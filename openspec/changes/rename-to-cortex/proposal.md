# Rename the project from Hive Mind to Cortex

## Why

The project is being productized under Electric Mind as **Cortex — an enterprise context fabric for agents**. The working name "Hive Mind" no longer reflects the brand. We want every identifier, namespace, config key, and document to use the new name so the codebase, telemetry, and docs are consistent before the first real use case lands.

## What changes

A full, mechanical rename of every "Hive Mind" identifier (~1,008 references). Proposed naming scheme — **short internal identifier `cortex`, descriptive repo name `cortex-context-fabric`**:

| Surface | From | To |
|---|---|---|
| GitHub repo + top dir | `hive-mind` | `cortex-context-fabric` |
| Product / display name | Hive Mind | Cortex |
| npm scope | `@hive-mind/*` | `@cortex/*` |
| Python packages | `hive_mind_pipeline`, `hive_mind_ingestion`, `hive_mind_shared` | `cortex_pipeline`, `cortex_ingestion`, `cortex_shared` |
| Env var prefix | `HIVE_MIND__*` | `CORTEX__*` |
| Postgres schema | `hive_mind` (+ `hive_mind.audit_log`, `hive_mind.graph_audit_log`) | `cortex` |
| Prometheus metrics | `hive_mind_*` | `cortex_*` |
| Compose image names | `hive-mind/admin-ui` etc. | `cortex/admin-ui` etc. |
| Docs / agent guides | Hive Mind | Cortex |

Compose **service** names (`pipeline`, `ingestion`, `admin-ui`, `postgres`, …) are already generic and stay as-is.

## Capabilities

- `project-conventions` — records the canonical naming/namespace scheme for the project.

## Impact

- **Cross-cutting**: ~126 files. No behavioural change — identifiers only.
- **Local `.env` (gitignored)**: every `HIVE_MIND__*` key must be renamed to `CORTEX__*`. The operator (you) must update their own `.env`; `.env.example` will be updated in-repo.
- **Postgres schema rename**: the running dev volume has the `hive_mind` schema. Cleanest path for the dev profile is a fresh volume (`make down` + remove volume, re-init). Init SQL, triggers, and all `asyncpg` queries move to `cortex`.
- **Prometheus/Grafana**: metric names change; any saved dashboards/queries referencing `hive_mind_*` break. Acceptable pre-launch (no production dashboards yet).
- **GitHub remote rename**: done on GitHub (redirects old URLs); the local `origin` URL is updated after.
- **In-flight OpenSpec changes**: the untracked `stabilize-full-smoke` change and archived changes contain the old name in prose; archived specs are historical and left as-is, active docs are updated.

## Out of scope

- No code behaviour, API contract, or data-model change beyond identifier strings.
