import type { ConceptDetail as ConceptDetailType } from "@cortex/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConceptActions } from "../app/graph/GraphActions";
import { CandidateEdgeRow } from "./CandidateEdgeRow";

export function ConceptDetail({ concept }: { concept: ConceptDetailType }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{concept.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <ConceptActions conceptId={concept.concept_id} />
        <p className="text-sm">{concept.description || "No description."}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          <strong className="text-foreground">State:</strong> {concept.state} · <strong className="text-foreground">Aliases:</strong> {concept.aliases.join(", ") || "none"}
        </p>
        <h3 className="mb-1 mt-4 text-sm font-semibold">Confirmed neighbours</h3>
        {concept.neighbours_confirmed.length ? concept.neighbours_confirmed.map((item) => <CandidateEdgeRow key={item.edge.edge_id} edge={item.edge} evidenceEntityIds={[...item.evidence_entity_ids]} />) : <p className="text-sm text-muted-foreground">No confirmed neighbours.</p>}
        <h3 className="mb-1 mt-4 text-sm font-semibold">Candidate neighbours</h3>
        {concept.neighbours_candidate.length ? concept.neighbours_candidate.map((item) => <CandidateEdgeRow key={item.edge.edge_id} edge={item.edge} evidenceEntityIds={[...item.evidence_entity_ids]} />) : <p className="text-sm text-muted-foreground">No candidate neighbours.</p>}
      </CardContent>
    </Card>
  );
}
