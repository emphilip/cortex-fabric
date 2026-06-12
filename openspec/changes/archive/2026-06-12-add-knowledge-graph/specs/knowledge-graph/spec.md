## MODIFIED Requirements

### Requirement: Named relationship vocabulary

The graph schema SHALL represent concept-to-concept relationships as **named edges** drawn from a curated, extensible vocabulary stored in `hive_mind.relationship_vocab`. Vocabulary rows SHALL include `name` (primary key), `description`, `inverse` (optional name of the inverse relation), `directed` (boolean, default true), and `deprecated_at` (nullable timestamp). The vocabulary MUST be seeded at DB init with at least: `depends_on`, `defined_in`, `supersedes`, `mentions`, `related_to`, `causes`, `derived_from`.

The deterministic code extractor also requires the seeded names `calls`, `imports`, and `uses`, for a total of ten default vocabulary entries.

Edges in `hive_mind.relationship_edge` SHALL carry a `type TEXT` column with a FK to `relationship_vocab.name`. Inserts with an unknown name MUST fail at the database level.

The vocabulary table MUST be editable through an admin API: add a row, edit `description` / `inverse` / `directed`, mark a row deprecated. Marking a row deprecated MUST NOT delete it nor cascade to existing edges.

#### Scenario: Vocabulary FK rejects unknown names

- **WHEN** any caller attempts to insert into `hive_mind.relationship_edge` with `type = "nonsense"`
- **THEN** the insert fails with a foreign key violation

#### Scenario: Vocabulary seeded at init

- **WHEN** the database first starts under this change
- **THEN** `relationship_vocab` contains the ten seeded semantic and code relationship names with `deprecated_at IS NULL`

#### Scenario: Admin adds a new relationship type

- **WHEN** an admin posts `{name:"compatible_with", description:"…", inverse:"compatible_with", directed:false}` to the vocabulary admin endpoint
- **THEN** subsequent inserts using `compatible_with` are accepted

#### Scenario: Deprecation preserves existing edges

- **WHEN** an admin deprecates the `causes` vocabulary row
- **THEN** existing edges with `type = "causes"` continue to traverse normally
- **AND** new edge inserts with `type = "causes"` are rejected with a `vocab_deprecated` error

## ADDED Requirements

### Requirement: Automatic relationship extraction

Ingestion SHALL run a *concept-and-relationship extractor* on every chunk after the chunk's vector point is upserted to Qdrant. The extractor MUST call a chat model (default: Ollama Cloud `gemma3:4b`) and request a structured JSON output containing `concepts` and `relations`. Concepts MUST be deduped against `hive_mind.concept` by a normalised `dedupe_key` (Unicode-folded, case-folded, whitespace-collapsed). New concepts AND new edges land in `state = "candidate"`.

The extractor MUST be best-effort: a failure (timeout, parse error, model unavailable) on one chunk MUST NOT fail the ingest. Failures MUST increment `hive_mind_extractor_errors_total{reason}` and log a structured warning naming the chunk's `entity_id`.

Every extracted edge MUST carry a `confidence FLOAT`, an `evidence_uri TEXT` pointing at the source chunk's `entity_id`, and an `extractor_version TEXT`. Edges below a configurable `min_confidence` (default 0.6) MUST NOT be inserted at all.

#### Scenario: Extractor finds two new concepts and an edge in a chunk

- **WHEN** a newly upserted chunk's text mentions "Service A depends on Service B"
- **THEN** two `candidate` concept rows are created with `name` = `Service A` / `Service B` and normalised `dedupe_key`s
- **AND** a `candidate` edge is created with `type = "depends_on"`, `evidence_uri` referencing the chunk, and `confidence ≥ 0.6`

#### Scenario: Extractor reuses an existing concept

- **WHEN** a chunk mentions "Prompt Caching" and a concept with `dedupe_key = "prompt caching"` already exists
- **THEN** no new concept is created
- **AND** any new edge refers to the existing concept's `concept_id`

#### Scenario: Extractor failure does not fail the ingest

- **WHEN** the chat model is unreachable during a chunk's extraction pass
- **THEN** the chunk's catalog row and Qdrant point are still upserted
- **AND** `hive_mind_extractor_errors_total{reason}` increments
- **AND** no concept or edge rows are written for that chunk

#### Scenario: Edges below the confidence threshold are dropped

- **WHEN** the extractor returns an edge with `confidence = 0.3` and the configured `min_confidence` is `0.6`
- **THEN** no edge row is written for that triple

### Requirement: Review, promote, edit, and delete

The admin API SHALL expose endpoints to list, promote, edit, and delete both candidate concepts and candidate edges. Every state transition MUST write a row to `hive_mind.graph_audit_log` (separate from the retrieval audit log) capturing `actor`, `target_id`, `target_kind ∈ {concept, edge, vocab}`, `from_state`, `to_state`, `reason`, `at`, and a JSONB `before` / `after` snapshot.

Promotion changes `state` from `candidate` to `confirmed`. Demotion (`confirmed → candidate`) MUST also be supported. Soft-delete (`* → tombstoned`) MUST be supported. `tombstoned` rows MUST NOT appear in traversal or browse responses by default.

#### Scenario: Admin promotes a candidate edge

