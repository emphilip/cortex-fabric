# project-conventions Specification

## Purpose
TBD - created by archiving change rename-to-opencg. Update Purpose after archive.
## Requirements
### Requirement: Canonical project naming and namespaces

The project SHALL be named **openCG** (repository `opencg-context-fabric`) and all identifiers, namespaces, configuration keys, telemetry names, and documentation SHALL use the openCG naming scheme consistently. No "Hive Mind" identifier SHALL remain in active (non-archived) source, configuration, or documentation.

#### Scenario: Namespaces use the openCG scheme

- **WHEN** a package, module, or workspace member is referenced
- **THEN** TypeScript packages use the `@opencg/*` scope and Python packages use the `opencg_*` prefix (e.g. `@opencg/admin-ui`, `opencg_pipeline`)

#### Scenario: Configuration and telemetry use the openCG scheme

- **WHEN** an environment variable, Postgres schema, or Prometheus metric is referenced
- **THEN** environment variables use the `OPENCG__*` prefix, the database schema is `opencg`, and metric names use the `opencg_*` prefix

#### Scenario: No legacy name remains in active sources

- **WHEN** the tracked, non-archived files are searched case-insensitively for `hive[-_ ]?mind`
- **THEN** no matches are found, except within `openspec/changes/archive/**` historical records

