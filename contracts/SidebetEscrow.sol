// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC-20 interface (USDC/pUSD return bool on transfer).
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Re-entrancy guard (OpenZeppelin-style).
abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status = _NOT_ENTERED;

    modifier nonReentrant() {
        require(_status != _ENTERED, "REENTRANT");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

/// @title SidebetEscrow
/// @notice Peer-to-peer escrow for two-sided bets resolved by a trusted settler.
///         Each bet specifies an ERC-20 collateral token (e.g. USDC or pUSD on Polygon),
///         a per-side stake `amount`, and a settler address authorized to declare the winner.
contract SidebetEscrow is ReentrancyGuard {
    enum Status {
        None,        // 0 — unused (id 0)
        Open,        // 1 — proposer staked, awaiting acceptor
        Matched,     // 2 — both sides staked, awaiting settlement
        Settled,     // 3 — winner paid (or both refunded on push)
        Cancelled,   // 4 — proposer pulled back stake before match
        Refunded     // 5 — refunded after settleDeadline expired
    }

    struct Bet {
        address proposer;
        address acceptor;       // address(0) until accepted
        address settler;        // trusted resolver
        address token;          // ERC-20 collateral (USDC / pUSD / etc.)
        uint256 amount;         // per-side stake (token's native units)
        uint64 createdAt;
        uint64 acceptDeadline;  // 0 = no deadline
        uint64 settleDeadline;  // 0 = no deadline
        uint16 feeBps;          // settler fee (basis points of total pool); max 1000 = 10%
        Status status;
        address winner;         // set on settlement; address(0) = push (split refund)
        bytes32 termsHash;      // keccak256 of off-chain terms blob (title|desc|terms)
    }

    uint256 public constant MAX_FEE_BPS = 1000; // 10%

    mapping(uint256 => Bet) public bets;
    uint256 public nextBetId = 1;

    event BetCreated(
        uint256 indexed id,
        address indexed proposer,
        address indexed settler,
        address token,
        uint256 amount,
        uint64 acceptDeadline,
        uint64 settleDeadline,
        uint16 feeBps,
        bytes32 termsHash
    );
    event BetAccepted(uint256 indexed id, address indexed acceptor);
    event BetCancelled(uint256 indexed id);
    event BetSettled(uint256 indexed id, address indexed winner, uint256 payout, uint256 fee);
    event BetRefunded(uint256 indexed id);

    /// @notice Proposer creates a bet and escrows `amount` of `token`.
    ///         Caller must have approved this contract for at least `amount`.
    function createBet(
        address settler,
        address token,
        uint256 amount,
        uint64 acceptDeadline,
        uint64 settleDeadline,
        uint16 feeBps,
        bytes32 termsHash
    ) external nonReentrant returns (uint256 id) {
        require(settler != address(0), "BAD_SETTLER");
        require(token != address(0), "BAD_TOKEN");
        require(amount > 0, "BAD_AMOUNT");
        require(feeBps <= MAX_FEE_BPS, "FEE_TOO_HIGH");
        require(acceptDeadline == 0 || acceptDeadline > block.timestamp, "BAD_ACCEPT_DL");
        require(
            settleDeadline == 0 || settleDeadline > acceptDeadline,
            "BAD_SETTLE_DL"
        );

        id = nextBetId++;
        bets[id] = Bet({
            proposer: msg.sender,
            acceptor: address(0),
            settler: settler,
            token: token,
            amount: amount,
            createdAt: uint64(block.timestamp),
            acceptDeadline: acceptDeadline,
            settleDeadline: settleDeadline,
            feeBps: feeBps,
            status: Status.Open,
            winner: address(0),
            termsHash: termsHash
        });

        _pullToken(token, msg.sender, amount);
        emit BetCreated(id, msg.sender, settler, token, amount, acceptDeadline, settleDeadline, feeBps, termsHash);
    }

    /// @notice Counterparty accepts an open bet by staking the matching amount.
    function acceptBet(uint256 id) external nonReentrant {
        Bet storage b = bets[id];
        require(b.status == Status.Open, "NOT_OPEN");
        require(msg.sender != b.proposer, "SELF_ACCEPT");
        require(b.acceptDeadline == 0 || block.timestamp < b.acceptDeadline, "ACCEPT_EXPIRED");

        b.acceptor = msg.sender;
        b.status = Status.Matched;

        _pullToken(b.token, msg.sender, b.amount);
        emit BetAccepted(id, msg.sender);
    }

    /// @notice Proposer cancels their open bet and recovers their stake.
    function cancelBet(uint256 id) external nonReentrant {
        Bet storage b = bets[id];
        require(b.status == Status.Open, "NOT_OPEN");
        require(msg.sender == b.proposer, "NOT_PROPOSER");

        b.status = Status.Cancelled;
        _send(b.token, b.proposer, b.amount);
        emit BetCancelled(id);
    }

    /// @notice Settler resolves a matched bet.
    ///         `winner` MUST be either the proposer, the acceptor, or address(0) for a push.
    ///         On win: winner gets `2*amount - fee`; settler gets `fee = pool * feeBps / 10000`.
    ///         On push: both sides receive `amount` back; no fee charged.
    function settleBet(uint256 id, address winner) external nonReentrant {
        Bet storage b = bets[id];
        require(b.status == Status.Matched, "NOT_MATCHED");
        require(msg.sender == b.settler, "NOT_SETTLER");
        require(
            winner == address(0) || winner == b.proposer || winner == b.acceptor,
            "BAD_WINNER"
        );

        b.status = Status.Settled;
        b.winner = winner;

        if (winner == address(0)) {
            // Push — refund both sides.
            _send(b.token, b.proposer, b.amount);
            _send(b.token, b.acceptor, b.amount);
            emit BetSettled(id, address(0), 0, 0);
        } else {
            uint256 pool = b.amount * 2;
            uint256 fee = (pool * b.feeBps) / 10000;
            uint256 payout = pool - fee;
            if (fee > 0) {
                _send(b.token, b.settler, fee);
            }
            _send(b.token, winner, payout);
            emit BetSettled(id, winner, payout, fee);
        }
    }

    /// @notice After `settleDeadline` passes without resolution, anyone can refund both parties.
    function refundExpired(uint256 id) external nonReentrant {
        Bet storage b = bets[id];
        require(b.status == Status.Matched, "NOT_MATCHED");
        require(b.settleDeadline != 0 && block.timestamp >= b.settleDeadline, "NOT_EXPIRED");

        b.status = Status.Refunded;
        _send(b.token, b.proposer, b.amount);
        _send(b.token, b.acceptor, b.amount);
        emit BetRefunded(id);
    }

    /// @notice Convenience: read a bet struct.
    function getBet(uint256 id) external view returns (Bet memory) {
        return bets[id];
    }

    // ---------- internal helpers ----------

    function _pullToken(address token, address from, uint256 amount) internal {
        uint256 before = IERC20(token).balanceOf(address(this));
        require(IERC20(token).transferFrom(from, address(this), amount), "PULL_FAIL");
        uint256 received = IERC20(token).balanceOf(address(this)) - before;
        require(received == amount, "FEE_ON_TRANSFER_UNSUPPORTED");
    }

    function _send(address token, address to, uint256 amount) internal {
        require(IERC20(token).transfer(to, amount), "SEND_FAIL");
    }
}
