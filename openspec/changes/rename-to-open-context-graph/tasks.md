## 1. Python packages (directories + imports)

- [x] 1.1 `git mv` `packages/shared-py/src/cortex_shared` → `opencg_shared`, `services/pipeline/src/cortex_pipeline` → `opencg_pipeline`, `services/ingestion/src/cortex_ingestion` → `opencg_ingestion`
- [x] 1.2 Rewrite all `cortex_shared|cortex_pipeline|cortex_ingestion` imports across services + tests to `opencg_*`
- [x] 1.3 Update each `pyproject.toml` (`[project].name`, `[project.scripts]` `cortex-ingest`→`opencg-ingest`, `tool.hatch...packages`, `tool.uv.sources`) and the root `pyproject.toml` workspace members; regenerate `uv.lock`
- [x] 1.4 `uv run` the pipeline + ingestion test suites to confirm imports resolve

## 2. npm scope

- [x] 2.1 Rename `@cortex/*` → `@opencg/*` in every `package.json` (`name` + deps), all TS imports, `Dockerfile`s, `next.config.mjs`, `Makefile`, `tsconfig`/Storybook mocks; regenerate `pnpm-lock.yaml`
- [x] 2.2 `pnpm -r build` + `pnpm -r test` to confirm

## 3. Env prefix + config file

- [x] 3.1 `CORTEX__` → `OPENCG__` in the Python config loader `_ENV_PREFIX`, MCP `config.ts`, `.env.example`, compose, `docs/`, smoke
- [x] 3.2 `git mv cortex.yaml opencg.yaml`; update `CORTEX_CONFIG`→`OPENCG_CONFIG`, Dockerfiles, loader default paths

## 4. Postgres (schema/role/db) + telemetry

- [x] 4.1 `infra/postgres/*.sql`: schema/role/db `cortex` → `opencg`, AGE graph name, triggers, grants
- [x] 4.2 Every `cortex.<table>`/schema string in pipeline + ingestion code and tests → `opencg.<table>`; compose `POSTGRES_USER/PASSWORD/DB`
- [x] 4.3 OTel service namespace + metric names `cortex_tokens`/`cortex_cost`/`cortex_provider`/`cortex_requests`/`cortex_stage`/`cortex_extractor` → `opencg_*`

## 5. Docker/compose + MCP surface

- [x] 5.1 Compose `name: cortex`→`opencg`, network refs, image names `cortex/*`→`opencg/*`, host-var defaults, healthcheck `$$` strings; `infra/ollama` + Dockerfiles image tags
- [x] 5.2 MCP advertised server name and `cortex/<tool>` namespace → `opencg/<tool>` in `tools.ts` (+ tests) and the pipeline `tool` field

## 6. Branding + docs + spec

- [x] 6.1 README, `docs/*`, admin-UI wordmark (`cortex`→`openCG`) and any visible "Cortex" copy
- [x] 6.2 Update `CLAUDE.md`, `AGENTS.md`, and `.cursor/rules/*.mdc` together (keep the three in sync), renaming the project and the in-flight-changes notes
- [x] 6.3 Confirm the `project-conventions` delta matches the implemented scheme

## 7. Verification + fresh stack

- [x] 7.1 `grep -rIi cortex` over tracked files excluding `openspec/changes/archive/**` (and build/dep dirs) returns ZERO; fix any leftovers
- [x] 7.2 `uv run pytest` (all packages) + `pnpm -r test` + `pnpm -r build` all green
- [x] 7.3 Regenerate `.env` from `.env.example` under `OPENCG__`, carrying over secret values (token, OAuth password, public URL, API keys)
- [x] 7.4 `make down-v` + `make up-d` (stack rebuilt under openCG), confirm all services healthy
- [x] 7.5 Re-ingest the banking repo; run `bash tests/smoke/run.sh` twice — both pass
- [x] 7.6 Update the live Claude Desktop MCP config (`opencg/mcp-server:local`, `--network opencg_default`)
- [x] 7.7 Run `openspec validate rename-to-open-context-graph --strict`, scan for secrets, commit, and push