- **WHEN** an admin posts `POST /graph/edges/{id}/promote` with a reason
- **THEN** the edge's `state` becomes `confirmed`
- **AND** a `graph_audit_log` row is written with `from_state = "candidate"`, `to_state = "confirmed"`, `actor`, `reason`, and the before/after snapshots

#### Scenario: Admin edits an edge type

- **WHEN** an admin posts `PATCH /graph/edges/{id}` with `{type:"defined_in"}` (assume the original type was `mentions`)
- **THEN** the edge's type changes to `defined_in`
- **AND** a `graph_audit_log` row is written with `target_kind = "edge"` and a `before` snapshot containing the old type

#### Scenario: Admin tombstones a concept

- **WHEN** an admin posts `DELETE /graph/concepts/{id}`
- **THEN** the concept's `state` becomes `tombstoned`
- **AND** subsequent `GET /graph/concepts` and `GET /graph/traverse` calls exclude it by default

### Requirement: Graph traversal API

The system SHALL expose `GET /graph/traverse?concept_id=…&types=…&depth=…&limit=…&include_candidates=…` returning the reachable subgraph as `{nodes: [...], edges: [...]}`. `depth` defaults to `2` and is capped at `4`. `limit` defaults to `50` and is capped at `200`. `types` accepts a comma-separated list of vocabulary names; absence means "all types". `include_candidates` defaults to `false`; when `true`, candidate edges and their endpoints are included.

The endpoint MUST execute the traversal via Apache AGE (openCypher) against the `hive_mind` graph, then hydrate node rows from `hive_mind.concept` so `name`, `description`, and `state` are present.

#### Scenario: Bounded depth traversal

- **WHEN** a caller calls traverse with `concept_id = C1`, `depth = 2`, `types = "depends_on"`, `limit = 50`
- **THEN** the response contains at most 50 nodes reachable via up to two `depends_on` hops from `C1`
- **AND** confirmed edges only — candidate edges are not present

#### Scenario: Include candidates flag

- **WHEN** the same caller passes `include_candidates = true`
- **THEN** candidate edges and the candidate concepts they connect to are included
- **AND** each node and edge in the response carries its `state` field

#### Scenario: Cap enforcement

- **WHEN** a caller passes `depth = 10`
- **THEN** the request is rejected with `400 Bad Request` and an error message naming the depth cap

### Requirement: Concept clustering for review

Deferred. The system SHALL NOT compute or expose concept clusters in this change. A follow-up change (`add-graph-analytics`) introduces clustering and the corresponding admin UI surface.

#### Scenario: Clustering endpoint is absent

- **WHEN** a caller queries any `/graph/clusters` endpoint
- **THEN** the pipeline returns `404 Not Found`

### Requirement: Concept identity and lifecycle

The system SHALL maintain a `hive_mind.concept` table with `concept_id UUID PRIMARY KEY`, `tenant TEXT NOT NULL`, `name TEXT NOT NULL`, `dedupe_key TEXT NOT NULL`, `description TEXT`, `aliases TEXT[] NOT NULL DEFAULT '{}'`, `state TEXT NOT NULL DEFAULT 'candidate'`, `confidence FLOAT`, `extractor_version TEXT`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`, `tombstoned_at TIMESTAMPTZ`. A UNIQUE constraint on `(tenant, dedupe_key)` enforces dedupe.

The `dedupe_key` MUST be computed as `lower(unaccent(regexp_replace(trim(name), '\s+', ' ', 'g')))` so visually-equivalent surface forms collide.

#### Scenario: Dedupe key catches case and whitespace variants

- **WHEN** the extractor inserts `name = "Prompt Caching"` and later `name = " PROMPT  CACHING "`
- **THEN** the second insert collides on `(tenant, dedupe_key)` and the existing concept is reused
- **AND** the new surface form is appended to `aliases` if it is not already present

#### Scenario: Tombstoned concepts are excluded from browse

- **WHEN** an admin tombstones a concept
- **THEN** `GET /graph/concepts` excludes it by default
- **AND** the concept can be re-included by passing `include_tombstoned=true`

### Requirement: Evidence linkage

Every candidate edge SHALL have at least one row in `hive_mind.relationship_evidence` linking it to the source chunk's `entity_id` (`hive_mind.entity`), with a `span TEXT` (optional, the supporting text fragment), `extractor_version`, and `confidence`. Promotion to `confirmed` MUST preserve all evidence rows.

#### Scenario: Evidence row written alongside candidate edge

- **WHEN** the extractor inserts a candidate edge from a specific chunk
- **THEN** a row in `relationship_evidence` is written with the chunk's `entity_id`, the edge's `edge_id`, the `extractor_version`, and the `confidence`

#### Scenario: Multiple chunks support the same edge

- **WHEN** the same `(from, type, to)` triple is extracted from two different chunks
- **THEN** the edge is deduped (one row in `relationship_edge`)
- **AND** two rows exist in `relationship_evidence`, one per chunk

### Requirement: Graph audit log immutability

The `hive_mind.graph_audit_log` table SHALL be append-only with the same immutability semantics as `hive_mind.audit_log`: a trigger MUST forbid `DELETE` and forbid `UPDATE` on every column. Partitioning by week MAY be deferred to the operations follow-up change.

#### Scenario: Cannot update a graph audit row

- **WHEN** any code path attempts to `UPDATE` or `DELETE` a `graph_audit_log` row
- **THEN** the database raises an error and the operation fails
