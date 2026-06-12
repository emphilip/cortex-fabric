## MODIFIED Requirements

### Requirement: Per-stage token accounting

The thin-MVP version required token accounting only on the hybrid-retrieval stage of the retrieve path. This change extends the requirement: every call site that invokes the embeddings client (including the new admin-side `POST /search/vector`) MUST record `model`, `provider`, `tokens_in`, and `latency_ms` on its OTel span AND increment `hive_mind_tokens_total{stage,model,provider,tenant,direction}`. Vector-search invocations MUST use `stage = "vector_search"`. Audit accounting (which only the `/retrieve` path produces) is unchanged.

#### Scenario: Vector search accounting

- **WHEN** an operator submits a query through `POST /search/vector`
- **THEN** an OTel span named `pipeline.vector_search` is emitted with `model`, `provider`, `tokens_in`, and `latency_ms`
- **AND** `hive_mind_tokens_total{stage="vector_search",direction="in"}` increases by the recorded `tokens_in`

#### Scenario: Retrieve path accounting unchanged

- **WHEN** a `/retrieve` call completes
- **THEN** the per-stage attribution from `bootstrap-thin-mvp` continues to hold (a `pipeline.hybrid_retrieval` span with the embeddings attributes)

## ADDED Requirements

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

#### Scenario: Fetch entity by id — chunk

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
