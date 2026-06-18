"use client";

import type { Neighbour } from "@opencg/shared";
import { RelationshipTypeBadge } from "./RelationshipTypeBadge";

export function NeighbourRow({
  neighbour,
  onNavigate,
}: {
  neighbour: Neighbour;
  onNavigate: (conceptId: string) => void;
}) {
  const { edge, peer, evidence_entity_ids } = neighbour;
  return (
    <div className="flex flex-col gap-1 border-b py-2 last:border-b-0">
      <div className="flex items-center gap-2 text-sm">
        <RelationshipTypeBadge type={edge.type} />
        <button
          type="button"
          onClick={() => onNavigate(peer.concept_id)}
          title={peer.name}
          className="min-w-0 flex-1 truncate text-left text-primary underline-offset-4 hover:underline"
        >
          {peer.name}
        </button>
        <span className="shrink-0 text-xs text-muted-foreground">{edge.confidence.toFixed(2)}</span>
      </div>
      {evidence_entity_ids.length ? (
        <div className="flex flex-wrap gap-2 pl-1">
          {evidence_entity_ids.map((id) => (
            <a
              key={id}
              href={`/entities/${id}`}
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              evidence
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
