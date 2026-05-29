// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IERC1155Receiver {
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns (bytes4);
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external returns (bytes4);
}

/// @notice Re-entrancy guard.
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

/// @title ConditionalTokens
/// @notice Minimal Gnosis/Polymarket-style conditional token framework as an
///         ERC-1155. A condition has N mutually-exclusive outcomes. Depositing
///         collateral mints a full set of outcome shares (1 per outcome); merging
///         a full set redeems collateral. After the settler reports the winning
///         outcome, winning shares redeem 1:1 for collateral.
contract ConditionalTokens is ReentrancyGuard {
    // ERC-1155 balances: id => owner => amount
    mapping(uint256 => mapping(address => uint256)) public balanceOf;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    struct Condition {
        address settler;
        address collateral;
        uint8 outcomeSlotCount;
        bool resolved;
        uint8 winningOutcome;
    }

    // conditionId => Condition
    mapping(bytes32 => Condition) public conditions;

    event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);
    event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event URI(string value, uint256 indexed id);

    event ConditionPrepared(bytes32 indexed conditionId, address indexed settler, address indexed collateral, bytes32 questionId, uint8 outcomeSlotCount);
    event PositionSplit(address indexed stakeholder, bytes32 indexed conditionId, address collateral, uint256 amount);
    event PositionsMerge(address indexed stakeholder, bytes32 indexed conditionId, address collateral, uint256 amount);
    event PayoutReported(bytes32 indexed conditionId, uint8 winningOutcome);
    event PayoutRedemption(address indexed redeemer, bytes32 indexed conditionId, address collateral, uint256 payout);

    // ---------- condition management ----------

    function getConditionId(address settler, bytes32 questionId, uint8 outcomeSlotCount)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(settler, questionId, outcomeSlotCount));
    }

    function getPositionId(bytes32 conditionId, address collateral, uint8 outcomeIndex)
        public
        pure
        returns (uint256)
    {
        return uint256(keccak256(abi.encodePacked(collateral, conditionId, outcomeIndex)));
    }

    function prepareCondition(
        address settler,
        address collateral,
        bytes32 questionId,
        uint8 outcomeSlotCount
    ) external returns (bytes32 conditionId) {
        require(settler != address(0), "BAD_SETTLER");
        require(collateral != address(0), "BAD_COLLATERAL");
        require(outcomeSlotCount >= 2, "BAD_OUTCOMES");
        conditionId = getConditionId(settler, questionId, outcomeSlotCount);
        require(conditions[conditionId].outcomeSlotCount == 0, "CONDITION_EXISTS");
        conditions[conditionId] = Condition({
            settler: settler,
            collateral: collateral,
            outcomeSlotCount: outcomeSlotCount,
            resolved: false,
            winningOutcome: 0
        });
        emit ConditionPrepared(conditionId, settler, collateral, questionId, outcomeSlotCount);
    }

    /// @notice Deposit `amount` collateral, mint `amount` of every outcome share.
    function splitPosition(bytes32 conditionId, uint256 amount) external nonReentrant {
        Condition memory c = conditions[conditionId];
        require(c.outcomeSlotCount != 0, "NO_CONDITION");
        require(amount > 0, "BAD_AMOUNT");

        _pull(c.collateral, msg.sender, amount);
        for (uint8 i = 0; i < c.outcomeSlotCount; i++) {
            uint256 id = getPositionId(conditionId, c.collateral, i);
            _mint(msg.sender, id, amount);
        }
        emit PositionSplit(msg.sender, conditionId, c.collateral, amount);
    }

    /// @notice Burn `amount` of every outcome share, withdraw `amount` collateral.
    function mergePositions(bytes32 conditionId, uint256 amount) external nonReentrant {
        Condition memory c = conditions[conditionId];
        require(c.outcomeSlotCount != 0, "NO_CONDITION");
        require(amount > 0, "BAD_AMOUNT");

        for (uint8 i = 0; i < c.outcomeSlotCount; i++) {
            uint256 id = getPositionId(conditionId, c.collateral, i);
            _burn(msg.sender, id, amount);
        }
        _send(c.collateral, msg.sender, amount);
        emit PositionsMerge(msg.sender, conditionId, c.collateral, amount);
    }

    /// @notice Settler reports the winning outcome for a condition.
    function reportPayouts(bytes32 conditionId, uint8 winningOutcome) external {
        Condition storage c = conditions[conditionId];
        require(c.outcomeSlotCount != 0, "NO_CONDITION");
        require(msg.sender == c.settler, "NOT_SETTLER");
        require(!c.resolved, "ALREADY_RESOLVED");
        require(winningOutcome < c.outcomeSlotCount, "BAD_OUTCOME");
        c.resolved = true;
        c.winningOutcome = winningOutcome;
        emit PayoutReported(conditionId, winningOutcome);
    }

    /// @notice Burn winning shares for collateral after resolution.
    function redeemPositions(bytes32 conditionId) external nonReentrant {
        Condition memory c = conditions[conditionId];
        require(c.outcomeSlotCount != 0, "NO_CONDITION");
        require(c.resolved, "NOT_RESOLVED");

        uint256 winId = getPositionId(conditionId, c.collateral, c.winningOutcome);
        uint256 bal = balanceOf[winId][msg.sender];
        require(bal > 0, "NOTHING_TO_REDEEM");

        _burn(msg.sender, winId, bal);
        _send(c.collateral, msg.sender, bal);
        emit PayoutRedemption(msg.sender, conditionId, c.collateral, bal);
    }

    // ---------- ERC-1155 (minimal) ----------

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function balanceOfBatch(address[] calldata owners, uint256[] calldata ids)
        external
        view
        returns (uint256[] memory)
    {
        require(owners.length == ids.length, "LENGTH_MISMATCH");
        uint256[] memory out = new uint256[](owners.length);
        for (uint256 i = 0; i < owners.length; i++) {
            out[i] = balanceOf[ids[i]][owners[i]];
        }
        return out;
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes calldata data
    ) external {
        require(from == msg.sender || isApprovedForAll[from][msg.sender], "NOT_AUTHORIZED");
        _transfer(from, to, id, amount);
        emit TransferSingle(msg.sender, from, to, id, amount);
        _doSafeTransferAcceptanceCheck(msg.sender, from, to, id, amount, data);
    }

    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes calldata data
    ) external {
        require(from == msg.sender || isApprovedForAll[from][msg.sender], "NOT_AUTHORIZED");
        require(ids.length == amounts.length, "LENGTH_MISMATCH");
        for (uint256 i = 0; i < ids.length; i++) {
            _transfer(from, to, ids[i], amounts[i]);
        }
        emit TransferBatch(msg.sender, from, to, ids, amounts);
        _doSafeBatchTransferAcceptanceCheck(msg.sender, from, to, ids, amounts, data);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        // ERC-165 + ERC-1155
        return interfaceId == 0x01ffc9a7 || interfaceId == 0xd9b67a26;
    }

    // ---------- internal ----------

    function _transfer(address from, address to, uint256 id, uint256 amount) internal {
        require(to != address(0), "BAD_TO");
        uint256 bal = balanceOf[id][from];
        require(bal >= amount, "INSUFFICIENT_BALANCE");
        unchecked {
            balanceOf[id][from] = bal - amount;
        }
        balanceOf[id][to] += amount;
    }

    function _mint(address to, uint256 id, uint256 amount) internal {
        balanceOf[id][to] += amount;
        emit TransferSingle(msg.sender, address(0), to, id, amount);
    }

    function _burn(address from, uint256 id, uint256 amount) internal {
        uint256 bal = balanceOf[id][from];
        require(bal >= amount, "INSUFFICIENT_BALANCE");
        unchecked {
            balanceOf[id][from] = bal - amount;
        }
        emit TransferSingle(msg.sender, from, address(0), id, amount);
    }

    function _pull(address token, address from, uint256 amount) internal {
        uint256 before = IERC20(token).balanceOf(address(this));
        require(IERC20(token).transferFrom(from, address(this), amount), "PULL_FAIL");
        require(IERC20(token).balanceOf(address(this)) - before == amount, "FEE_ON_TRANSFER_UNSUPPORTED");
    }

    function _send(address token, address to, uint256 amount) internal {
        require(IERC20(token).transfer(to, amount), "SEND_FAIL");
    }

    function _doSafeTransferAcceptanceCheck(
        address operator,
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes calldata data
    ) private {
        if (to.code.length > 0) {
            try IERC1155Receiver(to).onERC1155Received(operator, from, id, amount, data) returns (bytes4 response) {
                require(response == IERC1155Receiver.onERC1155Received.selector, "REJECTED");
            } catch {
                revert("NON_ERC1155_RECEIVER");
            }
        }
    }

    function _doSafeBatchTransferAcceptanceCheck(
        address operator,
        address from,
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes calldata data
    ) private {
        if (to.code.length > 0) {
            try IERC1155Receiver(to).onERC1155BatchReceived(operator, from, ids, amounts, data) returns (bytes4 response) {
                require(response == IERC1155Receiver.onERC1155BatchReceived.selector, "REJECTED");
            } catch {
                revert("NON_ERC1155_RECEIVER");
            }
        }
    }
}
