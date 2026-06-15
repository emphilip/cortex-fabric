# Cortex

> Open-source, self-hostable enterprise context engineering — exposed as MCP.

Cortex is a dockerized set of services that lets a single person or an organization run a private knowledge catalogue and serve it to any AI tool (Claude, Cursor, open-weight models, in-house agents) through a single MCP endpoint. It implements the contextual-layer pipeline — identity, intent classification, hybrid retrieval, catalog/graph enrichment, rerank + token-budget compression, entitlement, audit — and learns continuously from usage. Open-source components are preferred; local Ollama models are the default embeddings backend, with light Anthropic models (Haiku) reserved for chat/intent paths in follow-up changes.

> "If your AI architecture is just your LLM tool RAG-ing against a vector database, you don't have an AI architecture. You have one component."

## Status

The **thin MVP** (first end-to-end working slice) is implemented and in compose, plus an admin UI for vector search, entity inspection, ingestion control, and knowledge-graph review. The full v0 vision is broader and is being delivered through a series of OpenSpec changes:

- **[`bootstrap-thin-mvp`](./openspec/changes/bootstrap-thin-mvp/proposal.md)** — the authoritative contract for the original v0 stack: TS MCP server, 4-stage retrieval pipeline, git ingestion CLI, query review page, immutable audit log, local Ollama embeddings, Docker Compose dev profile.
- **[`add-admin-vector-and-content`](./openspec/changes/add-admin-vector-and-content/proposal.md)** — admin UI surfaces for **vector search**, **entity browse + detail (with tombstone)**, and **ingestion control**. Pipeline gains entity read endpoints, a vector-search endpoint, and ingestion proxies; ingestion gains an HTTP surface alongside the CLI. Strict-validated, 44 tasks.
- **[`add-knowledge-graph`](./openspec/changes/add-knowledge-graph/proposal.md)** — named concept relationships, deterministic code graphs, best-effort text extraction, graph traversal, candidate review, and editable vocabulary.
- **[`add-foundation`](./openspec/changes/add-foundation/proposal.md)** — the **full v0 vision** spanning 12 capabilities (knowledge graph with named relationships, intent classifier, rerank+compress, OPA, additional connectors, enrichment workers, full admin UI, OTel/Tempo/Grafana stack, etc.). Each deferred capability ships as its own follow-up change that MODIFIES the requirements earlier changes set.

## Credits

Code-side ingestion uses [graphifyy](https://github.com/safishamsi/graphify) (MIT) for AST-level file discovery + symbol extraction across 28 tree-sitter languages. See `openspec/changes/adopt-graphifyy/` for the integration contract.

## OpenSpec is the contract — strict requirement

**Every feature, deviation, or course-correction goes through the OpenSpec change workflow before code is written.** New work starts with `openspec new change <name>`, then proposal → design + specs → tasks → strict-validate, then implementation. Inline annotations or undocumented pivots are not acceptable.

## Quickstart

```bash
# 1. Bring up the stack (postgres+AGE, qdrant, valkey, ollama, pipeline, mcp-server,
#    ingestion, admin-ui). First start downloads images and pulls the embedding model.
cp .env.example .env
make up-d

# 2. Ingest a public git repo
make ingest-git REPO=https://github.com/anthropics/anthropic-cookbook

# 3. Hit the MCP/pipeline directly to retrieve context
curl -sS -X POST http://localhost:8000/retrieve \
  -H 'content-type: application/json' \
  -d '{
    "correlation_id":"hello-001",
    "identity":{"principal":"local-dev","roles":["admin","reader"],"tenant":"default"},
    "tool":"retrieve_for_context",
    "query":"how do I do prompt caching",
    "token_budget":2000
  }' | jq

# 4. Open the admin UI: http://localhost:3000/queries
```

Run the deterministic full-stack verification with `make smoke`. It builds a
temporary local Git fixture, uses local embeddings plus an Ollama-compatible
chat stub, verifies OTel spans, and enforces a five-minute deadline. A real
provider canary is opt-in via `make smoke-cloud`; it is capped at one document
and two chunks.

The admin UI ships five pages:

| Route | What it does |
|---|---|
| `/queries` | Recent retrievals + audit detail (tokens, fragments, principal, latency) |
| `/vectors` | Search the catalogue by meaning. Top-K results with score, source, snippet |
| `/entities` | Filterable, paginated entity browser; click through to detail, lineage, and a tombstone action |
| `/ingestion` | Connector list + last-run summaries; "Run now" form for git ingests |
| `/graph` | Search concepts, review candidate relationships, inspect evidence, and manage the relationship vocabulary |

## Where to read

| Document | What's there |
|---|---|
| [`openspec/project.md`](./openspec/project.md) | Vision, stack, conventions |
| [`openspec/changes/bootstrap-thin-mvp/`](./openspec/changes/bootstrap-thin-mvp/) | The original thin-MVP contract |
| [`openspec/changes/add-admin-vector-and-content/`](./openspec/changes/add-admin-vector-and-content/) | Vector explorer + entity browser + ingestion control |
| [`openspec/changes/add-foundation/`](./openspec/changes/add-foundation/) | The full v0 vision (12 capabilities) |
| [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) | Operating the stack — swapping embedding models, env overrides, etc. |

## What's actually in the v0 stack today

- **TypeScript MCP server** (`services/mcp-server`) advertising five tools. `cortex/retrieve_for_context` and `cortex/traverse_graph` are live; the other three return `not_implemented_in_mvp`.
- **Python retrieval pipeline** (`services/pipeline`) with four stages: identity → hybrid retrieval (Qdrant dense + Postgres FTS lexical, fused via RRF) → assemble (budget + hardcoded role→classification allow-list) → return.
- **Python ingestion** (`services/ingestion`) with a `cortex-ingest git <url>` CLI: clone, chunk, embed, write Postgres + Qdrant, derive code relationships with graphifyy, and extract candidate text relationships with the configured chat model.
- **Next.js admin UI** (`services/admin-ui`) with query, vector, content, ingestion, and graph-review pages. Storybook includes stories for every shared component.
- **Storage**: Postgres 16 + Apache AGE for the catalog, audit, and named knowledge graph; Qdrant for vectors; Valkey for cache; plus compose-internal Ollama embeddings.
- **Observability emission**: OTel spans per stage with token attributes; Prometheus counters at `/metrics`; a compose-local OTel Collector accepts and logs development traces. The full Tempo/Grafana stack is a follow-up change.
- **Immutable audit log** at `cortex.audit_log` (partitioned by week, row-level immutability trigger).

What is NOT in v0: intent classifier, OPA enforcement, Confluence/custom-API/web connectors, background enrichment workers, the Tempo/Loki/Prometheus/Grafana stack, `local-prod` compose profile, real auth.

## Working with the spec

```bash
openspec list                                  # changes in flight
openspec list --specs                          # archived (none yet)
openspec show bootstrap-thin-mvp               # the v0 stack contract
openspec show add-foundation                   # the full v0 vision
openspec validate bootstrap-thin-mvp --strict  # re-validate
```

## License

[MIT](./LICENSE).
