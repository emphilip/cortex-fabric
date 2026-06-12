## Context

Today's catalogue exposes documents and chunks; vector + lexical retrieval surfaces what's similar. The architectural promise was a *contextual layer* that also answers "what's connected and how" — and the `bootstrap-thin-mvp` design (D3, "Apache AGE on Postgres for the graph") was explicit that the graph store would live alongside the catalog from day one but stay empty until this change. This change makes the graph real.

We also discovered (during the bootstrap smoke) that Ollama Cloud serves chat happily for the reference account but refuses embed. That key has been sitting unused in `.env`; it powers extraction here.

## Goals / Non-Goals

**Goals:**
- Concepts and typed edges that are reviewable, editable, and auditable.
- Automatic extraction during ingestion that produces `candidate` rows for human review.
- Traversal API + MCP tool so AI clients can ask the graph "what's nearby?"
- Admin UI that surfaces the candidate review queue, concept browse, and edge editing.
- Extraction failure on any one chunk MUST NOT fail the ingest.

**Non-Goals:**
- Graph-aware retrieval (hybrid_retrieval consulting the graph) — its own follow-up change so we can A/B the impact.
- Concept clustering / community detection / centrality — a graph-analytics follow-up.
- Visual graph rendering (Cytoscape, force-directed layout) — UI-only follow-up; v1 ships tabular.
- A periodic re-extraction worker — waits for the background-enrichment follow-up.
- Full provider-protocol abstraction (the four-protocol model). Two concrete clients are enough until a third caller exists.

## Decisions

### D1. Two node types: `entity` (catalog) and `concept` (graph)

**Choice:** Catalog `entity` rows stay as-is — they're files / chunks. Concepts are a separate table with their own ID. Edges connect concepts to concepts. The relationship between a concept and the chunk that introduced it is captured by `relationship_evidence` (a join row pointing at the chunk's `entity_id`).

**Rationale:** A concept like "Prompt Caching" can be mentioned by many chunks across many sources. Treating them as the same node type as files would collapse the abstraction. Keeping concepts separate also lets a future change re-implement embedding-based concept dedupe without touching the catalog.

**Alternatives considered:**
- Concepts = catalog entities. Rejected — fights the model and loses the many-chunks-mention-one-concept idiom.
- Concepts only exist in AGE, not Postgres. Rejected — we still want a tabular browse UI; AGE-only loses the easy SELECT.

### D2. AGE for traversal, Postgres tables for browse and audit

**Choice:** Concept and edge rows live in regular Postgres tables. After each insert / state transition, the same row is reflected into the AGE graph so openCypher traversal works. Postgres is the source of truth; AGE is a queryable derived index.

**Rationale:** Postgres tables make tabular browse trivial and let us reuse our existing audit patterns. AGE gives us openCypher for the traversal API. Keeping Postgres authoritative avoids dual-write divergence (we treat AGE as recreatable from the tables).

**Alternatives considered:**
- AGE as the only store. Rejected — we lose easy SELECT, indexed filters, and the immutability tricks the audit log relies on.
- Two separate stores (Postgres tables + an external graph DB). Rejected — adds an engine for no win over AGE.

### D3. Concept dedupe via a normalised name key, not embeddings

**Choice:** Concepts dedupe on a `dedupe_key` column = `lower(normalize_unicode(strip(name)))`. Embedding-similarity dedupe (e.g., "Prompt Caching" ≈ "prompt-cache") is deferred.

**Rationale:** Normalised-name dedupe is deterministic, cheap, and easy to reason about during review. Embedding-similarity dedupe is more powerful but introduces a fuzziness that human reviewers find hard to predict. We ship the simpler one and pair it with reviewer-driven merging (a future "merge two concepts" admin action).

**Alternatives considered:**
- Embedding-similarity dedupe with a threshold. Rejected for v1 — surprises reviewers when an unrelated string folds into a popular concept.
- No dedupe at all (every extraction creates new candidates). Rejected — explodes the review queue.

### D4. Per-chunk extraction with structured JSON output

**Choice:** The extractor runs per chunk (not per document). Each call asks the chat model for a JSON object matching a Pydantic schema: `{concepts:[{name,description?,aliases?}], relations:[{from,relation,to,evidence_span?,confidence}]}`. Anything that doesn't parse is logged and dropped (no partial inserts). The extractor's prompt names the valid relationship vocabulary so the model rarely picks something we'd reject.

