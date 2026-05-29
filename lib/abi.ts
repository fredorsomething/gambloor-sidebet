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
