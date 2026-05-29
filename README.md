# Sidebet

Peer-to-peer escrowed side bets on Polygon. Two parties stake an ERC-20
collateral (USDC or pUSD) into an on-chain escrow, and a trusted third-party
"settler" resolves the market once the outcome is known.

- **Auth via Privy** — sign in with email, SMS, Google, or an external wallet.
  Users without a wallet get a self-custodial embedded wallet automatically;
  power users can connect MetaMask/Coinbase/etc. wagmi + viem run on top of
  Privy via `@privy-io/wagmi`.
- **Chain**: Polygon mainnet only (chain id 137)
- **Collateral**: USDC, pUSD (Polymarket USD), USDC.e, or any ERC-20
- **Settlement**: a per-bet `settler` address declares the winner (or a push)
- **Off-chain**: title / description / terms in Prisma + Postgres (Neon), committed
  on-chain as a `keccak256` `termsHash` so the displayed terms can be proven
  against what the proposer signed up for.
- **Profiles**: wallet-address identity linked to a Privy account, with editable
  username / avatar / bio. Profile + upload writes are authorized by verifying
  the Privy access token server-side (no gas, no signatures). Each profile has a
  page showing bets won/lost, realized PnL, win rate, volume, and balances.
- **Leaderboard**: gamified ranking by realized PnL with gold/silver/bronze
  podium for the top three.
- **Search**: header search across markets and users with a live dropdown.

## Architecture

```
┌──────────────┐       ┌──────────────┐       ┌──────────────────┐
│  Next.js UI  │ ───▶  │  /api/bets   │ ───▶  │  Prisma (Neon)   │
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
| `NEXT_PUBLIC_DEFAULT_CHAIN_ID` | `137` (Polygon mainnet) |
| `NEXT_PUBLIC_ESCROW_ADDRESS_POLYGON` | Deployed `SidebetEscrow` on Polygon |
| `NEXT_PUBLIC_DEFAULT_SETTLER` | Your wallet address as default settler |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy app id (from the Privy dashboard) |
| `PRIVY_APP_SECRET` | Privy app secret (server-only; verifies access tokens) |
| `NEXT_PUBLIC_PRIVY_CLIENT_ID` | Optional Privy client id |
| `DEPLOYER_PRIVATE_KEY` | Funded deployer key (server-only) |
| `POLYGONSCAN_API_KEY` | Optional, enables auto-verification |

### 3. Migrate the database

```bash
npm run db:push
```

### 4. Deploy the contract

Fund the deployer wallet with **POL** on Polygon mainnet for gas.

```bash
npm run hh:compile
npm run hh:deploy
```

Copy the printed address into `NEXT_PUBLIC_ESCROW_ADDRESS_POLYGON` in `.env` and Vercel.

### 5. Run the dev server

```bash
npm run dev
```

Open <http://localhost:3000>.

## User flow

1. **Sign in** — click *Sign in* and authenticate with email, SMS, Google, or an
   external wallet via Privy. New users get an embedded wallet automatically.
   Because gas is paid in **POL**, use *Fund wallet* to deposit POL before
   transacting (a low-gas banner appears on tx screens when your balance is 0).
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
| `npm run db:push` | Sync Prisma schema to Neon Postgres |
| `npm run db:studio` | Prisma Studio UI |
| `npm run hh:compile` | Compile Solidity |
| `npm run hh:test` | Run Hardhat tests |
| `npm run hh:deploy` | Deploy escrow to Polygon mainnet |

## Database (Neon Postgres)

Prisma uses **PostgreSQL** (Neon). Set two env vars:

| Variable | Use |
|----------|-----|
| `DATABASE_URL` | Pooled connection string (app + Vercel runtime) |
| `DATABASE_URL_UNPOOLED` | Direct connection (`prisma db push`, migrations) |

```bash
npm run db:push   # sync schema to Neon
```

On **Vercel**, add the same two vars (plus `DATABASE_URL_UNPOOLED` if you run migrations in CI).

## Deploying to Vercel

1. Import the GitHub repo on Vercel.
2. Set `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and all `NEXT_PUBLIC_*` vars from `.env.example`.
3. Build: `npm run build` (default).

Contract deploy keys (`DEPLOYER_PRIVATE_KEY`) must **never** be added to Vercel — deploy the escrow from your machine only.
