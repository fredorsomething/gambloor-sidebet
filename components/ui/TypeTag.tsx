import { cn } from "@/lib/utils";

type Kind = "market" | "sidebet";

/**
 * Product-type tag shown on cards and detail headers: a purple "Market" badge
 * for CLOB markets and a blue "Sidebet" badge for 1v1 sidebets.
 */
export function TypeTag({
  kind,
  className,
}: {
  kind: Kind;
  className?: string;
}) {
  const isMarket = kind === "market";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white shadow-sm",
        isMarket ? "bg-[hsl(265_85%_55%)]" : "bg-[hsl(222_89%_55%)]",
        className,
      )}
    >
      {isMarket ? "Market" : "Sidebet"}
    </span>
  );
}
