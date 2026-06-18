"use client";

import type { ConceptDetail as ConceptDetailType, Neighbour } from "@opencg/shared";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ConceptActions } from "../app/graph/GraphActions";
import { NeighbourRow } from "./NeighbourRow";

function stateDot(state: string) {
  return state === "confirmed"
    ? "bg-emerald-500"
    : state === "candidate"
      ? "bg-amber-500"
      : "bg-red-500";
}

function NeighbourList({
  items,
  onNavigate,
  empty,
}: {
  items: readonly Neighbour[];
  onNavigate: (conceptId: string) => void;
  empty: string;
}) {
  if (!items.length) return <p className="py-3 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div>
      {items.map((neighbour) => (
        <NeighbourRow key={neighbour.edge.edge_id} neighbour={neighbour} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

export function ConceptDetail({
  concept,
  onNavigate,
}: {
  concept: ConceptDetailType;
  onNavigate?: (conceptId: string) => void;
}) {
  const router = useRouter();
  const navigate = onNavigate ?? ((id: string) => router.push(`/graph?tab=map&focus=${id}`));

  const confirmed = concept.neighbours_confirmed;
  const candidate = concept.neighbours_candidate;
  const all = [...confirmed, ...candidate];
  const outgoing = all.filter((n) => n.edge.from_concept_id === concept.concept_id).length;
  const incoming = all.filter((n) => n.edge.to_concept_id === concept.concept_id).length;
  const defaultTab = confirmed.length || !candidate.length ? "confirmed" : "candidate";

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-2">
          <span
            className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", stateDot(concept.state))}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold" title={concept.name}>
              {concept.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {concept.state}
              {concept.symbol_kind ? ` · ${concept.symbol_kind}` : ""}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Concept actions" className="h-7 w-7">
                ⋯
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <ConceptActions conceptId={concept.concept_id} layout="menu" />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="text-sm text-muted-foreground">{concept.description || "No description."}</p>

        <dl className="space-y-1 text-xs">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-muted-foreground">Aliases</dt>
            <dd className="min-w-0">{concept.aliases.length ? concept.aliases.join(", ") : "none"}</dd>
          </div>
          {concept.source_entity_id ? (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-muted-foreground">Source</dt>
              <dd className="min-w-0 truncate">
                <a
                  href={`/entities/${concept.source_entity_id}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  source entity
                </a>
              </dd>
            </div>
          ) : null}
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-muted-foreground">Degree</dt>
            <dd>
              {incoming} in · {outgoing} out
            </dd>
          </div>
        </dl>

        <Tabs defaultValue={defaultTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="confirmed">Confirmed {confirmed.length}</TabsTrigger>
            <TabsTrigger value="candidate">Candidate {candidate.length}</TabsTrigger>
          </TabsList>
          <TabsContent value="confirmed">
            <NeighbourList items={confirmed} onNavigate={navigate} empty="No confirmed neighbours." />
          </TabsContent>
          <TabsContent value="candidate">
            <NeighbourList items={candidate} onNavigate={navigate} empty="No candidate neighbours." />
          </TabsContent>
        </Tabs>

        {concept.extractor_version || concept.created_at ? (
          <div className="flex justify-between border-t pt-2 text-xs text-muted-foreground">
            <span>{concept.extractor_version ?? ""}</span>
            <span>{concept.created_at ? `added ${concept.created_at.slice(0, 10)}` : ""}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
