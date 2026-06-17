<p align="center">
  <img src="./docs/assets/cortex-logo.png" alt="Cortex logo" width="120" height="120" />
</p>

<h1 align="center">Cortex</h1>

<p align="center">
  <em>Open-source, self-hostable enterprise context layer fabric — exposed as MCP, CLI, and Retrieval API.</em>
</p>

---

Cortex is a dockerized set of services that lets a single person or an organization run a private knowledge catalogue and serve it to any AI tool — Claude, Cursor, open-weight models, in-house agents — through a single MCP endpoint. It implements the contextual-layer pipeline (identity → intent → hybrid retrieval → catalog/graph enrichment → rerank + token-budget compression → entitlement → audit) and is built to learn continuously from usage. Open-source components are preferred; local Ollama models are the default embeddings backend, with light hosted chat models reserved for intent and extraction paths.

## Vision

> "If your AI architecture is just your LLM tool RAG-ing against a vector database, you don't have an AI architecture. You have one component."

Cortex builds out the missing components: identity, intent, hybrid retrieval, catalog/graph enrichment, rerank + compression, entitlement, audit, continuous enrichment, and an inspection UI. Every stage is independently testable, observable, and replaceable.

## Status

The **thin MVP** — the first end-to-end working slice — is implemented and running in Docker Compose, alongside an admin UI for vector search, entity inspection, ingestion control, and knowledge-graph review. The full v0 vision is broader and is delivered as a series of OpenSpec changes that flow from proposal → design + specs → tasks → implementation → archive.

**Shipped** (archived under [`openspec/changes/archive/`](./openspec/changes/archive/)):

- **`bootstrap-thin-mvp`** — the v0 stack: TS MCP server, four-stage retrieval pipeline, git ingestion CLI, query review page, immutable audit log, local Ollama embeddings, Docker Compose dev profile.
- **`add-admin-vector-and-content`** — admin UI for vector search, entity browse + detail (with tombstone), and ingestion control; pipeline entity/vector endpoints and ingestion proxies; an HTTP surface on ingestion alongside the CLI.
- **`add-knowledge-graph`** — named concept relationships, deterministic code graphs, best-effort text extraction, graph traversal, candidate review, and an editable relationship vocabulary.
- **`adopt-graphifyy`** · **`add-graph-explorer-view`** · **`adopt-shadcn-and-tremor`** · **`default-graph-to-map`** · **`rename-to-cortex`** — code-graph ingestion, the Obsidian-style graph explorer, the shadcn/Tremor admin redesign, and project naming.

**In flight** ([`openspec list`](./openspec/changes/)):

- **[`add-foundation`](./openspec/changes/add-foundation/)** — the **full v0 vision** spanning 12 capabilities (intent classifier, rerank + compress, OPA enforcement, additional connectors, enrichment workers, full admin UI, OTel/Tempo/Grafana stack, …). Each deferred capability ships as its own follow-up change that MODIFIES the requirements earlier changes set.
- **`stabilize-full-smoke`** — deterministic, bounded end-to-end smoke (local fixture + chat stub + OTel verification under a five-minute deadline). _Complete; pending archive._

## Stack

| Concern | Choice |
|---|---|
| Monorepo | `pnpm` + `uv` workspaces |
| MCP server | TypeScript (`@modelcontextprotocol/sdk`) |
| Pipeline · ingestion · workers | Python 3.12 (FastAPI, asyncpg, httpx) |
| Vector store | Qdrant (dense + lexical fusion) |
| Catalog · audit · graph | PostgreSQL 16 + Apache AGE |
| Cache | Valkey |
| Embeddings | Ollama (`nomic-embed-text`, compose-internal) |
| Chat / extraction | Ollama Cloud (`gemma3:4b` default) |
| Admin UI | Next.js 15 (App Router) + Storybook |
| Observability | OpenTelemetry → compose-local Collector (Tempo/Grafana is a follow-up) |
| Tests | pytest, vitest |
| Deployment | Docker Compose (`dev` profile) |

## Quickstart

