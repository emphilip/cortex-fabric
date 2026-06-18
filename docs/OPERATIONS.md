# Operations

Operational runbook for the v0 stack (see [`bootstrap-thin-mvp`](../openspec/changes/bootstrap-thin-mvp/proposal.md) for the authoritative contract).

## Bringing the stack up

```bash
cp .env.example .env
make up-d    # build + start in the background
make ps      # check status
make logs    # follow combined logs
make down    # stop (keeps volumes)
make down-v  # stop + DELETE volumes (loses everything)
```

First start downloads the Postgres+AGE image, the Qdrant image, the Valkey image, and the Ollama image, and then pulls the configured embedding model (~270 MB for `nomic-embed-text`). Expect 3–5 minutes on a typical laptop.

## Configuration

A single `opencg.yaml` file is the source of truth. Environment variables override file values using the convention `OPENCG__<SECTION>__<KEY>` (double underscore separates nesting levels). Copy `.env.example` to `.env` and edit; the compose stack mounts `.env` into every service.

| Key | Default | Notes |
|---|---|---|
| `OPENCG__TENANT` | `default` | Single-tenant deploy slug. |
| `OPENCG__IDENTITY__PRINCIPAL` | `local-dev` | Stubbed identity. Replace before any non-dev deploy. |
| `OPENCG__IDENTITY__ROLES` | `admin,reader` | Comma-separated list. |
| `OPENCG__POSTGRES__URL` | `postgresql://opencg:opencg@postgres:5432/opencg` | Catalog + audit. |
| `OPENCG__QDRANT__URL` | `http://qdrant:6333` | Vector store. |
| `OPENCG__VALKEY__URL` | `redis://valkey:6379/0` | Cache (unused by v0). |
| `OPENCG__OLLAMA__BASE_URL` | `http://ollama:11434` | Compose-internal Ollama by default. |
| `OPENCG__OLLAMA__EMBEDDING_MODEL` | `nomic-embed-text` | See "Swapping the embedding model" below. |
| `OPENCG__PROVIDERS__CHAT__BASE_URL` | `https://ollama.com` | Chat endpoint used by text graph extraction. |
| `OPENCG__PROVIDERS__CHAT__MODEL` | `gemma3:4b` | Independently configurable extraction model. |
| `OPENCG__PROVIDERS__CHAT__API_KEY` | empty | Secret bearer token for the chat endpoint. |
| `OPENCG__RETRIEVAL__DEFAULT_TOP_K` | `20` | Per-leg retrieval limit. |
| `OPENCG__RETRIEVAL__DEFAULT_TOKEN_BUDGET` | `4000` | Assemble-stage hard cap. |

## Extraction model

Two paths share the same chunk → embed → upsert orchestration but differ on what becomes a chunk:

