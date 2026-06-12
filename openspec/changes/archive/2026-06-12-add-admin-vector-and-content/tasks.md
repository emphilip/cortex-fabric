## 1. Shared types

- [x] 1.1 Add `Entity`, `EntityListItem`, `VectorSearchHit`, `IngestionRun`, `ConnectorStatus` to `packages/shared/src/index.ts`
- [x] 1.2 Mirror them as Pydantic models in `packages/shared-py/src/hive_mind_shared/types.py`
- [x] 1.3 Re-export from `__init__.py`

## 2. Catalog store

- [x] 2.1 Add `CatalogStore.list_entities(tenant, *, source?, classification?, freshness_state?, limit, offset)` returning `(rows, total)`
- [x] 2.2 Add `CatalogStore.get_entity_with_lineage(tenant, entity_id)` returning the row plus parent and chunk children
- [x] 2.3 Add `CatalogStore.tombstone(tenant, entity_id)` (idempotent)
- [x] 2.4 Tests: filter combinations, lineage chunk listing, tombstone idempotency

## 3. Vector index

- [x] 3.1 Add `VectorIndex.search_all(vector, top_k, filters?)` returning cross-collection RRF-fused hits with `collection` per hit
- [x] 3.2 Unit tests with a fake `AsyncQdrantClient`

## 4. Pipeline HTTP surface (new endpoints)

- [x] 4.1 `GET /entities` — list with filters and pagination
- [x] 4.2 `GET /entities/{id}` — single entity with lineage block
- [x] 4.3 `DELETE /entities/{id}` — tombstone
- [x] 4.4 `POST /search/vector` — embed → cross-collection search → response with model/provider/tokens; OTel span `pipeline.vector_search`; token counter increment with `stage="vector_search"`
- [x] 4.5 Ingestion proxies: `GET /ingestion/connectors`, `POST /ingestion/git/run`, `GET /ingestion/runs/recent`
- [x] 4.6 Endpoint tests (httpx test client + fakes for catalog/vector/ingestion)

## 5. Ingestion HTTP service

- [x] 5.1 New `services/ingestion/src/hive_mind_ingestion/server.py` with FastAPI app
- [x] 5.2 Endpoints: `/healthz`, `/readyz`, `GET /connectors`, `POST /run/git`, `GET /runs/recent`
- [x] 5.3 In-memory run-history store (capped at 100) + background-task runner
- [x] 5.4 Update `services/ingestion/Dockerfile` `CMD` to run uvicorn on port 8100
- [x] 5.5 Update `infra/compose/docker-compose.yml`: expose port 8100 inside the network, add healthcheck, point `pipeline` proxies at `http://ingestion:8100`
- [x] 5.6 Tests for endpoints (sync httpx test client) and run-history capping

## 6. Admin UI — vector explorer

- [x] 6.1 Page `services/admin-ui/src/app/vectors/page.tsx` (server component handling form + initial render; client component for results table)
- [x] 6.2 Component `VectorHit.tsx` + `VectorHit.stories.tsx` (canonical / empty / error)
- [x] 6.3 Status header showing `embedding_model` + `vector_size` from `GET /readyz`
- [x] 6.4 vitest unit tests for `VectorHit`

## 7. Admin UI — entities

- [x] 7.1 Page `services/admin-ui/src/app/entities/page.tsx` (filters + paginated list)
- [x] 7.2 Page `services/admin-ui/src/app/entities/[id]/page.tsx` (detail + lineage + tombstone)
- [x] 7.3 Component `EntityRow.tsx` + `.stories.tsx`
- [x] 7.4 Component `EntityDetail.tsx` + `.stories.tsx`
- [x] 7.5 Tombstone confirm dialog + post action
- [x] 7.6 vitest unit tests

## 8. Admin UI — ingestion

- [x] 8.1 Page `services/admin-ui/src/app/ingestion/page.tsx`
- [x] 8.2 Component `ConnectorCard.tsx` + `.stories.tsx`
- [x] 8.3 Component `IngestionRunRow.tsx` + `.stories.tsx`
- [x] 8.4 "Run now" form with input validation
- [x] 8.5 vitest unit tests

## 9. Cross-cutting

- [x] 9.1 Update `services/admin-ui/src/app/layout.tsx` nav to include the four pages
- [x] 9.2 `pnpm --filter @hive-mind/admin-ui build-storybook` succeeds without warnings
- [x] 9.3 `pnpm --filter @hive-mind/admin-ui build` succeeds
- [x] 9.4 All existing tests still pass (`uv run pytest` and `pnpm -r test`)

## 10. Smoke

- [x] 10.1 Extend `tests/smoke/run.sh`: after the existing ingest+retrieve check, hit `POST /search/vector` and assert ≥ 1 hit; hit `GET /entities?limit=1` and assert a row exists; hit `DELETE /entities/{id}` for one chunk and assert `tombstoned_at` round-trips
- [x] 10.2 Run smoke against the live stack

## 11. Docs

- [x] 11.1 README: short note pointing at the new admin pages
- [x] 11.2 `docs/OPERATIONS.md`: section on vector search and tombstone semantics