```bash
# 1. Bring up the stack (postgres+AGE, qdrant, valkey, ollama, pipeline,
#    mcp-server, ingestion, admin-ui). First start pulls images + the embedding model.
cp .env.example .env
make up-d

# 2. Ingest a public git repo
make ingest-git REPO=https://github.com/anthropics/anthropic-cookbook

# 3. Retrieve context directly from the pipeline
curl -sS -X POST http://localhost:8000/retrieve \
  -H 'content-type: application/json' \
  -d '{
    "correlation_id":"hello-001",
    "identity":{"principal":"local-dev","roles":["admin","reader"],"tenant":"default"},
    "tool":"retrieve_for_context",
    "query":"how do I do prompt caching",
    "token_budget":2000
  }' | jq

# 4. Open the admin UI
open http://localhost:3000/queries
```

Run the deterministic full-stack verification with `make smoke`. It builds a temporary local Git fixture, uses local embeddings plus an Ollama-compatible chat stub, verifies OTel spans, and enforces a five-minute deadline. A real-provider canary is opt-in via `make smoke-cloud` and is capped at one document and two chunks.

## Admin UI

| Route | What it does |
|---|---|
| `/queries` | Recent retrievals + audit detail (tokens, fragments, principal, latency) |
| `/vectors` | Search the catalogue by meaning — top-K results with score, source, snippet |
| `/entities` | Filterable, paginated entity browser; click through to detail, lineage, and a tombstone action |
| `/ingestion` | Connector list + last-run summaries; a "Run now" form for git ingests |
| `/graph` | Search concepts, review candidate relationships, inspect evidence, and manage the relationship vocabulary |

Every shared component has a Storybook story neighbour.

## What's in the v0 stack today

- **TypeScript MCP server** (`services/mcp-server`) advertising five tools. `cortex/retrieve_for_context` and `cortex/traverse_graph` are live; the other three return `not_implemented_in_mvp`.
- **Python retrieval pipeline** (`services/pipeline`) with four stages: identity → hybrid retrieval (Qdrant dense + Postgres FTS lexical, fused via RRF) → assemble (token budget + role→classification allow-list) → return.
- **Python ingestion** (`services/ingestion`) with a `cortex-ingest git <url>` CLI: clone, chunk, embed, write Postgres + Qdrant, derive code relationships with graphifyy, and extract candidate text relationships with the configured chat model.
- **Next.js admin UI** (`services/admin-ui`) with query, vector, content, ingestion, and graph-review pages.
- **Storage**: Postgres 16 + Apache AGE for catalog, audit, and the named knowledge graph; Qdrant for vectors; Valkey for cache; compose-internal Ollama for embeddings.
- **Observability**: per-stage OTel spans carrying token attributes; Prometheus counters at `/metrics`; a compose-local OTel Collector that accepts and logs development traces.
- **Immutable audit log** at `cortex.audit_log` (partitioned by week, with a row-level immutability trigger).

**Not in v0:** intent classifier, OPA enforcement, Confluence/custom-API/web connectors, background enrichment workers, the Tempo/Loki/Prometheus/Grafana stack, a `local-prod` compose profile, and real auth.

## OpenSpec is the contract

**Every feature, deviation, or course-correction goes through the OpenSpec change workflow before code is written.** New work starts with `openspec new change <name>`, then proposal → design + specs → tasks → strict validation, then implementation phase by phase. Inline annotations in another change or undocumented pivots are not acceptable.

```bash
openspec list                                  # changes in flight
openspec list --specs                          # the archived spec baseline
openspec show add-foundation                   # the full v0 vision
openspec validate add-foundation --strict      # re-validate
```

## Where to read

| Document | What's there |
|---|---|
| [`openspec/project.md`](./openspec/project.md) | Vision, stack, conventions |
| [`openspec/specs/`](./openspec/specs/) | The archived spec baseline — 10 capability specs |
| [`openspec/changes/add-foundation/`](./openspec/changes/add-foundation/) | The full v0 vision (12 capabilities) |
| [`openspec/changes/archive/2026-06-12-add-knowledge-graph/`](./openspec/changes/archive/2026-06-12-add-knowledge-graph/) | The shipped knowledge-graph contract |
| [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) | Operating the stack — swapping embedding models, env overrides, etc. |

## Credits

Code-side ingestion uses [graphifyy](https://github.com/safishamsi/graphify) (MIT) for AST-level file discovery and symbol extraction across 28 tree-sitter languages. See [`openspec/changes/archive/2026-06-12-adopt-graphifyy/`](./openspec/changes/archive/2026-06-12-adopt-graphifyy/) for the integration contract.

## License

[MIT](./LICENSE).
