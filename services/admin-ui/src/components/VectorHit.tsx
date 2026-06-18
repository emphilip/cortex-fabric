import type { VectorSearchHit } from "@opencg/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface VectorHitProps {
  hit: VectorSearchHit;
  rank: number;
  onShowNeighbours?: (hit: VectorSearchHit) => void;
}

export function VectorHit({ hit, rank, onShowNeighbours }: VectorHitProps) {
  return (
    <article className="grid grid-cols-[32px_1fr_110px] items-start gap-3 border-b p-3 last:border-b-0">
      <span className="font-mono text-[13px] text-muted-foreground">#{rank}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <strong className="font-mono">{hit.title ?? hit.entity_id}</strong>
          <span className="text-xs text-muted-foreground">{hit.source}</span>
          {hit.collection ? (
            <Badge
              variant="secondary"
              className="px-1.5 py-0 text-[11px] font-normal text-muted-foreground"
            >
              {hit.collection}
            </Badge>
          ) : null}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{hit.source_uri}</div>
        <p className="mt-2 text-[13px] leading-relaxed text-foreground/80">
          {hit.snippet}
        </p>
      </div>
      <div className="text-right">
        <div className="font-mono text-base font-semibold">{hit.score.toFixed(4)}</div>
        {onShowNeighbours ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onShowNeighbours(hit)}
            className="mt-1.5 text-xs text-primary"
          >
            show neighbours
          </Button>
        ) : null}
      </div>
    </article>
  );
}
