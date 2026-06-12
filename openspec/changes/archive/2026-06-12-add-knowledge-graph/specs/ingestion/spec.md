## MODIFIED Requirements

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

## ADDED Requirements

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
