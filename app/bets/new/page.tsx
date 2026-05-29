import { ChainGuard } from "@/components/ChainGuard";
import { CreateBetForm } from "@/components/CreateBetForm";

export default function NewBetPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Propose a sidebet</h1>
        <p className="text-sm text-muted-foreground">
          Define your terms, stake your collateral, and choose a settler. Your
          stake stays in the escrow contract until someone takes the other side.
        </p>
      </div>
      <ChainGuard>
        <CreateBetForm />
      </ChainGuard>
    </div>
  );
}
