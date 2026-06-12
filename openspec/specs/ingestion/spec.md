# Ingestion

## Purpose

Ingest external knowledge through shared CLI and HTTP connector implementations with observable run status.
## Requirements
### Requirement: Connector framework

The ingestion service SHALL continue to expose connectors through both a CLI binary AND an HTTP surface as established by prior changes. This change MODIFIES the file-discovery and chunking layer used by every connector: discovery delegates to `graphify.collect_files(target_path)`, and chunking is **type-aware** — code files use symbol-level chunking via `graphify.extract([path])`, non-code files use the existing paragraph chunker.

The connector framework MUST NOT bypass either path. Every newly-ingested file MUST be dispatched by extension (or by an explicit `force_text` override on the connector configuration) to exactly one of the two chunkers.

#### Scenario: Code file is dispatched to symbol chunker

- **WHEN** the git connector processes a file whose extension is in the graphifyy code-extensions set (Python, TypeScript, Go, Rust, Java, etc.)
- **THEN** chunking calls `chunk_code_by_symbols(path, body)` which invokes graphifyy's extractor
- **AND** one chunk is produced per symbol (class, function, method)

#### Scenario: Markdown file is dispatched to paragraph chunker

- **WHEN** the git connector processes a `.md` file
- **THEN** chunking calls the existing `chunk_text(body)` paragraph chunker
- **AND** graphifyy's extractor is not invoked

### Requirement: Git connector

The git connector SHALL clone the repo, derive stable entity IDs from `(tenant, source_uri)`, compute content hashes, and emit `GitDocument`s.

File discovery MUST use `graphify.collect_files(repo_path)` and honour `.graphifyignore`. Code files MUST use symbol-aware graphifyy chunking; non-code files MUST use the paragraph chunker. Per-file discovery or parse failures MUST log a structured warning and allow the ingest to continue.

The git connector's per-chunk pipeline SHALL gain a final step that calls `extract_for_chunk` after the chunk's vector is upserted into Qdrant. The extraction step MUST run synchronously in the same chunk loop and MUST be wrapped in try/except so a single failure does not abort the ingest.

The connector MUST NOT block on extraction longer than the configured `extraction.timeout_seconds` (default 30). Exceeding the timeout cancels the extractor call, logs the timeout, and proceeds to the next chunk.

#### Scenario: Discovery uses graphifyy's language-aware filter

- **WHEN** the git connector ingests a repo that contains `.kt` (Kotlin) and `.swift` files
- **THEN** the Kotlin and Swift files appear in the document stream
- **AND** the connector code contains no extension allow-list

#### Scenario: `.graphifyignore` is respected

- **WHEN** the cloned repo contains a `.graphifyignore` file listing `vendor/`
- **THEN** files under `vendor/` are not yielded by the connector

#### Scenario: Per-file parse failure does not abort the ingest

- **WHEN** graphifyy's discovery or extraction raises on a single corrupted file
- **THEN** the connector logs a structured warning naming the path
- **AND** the surrounding files in the same repo are still ingested

#### Scenario: Extraction runs after vector upsert

- **WHEN** the git connector processes a chunk that produces an embedding successfully
- **THEN** the embedding is upserted to Qdrant
- **AND** `extract_for_chunk` is then called for the same chunk

#### Scenario: Extraction timeout does not stop the ingest

- **WHEN** the chat model hangs and the extractor times out on chunk N
- **THEN** chunk N's catalog row and Qdrant point remain in place
- **AND** the connector continues to chunk N+1
- **AND** a structured warning is logged naming the chunk's `entity_id`

### Requirement: Ingestion HTTP surface

The ingestion service SHALL expose the following HTTP endpoints on port `8100`:

- `GET /healthz` - liveness, returns `{"status":"ok"}`.
- `GET /readyz` - readiness; returns `200` once the underlying storage (Postgres + Qdrant + Ollama embeddings) is reachable.
- `GET /connectors` - returns a JSON array of `{name, supported, reason?}` entries. `git` MUST have `supported = true`. `confluence`, `custom-api`, and `web` MUST have `supported = false` with a `reason` naming the change that will implement them.
- `POST /run/git` - body `{"repo_url": <string>}`. MUST return `{run_id, status}` immediately and execute the git ingest in a background task using the same `pipeline_runner.run` code path as the CLI.
- `GET /runs/recent` - returns the most recent 100 runs as `[{run_id, connector, repo, started_at, finished_at, status, parents, chunks, error}]`, in-memory.

