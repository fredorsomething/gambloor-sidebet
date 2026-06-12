import { getAddress } from "viem";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { collateralKey, parseKey, shareKey } from "@/lib/exchange/keys";

export type WalletMigrationStats = {
  tables: Record<string, number>;
};

function dmPair(a: string, b: string): string {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

/** Move off-chain activity from a stale linked wallet to the canonical embedded wallet. */
export async function migrateWalletAddress(
  fromRaw: string,
  toRaw: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<WalletMigrationStats> {
  const from = getAddress(fromRaw);
  const to = getAddress(toRaw);
  const fromLower = from.toLowerCase();
  const toLower = to.toLowerCase();

  if (fromLower === toLower) {
    return { tables: {} };
  }

  const stats: Record<string, number> = {};
  const bump = (key: string, n: number) => {
    stats[key] = (stats[key] ?? 0) + n;
  };

  bump(
    "UsernameHistory",
    (
      await tx.usernameHistory.updateMany({
        where: { address: from },
        data: { address: to },
      })
    ).count,
  );

  const bets = await tx.bet.findMany({
    where: {
      OR: [
        { proposer: { equals: from, mode: "insensitive" } },
        { acceptor: { equals: from, mode: "insensitive" } },
        { winner: { equals: from, mode: "insensitive" } },
        { intendedAcceptor: { equals: fromLower, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      proposer: true,
      acceptor: true,
      winner: true,
      intendedAcceptor: true,
    },
  });
  for (const bet of bets) {
    await tx.bet.update({
      where: { id: bet.id },
      data: {
        proposer:
          bet.proposer.toLowerCase() === fromLower ? to : bet.proposer,
        acceptor:
          bet.acceptor?.toLowerCase() === fromLower ? to : bet.acceptor,
        winner: bet.winner?.toLowerCase() === fromLower ? to : bet.winner,
        intendedAcceptor:
          bet.intendedAcceptor?.toLowerCase() === fromLower
            ? toLower
            : bet.intendedAcceptor,
      },
    });
  }
  bump("Bet", bets.length);

  const markets = await tx.market.findMany({
    where: {
      OR: [
        { creator: { equals: from, mode: "insensitive" } },
        { customSettler: { equals: fromLower, mode: "insensitive" } },
      ],
    },
    select: { id: true, creator: true, customSettler: true },
  });
  for (const market of markets) {
    await tx.market.update({
      where: { id: market.id },
      data: {
        creator:
          market.creator.toLowerCase() === fromLower ? to : market.creator,
        customSettler:
          market.customSettler?.toLowerCase() === fromLower
            ? toLower
            : market.customSettler,
      },
    });
  }
  bump("Market", markets.length);

  const fills = await tx.fill.findMany({
    where: { OR: [{ taker: fromLower }, { maker: fromLower }] },
    select: { id: true, taker: true, maker: true },
  });
  for (const fill of fills) {
    await tx.fill.update({
      where: { id: fill.id },
      data: {
        taker: fill.taker === fromLower ? toLower : fill.taker,
        maker: fill.maker === fromLower ? toLower : fill.maker,
      },
    });
  }
  bump("Fill", fills.length);

  const fromAccounts = await tx.account.findMany({
    where: { owner: fromLower },
  });
  for (const acc of fromAccounts) {
    const parsed = parseKey(acc.key);
    const newKey =
      parsed.kind === "SHARE"
        ? shareKey(toLower, parsed.marketId!, parsed.outcomeIndex!)
        : parsed.kind === "COLLATERAL"
          ? collateralKey(toLower)
          : acc.key.replace(`|${fromLower}|`, `|${toLower}|`);

    const existing = await tx.account.findUnique({ where: { key: newKey } });
    if (existing && existing.id !== acc.id) {
      await tx.account.update({
        where: { id: existing.id },
        data: {
          balance: existing.balance + acc.balance,
          locked: existing.locked + acc.locked,
        },
      });
      await tx.account.delete({ where: { id: acc.id } });
    } else {
      await tx.account.update({
        where: { id: acc.id },
        data: { owner: toLower, key: newKey },
      });
    }
  }
  bump("Account", fromAccounts.length);

  bump(
    "Deposit",
    (
      await tx.deposit.updateMany({
        where: { address: fromLower },
        data: { address: toLower },
      })
    ).count,
  );

  bump(
    "Withdrawal",
    (
      await tx.withdrawal.updateMany({
        where: { address: fromLower },
        data: { address: toLower },
      })
    ).count,
  );

  const profileComments = await tx.profileComment.findMany({
    where: { OR: [{ target: fromLower }, { author: fromLower }] },
    select: { id: true, target: true, author: true },
  });
  for (const row of profileComments) {
    await tx.profileComment.update({
      where: { id: row.id },
      data: {
        target: row.target === fromLower ? toLower : row.target,
        author: row.author === fromLower ? toLower : row.author,
      },
    });
  }
  bump("ProfileComment", profileComments.length);

  bump(
    "ThreadComment",
    (
      await tx.threadComment.updateMany({
        where: { author: fromLower },
        data: { author: toLower },
      })
    ).count,
  );

  bump(
    "CommentLike",
    (
      await tx.commentLike.updateMany({
        where: { liker: fromLower },
        data: { liker: toLower },
      })
    ).count,
  );

  const profileViews = await tx.profileView.findMany({
    where: { OR: [{ target: fromLower }, { viewer: fromLower }] },
  });
  for (const row of profileViews) {
    const newTarget = row.target === fromLower ? toLower : row.target;
    const newViewer = row.viewer === fromLower ? toLower : row.viewer;
    if (newTarget === row.target && newViewer === row.viewer) continue;

    const conflict = await tx.profileView.findUnique({
      where: { target_viewer: { target: newTarget, viewer: newViewer } },
    });
    if (conflict && conflict.id !== row.id) {
      await tx.profileView.delete({ where: { id: row.id } });
      continue;
    }

    await tx.profileView.update({
      where: { id: row.id },
      data: { target: newTarget, viewer: newViewer },
    });
  }
  bump("ProfileView", profileViews.length);

  bump(
    "Notification",
    (
      await tx.notification.updateMany({
        where: { recipient: fromLower },
        data: { recipient: toLower },
      })
    ).count,
  );

  const negs = await tx.betNegotiation.findMany({
    where: { OR: [{ fromAddress: fromLower }, { toAddress: fromLower }] },
    select: { id: true, fromAddress: true, toAddress: true },
  });
  for (const row of negs) {
    await tx.betNegotiation.update({
      where: { id: row.id },
      data: {
        fromAddress: row.fromAddress === fromLower ? toLower : row.fromAddress,
        toAddress:
          row.toAddress?.toLowerCase() === fromLower ? toLower : row.toAddress,
      },
    });
  }
  bump("BetNegotiation", negs.length);

  const repAsVoter = await tx.repVote.findMany({ where: { voter: fromLower } });
  for (const row of repAsVoter) {
    await tx.repVote
      .upsert({
        where: { voter_target: { voter: toLower, target: row.target } },
        update: { value: row.value },
        create: { voter: toLower, target: row.target, value: row.value },
      })
      .catch(() => {});
    await tx.repVote
      .delete({
        where: { voter_target: { voter: fromLower, target: row.target } },
      })
      .catch(() => {});
  }
  bump("RepVote.voter", repAsVoter.length);

  const repAsTarget = await tx.repVote.findMany({ where: { target: fromLower } });
  for (const row of repAsTarget) {
    await tx.repVote
      .upsert({
        where: { voter_target: { voter: row.voter, target: toLower } },
        update: { value: row.value },
        create: { voter: row.voter, target: toLower, value: row.value },
      })
      .catch(() => {});
    await tx.repVote
      .delete({
        where: { voter_target: { voter: row.voter, target: fromLower } },
      })
      .catch(() => {});
  }
  bump("RepVote.target", repAsTarget.length);

  const proposals = await tx.resolutionProposal.findMany({
    where: {
      OR: [{ proposedBy: fromLower }, { reviewedBy: fromLower }],
    },
    select: { id: true, proposedBy: true, reviewedBy: true },
  });
  for (const row of proposals) {
    await tx.resolutionProposal.update({
      where: { id: row.id },
      data: {
        proposedBy: row.proposedBy === fromLower ? toLower : row.proposedBy,
        reviewedBy:
          row.reviewedBy?.toLowerCase() === fromLower ? toLower : row.reviewedBy,
      },
    });
  }
  bump("ResolutionProposal", proposals.length);

  const resolverReqs = await tx.resolverRequest.findMany({
    where: {
      OR: [
        { requestedBy: fromLower },
        { suggested: fromLower },
        { reviewedBy: fromLower },
        { approvedBy: fromLower },
      ],
    },
  });
  for (const row of resolverReqs) {
    await tx.resolverRequest.update({
      where: { id: row.id },
      data: {
        requestedBy:
          row.requestedBy === fromLower ? toLower : row.requestedBy,
        suggested: row.suggested === fromLower ? toLower : row.suggested,
        reviewedBy: row.reviewedBy === fromLower ? toLower : row.reviewedBy,
        approvedBy: row.approvedBy === fromLower ? toLower : row.approvedBy,
      },
    });
  }
  bump("ResolverRequest", resolverReqs.length);

  bump(
    "ReferralCampaign",
    (
      await tx.referralCampaign.updateMany({
        where: { owner: fromLower },
        data: { owner: toLower },
      })
    ).count,
  );

  const earnings = await tx.referralEarning.findMany({
    where: { OR: [{ referrer: fromLower }, { referred: fromLower }] },
    select: { id: true, referrer: true, referred: true },
  });
  for (const row of earnings) {
    await tx.referralEarning.update({
      where: { id: row.id },
      data: {
        referrer: row.referrer === fromLower ? toLower : row.referrer,
        referred: row.referred === fromLower ? toLower : row.referred,
      },
    });
  }
  bump("ReferralEarning", earnings.length);

  bump(
    "ReferralCollection",
    (
      await tx.referralCollection.updateMany({
        where: { referrer: fromLower },
        data: { referrer: toLower },
      })
    ).count,
  );

  const referral = await tx.referralAttribution.findUnique({
    where: { referred: fromLower },
  });
  if (referral) {
    const existing = await tx.referralAttribution.findUnique({
      where: { referred: toLower },
    });
    if (!existing) {
      await tx.referralAttribution.update({
        where: { referred: fromLower },
        data: { referred: toLower },
      });
      bump("ReferralAttribution", 1);
    } else {
      await tx.referralAttribution.delete({ where: { referred: fromLower } });
      bump("ReferralAttribution.dropped", 1);
    }
  }

  bump(
    "BadgePurchase",
    (
      await tx.badgePurchase.updateMany({
        where: { address: fromLower },
        data: { address: toLower },
      })
    ).count,
  );

  const messages = await tx.directMessage.findMany({
    where: {
      OR: [{ sender: fromLower }, { recipient: fromLower }],
    },
  });
  for (const msg of messages) {
    const sender = msg.sender === fromLower ? toLower : msg.sender;
    const recipient = msg.recipient === fromLower ? toLower : msg.recipient;
    await tx.directMessage.update({
      where: { id: msg.id },
      data: {
        sender,
        recipient,
        pair: dmPair(sender, recipient),
      },
    });
  }
  bump("DirectMessage", messages.length);

  bump(
    "ChatMessage",
    (
      await tx.chatMessage.updateMany({
        where: { author: fromLower },
        data: { author: toLower },
      })
    ).count,
  );

  const mutes = await tx.chatMute.findMany({
    where: { OR: [{ address: fromLower }, { mutedBy: fromLower }] },
  });
  for (const row of mutes) {
    if (row.address === fromLower) {
      const existing = await tx.chatMute.findUnique({ where: { address: toLower } });
      if (existing && existing.address !== row.address) {
        await tx.chatMute.delete({ where: { address: row.address } }).catch(() => {});
      } else {
        await tx.chatMute.update({
          where: { address: row.address },
          data: {
            address: toLower,
            mutedBy: row.mutedBy === fromLower ? toLower : row.mutedBy,
          },
        });
      }
    } else {
      await tx.chatMute.update({
        where: { address: row.address },
        data: { mutedBy: toLower },
      });
    }
  }
  bump("ChatMute", mutes.length);

  bump(
    "Presence",
    (
      await tx.presence.updateMany({
        where: { address: fromLower },
        data: { address: toLower },
      })
    ).count,
  );

  const blocks = await tx.dmBlock.findMany({
    where: {
      OR: [{ blocker: fromLower }, { blocked: fromLower }],
    },
  });
  for (const row of blocks) {
    const blocker = row.blocker === fromLower ? toLower : row.blocker;
    const blocked = row.blocked === fromLower ? toLower : row.blocked;
    await tx.dmBlock
      .upsert({
        where: { blocker_blocked: { blocker, blocked } },
        update: {},
        create: { blocker, blocked },
      })
      .catch(() => {});
    await tx.dmBlock
      .delete({
        where: { blocker_blocked: { blocker: row.blocker, blocked: row.blocked } },
      })
      .catch(() => {});
  }
  bump("DmBlock", blocks.length);

  return { tables: stats };
}
