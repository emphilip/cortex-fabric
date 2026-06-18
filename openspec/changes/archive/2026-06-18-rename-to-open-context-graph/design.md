## Context

Cortex appears in ~700 places across 146 active files in well-defined identifier classes: npm scope `@cortex/*`, Python package directories `cortex_*` (with all imports), the `CORTEX__` env prefix, the Postgres `cortex` schema/role/db, Docker `cortex/*` images + compose project/network, the MCP server name + `cortex/<tool>` namespace, `cortex_*` metric/OTel names, `cortex.yaml`, and branding/docs. The prior `rename-to-cortex` change is the precedent — and it left leftovers (a `.env` and smoke fixtures) that caused real bugs we later fixed, so the gate here must be stricter.

## Goals / Non-Goals

**Goals:** rename every active identifier to the openCG scheme with no behavioural change; leave the stack runnable, all tests green, smoke passing, and `grep -ri cortex` over active sources at zero.

**Non-Goals:** data migration (we recreate fresh), the GitHub repo rename, and editing archived OpenSpec changes (historical records keep their Cortex text).

## Decisions

### Decision 1: Mechanical, identifier-class by class, in dependency order

Execute as ordered, reviewable passes rather than one blind global replace, because the right replacement differs by context (`@cortex/` vs `cortex_` vs `cortex.` schema vs the word "Cortex" in prose):

1. **Python package dirs** — `git mv` `cortex_shared`/`cortex_pipeline`/`cortex_ingestion` → `opencg_*`; rewrite imports, `pyproject.toml` (`name`, `[project.scripts]`, `tool.hatch` packages, `tool.uv.sources`), root `pyproject.toml` workspace members, CLI entry `cortex-ingest` → `opencg-ingest`.
2. **npm scope** — `@cortex/*` → `@opencg/*` in every `package.json`, import, `Dockerfile`, `next.config.mjs`, `Makefile`, `pnpm-lock.yaml` (regenerate).
3. **Env prefix** — `CORTEX__` → `OPENCG__` in the Python config loader (`_ENV_PREFIX`), the MCP `config.ts`, `.env.example`, compose, docs, smoke.
4. **Postgres** — schema/role/db `cortex` → `opencg` in `infra/postgres/*.sql`, compose `POSTGRES_*`, the AGE graph name, and every `cortex.<table>` string in pipeline/ingestion code + tests.
5. **Compose/Docker** — `name: cortex` → `opencg`, `cortex/<img>` → `opencg/<img>`, host-var defaults, healthcheck strings.
6. **MCP** — server name and `cortex/<tool>` namespace in `tools.ts` (+ tests), the pipeline `tool` field, OTel/metric names (`cortex_*` → `opencg_*`).
7. **Config file** — `git mv cortex.yaml opencg.yaml`; update `CORTEX_CONFIG`→`OPENCG_CONFIG`, Dockerfiles, loaders.
8. **Branding/docs** — README, `CLAUDE.md`/`AGENTS.md`/`.cursor/rules/*.mdc` (keep the three in sync), admin-UI wordmark, `docs/`, `Makefile` help.

After each pass, build/test the affected workspace so failures localize.

### Decision 2: Verification gate — zero `cortex` in active sources

The done-criterion is `grep -rIi cortex` over tracked files **excluding** `openspec/changes/archive/**` (and `node_modules`/`.venv`/`dist`/`.next`/lockfiles' transitive deps) returning nothing, AND the full pytest + vitest suites green, AND `bash tests/smoke/run.sh` passing twice. This mirrors the `project-conventions` "no legacy name" scenario, now covering `cortex` too.

### Decision 3: Fresh stack, regenerated `.env`

The DB schema/role/db and env-prefix renames make the running stack incompatible. Recreate: `down -v`, rebuild images under `opencg/*`, regenerate `.env` from the new `.env.example` while carrying over the secret values (`HTTP_TOKEN`, `OAUTH_PASSWORD`, `PUBLIC_URL`, API keys) under their `OPENCG__` names, then re-ingest. This also clears the lingering `tmp…` code-symbol names from the un-re-ingested corpus.

### Decision 4: Update live integrations

The Claude Desktop MCP config references `cortex/mcp-server:local` and `--network cortex_default`; update those to `opencg/*`. ngrok tunnels are port-based and unaffected. The OAuth metadata/token/password carry over under the new env names.

## Risks / Trade-offs

- **Leftovers** (the failure mode of the last rename). → The grep-zero gate + full test + double smoke is the backstop; per-pass builds localize misses.
- **Same-substring false splits** — e.g. `cortex.yaml` vs schema `cortex.` vs `@cortex/`. → Class-specific replacements, not one global sed, plus per-pass review.
- **Lockfile churn** — regenerate `pnpm-lock.yaml` and `uv.lock` after package renames; verify resolution unchanged except names.

## Migration Plan

No in-place data migration. Steps: rename code → rebuild stack under openCG → regenerate `.env` → `down -v` + `up -d` → re-ingest → smoke. Rollback = revert the (single, large) commit before recreating the stack.

## Open Questions

- GitHub repo rename (`cortex-fabric` → e.g. `open-context-graph`) is deferred to a manual follow-up; the `git remote set-url` can be done once the repo is renamed on GitHub.
