# Tasks — rename-to-cortex

## Phase 0 — Confirm scheme
- [ ] 0.1 Operator confirms D1 (short internal `cortex`, repo `cortex-context-fabric`) and D6 directory-rename preference.

## Phase 1 — Package manifests & namespaces
- [ ] 1.1 Rename TS workspace packages `@hive-mind/{admin-ui,mcp-server,shared}` → `@cortex/*` in every `package.json` (name + all `workspace:*` deps + imports).
- [ ] 1.2 Rename Python packages `hive_mind_{pipeline,ingestion,shared}` → `cortex_*`: directory names under `src/`, `pyproject.toml` names, and all imports.
- [ ] 1.3 Regenerate lockfiles: `pnpm install` and `uv sync --all-packages`.

## Phase 2 — Config, env, schema, telemetry
- [ ] 2.1 Replace env prefix `HIVE_MIND__*` → `CORTEX__*` in `.env.example`, config loader (`packages/shared-py`), compose, and all readers.
- [ ] 2.2 Rename Postgres schema `hive_mind` → `cortex` in `infra/postgres/init/*.sql` (incl. audit triggers + AGE setup) and every `asyncpg` query string.
- [ ] 2.3 Rename Prometheus metric prefix `hive_mind_*` → `cortex_*` and OTel service/resource names.
- [ ] 2.4 Rename compose image names `hive-mind/*` → `cortex/*`; leave generic service names.

## Phase 3 — Source, tests, docs
- [ ] 3.1 Sweep remaining `hive_mind` / `hive-mind` / `HIVE_MIND` in source + tests.
- [ ] 3.2 Update docs + agent guides (`CLAUDE.md`, `AGENTS.md`, `.cursor/rules/*`, `README.md`, `docs/OPERATIONS.md`, `openspec/project.md`) to Cortex.
- [ ] 3.3 Confirm zero unexpected matches: `grep -rIn -iE "hive[-_ ]?mind"` over tracked files excluding `openspec/changes/archive/**` and this change's prose.

## Phase 4 — Verify the running stack
- [ ] 4.1 `pnpm --filter @cortex/admin-ui build`, admin-ui tests, `build-storybook` — all green.
- [ ] 4.2 `make down` + remove postgres volume → `make up-d` → all services healthy.
- [ ] 4.3 `bash tests/smoke/run.sh` PASSES end-to-end.

## Phase 5 — Ship
- [ ] 5.1 Secret-scan staged diff; commit in logical batches.
- [ ] 5.2 Operator updates local `.env` (`HIVE_MIND__*` → `CORTEX__*`).
- [ ] 5.3 Push; rename GitHub repo to `cortex-context-fabric`; `git remote set-url origin …`.
- [ ] 5.4 (Optional, operator) rename on-disk directory to `cortex-context-fabric`.
- [ ] 5.5 `openspec archive rename-to-cortex`.
