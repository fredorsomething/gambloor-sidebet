import { NextRequest } from "next/server";

import {
  handleGetSentiment,
  handlePostSentiment,
} from "@/lib/sentimentHandlers";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return handleGetSentiment(req, "market", params.id);
}

export function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handlePostSentiment(req, "market", params.id);
}
