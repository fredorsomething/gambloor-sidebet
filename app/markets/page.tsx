import { redirect } from "next/navigation";

/** Legacy route — all markets and sidebets live on the home feed. */
export default function MarketsPage() {
  redirect("/");
}
