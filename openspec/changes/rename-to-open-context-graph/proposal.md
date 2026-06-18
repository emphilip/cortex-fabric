## Why

The project's final name is **Open Context Graph** (short **openCG**, slug `opencg`). The codebase is currently named **Cortex** throughout — ~700 occurrences across 146 active files, plus the `project-conventions` spec that *mandates* the Cortex naming. This change renames every active identifier, namespace, config key, telemetry name, and doc to the openCG scheme, and updates the spec that governs naming.

## What Changes

Rename Cortex → openCG across every active (non-archived) surface, per the confirmed mapping:

- **npm scope** `@cortex/*` → `@opencg/*` (admin-ui, mcp-server, shared).
- **Python packages** (directories + imports + pyproject + uv workspace): `cortex_shared`/`cortex_pipeline`/`cortex_ingestion` → `opencg_*`; CLI `cortex-ingest` → `opencg-ingest`.
- **Env prefix** `CORTEX__*` → `OPENCG__*` (config loaders, `.env.example`, compose, docs). Hard switch — no `CORTEX__` fallback. The running `.env` is regenerated under `OPENCG__`, preserving secret values (token, OAuth password, public URL).
- **Postgres** schema/role/db `cortex` → `opencg` (init SQL + every SQL string in code + the AGE graph name).
- **Docker/compose** project `cortex` → `opencg`, network `cortex_default` → `opencg_default`, image names `cortex/*` → `opencg/*`.
- **MCP** advertised server name and tool namespace `cortex/<tool>` → `opencg/<tool>`; OTel service namespace and metric prefixes (`cortex_tokens` etc.) → `opencg_*`.
- **Config file** `cortex.yaml` → `opencg.yaml` (+ `CORTEX_CONFIG`/`OPENCG_CONFIG`, Dockerfile/loader references).
- **Branding/docs**: README, the triple-synced agent guide (`CLAUDE.md` / `AGENTS.md` / `.cursor/rules/*.mdc`), admin-UI wordmark (`cortex` → `openCG`), `docs/`.
- **`project-conventions` spec**: MODIFIED to mandate the openCG scheme and forbid any `cortex` identifier in active source.

**Fresh start** (no data migration): recreate the stack under openCG names (`down -v`), regenerate `.env`, re-ingest. This also clears the lingering `tmp…` code-symbol names. The live Claude Desktop MCP config (image/network names) is updated.

**Out of scope:** the GitHub repo rename (a GitHub setting; the `git remote` update is a follow-up). Archived OpenSpec changes keep their historical Cortex text.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `project-conventions`: the canonical name, namespaces, env prefix, DB schema, telemetry names, and the "no legacy name" rule change from Cortex to Open Context Graph / openCG.

## Impact

- **Code/config**: every service (`mcp-server`, `pipeline`, `ingestion`, `admin-ui`), `packages/*`, `infra/*`, root configs, docs. Python package directories are renamed (`git mv`). No behavioural change — identifiers only.
- **Running stack**: rebuilt under openCG names; volumes recreated; `.env` regenerated; corpus re-ingested. ngrok tunnels (port-based) are unaffected; the OAuth public URL/token/password carry over.
- **Tests**: the full pytest + vitest suites and the smoke must pass post-rename; a `grep -ri cortex` over active (non-archived) sources must return zero.
