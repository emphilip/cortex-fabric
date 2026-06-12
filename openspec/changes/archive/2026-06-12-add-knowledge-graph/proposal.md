## Why

The original product brief asked for relationships between *concepts* — "we want to be able to name relationships for how concepts are related to each other. We need a way to do this automatically and then review and edit through an admin interface." Today the catalogue is a flat bag of documents and chunks. Vector search finds what's semantically close; the lexical leg finds what shares vocabulary; neither answers "what's connected, and how." That is exactly the gap `add-foundation`'s `knowledge-graph` capability promised to fill, and that `bootstrap-thin-mvp` deferred.

The probe that landed `bootstrap-thin-mvp` also surfaced a useful fact: Ollama Cloud refuses `/api/embed` for the reference account but happily serves `/api/chat` with `gemma3:4b`. This change finally puts that chat path to work as the **relationship extractor** that turns ingested chunks into typed edges between concepts. The Cloud key we already store in `.env` does real work now.

## What Changes

- **New first-class entity: `concept`.** Concepts are the nodes of the knowledge graph and are distinct from catalog `entity` rows (which are files / chunks). A concept has a stable `concept_id`, a canonical `name`, a normalised dedupe key, an optional `description`, an `aliases` array, and a `state` (`candidate` / `confirmed`). Concepts are stored in a Postgres table; the Apache AGE graph that's already loaded becomes the home for edges.
- **New edge model: typed, audited relationships between concepts.** Edges are typed from a curated **vocabulary** (a small extensible table seeded with `depends_on`, `defined_in`, `supersedes`, `mentions`, `related_to`, `causes`, `derived_from`). Every edge carries `state` (`candidate` / `confirmed`), `confidence`, `evidence_uri` (pointing at the source chunk), `extractor_version`, and timestamps. Candidate edges MUST NOT appear in traversal results by default.
- **Automatic extraction during ingestion.** When the git connector finishes upserting a chunk, the ingestion pipeline runs a *concept-and-relationship extractor* against that chunk's text using a chat model. The extractor emits a list of `{concept_a, relation, concept_b, evidence_span, confidence}` triples. Concepts are deduped by a normalised name key (Unicode-folded, case-folded, whitespace-collapsed). New concepts AND new edges land in `candidate` state.
- **New model client: `OllamaChat`.** A concrete chat client over the Ollama `/api/chat` shape with `Authorization: Bearer …` support (so it works against Ollama Cloud). The thin MVP got away with one model caller (embeddings); we now have two. To avoid premature abstraction we ship two concrete clients (`OllamaEmbeddings` + `OllamaChat`) plus a single shared `ProviderConfig` that selects per-capability `(provider, model, base_url, api_key)`. The full provider-protocol abstraction described in `add-foundation/specs/model-providers/spec.md` is still deferred until a *third* caller exists.
- **Vocabulary CRUD.** Admin API to list, add, edit, and deprecate relationship types. The vocabulary table seeds with the seven defaults above; deployments can extend it. Inserts of edges with an unknown vocabulary `type` are rejected at the database level.
- **Candidate review workflow.** Admin API and UI for browsing candidate concepts and edges, promoting them to `confirmed`, editing their type or endpoints, or deleting them. Every state transition writes an audit row (separate from the retrieval audit log) capturing actor, before, after, and reason.
- **`GET /graph/concepts` / `GET /graph/concepts/{id}` / `GET /graph/traverse`** read endpoints on the pipeline service, plus the corresponding admin write endpoints. `traverse` accepts a starting `concept_id`, an optional list of relationship `types`, a `depth` (default 2, max 4), and a result `limit` (default 50, max 200). Returns the reachable subgraph as `{nodes, edges}` and includes only `confirmed` edges unless `include_candidates=true` is set.
- **MCP `hive_mind/traverse_graph` tool wired up.** The tool's stub returning `not_implemented_in_mvp` is replaced with a real implementation that calls the pipeline's traverse endpoint and returns a structured payload.
- **Admin UI graph page at `/graph`.** Three sub-views in one page: (1) a concept browser with filters (`state`, search by name), (2) a concept-detail view showing the concept's confirmed and candidate neighbours, and (3) a candidate review queue ordered by `confidence DESC` with per-row promote / edit / reject actions. **Tabular only — no visual graph rendering in this change.** A small status badge per concept indicates state.
- **New shared types:** `Concept`, `ConceptListItem`, `RelationshipType`, `RelationshipEdge`, `EdgeState`, `TraverseRequest`, `TraverseResponse`, `ExtractionResult`.