**Rationale:** Per-chunk is the natural ingestion granularity (a chunk is small enough for a single model call). Structured output keeps the pipeline robust against drift. Naming the vocabulary in the prompt cuts the rejection rate for unknown relationship names.

**Alternatives considered:**
- Per-document extraction. Rejected — bodies up to 1 MB are too big for a single chat call.
- Free-text relationship names (no vocabulary in the prompt). Rejected — the review queue would fill with `is_a_kind_of`, `interacts_with`, etc., and the curated set was the user's stated requirement.

### D5. Ollama Cloud `gemma3:4b` is the default extractor model

**Choice:** Default `providers.chat.model = gemma3:4b`, `base_url = https://ollama.com`, `api_key` from `.env`. Operators can swap to any chat model exposed by Ollama Cloud or a local Ollama daemon by changing config.

**Rationale:** This is the exact path the bootstrap probe proved (`/api/chat` with `gemma3:4b` returned a real completion). It's the smallest viable Cloud model — fast and cheap. Bigger Cloud models (`kimi-k2`, `qwen3-coder:480b`) work but are overkill for relationship extraction; operators can swap if they want.

**Alternatives considered:**
- Local Ollama for chat (`qwen2.5:7b`). Rejected for default because most laptops can't run a 7B chat model fast enough to keep up with ingest. Local stays as a fallback configurable via env.
- Anthropic Haiku. Rejected for default — the project is OSS-first; Anthropic stays optional via the future `add-anthropic-provider` change.

### D6. Two concrete clients, not a four-protocol abstraction

**Choice:** Ship `OllamaEmbeddings` (already exists) and `OllamaChat` (new) as concrete classes. A small `ProviderConfig` dataclass on the shared config selects `(provider, model, base_url, api_key)` per capability (currently `embeddings` and `chat`). The four-protocol abstraction in `add-foundation/model-providers/spec.md` (`EmbeddingProvider` / `IntentClassifier` / `Reranker` / `Generator`) stays deferred.

**Rationale:** Abstractions earn their keep when the third caller arrives. The thin MVP had one (embeddings), this change has two (add chat) — we don't have a stable shape to abstract over yet. When the rerank or intent change lands, that's when we extract the protocol.

**Alternatives considered:**
- Full four-protocol abstraction now. Rejected — speculative.
- Single ad-hoc HTTP client. Rejected — the embed/chat shapes are different enough that one client makes both worse.

### D7. Candidate edges hidden from traversal by default

**Choice:** `GET /graph/traverse` returns only `confirmed` edges unless `include_candidates=true` is passed. The MCP `hive_mind/traverse_graph` tool exposes the same flag.

**Rationale:** Candidate edges are noisy — they are by definition unreviewed. Defaulting traversal to `confirmed` keeps the graph trustworthy for downstream model consumption. The admin UI passes `include_candidates=true` when rendering the review queue and the concept-detail "candidate neighbours" tab.

**Alternatives considered:**
- Return all edges, let consumers filter. Rejected — every downstream caller would need to know about the state field.
- Drop candidates after a TTL. Premature optimisation; review queue paging is fine for v1.

### D8. Extraction failure does NOT fail the ingest

**Choice:** The extractor call is wrapped in `try/except` inside the ingest loop. Failures (timeout, parse error, model unavailable) are logged + counter-incremented but the chunk is still upserted into the catalog and Qdrant.

**Rationale:** Ingest is the load-bearing path. If Ollama Cloud is briefly down the catalogue still updates; an enrichment worker (next change) can re-extract later. Coupling ingest health to the chat provider would be a single point of failure we don't need.

**Alternatives considered:**
- Fail the chunk on extraction error. Rejected — every Cloud blip becomes a re-ingest.
- Retry with backoff in the loop. Defer — the enrichment worker change does this properly.

### D9. Vocabulary is enforced at the database, not the application

**Choice:** `relationship_edge.type` is a `TEXT` with a FK to `relationship_vocab.name`. Adding an edge with an unknown vocabulary name fails at insert.

