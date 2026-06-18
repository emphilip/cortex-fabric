import Link from "next/link";
import type { EntityListItem } from "@opencg/shared";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export interface EntityRowProps {
  entity: EntityListItem;
}

function freshnessClass(state: string): string {
  if (state === "fresh") return "text-emerald-600 dark:text-emerald-400";
  if (state === "stale") return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

export function EntityRow({ entity }: EntityRowProps) {
  const tombstoned = entity.tombstoned_at != null;
  return (
    <Link
      href={`/entities/${entity.entity_id}`}
      className={cn(
        "grid grid-cols-[1fr_80px_90px_90px_140px_50px] items-center gap-3 border-b px-3 py-2 text-sm text-foreground no-underline transition-colors last:border-b-0 hover:bg-accent",
        tombstoned && "opacity-55",
      )}
    >
      <span className="truncate" title={entity.source_uri}>
        {entity.title ?? entity.source_uri}
      </span>
      <span className="font-mono text-xs text-muted-foreground">{entity.source}</span>
      <span className="text-xs text-muted-foreground">{entity.classification}</span>
      <span className={cn("text-xs", freshnessClass(entity.freshness_state))}>
        {entity.freshness_state}
      </span>
      <span className="font-mono text-xs text-muted-foreground">
        {new Date(entity.updated_at).toLocaleString()}
      </span>
      {tombstoned ? (
        <Badge variant="destructive" className="justify-self-start text-[11px]">
          RIP
        </Badge>
      ) : (
        <span />
      )}
    </Link>
  );
}
