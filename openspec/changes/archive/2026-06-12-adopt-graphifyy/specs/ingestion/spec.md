## MODIFIED Requirements

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

The git connector SHALL clone the repo, derive stable entity IDs from `(tenant, source_uri)`, compute content hashes, and emit `GitDocument`s — those responsibilities are unchanged.

This change MODIFIES the file-discovery step: the connector MUST use `graphify.collect_files(repo_path)` to enumerate files. The connector MUST NOT maintain its own `TEXT_EXTS` allow-list or `SKIP_DIRS` deny-list — those sets are removed. The connector MUST honour a `.graphifyignore` file in the cloned repo if present.

The connector MUST handle a `collect_files` failure (e.g., unreadable file, tree-sitter version mismatch) on any individual file by skipping that file with a structured warning log; the ingest as a whole MUST continue.

#### Scenario: Discovery uses graphifyy's language-aware filter

- **WHEN** the git connector ingests a repo that contains `.kt` (Kotlin) and `.swift` files
- **THEN** the Kotlin and Swift files appear in the document stream
- **AND** the connector code contains no extension allow-list

#### Scenario: `.graphifyignore` is respected

- **WHEN** the cloned repo contains a `.graphifyignore` file listing `vendor/`
- **THEN** files under `vendor/` are not yielded by the connector

#### Scenario: Per-file parse failure does not abort the ingest

- **WHEN** graphifyy's `collect_files` raises on a single corrupted file
- **THEN** the connector logs a structured warning naming the path
- **AND** the surrounding files in the same repo are still ingested

## ADDED Requirements

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
