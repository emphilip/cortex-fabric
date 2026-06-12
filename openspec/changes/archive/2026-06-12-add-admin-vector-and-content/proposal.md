## Why

The thin MVP gave operators a query review surface, but the user explicitly asked for an admin interface that also covers **vector search**, **review and management of content**, and **adding content**. Today the only way to see what's in the catalogue is to write SQL or curl Qdrant directly. That is fine for engineers, useless for operators, and makes the catalogue feel like a black box — which is the opposite of the architectural promise.

This change wires up the admin UI surfaces that turn the catalogue into something an operator can reason about: search by meaning, browse by entity, inspect lineage and freshness, and trigger ingestion. It does this without introducing new model calls beyond the existing embeddings client and without creating a worker queue (which is the next change's job).

## What Changes

- New admin UI pages:
  - `/vectors` — vector search by free-text query, returning the top-K nearest catalog entities with score, source, classification, and a snippet. Drill-in shows the entity's nearest neighbours.
  - `/entities` — filterable, paginated entity browser (by source, classification, freshness).
  - `/entities/[id]` — entity detail: raw text, lineage (parent + chunks), source URI, metadata, freshness, recent audit appearances. Tombstone action.
  - `/ingestion` — configured connectors with last-run / next-run / error-count / status, plus a "Run now" panel that triggers a git ingest with a user-supplied URL.
- New pipeline read endpoints (HTTP, JSON):
  - `GET /entities?source&classification&freshness_state&limit&offset` — list.
  - `GET /entities/{id}` — single entity with lineage children/parent.
  - `POST /search/vector` — `{query, top_k, filters?}` → ordered hits with `entity_id`, `score`, `payload`. Uses the same embeddings client the retrieval path uses; emits its own OTel span + token counter increment.
  - `DELETE /entities/{id}` — tombstone (sets `tombstoned_at`; cascades none).
  - `GET /ingestion/connectors` — connector list (proxies the ingestion service).
  - `POST /ingestion/git/run` — `{repo_url}` (proxies the ingestion service).
  - `GET /ingestion/runs/recent` — recent runs (proxies the ingestion service).
- New ingestion HTTP surface (FastAPI, exposed inside the compose network only):
  - `POST /run/git` — kick off an ingest in a background task; return `{run_id, status:"queued"}`.
  - `GET /runs/recent` — in-memory list of recent runs (id, repo, started_at, finished_at, status, parents, chunks, error).
  - `GET /connectors` — `[{name: "git", supported: true}, ...]` mirroring the v0 capability set.
- Shared types added to `packages/shared` and `packages/shared-py`: `Entity`, `EntityListItem`, `VectorSearchHit`, `IngestionRun`, `ConnectorStatus`.
- New Storybook stories for every new component (`EntityRow`, `EntityDetail`, `VectorHit`, `ConnectorCard`, `IngestionRunRow`).
- Vitest unit tests for every new admin UI component and the new pipeline endpoints (respx + httpx test client for the new routes; the existing patterns generalise).

## Capabilities

### New Capabilities

None. Everything attaches to existing capability spec folders.

### Modified Capabilities

- `admin-ui`: vector neighbourhood exploration, content management (read-only + tombstone), and ingestion control move from "SHALL NOT in v0" to "SHALL ship the surfaces described above." Graph relationship management stays deferred to `add-knowledge-graph`.
- `retrieval-pipeline`: the audit-read endpoint set ADDed in `bootstrap-thin-mvp` is extended with entity read/list, vector-search, tombstone, and ingestion-trigger proxies. Per-stage token accounting MODIFIED to acknowledge that vector search also invokes the embeddings model.
- `ingestion`: the CLI MUST keep working; ADD a thin in-process FastAPI for ad-hoc runs and run-history. Persistence of run history stays deferred to the enrichment change (in-memory is acceptable in v0+1).
- `catalog-store`: ADD a list query with filters used by the entity browser; ADD a soft-delete (tombstone) operation. Direct query is no longer "lexical-leg only" — admin filtered list joins the set of v0 query paths.
- `vector-index`: ADD a wrapper for "given a vector or a query text, return the top-K across all collections with payload" so the pipeline's `/search/vector` endpoint has a single call site.

## Impact

- `services/admin-ui` gains four pages, ~half a dozen components, and matching stories + tests.
- `services/pipeline` gains six new routes, a vector-search code path that mirrors stage 3 of the runtime pipeline but is **standalone** (no audit row written — vector search is exploration, not an audited retrieval).
- `services/ingestion` becomes a long-running HTTP server in addition to a CLI. Its Dockerfile gains a `CMD ["uv","run","--package","hive-mind-ingestion","uvicorn", ...]`. The CLI binary keeps working unchanged.
- `infra/compose/docker-compose.yml`: `ingestion` gains a port mapping (`8100:8100`) and a healthcheck against `/healthz`.
- No new external dependencies (no new images, no new model calls).
- No new MCP tools and no spec changes to `mcp-server`. Vector search is admin-only because exposing it as an MCP tool without audit-side-effects breaks the recreatability story for `retrieve_for_context`. If we later want an MCP `search` tool, that's its own change with its own audit semantics.
