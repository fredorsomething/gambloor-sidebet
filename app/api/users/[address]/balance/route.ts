import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";

import { getMarketCollateralToken, MARKET_COLLATERAL_SYMBOL } from "@/lib/chains";
import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { collateralKey } from "@/lib/exchange/keys";
import { formatMicro } from "@/lib/exchange/units";

export const dynamic = "force-dynamic";

/**
 * GET /api/users/[address]/balance
 * The user's custodial collateral balance (free + locked), in micro-units and
 * a formatted decimal. Public read.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } },
) {
  const handle = decodeURIComponent(params.address).trim().replace(/^@/, "");
  if (!isAddress(handle)) return jsonErr("bad address", 400);
  const lower = getAddress(handle).toLowerCase();

  const acc = await prisma.account.findUnique({
    where: { key: collateralKey(lower) },
    select: { balance: true, locked: true },
  });
  const balance = acc?.balance ?? 0n;
  const locked = acc?.locked ?? 0n;

  return jsonOk({
    decimals: getMarketCollateralToken().decimals,
    tokenSymbol: MARKET_COLLATERAL_SYMBOL,
    balanceMicro: balance.toString(),
    lockedMicro: locked.toString(),
    balance: formatMicro(balance),
    locked: formatMicro(locked),
    available: formatMicro(balance),
  });
}
