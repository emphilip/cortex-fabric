## Context

We've shipped `bootstrap-thin-mvp` and `add-admin-vector-and-content`. We have a working ingestion service that paragraph-chunks every file and a half-written `add-knowledge-graph` change that proposes per-chunk LLM relation extraction.

Inspecting [graphifyy](https://github.com/safishamsi/graphify) revealed:

1. Their `collect_files()` already does what our `TEXT_EXTS + SKIP_DIRS + UTF-8 check + rglob` loop does, but for 28 languages including ones we don't cover, and with a `.graphifyignore` mechanism.
2. Their `extract()` runs tree-sitter parsers per file and emits symbol-level `nodes` (classes, functions, methods) with `edges` typed `calls`/`imports`/`uses` and graded `EXTRACTED`/`INFERRED`/`AMBIGUOUS`. Two-pass: per-file structural extraction, then cross-file import resolution.
3. Their architecture (`ARCHITECTURE.md`) explicitly states "the library can be used standalone." API surface is small and stable: `extract`, `collect_files`, `build_from_json`, `cluster`, `god_nodes`, …

For the things they do (code symbol extraction, language coverage, deterministic call-graph), they are strictly better than what we have written or planned. For the things they don't do (embeddings, multi-tenant audit, MCP serving, retrieval orchestration), we already have the right shape.

This change draws the line: graphifyy becomes our code extractor; our existing service becomes the orchestration and serving layer around it.

## Goals / Non-Goals

**Goals:**
- One python library, `graphifyy`, replaces ~150 lines of hand-written discovery and code-chunking logic.
- Code files produce both embeddable chunks (one per symbol) AND deterministic graph edges in one ingest pass.
- The LLM extractor planned in `add-knowledge-graph` is narrowed to non-code files, removing per-chunk Cloud chat calls for the majority of our test corpus.
- Code edges are auto-confirmed (skip the candidate review queue) because tree-sitter output is deterministic.
- No change to MCP server, retrieval pipeline, admin UI, audit, or entitlement.

**Non-Goals:**
- Adopt graphifyy's MCP server (`graphify-mcp`). We have our own multi-tenant audited MCP server.
- Adopt graphifyy's HTML graph viewer or Obsidian export. Out of scope; we have our own admin UI plans.
- Adopt graphifyy's watch loop. Our incremental updates ship in the background-enrichment follow-up.
- Adopt graphifyy's LLM providers. We already have `OllamaEmbeddings`, and the `add-knowledge-graph` change introduces `OllamaChat`.
- Optional extras (`pdf`, `office`, `google`, `video`). Each waits for its dedicated connector change.

## Decisions

### D1. graphifyy is a library dependency, not a service

**Choice:** add `graphifyy>=0.8` to `services/ingestion/pyproject.toml`. Call it in-process from `chunking.py` and `pipeline_runner.py`. Do not run their CLI, do not run their MCP server, do not consume `graph.json` artifacts.

**Rationale:** in-process gives us a clean Python API (`extract([path])` → dict), zero subprocess overhead, and full control over the lifecycle. Their CLI is for end-user laptops; we are a service stack.

**Alternatives considered:**
- Run `graphify` as a sidecar container that ingestion calls via HTTP. Rejected — they expose no HTTP server in the OSS tier, and writing a wrapper around their CLI just to call it as a subprocess defeats the point.
- Consume their `graph.json` output as a connector. Rejected — that's the right shape for orgs already running graphifyy externally (covered separately by the deferred `add-graphify-connector` change), not the right shape for our own ingest pipeline.

### D2. Code edges are auto-confirmed

**Choice:** symbol nodes and edges produced by graphifyy land in `state = "confirmed"` directly. They do not pass through the candidate review queue.

**Rationale:** tree-sitter output is deterministic. Reviewing a graphifyy-produced `calls(a, b)` edge offers no information signal — the only legitimate review action would be "delete because the source code is wrong", which is the wrong fix. Auto-confirmation matches their `EXTRACTED` confidence label (the highest level in their schema).

**Edge cases:**
- `INFERRED` edges (graphifyy's second-pass import resolution): also auto-confirmed at `confidence = 0.85`. They are still deterministic relative to the inputs; only ambiguous in mapping multiple plausible referents.
- `AMBIGUOUS` edges: persisted at `state = "candidate"` with `confidence = 0.5`. Reviewer can confirm or reject. This handles the rare case where the tree-sitter parser sees a `foo.bar()` call but cannot resolve `foo`'s type.

**Alternatives considered:**
- All graphifyy edges to candidate state. Rejected — would flood the queue with reviewing trivially-correct edges; reviewers would just bulk-approve and learn to ignore them.
- All graphifyy edges to confirmed unconditionally. Rejected — `AMBIGUOUS` legitimately deserves review.

### D3. Symbol chunking, not paragraph chunking, for code

**Choice:** for code files, the chunk unit is one graphifyy symbol (class, function, method, or top-level function-like construct). Chunk text is the source span between the symbol's start and end lines. Embed each chunk as before via Ollama.

**Rationale:** paragraph chunking on code is meaningless — `\n\n` boundaries split logical units arbitrarily. Symbol boundaries produce one vector per semantic unit. Retrieval queries like "show me the auth middleware" return the function, not a 2000-char window that happens to overlap it.

**Edge cases:**
- Tiny symbols (< 50 chars): merge consecutive small symbols within the same file/class into a single chunk to amortise embedding cost. Configurable `min_symbol_chars` (default 50).
- Huge symbols (> 8000 chars, e.g. a god-function): apply paragraph chunker to the symbol body, with each sub-chunk tagged with the parent symbol's id in the chunk metadata.
- Files with no extractable symbols (e.g., a config-heavy script): fall back to the paragraph chunker for the whole file. No code graph is written for this file.

### D4. The LLM extractor narrows to text-only

**Choice:** when `add-knowledge-graph` ships (or as part of this change if landed first), the LLM `extract_for_chunk` call site checks file extension before invoking. Code files skip the LLM call entirely. Text/markdown/PDF (when supported) still get the LLM extractor.

**Rationale:** running both a deterministic and a non-deterministic extractor on the same code chunks produces two graphs for the same input, with the LLM one being strictly worse. Pick one tool per file type.

### D5. Vocabulary expands by three names: `calls`, `imports`, `uses`

**Choice:** seed `relationship_vocab` with the existing seven names (`depends_on`, `defined_in`, `supersedes`, `mentions`, `related_to`, `causes`, `derived_from`) PLUS three new ones: `calls`, `imports`, `uses`. Total ten seeded names.

**Rationale:** graphifyy's edge relations are these three. Adding them to our vocabulary lets the FK on `relationship_edge.type` accept them without ad-hoc special-casing. Other code-typed relations (`extends`, `implements`) can be added later when we cover OOP-heavy languages — graphifyy already produces them for some languages but we'll see how often after the first ingest.

**Alternatives considered:**
- Map graphifyy's `calls`/`imports`/`uses` onto our existing `depends_on`/`defined_in`/`mentions`. Rejected — lossy and confusing for graph consumers.
- Maintain two vocabularies (code vs text). Rejected — one shared vocab keeps the model simple; the type field is enough metadata.

### D6. Chunk-ID derivation includes symbol identity

**Choice:** for symbol chunks, the chunk id is `uuid5(ns, f"{parent_entity_id}:{symbol_id}")` where `symbol_id` is graphifyy's stable per-symbol id (e.g., `module.path.ClassName.method_name`). Paragraph chunks keep the existing `uuid5(ns, f"{parent_entity_id}:{index}")`.

**Rationale:** re-ingesting an unchanged file produces the same symbol set in the same order → same chunk ids → idempotent upserts. With the index-only scheme, a single inserted function above existing symbols renumbers everything below it, invalidating all downstream cache + audit references.

### D7. Disk space + image size

**Choice:** accept the ~80 MB increase in the ingestion image footprint. The tree-sitter language wheels are individually ~3 MB and we want all 28; they compress well in Docker layers.

**Rationale:** we could shave by opting into only Python+TS+Go+Rust wheels via a narrower dep list. Not worth the maintenance — every time someone ingests a Kotlin or Swift file we'd have to bump deps. The image is still under 1 GB.

### D8. Caching

**Choice:** graphifyy's `extract()` accepts a `cache_root` parameter that gates re-extraction by content hash. We pass `cache_root = Path("/var/cache/graphify")`, mount a tmpfs volume in compose, and let graphifyy's cache work. The cache survives within a single container run only.

**Rationale:** docker tmpfs is fast and ephemeral, which matches what we want (avoid re-extracting unchanged files within a long-running ingestion task) without leaking stale state across deploys. Persistent cache is a follow-up if profiling justifies it.

## Risks / Trade-offs

- **Risk: graphifyy's API breaks at a minor-version bump.** They are at 0.8.x and pushing frequently (last push today). → Mitigation: pin to `>=0.8,<0.9` in pyproject; bump deliberately when tests pass.
- **Risk: tree-sitter parsers fail on malformed or fringe-case files.** → Mitigation: graphifyy is wrapped in a `try/except` per file in our discovery loop; a parse failure logs + falls back to paragraph chunking for that one file.
- **Risk: image size growth slows compose bring-up the first time.** → Mitigation: documented in `OPERATIONS.md`; the layer caches after the first build.
- **Risk: graphifyy's `AMBIGUOUS` edges flood the candidate queue for some codebases.** → Mitigation: per-source `min_confidence` cap reuses what `add-knowledge-graph` already proposes; AMBIGUOUS edges with low confidence drop before insert.
- **Risk: their symbol IDs are not stable across graphifyy versions.** → Mitigation: record `extractor_version` per concept and edge (already in spec). A version bump triggers re-extraction; old ids stay tombstoned via the existing soft-delete path.
- **Risk: adopting graphifyy makes our project look like a graphifyy wrapper.** → Counter: we are the multi-tenant audited context layer with embeddings, retrieval pipeline, and entitlement. Graphifyy is the extraction engine inside. Composition is the right shape, and we credit them everywhere (README, OPERATIONS, here).

## Migration Plan

1. Add `graphifyy>=0.8,<0.9` to `services/ingestion/pyproject.toml`.
2. Refactor `connectors/git.py` to use `collect_files()`; delete `TEXT_EXTS` and `SKIP_DIRS`.
3. Refactor `chunking.py` to add `chunk_code_by_symbols()` keyed off `extract([path])`'s output.
4. Update `pipeline_runner.ingest_documents()` to dispatch by extension (code vs text).
5. New module `graph_writer.py` writes graphifyy nodes/edges into the existing concept/edge tables (which `add-knowledge-graph` creates; if that change hasn't shipped yet, this change adds the migration as well).
6. Smoke + tests.

If `add-knowledge-graph` has not yet shipped when this change is implemented, this change pulls in the relevant migration (`040_graph.sql`) and the vocabulary seed. The LLM extractor pieces of `add-knowledge-graph` stay deferred to that change.

Rollback: revert the `pyproject.toml` change; restore the old `git.py` and `chunking.py`; drop any `concept` / `relationship_edge` rows that were written. Existing catalog and Qdrant rows are unaffected (chunk IDs change for code files but the catalog is upsert-keyed by `(tenant, source, source_uri)`).

## Open Questions

- **OQ1:** Do we want a per-source `extraction.code.enabled` toggle so an operator can disable the graphifyy path while keeping the text LLM path running? Default: yes, but defer until a real use case asks for it.
- **OQ2:** When `add-knowledge-graph` finally ships, do graphifyy nodes and LLM-extracted concepts share the same `dedupe_key` namespace? Default: yes — a symbol named `Foo` and a concept named `Foo` collide on `dedupe_key`, which is usually correct (they're the same thing) but occasionally wrong. The admin can split via the `merge_concepts` action (which is itself a deferred follow-up). Acceptable for v1.
- **OQ3:** Does graphifyy's `extract()` parallelism conflict with our async ingestion loop (it uses ProcessPoolExecutor)? Default: pass `parallel=False` from inside our async handler; let the per-file work serialize. Reassess after profiling.
