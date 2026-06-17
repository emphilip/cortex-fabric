## ADDED Requirements

### Requirement: Code-graph names derive from the real source path

graphifyy derives node labels and per-symbol ids from the file path it is given. Because the git connector exposes only a file **body** and a **repo-relative path** (`doc.metadata["path"]`) and never an on-disk location, the ingestion service SHALL materialise each code file under its true repo-relative path (e.g. `<tmpdir>/evals/checks.py`) before invoking `graphify.extract([path])` or `chunk_code_by_symbols(path, body)`.

Module/file node labels and per-symbol ids MUST derive from that repo-relative path. The service MUST NOT feed graphifyy a randomly-named or otherwise transient filename whose stem would leak into node labels or symbol identifiers. Any temporary on-disk materialisation MUST be removed after extraction completes, including on the error/fallback path.

#### Scenario: Code-file node reflects its real basename

- **WHEN** the symbol chunker processes `evals/checks.py` from a git ingest whose cloned working tree is no longer on disk
- **THEN** the persisted module/file node is labelled `checks.py` (its real basename)
- **AND** no persisted node label or `symbol_id` contains a transient `tmp`-prefixed random stem

#### Scenario: Repeated extraction of identical content is stable

- **WHEN** the same file body and repo-relative path are extracted twice
- **THEN** the `symbol_id` values produced are identical across both runs

## MODIFIED Requirements

### Requirement: Symbol identity flows through the catalog

The catalog `metadata` JSONB on chunks produced by `chunk_code_by_symbols` MUST include:

- `symbol_id` (graphifyy's stable per-symbol id derived from the file's **repo-relative path**, e.g., `auth_middleware_verify_token`; it MUST NOT contain a transient or randomly-generated filename stem)
- `symbol_kind` (one of `class`, `function`, `method`, `module`)
- `start_line`, `end_line` (integers)
- `extractor_version` (e.g., `graphifyy/0.8.38`)

These fields MUST be queryable via the existing `GET /entities/{id}` endpoint without changes to the route schema.

The chunk's `entity_id` MUST be derived as `uuid5(_SYMBOL_NS, f"{parent_entity_id}:{symbol_id}")` for symbol-aligned chunks. Because `symbol_id` derives from the stable repo-relative path rather than a transient temp filename, re-ingest of an unchanged file produces stable IDs and upserts are idempotent.

#### Scenario: Symbol chunk metadata is queryable

- **WHEN** an admin calls `GET /entities/{chunk_id}` on a symbol-aligned chunk
- **THEN** the response's `metadata` block contains `symbol_id`, `symbol_kind`, `start_line`, `end_line`, and `extractor_version`

#### Scenario: Idempotent re-ingest of unchanged code

- **WHEN** a repo is re-ingested without changes
- **THEN** existing symbol chunks have unchanged `entity_id` values
- **AND** the catalog rows upsert in place (no duplicate rows)
- **AND** no symbol chunk's `symbol_id` contains a transient temp-file stem
- **AND** the existing graph concepts and edges are unchanged
