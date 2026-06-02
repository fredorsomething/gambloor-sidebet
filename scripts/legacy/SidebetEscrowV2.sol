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

/// @title SidebetEscrowV2
/// @notice Peer-to-peer escrow for two-party bets with asymmetric stakes and
///         custom multi-outcome brackets, resolved by an approved settler.
///         The settler must be registered by the owner with their own fee; the
///         creator cannot be the settler. There is no settle deadline; the owner
///         can emergency-refund a stuck matched bet as a safety net.
contract SidebetEscrowV2 is ReentrancyGuard {
    enum Status {
        None,      // 0 — unused (id 0)
        Open,      // 1 — proposer staked, awaiting acceptor
        Matched,   // 2 — both sides staked, awaiting settlement
        Settled,   // 3 — resolved + paid
        Cancelled, // 4 — proposer pulled back stake before match
        Refunded   // 5 — emergency refund
    }

    struct Bet {
        address proposer;
        address acceptor;        // address(0) until accepted
        address settler;         // approved resolver (!= proposer)
        address token;           // ERC-20 collateral
        uint256 proposerStake;   // proposer's stake (token units)
        uint256 acceptorStake;   // required acceptor stake (token units)
        uint8 proposerOutcome;   // outcome index proposer backs
        uint8 acceptorOutcome;   // outcome index acceptor backs
        uint8 numOutcomes;       // total outcomes (>= 2)
        uint64 createdAt;
        uint64 acceptDeadline;   // 0 = no deadline
        uint64 estimatedEndDate; // informational; 0 = unset
        uint16 feeBps;           // settler fee snapshot (bps of pool)
        Status status;
        uint8 winningOutcome;    // set on settlement
        bytes32 termsHash;       // keccak256 of off-chain terms blob
    }

    uint256 public constant MAX_FEE_BPS = 1000; // 10%

    address public owner;

    // Approved settler registry: address => fee (bps). approved == fee tracked separately.
    mapping(address => bool) public isApprovedSettler;
    mapping(address => uint16) public settlerFeeBps;

    mapping(uint256 => Bet) public bets;
    uint256 public nextBetId = 1;

    event SettlerUpdated(address indexed settler, bool approved, uint16 feeBps);
    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);

    event BetCreated(
        uint256 indexed id,
        address indexed proposer,
        address indexed settler,
        address token,
        uint256 proposerStake,
        uint256 acceptorStake,
        uint8 proposerOutcome,
        uint8 acceptorOutcome,
        uint8 numOutcomes,
        uint64 estimatedEndDate,
        uint16 feeBps,
        bytes32 termsHash
    );
    event BetAccepted(uint256 indexed id, address indexed acceptor);
    event BetCancelled(uint256 indexed id);
    event BetExpired(uint256 indexed id);
    event BetSettled(uint256 indexed id, uint8 winningOutcome, address winner, uint256 payout, uint256 fee);
    event BetRefunded(uint256 indexed id);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnerTransferred(address(0), msg.sender);
    }

    // ---------- owner / settler registry ----------

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "BAD_OWNER");
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Approve/disapprove a settler and set their fee (bps of pool).
    function setSettler(address settler, bool approved, uint16 feeBps) external onlyOwner {
        require(settler != address(0), "BAD_SETTLER");
        require(feeBps <= MAX_FEE_BPS, "FEE_TOO_HIGH");
        isApprovedSettler[settler] = approved;
        settlerFeeBps[settler] = feeBps;
        emit SettlerUpdated(settler, approved, feeBps);
    }

    // ---------- bet lifecycle ----------

    /// @notice Proposer creates a bet and escrows `proposerStake` of `token`.
    function createBet(
        address settler,
        address token,
        uint256 proposerStake,
        uint256 acceptorStake,
        uint8 proposerOutcome,
        uint8 acceptorOutcome,
        uint8 numOutcomes,
        uint64 acceptDeadline,
        uint64 estimatedEndDate,
        bytes32 termsHash
    ) external nonReentrant returns (uint256 id) {
        require(isApprovedSettler[settler], "SETTLER_NOT_APPROVED");
        require(settler != msg.sender, "SELF_SETTLE");
        require(token != address(0), "BAD_TOKEN");
        require(proposerStake > 0 && acceptorStake > 0, "BAD_AMOUNT");
        require(numOutcomes >= 2, "BAD_OUTCOMES");
        require(proposerOutcome < numOutcomes && acceptorOutcome < numOutcomes, "BAD_OUTCOME_IDX");
        require(proposerOutcome != acceptorOutcome, "SAME_OUTCOME");
        require(acceptDeadline == 0 || acceptDeadline > block.timestamp, "BAD_ACCEPT_DL");

        uint16 feeBps = settlerFeeBps[settler];

        id = nextBetId++;
        bets[id] = Bet({
            proposer: msg.sender,
            acceptor: address(0),
            settler: settler,
            token: token,
            proposerStake: proposerStake,
            acceptorStake: acceptorStake,
            proposerOutcome: proposerOutcome,
            acceptorOutcome: acceptorOutcome,
            numOutcomes: numOutcomes,
            createdAt: uint64(block.timestamp),
            acceptDeadline: acceptDeadline,
            estimatedEndDate: estimatedEndDate,
            feeBps: feeBps,
            status: Status.Open,
            winningOutcome: 0,
            termsHash: termsHash
        });

        _pullToken(token, msg.sender, proposerStake);
        emit BetCreated(
            id,
            msg.sender,
            settler,
            token,
            proposerStake,
            acceptorStake,
            proposerOutcome,
            acceptorOutcome,
            numOutcomes,
            estimatedEndDate,
            feeBps,
            termsHash
        );
    }

    /// @notice Counterparty accepts an open bet by staking `acceptorStake`.
    function acceptBet(uint256 id) external nonReentrant {
        Bet storage b = bets[id];
        require(b.status == Status.Open, "NOT_OPEN");
        require(msg.sender != b.proposer, "SELF_ACCEPT");
        require(msg.sender != b.settler, "SETTLER_ACCEPT");
        require(b.acceptDeadline == 0 || block.timestamp < b.acceptDeadline, "ACCEPT_EXPIRED");

        b.acceptor = msg.sender;
        b.status = Status.Matched;

        _pullToken(b.token, msg.sender, b.acceptorStake);
        emit BetAccepted(id, msg.sender);
    }

    /// @notice Proposer cancels their open bet and recovers their stake.
    function cancelBet(uint256 id) external nonReentrant {
        Bet storage b = bets[id];
        require(b.status == Status.Open, "NOT_OPEN");
        require(msg.sender == b.proposer, "NOT_PROPOSER");

        b.status = Status.Cancelled;
        _send(b.token, b.proposer, b.proposerStake);
        emit BetCancelled(id);
    }

    function expireOpenBet(uint256 id) external nonReentrant {
        Bet storage b = bets[id];
        require(b.status == Status.Open, "NOT_OPEN");
        require(b.acceptDeadline != 0, "NO_DEADLINE");
        require(block.timestamp >= b.acceptDeadline, "NOT_EXPIRED");

        b.status = Status.Cancelled;
        _send(b.token, b.proposer, b.proposerStake);
        emit BetExpired(id);
    }

    /// @notice Approved settler resolves a matched bet by declaring the winning outcome.
    ///         If the winning outcome is the proposer's, the proposer wins the pool less fee.
    ///         If it is the acceptor's, the acceptor wins. Otherwise both are refunded (no fee).
    function settleBet(uint256 id, uint8 winningOutcome) external nonReentrant {
        Bet storage b = bets[id];
        require(b.status == Status.Matched, "NOT_MATCHED");
        require(msg.sender == b.settler, "NOT_SETTLER");
        require(winningOutcome < b.numOutcomes, "BAD_WINNER");

        b.status = Status.Settled;
        b.winningOutcome = winningOutcome;

        uint256 pool = b.proposerStake + b.acceptorStake;

        if (winningOutcome == b.proposerOutcome) {
            uint256 fee = (pool * b.feeBps) / 10000;
            uint256 payout = pool - fee;
            if (fee > 0) _send(b.token, b.settler, fee);
            _send(b.token, b.proposer, payout);
            emit BetSettled(id, winningOutcome, b.proposer, payout, fee);
        } else if (winningOutcome == b.acceptorOutcome) {
            uint256 fee = (pool * b.feeBps) / 10000;
            uint256 payout = pool - fee;
            if (fee > 0) _send(b.token, b.settler, fee);
            _send(b.token, b.acceptor, payout);
            emit BetSettled(id, winningOutcome, b.acceptor, payout, fee);
        } else {
            // Neither side backed the winning outcome — refund both, no fee.
            _send(b.token, b.proposer, b.proposerStake);
            _send(b.token, b.acceptor, b.acceptorStake);
            emit BetSettled(id, winningOutcome, address(0), 0, 0);
        }
    }

    /// @notice Owner-only safety net: refund a matched bet that the settler never resolved.
    function emergencyRefund(uint256 id) external onlyOwner nonReentrant {
        Bet storage b = bets[id];
        require(b.status == Status.Matched, "NOT_MATCHED");

        b.status = Status.Refunded;
        _send(b.token, b.proposer, b.proposerStake);
        _send(b.token, b.acceptor, b.acceptorStake);
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
