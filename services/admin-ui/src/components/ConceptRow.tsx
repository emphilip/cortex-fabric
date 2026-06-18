import Link from "next/link";
import type { ConceptListItem } from "@opencg/shared";
import { cn } from "@/lib/utils";

export function ConceptRow({ concept }: { concept: ConceptListItem }) {
  return (
    <Link
      href={`/graph?concept_id=${concept.concept_id}`}
      className="grid grid-cols-[1fr_110px_100px] items-center gap-3 border-b px-2 py-2.5 text-sm text-foreground no-underline transition-colors hover:bg-accent/50"
    >
      <span>
        <strong>{concept.name}</strong>
        <br />
        <small className="text-muted-foreground">{concept.aliases.join(", ") || "no aliases"}</small>
      </span>
      <span
        className={cn(
          concept.state === "confirmed"
            ? "text-emerald-600 dark:text-emerald-400"
            : concept.state === "candidate"
              ? "text-amber-600 dark:text-amber-400"
              : "text-red-600 dark:text-red-400"
        )}
      >
        {concept.state}
      </span>
      <span className="text-muted-foreground">{concept.confidence?.toFixed(2) ?? "n/a"}</span>
    </Link>
  );
}
