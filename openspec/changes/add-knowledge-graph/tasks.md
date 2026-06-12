## 1. Storage migration

- [x] 1.1 Add `infra/postgres/init/040_graph.sql` creating `relationship_vocab`, `concept`, `relationship_edge`, `relationship_evidence`, `graph_audit_log`
- [x] 1.2 Seed `relationship_vocab` with the seven default names + descriptions + inverses
- [x] 1.3 Add immutability trigger to `graph_audit_log` (mirrors `audit_log` trigger)
- [x] 1.4 AGE bootstrap: add label types for `Concept` and one edge label per vocabulary entry (run idempotently via DO block)
- [x] 1.5 Indexes: `concept(tenant, dedupe_key)` UNIQUE, `concept(tenant, state)`, `edge(state, confidence DESC)`, `evidence(edge_id)`, `evidence(entity_id)`, `graph_audit_log(target_id, created_at DESC)`

## 2. Shared types

- [x] 2.1 TS: add `Concept`, `ConceptListItem`, `RelationshipType`, `RelationshipEdge`, `EdgeState`, `TraverseRequest`, `TraverseResponse`, `ExtractionResult`, `Neighbour` to `packages/shared/src/index.ts`
- [x] 2.2 Python: mirror as Pydantic in `packages/shared-py/src/hive_mind_shared/types.py` and re-export from `__init__.py`

## 3. Config / providers

- [x] 3.1 `packages/shared-py/.../config.py`: add `ProvidersCfg.embeddings` + `ProvidersCfg.chat`, with back-compat that maps the existing `ollama` block onto `providers.embeddings`
- [x] 3.2 `OllamaChat` client at `services/pipeline/src/hive_mind_pipeline/providers.py` (sibling of `OllamaEmbeddings`); `Authorization: Bearer …` when key set; `format=json` when a schema is supplied; surface `tokens_in`/`tokens_out` from `prompt_eval_count` / `eval_count`
- [x] 3.3 respx unit tests: cloud chat with bearer, local chat without bearer, JSON-mode flag pass-through, error propagation
- [x] 3.4 `hive-mind.yaml`: add `providers.chat` block with `base_url=https://ollama.com`, `model=gemma3:4b`, `api_key=null`
- [x] 3.5 `.env.example`: document `HIVE_MIND__PROVIDERS__CHAT__*` overrides

## 4. Extractor

- [x] 4.1 New module `services/pipeline/src/hive_mind_pipeline/graph/extract.py` with `extract_for_chunk(chunk_text, chunk_entity_id) -> ExtractionResult`
- [x] 4.2 Prompt template that names the active vocabulary and asks for JSON with `concepts[]` and `relations[]`
- [x] 4.3 Pydantic `ExtractionResult` with `model_validate_json` for response parsing
- [x] 4.4 `min_confidence` filter; configurable per `hive-mind.yaml` (`providers.chat.min_confidence`, default 0.6)
- [x] 4.5 Transactional insert of concepts + edges + evidence + AGE reflection
- [x] 4.6 OTel span `pipeline.graph_extract`; Prom counter `hive_mind_extractor_edges_total{relation,state}`, `hive_mind_extractor_errors_total{reason}`
- [x] 4.7 Unit tests: dedupe via normalised name, threshold drops, vocabulary rejection on unknown name, transaction rollback on AGE failure

## 5. Pipeline graph routes

- [x] 5.1 New module `services/pipeline/src/hive_mind_pipeline/graph/routes.py` mounted at `app.include_router(graph_routes.router)`
- [x] 5.2 Read endpoints: `GET /graph/vocab`, `GET /graph/concepts`, `GET /graph/concepts/{id}`, `GET /graph/edges`, `GET /graph/traverse`
- [ ] 5.3 Admin write endpoints: promote/demote/tombstone/patch for concepts and edges; `POST /graph/concepts/merge`; vocab CRUD
- [ ] 5.4 Every state transition writes a `graph_audit_log` row in the same transaction
- [x] 5.5 AGE-backed traversal using openCypher (`MATCH path = (start)-[:type1|type2*1..depth]-(neighbour) ...`)
- [ ] 5.6 Endpoint tests with FastAPI TestClient + fake catalog/graph stores

