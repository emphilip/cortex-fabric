## ADDED Requirements

### Requirement: Named relationship vocabulary

The graph schema SHALL represent concept-to-concept relationships as named edges drawn from a curated vocabulary stored in `hive_mind.relationship_vocab`. The vocabulary table seed under this change MUST contain ten names: `depends_on`, `defined_in`, `supersedes`, `mentions`, `related_to`, `causes`, `derived_from`, plus `calls`, `imports`, `uses`. Each seed row MUST have `directed = true`, `deprecated_at = null`, and a human-readable `description`.

The `name` column of `relationship_edge` MUST FK to `relationship_vocab.name` so inserts with an unknown vocabulary name fail at the database.

#### Scenario: Ten seeded vocabulary entries on a fresh database

- **WHEN** the database first starts under this change
- **THEN** `relationship_vocab` contains the ten seeded names with `deprecated_at IS NULL`

#### Scenario: Vocabulary FK rejects unknown names

- **WHEN** any caller attempts to insert a `relationship_edge` row with `type = "smells_like"`
- **THEN** the insert fails with a foreign-key violation

### Requirement: Deterministic code-graph extraction during ingestion

For every code file (where `is_code_path(path)` is true), the ingestion service SHALL invoke `graphify.extract([path])` exactly once per file, then persist the resulting `{nodes, edges}` to `hive_mind.concept`, `hive_mind.relationship_edge`, and `hive_mind.relationship_evidence` via the `graph_writer` module. The persistence MUST run inside a single Postgres transaction so a partial failure leaves no orphan rows.

Code extraction MUST NOT call any chat model. Code extraction MUST be best-effort: a graphifyy failure on one file MUST NOT abort the surrounding ingest — the file's catalog row and (text-fallback) chunks still upsert.

#### Scenario: Python file extraction is deterministic and silent

- **WHEN** ingestion processes a Python file containing two classes and a top-level function
- **THEN** `graphify.extract` is called exactly once for that file
- **AND** no chat-model call is made for any chunk derived from that file
- **AND** the resulting concepts and edges land in `hive_mind.concept` / `hive_mind.relationship_edge` in a single transaction

#### Scenario: Code file with zero symbols does not produce graph rows

- **WHEN** ingestion processes a `.py` file that contains only configuration constants (no `def`, no `class`)
- **THEN** the paragraph chunker handles embedding
- **AND** no concept or edge rows are written for that file

#### Scenario: Extraction failure does not abort the ingest

- **WHEN** graphifyy raises on a single corrupted file
- **THEN** the surrounding files in the same repo are still ingested
- **AND** a structured warning is logged naming the failed file

### Requirement: Auto-confirmation policy for code-graph rows

The `graph_writer` module SHALL assign `state` and numeric `confidence` to graphifyy-extracted rows according to graphifyy's `confidence` label:

- `EXTRACTED` → `state = "confirmed"`, `confidence = 1.0`
- `INFERRED` → `state = "confirmed"`, `confidence = 0.85`
- `AMBIGUOUS` → `state = "candidate"`, `confidence = 0.5`

Every persisted row MUST record `extractor_version` as `graphifyy/{version}` so admins can identify provenance.

#### Scenario: EXTRACTED edge lands confirmed

- **WHEN** the graph writer persists an edge with graphifyy confidence label `EXTRACTED`
- **THEN** the row's `state` is `confirmed` and `confidence` is `1.0`

#### Scenario: AMBIGUOUS edge enters the review queue

- **WHEN** the graph writer persists an edge with graphifyy confidence label `AMBIGUOUS`
- **THEN** the row's `state` is `candidate` and `confidence` is `0.5`

#### Scenario: INFERRED edge is confirmed at a lower confidence

- **WHEN** the graph writer persists an edge with graphifyy confidence label `INFERRED`
- **THEN** the row's `state` is `confirmed` and `confidence` is `0.85`

### Requirement: Graphifyy relation mapping

Graphifyy emits relation names richer than the seeded vocabulary. The `graph_writer` module SHALL map them onto in-vocabulary names before insert:

- `calls` → `calls`
- `imports` → `imports`
- `imports_from` → `imports`
- `contains` → `defined_in`
- `method` → `defined_in`
- `uses` → `uses`

Any graphifyy relation outside this map MUST be skipped with a debug log entry; no edge row is inserted for it.

#### Scenario: contains and method both map to defined_in

- **WHEN** the writer processes graphifyy edges with relations `contains` and `method`
- **THEN** the resulting `relationship_edge` rows both carry `type = "defined_in"`

#### Scenario: imports_from maps to imports

- **WHEN** the writer processes a graphifyy edge with relation `imports_from`
- **THEN** the resulting `relationship_edge` row carries `type = "imports"`

#### Scenario: Unknown relation is dropped

- **WHEN** the writer encounters a graphifyy edge with relation `smells_like` (not in the map)
- **THEN** no edge row is written for that triple
- **AND** the writer continues with subsequent edges

### Requirement: External target concept creation

When graphifyy emits an edge whose target is a string that isn't itself an AST node in the same extraction (e.g., `imports os` where `os` is an external module), the `graph_writer` SHALL create a concept row for that target on the fly so the edge has a valid `to_concept_id`. The on-the-fly concept MUST land at `state = "confirmed"`, `confidence = 1.0`, and dedupe on the normalised target name.

#### Scenario: imports os creates the os concept

- **WHEN** the writer processes an edge `(module, "imports", "os")` and no node with id `"os"` exists in the extraction
- **THEN** a new `hive_mind.concept` row is created with `name = "os"` and `state = "confirmed"`
- **AND** the edge's `to_concept_id` references the new concept

### Requirement: Symbol identity flows through the catalog

The catalog `metadata` JSONB on chunks produced by `chunk_code_by_symbols` MUST include:

- `symbol_id` (graphifyy's stable per-symbol id, e.g., `auth_middleware_verify_token`)
- `symbol_kind` (one of `class`, `function`, `method`, `module`)
- `start_line`, `end_line` (integers)
- `extractor_version` (e.g., `graphifyy/0.8.38`)

These fields MUST be queryable via the existing `GET /entities/{id}` endpoint without changes to the route schema.

The chunk's `entity_id` MUST be derived as `uuid5(_SYMBOL_NS, f"{parent_entity_id}:{symbol_id}")` for symbol-aligned chunks, so re-ingest of an unchanged file produces stable IDs and upserts are idempotent.

#### Scenario: Symbol chunk metadata is queryable

- **WHEN** an admin calls `GET /entities/{chunk_id}` on a symbol-aligned chunk
- **THEN** the response's `metadata` block contains `symbol_id`, `symbol_kind`, `start_line`, `end_line`, and `extractor_version`

#### Scenario: Idempotent re-ingest of unchanged code

- **WHEN** a repo is re-ingested without changes
- **THEN** existing symbol chunks have unchanged `entity_id` values
- **AND** the catalog rows upsert in place (no duplicate rows)
- **AND** the existing graph concepts and edges are unchanged

### Requirement: Graph rows persist via a single transaction

The `graph_writer.write_code_graph` function SHALL wrap all node and edge inserts for a single file in one Postgres transaction acquired from the catalog's connection pool. A failure on any insert MUST roll back every prior insert for that file. The function MUST return `(concepts_written, edges_written)` counts so the caller can record metrics.

#### Scenario: Transaction wraps multi-statement write

- **WHEN** the writer processes one file's nodes and edges
- **THEN** all SQL statements execute inside a single `BEGIN/COMMIT` block
- **AND** the returned counts equal the number of rows successfully inserted
