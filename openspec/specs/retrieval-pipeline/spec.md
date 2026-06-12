# Retrieval Pipeline

## Purpose

Expose retrieval, catalogue administration, vector search, and ingestion controls with full model-call observability.
## Requirements
### Requirement: Per-stage token accounting

Token accounting attributes MUST continue to be emitted for every model invocation, but this change MODIFIES the `graph_extract` stage label set: the single `graph_extract` label proposed in `add-knowledge-graph` is replaced by two distinct labels, **`graph_extract_text`** and **`graph_extract_code`**.

- `graph_extract_text` MUST be used when the LLM extractor runs (markdown, plain text, future PDF / HTML / MDX). Token counters and OTel attributes MUST be emitted as before.
- `graph_extract_code` MUST be used for graphifyy invocations. Token counters MUST NOT be incremented for this label (graphifyy makes no model calls). An OTel span with `stage="graph_extract_code"`, `model="graphifyy"`, `provider="graphifyy"`, `tokens_in=0`, `tokens_out=0`, and `latency_ms` MUST still be emitted so the stage is observable in traces.

#### Scenario: Code extraction emits a token-zero span

- **WHEN** the ingestion service runs graphifyy on a Python file
- **THEN** an OTel span named `pipeline.graph_extract_code` is emitted with `model="graphifyy"`, `provider="graphifyy"`, `tokens_in=0`, `tokens_out=0`, and `latency_ms` set
- **AND** `hive_mind_tokens_total{stage="graph_extract_code"}` is NOT incremented

#### Scenario: Text extraction continues to count tokens

- **WHEN** the LLM extractor runs on a markdown chunk
- **THEN** an OTel span named `pipeline.graph_extract_text` is emitted with the chat model's `model`, `provider`, `tokens_in`, `tokens_out`, and `latency_ms`
- **AND** `hive_mind_tokens_total{stage="graph_extract_text"}` increases by the recorded counts

### Requirement: Entity read HTTP endpoints

The pipeline service SHALL expose entity-side read endpoints used by the admin UI: `GET /entities` (list with filters), `GET /entities/{id}` (single entity with lineage), and `DELETE /entities/{id}` (tombstone). These endpoints MUST be read-only with respect to retrieval state and MUST NOT write audit rows.

`GET /entities` MUST accept and apply the query parameters `source`, `classification`, `freshness_state`, `limit` (default 50, max 200), and `offset` (default 0). It MUST return `{"items":[...], "total": <int>, "limit": <int>, "offset": <int>}`. Filters MUST be evaluated by Postgres using existing indexes; the endpoint MUST NOT scan body text.

`GET /entities/{id}` MUST return the entity row plus a `lineage` block containing `parent` (if any) and `children` (chunks, if this is a parent), each as compact `{entity_id, title, source_uri}` references.

`DELETE /entities/{id}` MUST set `tombstoned_at = now()` on the matching row and return the updated row. It MUST be idempotent (re-tombstoning is a no-op).

#### Scenario: List entities with filters

- **WHEN** a client calls `GET /entities?source=git&classification=internal&limit=50&offset=0`
- **THEN** the response is `{items:[…], total:<int>, limit:50, offset:0}` with up to 50 rows matching the filters
- **AND** the database query uses the existing indexes (no sequential scan over `entity` body text)

#### Scenario: Fetch entity by id

- **WHEN** a client calls `GET /entities/{id}` for an existing parent file with chunks
- **THEN** the response contains the entity columns plus `lineage.children` listing each chunk's `entity_id`, `title`, and `source_uri`

#### Scenario: Fetch entity by id - chunk

- **WHEN** a client calls `GET /entities/{id}` for a chunk
- **THEN** the response contains the chunk plus `lineage.parent` referencing the parent file

#### Scenario: Tombstone an entity

- **WHEN** a client calls `DELETE /entities/{id}` for an entity whose `tombstoned_at` is `NULL`
- **THEN** the row's `tombstoned_at` is set to `now()` and the response contains the updated row
- **AND** a subsequent `GET /entities/{id}` returns the same `tombstoned_at`

### Requirement: Vector search HTTP endpoint

The pipeline service SHALL expose `POST /search/vector` accepting `{"query": <string>, "top_k"?: <int 1..100>, "filters"?: { … }}`. The endpoint MUST embed the query through the same embeddings client used by the retrieve path and MUST return `{"hits": [{ "entity_id", "score", "source", "source_uri", "title", "classification", "snippet" }], "model": "…", "provider": "…", "tokens_in": <int> }`.

The endpoint MUST NOT write an audit row. It MUST emit an OTel span and increment the token counter as defined in the "Per-stage token accounting" requirement above.

#### Scenario: Vector search end-to-end

- **WHEN** a client calls `POST /search/vector` with `{"query":"prompt caching","top_k":10}`
- **THEN** the response contains up to 10 hits ordered by `score` desc
- **AND** the response carries the embedding `model`, `provider`, and `tokens_in`
- **AND** no row is written to `hive_mind.audit_log`

#### Scenario: Vector search top_k cap

- **WHEN** a client sends `top_k = 500`
- **THEN** the request is rejected with `400 Bad Request` and a message naming the 100 cap

### Requirement: Ingestion control proxies

The pipeline service SHALL proxy three endpoints to the ingestion service over the compose network: `GET /ingestion/connectors`, `POST /ingestion/git/run`, and `GET /ingestion/runs/recent`. Failures from the ingestion service MUST surface as `502 Bad Gateway` with the upstream body included.

The pipeline MUST NOT cache responses; the proxy is a thin pass-through so future cross-cutting concerns (OPA, rate limit) have a single attach point.

#### Scenario: Proxy connectors list

- **WHEN** a client calls `GET /ingestion/connectors` against the pipeline
- **THEN** the pipeline forwards to `GET /connectors` on the ingestion service
- **AND** the response body matches the ingestion service's response

#### Scenario: Proxy run request

- **WHEN** a client calls `POST /ingestion/git/run` with `{"repo_url":"https://…"}`
- **THEN** the pipeline forwards to `POST /run/git` on the ingestion service with the same body
- **AND** the response contains `{run_id, status}`

#### Scenario: Upstream failure surfaces as 502

- **WHEN** the ingestion service returns `500` to a proxied request
- **THEN** the pipeline returns `502 Bad Gateway` with the upstream body included in the error payload
