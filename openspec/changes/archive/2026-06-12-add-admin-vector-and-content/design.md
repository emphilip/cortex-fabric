## Context

`bootstrap-thin-mvp` shipped a working retrieval path and one admin page (`/queries`). The catalogue has 2168 chunks ingested from a single repo; you can prove the system works but you can't actually look at what's in it without `psql` or curl.

This change focuses on **legibility**: the admin UI becomes the place to ask "what does Hive Mind know?" Three surfaces matter most:

1. *Vector search* — ad-hoc "what's nearest to this text" without writing an MCP request.
2. *Entity browse + detail* — see what was ingested, when it was last verified, where it came from, what its chunks look like.
3. *Ingestion control* — trigger a git ingest from a button.

What this change explicitly does **not** touch: the knowledge graph (its own follow-up), background enrichment workers, OPA, real auth.

## Goals / Non-Goals

**Goals:**
- Three new admin UI pages plus the components and stories to back them.
- Read endpoints on the pipeline service for entities and vector search.
- A thin HTTP surface on the ingestion service for run-now + status.
- Reuse the existing embeddings client and Qdrant wrapper — no new model dependency.
- Keep every component Storybook-first (no new component lands without a story).

**Non-Goals:**
- Re-embed / re-extract actions on entities. Those imply a worker queue, which lands with `add-background-enrichment`.
- Graph editor surface. Lands with `add-knowledge-graph`.
- UMAP / dimensionality-reduction visualisation. Deferred — needs a Python sidecar; not worth the operational weight for v0+1.
- Connector run persistence beyond in-memory. The next enrichment change introduces durable run history.
- A new MCP tool. Vector search is operator-only because making it an MCP tool without audit changes the recreatability story for `retrieve_for_context`.

## Decisions

### D1. Vector search is an admin-only HTTP endpoint, not a new MCP tool

**Choice:** `POST /search/vector` lives on the pipeline service and is consumed only by the admin UI.

**Rationale:** the `retrieve_for_context` MCP tool guarantees an immutable audit row per call. Vector search is exploratory — an operator is poking at the catalogue. Audit-on-explore would either flood the audit log or weaken the "every assembled context has an audit row" invariant. Keeping it admin-only keeps the audit semantics clean. If we later decide an MCP client should expose a "lookup" tool, that's its own change with its own audit story.

**Alternatives considered:**
- Making it a new MCP tool with `"audit": "exploration"` tagging. Rejected — pollutes audit semantics; downstream replay logic would have to special-case it.
- Mirroring it onto an MCP `search` tool that writes audit. Rejected — same audit-flood concern.

### D2. Ingestion service grows a small FastAPI alongside the CLI

**Choice:** `services/ingestion` becomes a long-running container with both an HTTP server (default `CMD`) and the `hive-mind-ingest` Click CLI (still callable via `docker compose exec`). Run history is **in-memory** for v0+1.

**Rationale:** the admin UI needs a way to fire ad-hoc ingestion and see "what just ran". Persisting jobs to Valkey or Postgres adds queue semantics that pair better with the background-enrichment change. In-memory + restart-loses-history is honest about the v0+1 scope and keeps this change small.

**Alternatives considered:**
- Valkey-backed worker queue (arq). Rejected for this change — premature; the enrichment change introduces it properly with persistence and retry semantics.
- Pipeline service runs ingestion in-process. Rejected — pipeline is request-path; you don't want a 90-second git clone blocking the same process serving `/retrieve`. Also git binary is only in the ingestion image.

### D3. Pipeline proxies ingestion endpoints rather than the UI calling ingestion directly

**Choice:** the admin UI talks only to the pipeline; the pipeline proxies `/ingestion/*` to the ingestion service over the compose network.

**Rationale:** one URL for the UI to configure, one place to add cross-cutting concerns later (OPA enforcement on "run now", rate limiting, tenant scoping). The proxy is trivial (an httpx forward).