## 6. Ingestion hook + re-extract CLI

- [x] 6.1 Wire `extract_for_chunk` into `services/ingestion/src/hive_mind_ingestion/pipeline_runner.py` after the Qdrant upsert; try/except + timeout
- [ ] 6.2 New `hive-mind-ingest re-extract` Click subcommand with `--source` and `--since`
- [ ] 6.3 Unit tests: extractor failure does not abort the chunk loop, timeout is enforced
- [ ] 6.4 CLI test for `re-extract` skip-by-extractor-version logic

## 7. MCP server

- [x] 7.1 Replace `hive_mind/traverse_graph` stub handler with a real implementation that calls `GET /graph/traverse` on the pipeline
- [x] 7.2 Surface `code = "concept_not_found"` when the concept_id doesn't exist
- [x] 7.3 Update existing `tools.test.ts`: traverse_graph success path + concept_not_found path; other three deferred tools still error

## 8. Admin UI — /graph page

- [ ] 8.1 New route `services/admin-ui/src/app/graph/page.tsx` with tabbed layout: Concepts / Candidate review / Vocabulary
- [ ] 8.2 Component `ConceptRow` + stories + tests
- [ ] 8.3 Component `ConceptDetail` (header, neighbours, evidence) + stories + tests
- [ ] 8.4 Component `CandidateEdgeRow` (per-row promote/demote/edit/delete) + stories + tests
- [ ] 8.5 Component `RelationshipTypeBadge` + stories + tests
- [ ] 8.6 Component `VocabRow` + stories + tests
- [ ] 8.7 Client actions: promote/demote/tombstone/merge for concepts; promote/demote/edit/tombstone for edges; vocab CRUD
- [ ] 8.8 Next-server route handlers under `src/app/api/proxy/graph/...` forwarding to the pipeline (mirrors existing `/api/proxy/...` pattern)
- [ ] 8.9 Update nav in `src/app/layout.tsx` to include `Graph`
- [ ] 8.10 Confirm `pnpm exec next build` and `pnpm build-storybook` are green

## 9. Cross-cutting

- [x] 9.1 `services/pipeline/src/hive_mind_pipeline/storage/catalog.py`: add `get_evidence_chunks(edge_id)`
- [ ] 9.2 All existing tests still pass (`uv run pytest` and `pnpm -r test`)
- [ ] 9.3 Compose `pipeline` + `ingestion` rebuild green
- [ ] 9.4 `OPENSPEC validate --strict` for all three in-flight changes

## 10. Smoke

- [ ] 10.1 Extend `tests/smoke/run.sh`: after the existing ingest, assert at least one candidate edge exists via `GET /graph/edges?state=candidate&limit=5`; assert vocabulary listing returns the seven seeded names; assert `traverse` from a known concept returns a non-empty subgraph
- [ ] 10.2 Run smoke against the live stack
- [ ] 10.3 Pick one candidate edge, promote it via `POST /graph/edges/{id}/promote`, verify `confirmed` + a `graph_audit_log` row exists

## 11. Docs

- [ ] 11.1 README: short note pointing at the new `/graph` page and the MCP `traverse_graph` tool now being live
- [ ] 11.2 `docs/OPERATIONS.md`: section on the relationship vocabulary, extraction tuning (`min_confidence`, `chat_qps`, `extraction.enabled`, `timeout_seconds`), and re-extract CLI
- [ ] 11.3 `docs/EXTRACTOR_PROMPT.md` (new): exact prompt template + response schema, so operators can reason about why the model produced what it produced

## 12. Commit + push
