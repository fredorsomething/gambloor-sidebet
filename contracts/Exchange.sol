// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IConditionalTokens {
    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external;
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

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

/// @title CTFExchange
/// @notice Direct-fill exchange for ERC-1155 conditional outcome shares against a
///         single ERC-20 collateral. Makers sign EIP-712 orders off-chain (gasless);
///         takers submit `fillOrder` on-chain and pay gas. Supports partial fills,
///         cancellation, and expiry. No continuous matching engine.
contract CTFExchange is ReentrancyGuard {
    enum Side {
        BUY,  // maker buys shares: gives collateral, receives shares
        SELL  // maker sells shares: gives shares, receives collateral
    }

    struct Order {
        uint256 salt;
        address maker;
        uint256 tokenId;     // ERC-1155 position id
        uint256 makerAmount; // total amount the maker gives (collateral for BUY, shares for SELL)
        uint256 takerAmount; // total amount the maker receives (shares for BUY, collateral for SELL)
        uint256 expiration;  // unix seconds; 0 = no expiry
        uint8 side;          // Side
    }

    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(uint256 salt,address maker,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint256 expiration,uint8 side)"
    );

    bytes32 public immutable DOMAIN_SEPARATOR;
    address public immutable collateral;
    IConditionalTokens public immutable ctf;

    // orderHash => taker-side amount already filled.
    mapping(bytes32 => uint256) public filled;
    mapping(bytes32 => bool) public cancelled;

    event OrderFilled(
        bytes32 indexed orderHash,
        address indexed maker,
        address indexed taker,
        uint256 tokenId,
        uint8 side,
        uint256 makerFilled,
        uint256 takerFilled
    );
    event OrderCancelled(bytes32 indexed orderHash, address indexed maker);

    constructor(address _ctf, address _collateral) {
        ctf = IConditionalTokens(_ctf);
        collateral = _collateral;
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("CTFExchange")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function hashOrder(Order calldata o) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                ORDER_TYPEHASH,
                o.salt,
                o.maker,
                o.tokenId,
                o.makerAmount,
                o.takerAmount,
                o.expiration,
                o.side
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    /// @notice Fill a resting maker order. `takerFillAmount` is the taker-side amount
    ///         (shares for a BUY order, collateral for a SELL order) the taker provides.
    function fillOrder(Order calldata o, bytes calldata signature, uint256 takerFillAmount)
        external
        nonReentrant
    {
        require(takerFillAmount > 0, "ZERO_FILL");
        require(o.makerAmount > 0 && o.takerAmount > 0, "BAD_ORDER");
        require(o.expiration == 0 || block.timestamp <= o.expiration, "EXPIRED");

        bytes32 orderHash = hashOrder(o);
        require(!cancelled[orderHash], "CANCELLED");
        require(_verify(o.maker, orderHash, signature), "BAD_SIG");

        uint256 remaining = o.takerAmount - filled[orderHash];
        require(takerFillAmount <= remaining, "OVERFILL");

        // makerGives = takerFillAmount * makerAmount / takerAmount (proportional).
        uint256 makerGives = (takerFillAmount * o.makerAmount) / o.takerAmount;
        require(makerGives > 0, "DUST");

        filled[orderHash] += takerFillAmount;

        if (o.side == uint8(Side.BUY)) {
            // maker gives collateral (makerGives), receives shares (takerFillAmount).
            // taker gives shares, receives collateral.
            require(IERC20(collateral).transferFrom(o.maker, msg.sender, makerGives), "COLLATERAL_FAIL");
            ctf.safeTransferFrom(msg.sender, o.maker, o.tokenId, takerFillAmount, "");
        } else {
            // maker gives shares (makerGives), receives collateral (takerFillAmount).
            // taker gives collateral, receives shares.
            ctf.safeTransferFrom(o.maker, msg.sender, o.tokenId, makerGives, "");
            require(IERC20(collateral).transferFrom(msg.sender, o.maker, takerFillAmount), "COLLATERAL_FAIL");
        }

        emit OrderFilled(orderHash, o.maker, msg.sender, o.tokenId, o.side, makerGives, takerFillAmount);
    }

    /// @notice Maker cancels their own order.
    function cancelOrder(Order calldata o) external {
        require(msg.sender == o.maker, "NOT_MAKER");
        bytes32 orderHash = hashOrder(o);
        cancelled[orderHash] = true;
        emit OrderCancelled(orderHash, o.maker);
    }

    // ---------- internal ----------

    function _verify(address signer, bytes32 digest, bytes calldata sig) internal pure returns (bool) {
        if (sig.length != 65) return false;
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return false;
        address recovered = ecrecover(digest, v, r, s);
        return recovered != address(0) && recovered == signer;
    }
}