**Rationale:** Defence in depth. Application-side validation can be bypassed by direct DB access; the FK catches that. The vocabulary table itself remains editable through the admin API, so legitimate vocabulary growth is a single API call.

### D10. Tabular UI in v1, visual rendering in a follow-up

**Choice:** The `/graph` admin page is tabular — concept browser, candidate review queue, concept-detail view with neighbour tables. No SVG, no Cytoscape, no UMAP-style projection.

**Rationale:** Visual graph rendering well is its own project (layout algorithms, zoom UX, edge bundling). Tabular surfaces 80% of the value (review, edit) with 10% of the work. Visual rendering ships as `add-graph-visual-rendering` once we know what shape of subgraph reviewers actually want to see.

## Risks / Trade-offs

- **Risk:** The extractor generates many low-quality candidates and overwhelms reviewers. → Mitigation: configurable `min_confidence` threshold (default 0.6) drops obviously bad candidates before insert; review queue paginates and sorts by confidence DESC; a follow-up change adds bulk-reject and an auto-archive job for low-confidence candidates older than N days.
- **Risk:** Ollama Cloud rate-limits during a large ingest. → Mitigation: per-chunk extraction is sequential by default; a token-bucket limiter (configurable) caps `chat_qps`. Extraction failures fall back to "skip this chunk" without blocking ingest.
- **Risk:** AGE-vs-Postgres drift if a row is inserted but the AGE reflection fails. → Mitigation: AGE reflection wraps the same Postgres transaction; failure rolls back the row. A periodic reconciler in the enrichment change provides defence in depth.
- **Risk:** A reviewer promotes a wrong edge. → Mitigation: every state transition is auditable (actor, before, after, reason); the same admin API allows demotion (`confirmed → candidate`) and deletion (`* → tombstoned`).
- **Risk:** Concept dedupe by normalised name groups truly different concepts ("Apple the company" vs "apple the fruit"). → Mitigation: the admin UI exposes a "split concept" action in the detail view (future "merge two concepts" pairs with it). For v1, the dedupe is conservative — only exact-after-normalisation matches collide.
- **Risk:** Vocabulary churn (adding new types after edges exist) breaks back-references. → Mitigation: vocabulary rows are soft-deleted via a `deprecated_at` column; existing edges keep working; new inserts of deprecated types are rejected.
- **Risk:** Cost of extraction at scale. The cookbook ingest is 2168 chunks; one chat call per chunk at, say, 200ms each is ~7 minutes for the full repo and N model-tokens. → Mitigation: `chat_qps` cap, configurable extractor disable (`extraction.enabled = false`), per-source enable/disable in `hive-mind.yaml`.

## Migration Plan

1. Migration `040_graph.sql` creates the new tables.
2. AGE bootstrap (already loaded) gets concept/edge label types.
3. Ingestion service grows the post-chunk extractor step. Old data: a one-shot CLI subcommand `hive-mind-ingest re-extract` walks existing chunks, runs the extractor, populates the graph. (Wraps the same code path as the per-chunk hook; safe to re-run.)
4. Pipeline service grows the graph routes module.
5. MCP server's `traverse_graph` handler is updated.
6. Admin UI gets the `/graph` route + new components.

Rollback: `DROP` the four new tables; remove the AGE label types; revert the ingest hook + pipeline router include. No retrieval-path code is touched in this change, so the retrieve flow is unaffected by rollback.

## Open Questions

- **OQ1:** Should we ship a `merge_concepts(a_id, b_id)` admin action in v1 to give reviewers a way to fix wrong dedupes? Default: include it (it's small and reviewers will ask for it on day one).
- **OQ2:** Do we batch extraction calls (multiple chunks per chat call) to amortise model latency? Default: no for v1 — per-chunk keeps prompts focused and parsing reliable. Revisit if cost / time becomes an issue.
- **OQ3:** Should `traverse_graph` return concept embeddings (for client-side reranking)? Default: no for v1 — concepts have no embedding in this change. Embed concepts in a follow-up if a downstream caller needs it.
- **OQ4:** Per-source vocabularies (a separate `relationship_vocab` set per ingestion source)? Default: no for v1 — one shared vocabulary keeps the model.
- **OQ5:** Concept aliases — extracted automatically from variant surface forms in the same chunk, or admin-only? Default: extractor produces them, admin can edit.
