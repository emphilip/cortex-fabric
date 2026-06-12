## Why

We have built ~150 lines of file walking + chunking by hand. The git connector curates 35 file extensions and 9 skip-dirs in a Python set; the chunker splits on `\n\n` paragraph boundaries. For markdown and prose that's fine. For source code it is materially wrong: a 2000-character paragraph window splits mid-function and mid-class, and the resulting embeddings mix code from unrelated symbols.

Meanwhile [graphifyy](https://github.com/safishamsi/graphify) (MIT, 66k stars on GitHub, on PyPI as `graphifyy`) already provides exactly the two things we are bad at:

1. **Language-aware file discovery** across 28 tree-sitter-supported languages we do not currently cover (Kotlin, Scala, Swift, Elixir, Lua, Zig, PowerShell, Julia, Verilog, Fortran, Objective-C, Erlang, …) plus PDFs/Markdown/HTML/MDX as optional extras. `collect_files(target_path)` returns a filtered list and honours a `.graphifyignore` file.
2. **AST-level code extraction** via `extract(list_of_paths)` returning `{nodes, edges}` with symbol-level granularity (classes, functions, methods) and a cross-file import-resolution pass that produces `calls`/`imports`/`uses` edges with `EXTRACTED`/`INFERRED`/`AMBIGUOUS` confidence labels. Two-pass, parallel-by-default, cache-aware.

The `add-knowledge-graph` change as currently specced asks an LLM (Ollama Cloud `gemma3:4b`) to extract typed relationships from each chunk. For source code this is the wrong tool: tree-sitter does it deterministically, faster, and without Cloud round-trips. For text/PDF/markdown the LLM extractor remains the only viable option.

This change adopts graphifyy as the extraction library for code, splits the knowledge-graph extraction path into a deterministic code path and an LLM text path, and shrinks our hand-written code surface accordingly.

## What Changes

- **Add `graphifyy>=0.8` as a dep on `services/ingestion`.** Base install pulls `networkx`, `numpy`, `rapidfuzz`, and ~28 tree-sitter language wheels (~50-100 MB). We do not opt into the `pdf`, `video`, `office`, `google`, `bedrock`, `anthropic`, `openai`, `gemini` extras — those come in their own follow-up changes.
- **Replace `walk_repo()` discovery body with `graphify.collect_files()`.** The git connector still clones, derives stable IDs, and computes content hashes — those are ours. The file-listing loop and the curated extension/skip-dir sets are deleted. `.graphifyignore` is honoured if present in the cloned repo.
- **Type-aware chunking in `pipeline_runner.ingest_documents`.** Files whose extension is in the code set are chunked by graphifyy symbols (one chunk per function/class/method, with the text span fetched from the source). Files outside that set continue through the existing paragraph chunker.
- **Deterministic code graph as a side effect of ingestion.** Each graphifyy symbol node lands as a `hive_mind.concept` row with `state = "confirmed"`, `confidence = 1.0`, `extractor_version = graphifyy/<version>`. Each graphifyy edge lands as a `hive_mind.relationship_edge` row with `state = "confirmed"`, `confidence` derived from the `EXTRACTED|INFERRED|AMBIGUOUS` label, `evidence_uri` pointing at the source chunk. Code edges skip the candidate review queue because tree-sitter output is deterministic — review provides no signal.
- **Expand the relationship vocabulary** to include `calls`, `imports`, `uses` so graphifyy edges have first-class types. Seven seeded names becomes ten.
- **Shrink the LLM extractor's scope to non-code** files (markdown, plain text, restructured text, html when we add it). The LLM path remains the candidate review path because language-model output is non-deterministic. Both paths feed the same Postgres+AGE tables; the admin UI does not differentiate.
- **Per-stage token accounting** in `retrieval-pipeline` splits the `graph_extract` stage into `graph_extract_code` (deterministic, no tokens) and `graph_extract_text` (LLM, tokens). The Prometheus counters and OTel span attributes follow.
- **Tests**: the existing chunker tests stay; new tests cover the symbol-chunker path with fixture Python and TypeScript files. The git connector test stays; new test wraps a tiny repo and asserts both text and code chunks are produced through the right path.
- **Smoke**: extend the smoke to assert at least one node and one edge exist in `hive_mind.concept` / `hive_mind.relationship_edge` after the anthropic-cookbook re-ingest (it has Python notebooks + markdown).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ingestion`: `walk_repo` swapped for graphifyy's `collect_files`; `ingest_documents` becomes type-aware (code path uses symbol chunking, text path uses paragraph chunker). The git connector's `TEXT_EXTS` and `SKIP_DIRS` sets are removed.
- `knowledge-graph`: relationship extraction bifurcates into code (graphifyy, deterministic, auto-confirmed) and text (LLM, candidates for review). Vocabulary expands by three names. The `add-knowledge-graph` extractor requirements MODIFY to scope the LLM path to text only and ADD a deterministic code-extraction path.
- `retrieval-pipeline`: per-stage token accounting MODIFIES — `graph_extract` becomes two distinct stage labels (`graph_extract_code` with zero tokens, `graph_extract_text` with model tokens).
- `catalog-store`: chunk-id derivation MODIFIES — symbol chunks include the symbol's `id` in the chunk_id seed so a re-extract that produces the same symbol set is idempotent (no duplicate rows).

## Impact

- `services/ingestion/pyproject.toml`: add `graphifyy>=0.8` to dependencies.
- `services/ingestion/src/hive_mind_ingestion/connectors/git.py`: ~80 lines deleted; `walk_repo` becomes a 15-line wrapper.
- `services/ingestion/src/hive_mind_ingestion/chunking.py`: new helper `chunk_code_by_symbols(file_path, source_text) -> list[Chunk]` that uses graphifyy's `extract([path])` output to derive symbol-level spans. Text chunking stays unchanged.
- `services/ingestion/src/hive_mind_ingestion/pipeline_runner.py`: dispatch by file extension; for code files, persist the graphifyy graph alongside the embedded chunks.
- New module `services/ingestion/src/hive_mind_ingestion/graph_writer.py`: persists graphifyy nodes/edges into `hive_mind.concept` / `hive_mind.relationship_edge` with `state="confirmed"`. Used by the code path only.
- `infra/postgres/init/040_graph.sql` (which the upcoming `add-knowledge-graph` migration creates): vocabulary seed gains `calls`, `imports`, `uses`. The seed already lives in that migration; this change updates the seed list before that migration ships.
- `services/pipeline` is unchanged — graph storage shape is the same; only the source of rows differs.
- Docker image: `services/ingestion`'s built image grows by ~80 MB (the tree-sitter wheels).
- No change to MCP server, admin UI, vector index, retrieval path, or audit.

## Why one change, not three

The three places we'd use graphifyy (file discovery, code chunking, code extraction) are coupled through `ingest_documents`. Shipping them separately would leave intermediate states where, say, the chunker has been swapped but the extractor still runs the old LLM path on code — which is strictly worse than the current state. Doing all three at once keeps every commit in this change shippable.

The graphifyy-powered analytics (Leiden clustering, god-nodes via betweenness centrality) stay in the deferred `add-graph-analytics` change. PDF / image / video extraction extras stay in their respective future connector changes.