- **Code files** (`.py`, `.ts`, `.go`, `.rs`, `.kt`, ... — anything in graphifyy's tree-sitter dispatch except markdown/yaml/json/html) are processed by `chunk_code_by_symbols`. Each AST symbol (class / function / method) becomes one chunk. The same graphifyy call produces the **deterministic code graph** that lands in `opencg.concept` / `opencg.relationship_edge` as `confirmed` state. Powered by [graphifyy](https://github.com/safishamsi/graphify).
- **Text files** (`.md`, `.yaml`, `.toml`, `.json`, ...) flow through `chunk_text` (paragraph splitter). A best-effort chat-model pass extracts candidate concepts and named relationships after the catalog and vector writes succeed.

Code extraction emits `pipeline.graph_extract_code` with zero model tokens. Text extraction emits `pipeline.graph_extract_text`, token counts, latency, accepted-edge counters, and error counters. Provider errors, malformed output, and timeouts are logged and counted but never abort ingestion.

## Knowledge graph

Open `/graph` to search concepts, inspect evidence and neighbours, review candidate edges, and edit the relationship vocabulary. The seven seeded semantic relationship names are `depends_on`, `defined_in`, `supersedes`, `mentions`, `related_to`, `causes`, and `derived_from`. Graphifyy also uses the code-specific `calls`, `imports`, and `uses` names.

Text extraction is controlled by:

| Key | Default | Effect |
|---|---|---|
| `OPENCG__PROVIDERS__EXTRACTION__ENABLED` | `true` | Enables best-effort text extraction during ingest and re-extract. |
| `OPENCG__PROVIDERS__EXTRACTION__MIN_CONFIDENCE` | `0.6` | Drops model relationships below this confidence. |
| `OPENCG__PROVIDERS__EXTRACTION__TIMEOUT_SECONDS` | `30` | Per-chunk chat request deadline. |
| `OPENCG__PROVIDERS__EXTRACTION__CHAT_QPS` | empty | Reserved rate limit; empty means unbounded. |

The active prompt and JSON response contract are documented in [`EXTRACTOR_PROMPT.md`](./EXTRACTOR_PROMPT.md).

## Ingestion

A single connector ships today: `git`. Trigger an ingest from any of:

```bash
# 1. From the host
make ingest-git REPO=https://github.com/anthropics/anthropic-cookbook

# 2. From the admin UI
open http://localhost:3000/ingestion   # use the "Run now" form

# 3. From the pipeline API (which proxies to the ingestion service)
curl -X POST http://localhost:8000/ingestion/git/run \
  -H 'content-type: application/json' \
  -d '{"repo_url":"https://github.com/anthropics/anthropic-cookbook"}'

# 4. Direct CLI inside the ingestion container
docker compose -f infra/compose/docker-compose.yml exec ingestion \
  uv run --package opencg-ingestion \
  python -m opencg_ingestion.cli git <repo-url>
```

Re-ingest is idempotent (entities are upserted by stable ID derived from `(tenant, source_uri)`). Run history (from options 2 and 3) is in-memory inside the ingestion container — restarting clears it. A follow-up change adds durable history.

Re-run text graph extraction without re-embedding:

```bash
docker compose -f infra/compose/docker-compose.yml exec ingestion \
  uv run --package opencg-ingestion \
  python -m opencg_ingestion.cli re-extract

# Optional catalog filters
docker compose -f infra/compose/docker-compose.yml exec ingestion \
  uv run --package opencg-ingestion \
  python -m opencg_ingestion.cli re-extract --source git --since 2026-06-01
```

Chunks already processed by the current extractor version are skipped. Failures are counted and the command continues with later chunks.

### Bounded ingestion

The Git CLI accepts optional positive limits for diagnostics and provider
canaries. Normal ingestion remains unlimited when these options are omitted:

```bash
docker compose -f infra/compose/docker-compose.yml exec ingestion \
  uv run --package opencg-ingestion \
  python -m opencg_ingestion.cli git <repo-url> \
  --max-documents 1 --max-chunks 2
```

### Full smoke and cloud canary

`make smoke` is deterministic and does not call a paid chat provider. It
constructs a uniquely named local Git repository from the committed fixture,
uses the real local embedding model and a compose-local Ollama-compatible chat
stub, verifies current-run vector/graph/audit records and OTel spans, and
terminates after 300 seconds by default.

```bash
make smoke
SMOKE_TIMEOUT_SECONDS=180 make smoke
```

The real-provider canary is explicit and bounded to one document and two
chunks:

```bash
make smoke-cloud
```

It requires `OPENCG__PROVIDERS__CHAT__BASE_URL`,
`OPENCG__PROVIDERS__CHAT__MODEL`, and
`OPENCG__PROVIDERS__CHAT__API_KEY` in `.env`.

The dev stack includes an OpenTelemetry Collector at
`http://otel-collector:4318`. Set `OTEL_EXPORTER_OTLP_ENDPOINT=none` for an
explicit offline run; smoke reports that trace verification was skipped.

## Vector search

`POST /search/vector` runs the same embeddings + Qdrant path the retrieve pipeline uses but writes no audit row — it is admin/operator exploration. Hit it from the admin UI at `/vectors` or directly:

```bash
curl -X POST http://localhost:8000/search/vector \
  -H 'content-type: application/json' \
  -d '{"query":"prompt caching","top_k":20}'
```

Results are fused across every source collection by Reciprocal Rank Fusion. `top_k` is server-capped at 100.

## Entity browse and tombstone

Browse via the admin UI (`/entities` with filters) or directly:

```bash
# List with filters
curl "http://localhost:8000/entities?source=git&classification=internal&limit=50"

# Fetch a single entity with lineage (parent + chunks)
curl http://localhost:8000/entities/<entity_id>

# Soft delete (tombstone). Idempotent — re-tombstoning preserves the original timestamp.
curl -X DELETE http://localhost:8000/entities/<entity_id>
```

Tombstoning sets `tombstoned_at` on the catalog row. The lexical leg of retrieval excludes tombstoned rows immediately. Qdrant points are NOT removed in this change — vector search continues to surface them so operators can see "what's there"; a future change pairs re-embed with vector-side cleanup.

## Swapping the embedding model

The vector dimension is per-collection in Qdrant. If you change `embedding_model`, you must also change `qdrant.vector_size` in `opencg.yaml` to match the new model's output dim — and either recreate the Qdrant collections or stand up a fresh tenant.

| Model | Dimension | Notes |
|---|---|---|
| `nomic-embed-text` (default) | 768 | Fast on CPU. Good general baseline. |
| `bge-m3` | 1024 | Multilingual; larger. |
| `qwen3-embedding:8b` | 4096 | Heavy; needs ≥ 16 GB RAM in the Ollama container. |
| `embeddinggemma` | 768 | Google's small embed model. |

Procedure to swap (full reset):

```bash
make down-v
# Edit opencg.yaml: ollama.embedding_model AND qdrant.vector_size
# (also update .env's OPENCG__OLLAMA__EMBEDDING_MODEL)
make up-d
# First start re-pulls the new model.
make ingest-git REPO=<your repo>
```

In-place swap (preserves catalog rows but rebuilds vector points) is not yet supported; a `model-providers` follow-up change adds a re-embed CLI.

## Identity stub

v0 hardcodes an identity context from `.env`. Anything calling the MCP server gets the configured `principal` + `roles` + `tenant` attached. The pipeline propagates these to OPA (when it lands in the follow-up) and into every audit row. **Replace with real auth before any non-dev deployment** — the propagation contract is already in place so only the verifier needs to change.

## Observability

- **Traces**: OTel spans are emitted by every service. Set `OTEL_EXPORTER_OTLP_ENDPOINT` to a live collector to see them. v0 does not bundle one — that's a follow-up change.
- **Metrics**: each service exposes `/metrics` in Prometheus format. Scrape from the pipeline at `:8000/metrics`.
- **Response usage**: every `POST /retrieve` response carries a `usage` envelope with per-stage token counts and latency.

## Audit log

Every retrieval writes a row to `opencg.audit_log` (partitioned weekly, append-only enforced by trigger). The pipeline exposes two read endpoints:

```bash
curl http://localhost:8000/audit/recent?limit=50
curl http://localhost:8000/audit/42
```

The admin UI's `/queries` page consumes these.

## Troubleshooting

- **`make up-d` hangs on `ollama` health** — first start has to download the embedding model. Tail `docker compose logs ollama` to watch the pull. If it hangs longer than ~5 minutes, check the host's network access to `registry.ollama.ai`.
- **`pipeline /readyz` returns 503** — typically Postgres or Qdrant is still starting; `make ps` shows healthcheck state.
- **Embedding errors after a model swap** — Qdrant collections retain the old vector dimension. Run `make down-v` and re-ingest.
- **`Authorization: Bearer …` showing up in local Ollama logs** — fine. Local Ollama ignores the header. If you don't want it, leave `OPENCG__OLLAMA__API_KEY` unset.
