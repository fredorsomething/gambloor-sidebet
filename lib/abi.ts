export const ERC20_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

export const SIDEBET_ESCROW_ABI = [
  {
    type: "function",
    name: "nextBetId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "MAX_FEE_BPS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getBet",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "proposer", type: "address" },
          { name: "acceptor", type: "address" },
          { name: "settler", type: "address" },
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "createdAt", type: "uint64" },
          { name: "acceptDeadline", type: "uint64" },
          { name: "settleDeadline", type: "uint64" },
          { name: "feeBps", type: "uint16" },
          { name: "status", type: "uint8" },
          { name: "winner", type: "address" },
          { name: "termsHash", type: "bytes32" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "createBet",
    stateMutability: "nonpayable",
    inputs: [
      { name: "settler", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "acceptDeadline", type: "uint64" },
      { name: "settleDeadline", type: "uint64" },
      { name: "feeBps", type: "uint16" },
      { name: "termsHash", type: "bytes32" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "acceptBet",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelBet",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "settleBet",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "winner", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refundExpired",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "event",
    name: "BetCreated",
    inputs: [
      { indexed: true, name: "id", type: "uint256" },
      { indexed: true, name: "proposer", type: "address" },
      { indexed: true, name: "settler", type: "address" },
      { indexed: false, name: "token", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "acceptDeadline", type: "uint64" },
      { indexed: false, name: "settleDeadline", type: "uint64" },
      { indexed: false, name: "feeBps", type: "uint16" },
      { indexed: false, name: "termsHash", type: "bytes32" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "BetAccepted",
    inputs: [
      { indexed: true, name: "id", type: "uint256" },
      { indexed: true, name: "acceptor", type: "address" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "BetCancelled",
    inputs: [{ indexed: true, name: "id", type: "uint256" }],
    anonymous: false,
  },
  {
    type: "event",
    name: "BetSettled",
    inputs: [
      { indexed: true, name: "id", type: "uint256" },
      { indexed: true, name: "winner", type: "address" },
      { indexed: false, name: "payout", type: "uint256" },
      { indexed: false, name: "fee", type: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "BetRefunded",
    inputs: [{ indexed: true, name: "id", type: "uint256" }],
    anonymous: false,
  },
] as const;

export const BET_STATUS = {
  0: "None",
  1: "Open",
  2: "Matched",
  3: "Settled",
  4: "Cancelled",
  5: "Refunded",
} as const;

export type BetStatusCode = keyof typeof BET_STATUS;
export type BetStatusName = (typeof BET_STATUS)[BetStatusCode];

// ----------------------- SidebetEscrowV2 -----------------------

export const SIDEBET_ESCROW_V2_ABI = [
  {
    type: "function",
    name: "nextBetId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "MAX_FEE_BPS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "isApprovedSettler",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "settlerFeeBps",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "function",
    name: "setSettler",
    stateMutability: "nonpayable",
    inputs: [
      { name: "settler", type: "address" },
      { name: "approved", type: "bool" },
      { name: "feeBps", type: "uint16" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getBet",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "proposer", type: "address" },
          { name: "acceptor", type: "address" },
          { name: "settler", type: "address" },
          { name: "token", type: "address" },
          { name: "proposerStake", type: "uint256" },
          { name: "acceptorStake", type: "uint256" },
          { name: "proposerOutcome", type: "uint8" },
          { name: "acceptorOutcome", type: "uint8" },
          { name: "numOutcomes", type: "uint8" },
          { name: "createdAt", type: "uint64" },
          { name: "acceptDeadline", type: "uint64" },
          { name: "estimatedEndDate", type: "uint64" },
          { name: "feeBps", type: "uint16" },
          { name: "status", type: "uint8" },
          { name: "winningOutcome", type: "uint8" },
          { name: "termsHash", type: "bytes32" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "createBet",
    stateMutability: "nonpayable",
    inputs: [
      { name: "settler", type: "address" },
      { name: "token", type: "address" },
      { name: "proposerStake", type: "uint256" },
      { name: "acceptorStake", type: "uint256" },
      { name: "proposerOutcome", type: "uint8" },
      { name: "acceptorOutcome", type: "uint8" },
      { name: "numOutcomes", type: "uint8" },
      { name: "acceptDeadline", type: "uint64" },
      { name: "estimatedEndDate", type: "uint64" },
      { name: "termsHash", type: "bytes32" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "acceptBet",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelBet",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "settleBet",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "winningOutcome", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "emergencyRefund",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "event",
    name: "BetCreated",
    inputs: [
      { indexed: true, name: "id", type: "uint256" },
      { indexed: true, name: "proposer", type: "address" },
      { indexed: true, name: "settler", type: "address" },
      { indexed: false, name: "token", type: "address" },
      { indexed: false, name: "proposerStake", type: "uint256" },
      { indexed: false, name: "acceptorStake", type: "uint256" },
      { indexed: false, name: "proposerOutcome", type: "uint8" },
      { indexed: false, name: "acceptorOutcome", type: "uint8" },
      { indexed: false, name: "numOutcomes", type: "uint8" },
      { indexed: false, name: "estimatedEndDate", type: "uint64" },
      { indexed: false, name: "feeBps", type: "uint16" },
      { indexed: false, name: "termsHash", type: "bytes32" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "BetAccepted",
    inputs: [
      { indexed: true, name: "id", type: "uint256" },
      { indexed: true, name: "acceptor", type: "address" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "BetCancelled",
    inputs: [{ indexed: true, name: "id", type: "uint256" }],
    anonymous: false,
  },
  {
    type: "event",
    name: "BetSettled",
    inputs: [
      { indexed: true, name: "id", type: "uint256" },
      { indexed: false, name: "winningOutcome", type: "uint8" },
      { indexed: false, name: "winner", type: "address" },
      { indexed: false, name: "payout", type: "uint256" },
      { indexed: false, name: "fee", type: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "BetRefunded",
    inputs: [{ indexed: true, name: "id", type: "uint256" }],
    anonymous: false,
  },
] as const;

// ----------------------- ConditionalTokens (ERC-1155) -----------------------

export const CONDITIONAL_TOKENS_ABI = [
  {
    type: "function",
    name: "getConditionId",
    stateMutability: "pure",
    inputs: [
      { name: "settler", type: "address" },
      { name: "questionId", type: "bytes32" },
      { name: "outcomeSlotCount", type: "uint8" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "getPositionId",
    stateMutability: "pure",
    inputs: [
      { name: "conditionId", type: "bytes32" },
      { name: "collateral", type: "address" },
      { name: "outcomeIndex", type: "uint8" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "prepareCondition",
    stateMutability: "nonpayable",
    inputs: [
      { name: "settler", type: "address" },
      { name: "collateral", type: "address" },
      { name: "questionId", type: "bytes32" },
      { name: "outcomeSlotCount", type: "uint8" },
    ],
    outputs: [{ name: "conditionId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "conditions",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [
      { name: "settler", type: "address" },
      { name: "collateral", type: "address" },
      { name: "outcomeSlotCount", type: "uint8" },
      { name: "resolved", type: "bool" },
      { name: "winningOutcome", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "splitPosition",
    stateMutability: "nonpayable",
    inputs: [
      { name: "conditionId", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "mergePositions",
    stateMutability: "nonpayable",
    inputs: [
      { name: "conditionId", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "reportPayouts",
    stateMutability: "nonpayable",
    inputs: [
      { name: "conditionId", type: "bytes32" },
      { name: "winningOutcome", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "redeemPositions",
    stateMutability: "nonpayable",
    inputs: [{ name: "conditionId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "ConditionPrepared",
    inputs: [
      { indexed: true, name: "conditionId", type: "bytes32" },
      { indexed: true, name: "settler", type: "address" },
      { indexed: true, name: "collateral", type: "address" },
      { indexed: false, name: "questionId", type: "bytes32" },
      { indexed: false, name: "outcomeSlotCount", type: "uint8" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PayoutReported",
    inputs: [
      { indexed: true, name: "conditionId", type: "bytes32" },
      { indexed: false, name: "winningOutcome", type: "uint8" },
    ],
    anonymous: false,
  },
] as const;

// ----------------------- CTFExchange -----------------------

export const EXCHANGE_ABI = [
  {
    type: "function",
    name: "DOMAIN_SEPARATOR",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "collateral",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "ctf",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "filled",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "cancelled",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "hashOrder",
    stateMutability: "view",
    inputs: [
      {
        name: "o",
        type: "tuple",
        components: [
          { name: "salt", type: "uint256" },
          { name: "maker", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "makerAmount", type: "uint256" },
          { name: "takerAmount", type: "uint256" },
          { name: "expiration", type: "uint256" },
          { name: "side", type: "uint8" },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "fillOrder",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "o",
        type: "tuple",
        components: [
          { name: "salt", type: "uint256" },
          { name: "maker", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "makerAmount", type: "uint256" },
          { name: "takerAmount", type: "uint256" },
          { name: "expiration", type: "uint256" },
          { name: "side", type: "uint8" },
        ],
      },
      { name: "signature", type: "bytes" },
      { name: "takerFillAmount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelOrder",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "o",
        type: "tuple",
        components: [
          { name: "salt", type: "uint256" },
          { name: "maker", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "makerAmount", type: "uint256" },
          { name: "takerAmount", type: "uint256" },
          { name: "expiration", type: "uint256" },
          { name: "side", type: "uint8" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "OrderFilled",
    inputs: [
      { indexed: true, name: "orderHash", type: "bytes32" },
      { indexed: true, name: "maker", type: "address" },
      { indexed: true, name: "taker", type: "address" },
      { indexed: false, name: "tokenId", type: "uint256" },
      { indexed: false, name: "side", type: "uint8" },
      { indexed: false, name: "makerFilled", type: "uint256" },
      { indexed: false, name: "takerFilled", type: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OrderCancelled",
    inputs: [
      { indexed: true, name: "orderHash", type: "bytes32" },
      { indexed: true, name: "maker", type: "address" },
    ],
    anonymous: false,
  },
] as const;

export const ORDER_SIDE = { BUY: 0, SELL: 1 } as const;
export type OrderSideName = keyof typeof ORDER_SIDE;
