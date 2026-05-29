# Sidebet

Peer-to-peer escrowed side bets on Polygon. Two parties stake an ERC-20
collateral (USDC or pUSD) into an on-chain escrow, and a trusted third-party
"settler" resolves the market once the outcome is known.

- **Wallet connect** via Wagmi connectors (injected/MetaMask, Coinbase Wallet,
  and optional WalletConnect) with a custom in-app modal
- **Chain**: Polygon mainnet (137) and Polygon Amoy testnet (80002)
- **Collateral**: USDC, pUSD (Polymarket USD), USDC.e, or any ERC-20
- **Settlement**: a per-bet `settler` address declares the winner (or a push)
- **Off-chain**: title / description / terms in Prisma + SQLite, committed
  on-chain as a `keccak256` `termsHash` so the displayed terms can be proven
  against what the proposer signed up for.
- **Profiles**: wallet-based identity with editable username / avatar / bio,
  gated by an off-chain signature (no gas). Each profile has a page showing
  bets won/lost, realized PnL, win rate, volume, and on-chain balances.
- **Leaderboard**: gamified ranking by realized PnL with gold/silver/bronze
  podium for the top three.
- **Search**: header search across markets and users with a live dropdown.

## Architecture

```
┌──────────────┐       ┌──────────────┐       ┌──────────────────┐
│  Next.js UI  │ ───▶  │  /api/bets   │ ───▶  │  Prisma (SQLite) │
│  Wagmi+viem  │       │  (Next API)  │       │  metadata cache  │
└──────┬───────┘       └──────┬───────┘       └──────────────────┘
       │                      │
       │  signed tx           │  viem readContract (sync)
       ▼                      ▼
┌──────────────────────────────────────┐
│  SidebetEscrow.sol on Polygon        │
│  · createBet / acceptBet             │
│  · cancelBet / refundExpired         │
│  · settleBet (settler only)          │
└──────────────────────────────────────┘
```

The escrow contract is the source of truth for funds and status. The local
Prisma cache is used for fast list/search and to hold the human-readable
title/description/terms (which are otherwise too expensive to store on-chain).

## Quick start

### 1. Install

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

Key vars:

| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_DEFAULT_CHAIN_ID` | `80002` for Amoy testnet, `137` for mainnet |
| `NEXT_PUBLIC_ESCROW_ADDRESS_AMOY` | Set after deploying to Amoy |
| `NEXT_PUBLIC_ESCROW_ADDRESS_POLYGON` | Set after deploying to mainnet |
| `NEXT_PUBLIC_WC_PROJECT_ID` | Optional WalletConnect project id. Injected + Coinbase work without it |
| `DEPLOYER_PRIVATE_KEY` | Funded deployer key (server-only) |
| `POLYGONSCAN_API_KEY` | Optional, enables auto-verification |

### 3. Migrate the database

```bash
npm run db:push
```

### 4. Deploy the contract

```bash
npm run hh:compile

# Testnet
npm run hh:deploy:amoy

# Mainnet (when ready)
npm run hh:deploy:polygon
```

Copy the printed address into `NEXT_PUBLIC_ESCROW_ADDRESS_AMOY` /
`NEXT_PUBLIC_ESCROW_ADDRESS_POLYGON` in `.env`.

### 5. Run the dev server

```bash
npm run dev
```

Open <http://localhost:3000>.

## User flow

1. **Connect wallet** — Sidebet uses wagmi connectors, so MetaMask, WalletConnect
   v2, Coinbase Wallet, Rainbow, Ledger, etc. all work out of the box.
2. **Propose a bet** at `/bets/new` — fill in title, description, terms,
   token, stake, settler, and deadlines. Sign two transactions: an ERC-20
   approve (if needed) and `createBet`.
3. **Browse markets** on `/` — anyone with the link or the listing can take
   the other side by hitting **Accept bet**.
4. **Settle** — the wallet listed as `settler` visits `/settle`, picks the
   winner (or declares a push), and signs `settleBet`. Funds are paid out
   atomically: `2 × stake − fee` to the winner, `fee` to the settler.
5. **Expired markets** — if `settleDeadline` passes without resolution,
   anyone can call `refundExpired` and recover both stakes.

## Smart contract

- `contracts/SidebetEscrow.sol` — see inline NatSpec.
- Status machine: `Open → Matched → Settled | Refunded`, or
  `Open → Cancelled`.
- Re-entrancy guarded; explicitly rejects fee-on-transfer tokens (the
  pull/push helpers check that `balanceOf(this)` increased by exactly
  `amount`).
- Max settler fee is hard-capped at **10% (1000 bps)**.
- `winner == address(0)` in `settleBet` means **push** (split refund).

## Trust model

Sidebet is non-custodial *for the principal*: funds never leave the escrow
contract until the contract pays them out. The contract has **no admin** —
not even the deployer can move funds.

The **settler** is trusted to declare the winner honestly. Pick someone
neutral and credible. The `settleDeadline` is the safety net: if the settler
disappears, both parties can recover their stakes via `refundExpired`.

## Why pUSD?

pUSD (Polymarket USD, `0xC011a7E1…E82DFB`) is Polymarket's settlement token
on Polygon as of April 2026. It's a 1:1 USDC-backed ERC-20, so users who
already hold pUSD from Polymarket positions can side-bet directly without
unwrapping. The contract is token-agnostic — USDC, USDT, DAI, or any other
ERC-20 also work.

## Token addresses (Polygon mainnet)

| Token | Address |
| --- | --- |
| USDC | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` |
| pUSD | `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB` |
| USDC.e | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` |

All three are 6 decimals.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Prisma generate + Next build |
| `npm run db:push` | Sync Prisma schema to SQLite |
| `npm run db:studio` | Prisma Studio UI |
| `npm run hh:compile` | Compile Solidity |
| `npm run hh:test` | Run Hardhat tests |
| `npm run hh:deploy:amoy` | Deploy escrow to Polygon Amoy |
| `npm run hh:deploy:polygon` | Deploy escrow to Polygon mainnet |

## Deploying to Vercel

**SQLite does not work in production on Vercel** (the filesystem is ephemeral). Use a hosted Postgres database (Neon is free and easy).

1. Create a project at [neon.tech](https://neon.tech) and copy the **pooled** connection string.
2. In `prisma/schema.prisma`, change the datasource to:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
3. Locally: set `DATABASE_URL` to the Neon URL and run `npm run db:push`.
4. On Vercel: add the same `DATABASE_URL` and all `NEXT_PUBLIC_*` vars from `.env.example`.
5. Build command: `npm run build` (default). Install command: `npm install` (default).

Contract deploy keys (`DEPLOYER_PRIVATE_KEY`) must **never** be added to Vercel — deploy the escrow from your machine only.