## Capabilities

### New Capabilities

None — every capability touched already exists.

### Modified Capabilities

- `knowledge-graph`: every requirement currently set to "SHALL NOT in v0" by `bootstrap-thin-mvp` is brought online. Concept clustering stays deferred to a graph-analytics follow-up; everything else (named relationships, automatic extraction, candidate review workflow, traversal API) ships here.
- `mcp-server`: `hive_mind/traverse_graph` MUST return real results; the `not_implemented_in_mvp` error path for this tool is removed.
- `retrieval-pipeline`: ADDs `/graph/concepts`, `/graph/concepts/{id}`, `/graph/traverse`, plus admin write endpoints for vocabulary and edge state transitions. Per-stage token accounting MODIFIED to recognise the extraction stage that runs during ingestion. The retrieve path itself does NOT consult the graph in this change (that comes in a follow-up `add-graph-aware-retrieval` change so we can measure its impact in isolation).
- `ingestion`: the git connector's per-chunk pipeline gains a final step that calls the extractor and writes candidate concepts + edges. Extraction MUST be best-effort — an extractor failure on one chunk MUST NOT fail the ingest.
- `model-providers`: ADDs the `OllamaChat` client and a small `ProviderConfig` that names which `(provider, model, base_url, api_key)` powers each capability. The four-protocol abstraction described in `add-foundation` stays deferred.
- `admin-ui`: ADDs the `/graph` page with concept browser, concept detail, and candidate review queue. Storybook coverage is required for every new component (`ConceptRow`, `ConceptDetail`, `CandidateEdgeRow`, `RelationshipTypeBadge`).
- `entitlement-audit`: a new audit table `hive_mind.graph_audit_log` is added for graph state transitions. Same immutability semantics as the retrieval audit log.
- `catalog-store`: ADDs a small `evidence` cross-table linking edges to the catalog chunks they were extracted from, so candidate review can show the source span.

## Impact

- New Postgres tables: `hive_mind.concept`, `hive_mind.relationship_vocab`, `hive_mind.relationship_edge` (also reflected into AGE for traversal), `hive_mind.relationship_evidence`, `hive_mind.graph_audit_log`.
- Apache AGE: the empty `hive_mind` graph created at DB init gets edges + nodes inserted; openCypher queries are issued from the pipeline service.
- `services/pipeline` gains a new module `graph_routes.py` (mirrors `admin_routes.py`'s pattern), a small AGE query helper, and Ollama-Cloud-backed extractor wiring.
- `services/ingestion` gains a new chunk-post-process step calling the extractor; runs in the same `ingest_documents` loop but is wrapped in `try/except` so extractor failures only log.
- `services/admin-ui` gains the `/graph` route plus four shared components with stories and tests.
- `services/mcp-server` updates the `traverse_graph` tool handler.
- `hive-mind.yaml` + `.env.example` gain a `providers.chat` section (defaults to Ollama Cloud `gemma3:4b` since that's what we proved works) but the existing Cloud key reference is kept centralised in `.env`.
- New OTel span name: `pipeline.graph_extract`. New Prometheus counter: `hive_mind_extractor_edges_total{relation,state}`.

## Why this is one change, not two

The proposal could have been split into `add-knowledge-graph-storage` and `add-knowledge-graph-extraction`, but doing storage without extraction leaves an unusable feature shipped (operators can review an empty graph), and doing extraction without storage is incoherent. The unit that delivers value is "the graph is real, populated automatically, and reviewable" — that's one change. The visual graph rendering (Cytoscape over a subset) and graph-aware retrieval (`hybrid_retrieval` consults the graph) are explicitly deferred to follow-ups so each can be measured independently.