**Alternatives considered:**
- UI calls ingestion directly via `INGESTION_URL`. Rejected — doubles the config surface; later cross-cutting concerns leak across both services.

### D4. Entity list filters use indexed Postgres columns only

**Choice:** the entity-list endpoint accepts `source`, `classification`, `freshness_state`, plus `limit/offset` (no rich text search yet).

**Rationale:** keeps the endpoint cheap (existing indexes), small response shape, no surprise scans. Rich text search at admin scale is `pg_trgm` plus rank, which is what the retrieval pipeline already does and what vector search already does — we don't need to invent a third filtered-text path.

### D5. Tombstone is a soft delete; no cascading

**Choice:** `DELETE /entities/{id}` sets `tombstoned_at = now()` on the entity row. The row is excluded from future retrieval (it already is — the lexical leg filters `tombstoned_at IS NULL`). Qdrant points are not removed in this change.

**Rationale:** soft delete is recoverable; we don't lose the body, lineage, or audit references. Qdrant cleanup is a separate concern that pairs with re-embed (next change). Leaving stale Qdrant points around is fine because tombstoned entities don't appear in the catalog-side filter on retrieval — vector search will still return them, but admin operators expect that ("show me what's there").

**Alternatives considered:**
- Hard delete from Postgres + Qdrant. Rejected — unrecoverable; cascades into audit references that point at the entity ID.

### D6. Vector search uses the same `OllamaEmbeddings` client the pipeline uses

**Choice:** `/search/vector` instantiates from the same lifespan-scoped embeddings client. Token usage is counted under the same `hive_mind_tokens_total` counter with `stage="vector_search"`.

**Rationale:** zero new model dependencies, consistent token accounting, single source of truth for embedding-model configuration.

### D7. Storybook is mandatory for every new component

**Choice:** every component this change ships gets a `*.stories.tsx` neighbour file. The `admin-ui` capability spec already requires this; we re-state it here so it's load-bearing for the review.

**Rationale:** the user asked for Storybook so components can be swapped from one place later. Letting any one component land without a story breaks that contract on day one.

## Risks / Trade-offs

- **Risk:** vector search across all collections fans out and scales poorly. → Mitigation: thin MVP has one collection per source and only `git` exists; we cap `top_k` at 100 server-side; cross-collection fusion is the same RRF the retrieval path already uses.
- **Risk:** in-memory run history disappears on restart. → Mitigation: documented in `docs/OPERATIONS.md`; the next enrichment change adds persistence.
- **Risk:** the admin UI now has four pages with no auth in front of it. → Mitigation: same as `bootstrap-thin-mvp` — identity is stubbed; the auth follow-up change replaces the verifier without touching this code.
- **Risk:** entity detail page may render very large bodies (we ingest files up to 1 MB). → Mitigation: the page shows the first 50 KB by default with a "show full body" toggle; the JSON copy action always returns the full body.
- **Risk:** a long git ingest started from the UI ties up a single ingestion container worker. → Mitigation: FastAPI BackgroundTask runs in a thread; status endpoint reflects state; one concurrent ingest is enough for v0+1.

## Migration Plan

This is purely additive. No data migration. The compose `ingestion` service changes its default command from `sleep infinity` to running the FastAPI server; the CLI binary still works via `docker compose exec ingestion ...`. No env vars change.

## Open Questions

- **OQ1:** Do we want the vector search page to render the embedding model + dimension live (handy when swapping models)? Default: yes, small status header. Confirm during implementation.
- **OQ2:** Tombstone reasons — capture an operator-supplied reason field, or just timestamp? Default: just timestamp for v0+1; reasons land with the audit-trail-for-admin-actions change.
- **OQ3:** Connector "Run now" panel — should it allow arbitrary URLs, or only URLs matching an allow-list? Default: arbitrary in v0+1 because we're single-tenant + stub-auth; the web-indexer change introduces a domain allow-list.
