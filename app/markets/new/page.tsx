import { redirect } from "next/navigation";

export default function NewMarketPage() {
  redirect("/create?type=market");
}
