## MODIFIED Requirements

### Requirement: Per-stage token accounting

Every stage that invokes a model SHALL record `model`, `provider`, `tokens_in`, `tokens_out` (when the response carries them), and `latency_ms` on its OTel span AND increment `hive_mind_tokens_total{stage,model,provider,tenant,direction}`.

Text relationship extraction MUST use `stage="graph_extract_text"` and emit an OTel span named `pipeline.graph_extract_text`. Deterministic Graphifyy extraction MUST use `stage="graph_extract_code"` and emit an OTel span named `pipeline.graph_extract_code` with `model="graphifyy"`, `provider="graphifyy"`, and zero tokens; it MUST NOT increment the token counter.

#### Scenario: Graph extraction token accounting

- **WHEN** the ingestion service runs the extractor on a chunk and the chat model returns a usable response
- **THEN** an OTel span `pipeline.graph_extract_text` is emitted with `model`, `provider`, `tokens_in`, `tokens_out`, and `latency_ms`
- **AND** `hive_mind_tokens_total{stage="graph_extract_text"}` increases by the recorded counts

#### Scenario: Code extraction emits a token-zero span

- **WHEN** the ingestion service runs Graphifyy on a code file
- **THEN** an OTel span `pipeline.graph_extract_code` is emitted with zero token attributes
- **AND** `hive_mind_tokens_total{stage="graph_extract_code"}` is not incremented

#### Scenario: Other stages unchanged

- **WHEN** a `/retrieve` call completes
- **THEN** the existing token attribution for `hybrid_retrieval` and the vector-search admin endpoint remains as before

## ADDED Requirements

### Requirement: Graph read endpoints

The pipeline service SHALL expose graph read endpoints used by the admin UI and the MCP `traverse_graph` tool:

- `GET /graph/concepts?state&search&include_tombstoned&limit&offset` — paginated browse with filters. `state` accepts a comma-separated set of `candidate|confirmed`. `search` is a case-insensitive name substring match. Defaults: `state=confirmed,candidate`, `include_tombstoned=false`, `limit=50` (max 200), `offset=0`.
- `GET /graph/concepts/{concept_id}` — single concept plus its immediate neighbours (confirmed + candidate, each with the connecting edge metadata).
- `GET /graph/traverse?concept_id=&types=&depth=&limit=&include_candidates=` — see the knowledge-graph spec for full semantics.
- `GET /graph/vocab` — list relationship types from `relationship_vocab`.
- `GET /graph/edges?state&type&limit&offset` — paginated edge browse used by the candidate review queue.

All endpoints MUST be read-only (no audit-row write side effects).

#### Scenario: List concepts with filters

- **WHEN** a client calls `GET /graph/concepts?state=candidate&search=prompt&limit=10`
- **THEN** the response is `{items:[…], total:<int>, limit:10, offset:0}` listing concepts in `candidate` state whose name contains "prompt" (case-insensitive)

#### Scenario: Concept detail with neighbours

- **WHEN** a client calls `GET /graph/concepts/{id}` for a concept that has 3 confirmed and 2 candidate edges
- **THEN** the response contains the concept plus `neighbours: { confirmed: […], candidate: […] }` with the edge metadata (type, confidence, evidence_uris) on each entry

#### Scenario: Edge browse paginated

- **WHEN** a client calls `GET /graph/edges?state=candidate&limit=20`
- **THEN** the response is `{items:[…], total:<int>}` with at most 20 candidate edges ordered by `confidence DESC, created_at DESC`

### Requirement: Graph admin write endpoints

The pipeline service SHALL expose graph admin write endpoints. Each MUST be idempotent where the operation is semantically idempotent (re-promoting an already-confirmed edge is a no-op), and every state transition MUST persist a row in `hive_mind.graph_audit_log`.

- `POST /graph/concepts/{id}/promote` — `{reason?}` → `state = confirmed`.
- `POST /graph/concepts/{id}/demote` — `{reason?}` → `state = candidate`.
- `DELETE /graph/concepts/{id}` — `{reason?}` → `state = tombstoned`.
- `POST /graph/concepts/merge` — `{into_id, from_ids[], reason?}` re-points edges, tombstones the merged-from concepts, and appends their aliases.
- `PATCH /graph/concepts/{id}` — `{name?, description?, aliases?}` updates editable fields.
- `POST /graph/edges/{id}/promote` — same shape as concepts.
- `POST /graph/edges/{id}/demote` — same shape.
- `DELETE /graph/edges/{id}` — tombstone.
- `PATCH /graph/edges/{id}` — `{type?, from_concept_id?, to_concept_id?}` edit endpoints or type.
- `POST /graph/vocab` — `{name, description?, inverse?, directed?}` add a relationship type.
- `PATCH /graph/vocab/{name}` — edit description / inverse / directed.
- `POST /graph/vocab/{name}/deprecate` — mark deprecated.

#### Scenario: Promotion writes audit row

- **WHEN** a client calls `POST /graph/concepts/{id}/promote` with `{reason:"reviewed"}`
- **THEN** the concept's `state` becomes `confirmed`
- **AND** a `graph_audit_log` row is written with `target_kind="concept"`, `from_state="candidate"`, `to_state="confirmed"`, `actor` derived from the identity stub, `reason="reviewed"`, and `before` / `after` snapshots

#### Scenario: Merging concepts re-points edges

- **WHEN** an admin calls `POST /graph/concepts/merge` with `{into_id:"A", from_ids:["B","C"], reason:"…"}`
- **THEN** every edge whose endpoint is `B` or `C` is re-pointed to `A`
- **AND** `B` and `C` are tombstoned
- **AND** their aliases are appended to `A.aliases` (deduped)

#### Scenario: Vocabulary insertion of a deprecated name fails

- **WHEN** an admin calls `POST /graph/vocab` with `{name:"causes"}` and `causes` is already deprecated
- **THEN** the response is `409 Conflict` with `code="vocab_name_in_use"`

### Requirement: Graph extraction is invoked during ingestion

The pipeline service SHALL expose a callable `extract_for_chunk(chunk_text, chunk_entity_id) -> ExtractionResult` used by the ingestion service after a chunk's vector is upserted. The function MUST:

1. Call the configured chat client (default Ollama Cloud) with a prompt naming the active relationship vocabulary.
2. Parse the response into a `Pydantic` `ExtractionResult` (concepts + relations).
3. Drop relations whose `confidence < min_confidence` (configurable).
4. Upsert concepts and edges in `candidate` state, write evidence rows, and reflect into AGE — all in a single transaction.
5. Emit the `pipeline.graph_extract` OTel span and the per-relation `hive_mind_extractor_edges_total{relation,state}` counter.

Failures MUST raise to the caller AND increment `hive_mind_extractor_errors_total{reason}`. The ingestion service catches and logs the exception so the chunk still completes.

#### Scenario: Successful extraction inserts concepts and edges in one transaction

- **WHEN** the ingestion service calls `extract_for_chunk` on a chunk with extractable content
- **THEN** all resulting concepts and edges land in a single Postgres transaction
- **AND** an AGE reflection writes the matching graph nodes/edges in the same transaction

#### Scenario: Configurable extraction disable

- **WHEN** `providers.chat.extraction.enabled = false`
- **THEN** `extract_for_chunk` is a no-op that returns an empty result without calling the chat model
- **AND** no extractor token counter increments