Run history MAY be in-memory only. Durability across container restarts is deferred to a follow-up change.

#### Scenario: Health endpoints

- **WHEN** the ingestion service is up
- **THEN** `GET /healthz` returns `200` with `{"status":"ok"}`
- **AND** `GET /readyz` returns `200` only when the storage backends are reachable

#### Scenario: Connectors enumeration

- **WHEN** a client calls `GET /connectors`
- **THEN** the response contains `git` with `supported = true`
- **AND** the response contains `confluence`, `custom-api`, and `web` with `supported = false` and a `reason` field

#### Scenario: Run lifecycle observable via /runs/recent

- **WHEN** a `POST /run/git` triggers a background run that eventually succeeds
- **THEN** `GET /runs/recent` shows the run progressing through `queued → running → succeeded`
- **AND** the final entry carries the populated `parents` and `chunks` counts

#### Scenario: Run failure surfaces error

- **WHEN** a `POST /run/git` triggers a background run that fails (e.g. unreachable repo)
- **THEN** the `/runs/recent` entry for that run reaches `status = failed`
- **AND** the entry carries a non-empty `error` string

### Requirement: Symbol-level code chunking

The ingestion service SHALL provide `chunk_code_by_symbols(path, source_text) -> list[Chunk]`. The function MUST:

1. Call `graphify.extract([path])` to obtain the file's symbol nodes.
2. For each node, extract the source-text span between the symbol's start and end lines.
3. Yield one `Chunk` per symbol, in document order, with chunk metadata including the symbol's stable id (`module.path.ClassName.method_name` shape), the symbol kind (`class` / `function` / `method`), and the start/end line numbers.

Edge handling:
- Symbols smaller than the configured `min_symbol_chars` (default 50) MUST be merged with adjacent symbols in the same scope, up to `target_chars` (default 2000).
- Symbols larger than the configured `max_symbol_chars` (default 8000) MUST be split by the paragraph chunker, with each sub-chunk carrying the parent symbol's id.
- Files that produce zero symbols (e.g., a config-heavy YAML script that ended up in the code path by extension) MUST fall back to the paragraph chunker for the whole file.

#### Scenario: One chunk per Python function

- **WHEN** the symbol chunker processes a Python file with three top-level functions
- **THEN** three chunks are yielded, each spanning exactly one function's source range

#### Scenario: Tiny adjacent symbols merge

- **WHEN** a class has five getter methods of less than 50 characters each
- **THEN** the chunker merges them into one or two chunks that stay under `target_chars`
- **AND** the merged chunk's metadata lists all included symbol ids

#### Scenario: Oversized symbol is paragraph-split

- **WHEN** a single function body exceeds 8000 characters
- **THEN** the chunker emits multiple chunks, each tagged with the parent symbol's id
- **AND** each sub-chunk stays at or under 2000 characters

#### Scenario: File with no symbols falls back

- **WHEN** the symbol chunker is invoked on a Python file that contains only top-level statements (no defs, no classes)
- **THEN** the paragraph chunker is invoked on the whole file body
- **AND** no symbol metadata is attached to the resulting chunks

### Requirement: Re-extract CLI subcommand

The `hive-mind-ingest` CLI SHALL gain a `re-extract` subcommand that walks every chunk in the catalog (filtered optionally by `--source` and `--since`) and runs `extract_for_chunk` against each. The subcommand SHALL be idempotent (skip chunks whose latest evidence row was written by the current or newer extractor version) and SHALL respect the same `extraction.timeout_seconds` and best-effort error handling as the connector hook.

#### Scenario: Re-extract uses latest version filtering

- **WHEN** the operator runs `hive-mind-ingest re-extract --source git` and the configured `extractor_version` is `v2`
- **THEN** chunks whose latest `relationship_evidence` row already has `extractor_version = "v2"` are skipped
- **AND** chunks with no evidence row OR an older version are re-extracted

#### Scenario: Re-extract is best-effort

- **WHEN** the chat model fails on a single chunk during re-extract
- **THEN** the CLI continues with the next chunk
- **AND** logs a summary at the end with succeeded / failed / skipped counts
