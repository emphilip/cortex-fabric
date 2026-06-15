# project-conventions

## ADDED Requirements

### Requirement: Canonical project naming and namespaces

The project SHALL be named **Cortex** (repository `cortex-context-fabric`) and all identifiers, namespaces, configuration keys, telemetry names, and documentation SHALL use the Cortex naming scheme consistently. No "Hive Mind" identifier SHALL remain in active (non-archived) source, configuration, or documentation.

#### Scenario: Namespaces use the Cortex scheme

- **WHEN** a package, module, or workspace member is referenced
- **THEN** TypeScript packages use the `@cortex/*` scope and Python packages use the `cortex_*` prefix (e.g. `@cortex/admin-ui`, `cortex_pipeline`)

#### Scenario: Configuration and telemetry use the Cortex scheme

- **WHEN** an environment variable, Postgres schema, or Prometheus metric is referenced
- **THEN** environment variables use the `CORTEX__*` prefix, the database schema is `cortex`, and metric names use the `cortex_*` prefix

#### Scenario: No legacy name remains in active sources

- **WHEN** the tracked, non-archived files are searched case-insensitively for `hive[-_ ]?mind`
- **THEN** no matches are found, except within `openspec/changes/archive/**` historical records
