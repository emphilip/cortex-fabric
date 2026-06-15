## 1. Ingestion Bounds

- [x] 1.1 Add optional `max_documents` and `max_chunks` arguments to the shared Git ingestion runner while preserving unlimited defaults
- [x] 1.2 Stop before inserting any parent beyond `max_documents` and before inserting, embedding, upserting, or extracting any chunk beyond `max_chunks`
- [x] 1.3 Add `--max-documents` and `--max-chunks` positive-integer options to the Git CLI and include limit/truncation state in its summary
- [x] 1.4 Add ingestion unit tests for unlimited behavior, document truncation, chunk truncation, downstream call counts, and invalid CLI limits

## 2. Deterministic Smoke Fixture

- [x] 2.1 Add a committed mixed prose/code fixture under `tests/smoke/fixtures/knowledge-repo/` with a unique retrieval phrase and deterministic graph relationships
- [x] 2.2 Add fixture setup logic that copies the source tree into the ingestion container, initializes a uniquely named Git repository, and records its source URI prefix
- [x] 2.3 Add fixture cleanup logic that removes the in-container repository on success, failure, timeout, or interrupt
- [x] 2.4 Verify with an automated test/helper that default fixture ingestion produces fewer than 20 chunks, symbol metadata, and text relationship evidence

## 3. Deterministic Chat Provider

- [x] 3.1 Add a minimal Ollama-compatible smoke chat service implementing `/api/chat`, schema-valid extraction JSON, and fixed non-zero token counts
- [x] 3.2 Add the chat stub to compose under the smoke/development profile with a health check and pinned runtime dependencies
- [x] 3.3 Configure default smoke ingestion to override only the chat endpoint/model for the command while retaining real local Ollama embeddings
- [x] 3.4 Add contract tests for the stub response shape and the production `OllamaChat` client interaction

## 4. OpenTelemetry Development Path

- [x] 4.1 Add a pinned OpenTelemetry Collector Contrib service and configuration with OTLP/HTTP, health, and debug export enabled
- [x] 4.2 Wire exporting application services to collector health without preventing explicit offline telemetry mode
- [x] 4.3 Add smoke polling that verifies current-run ingestion resource data plus `pipeline.graph_extract_code` and `pipeline.graph_extract_text` spans
- [x] 4.4 Add an explicit visible telemetry-skip path for exporter values `none`, `off`, `disabled`, or empty

## 5. Qdrant Compatibility

- [x] 5.1 Constrain pipeline and ingestion `qdrant-client` dependencies to `>=1.12,<1.13` and regenerate `uv.lock`
- [x] 5.2 Add a pre-ingestion smoke compatibility check that reports both client and server versions on mismatch
- [x] 5.3 Verify pipeline and ingestion startup no longer emit Qdrant incompatibility warnings

## 6. Bounded Smoke Runner

- [x] 6.1 Refactor `tests/smoke/run.sh` around named stages with elapsed-time reporting and a configurable 300-second overall deadline
- [x] 6.2 Implement portable Bash subprocess deadlines and traps that terminate host Docker exec processes and their in-container ingestion children
- [x] 6.3 Replace the public cookbook ingest with the unique local fixture and assert its reported parent/chunk bounds
- [x] 6.4 Update retrieval and vector assertions to use the fixture's unique phrase and require hits from the current run's source prefix
- [x] 6.5 Resolve the tombstone entity, candidate edge, and traversal concept from current-run source/evidence before invoking public HTTP mutation/read endpoints
- [x] 6.6 Preserve vocabulary, graph population, traversal, promotion, and append-only graph-audit assertions against current-run records

## 7. Optional Cloud Canary

- [x] 7.1 Add `SMOKE_CHAT_MODE=cloud` selection with preflight validation for chat base URL, model, and API key
- [x] 7.2 Enforce one-document and two-chunk limits in cloud mode and retain the overall smoke deadline
- [x] 7.3 Assert cloud mode receives parseable extraction output and records non-zero provider token counts
- [x] 7.4 Add shell-level tests or a dry-run inspection path proving default mode cannot select the cloud endpoint and cloud mode cannot exceed its limits

## 8. Documentation and Verification

- [x] 8.1 Update `.env.example`, `Makefile`, README quickstart, and `docs/OPERATIONS.md` for deterministic smoke, cloud canary, timeout controls, collector behavior, and offline mode
- [x] 8.2 Run `uv run pytest` and `pnpm -r test`
- [x] 8.3 Run `pnpm -r build`
- [x] 8.4 Rebuild/start the development stack and confirm every service, including collector and chat stub, is healthy
- [x] 8.5 Run `bash tests/smoke/run.sh` twice against the same persistent stack; both runs MUST pass independently within five minutes
- [x] 8.6 Run the bounded cloud canary once and record request count, duration, extraction result, and token-accounting evidence
- [x] 8.7 Run `openspec validate stabilize-full-smoke --strict`, scan staged changes for secrets, commit, and push
