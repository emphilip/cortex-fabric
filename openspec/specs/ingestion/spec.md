# Ingestion

## Purpose

Ingest external knowledge through shared CLI and HTTP connector implementations with observable run status.

## Requirements

### Requirement: Connector framework

The ingestion service SHALL expose connectors through both a CLI binary AND an HTTP surface. The container SHALL by default run a FastAPI HTTP server bound to port `8100` inside the compose network. The `hive-mind-ingest` CLI binary MUST remain callable via `docker compose exec ingestion hive-mind-ingest …`. Both surfaces MUST share the same underlying connector implementations; no duplicate code paths are permitted.

#### Scenario: HTTP server is the default command

- **WHEN** the ingestion service starts in the dev profile
- **THEN** `/healthz` returns `200` within the configured start-period
- **AND** the CLI binary `hive-mind-ingest --help` still works when invoked via `docker compose exec`

### Requirement: Git connector

The git connector SHALL clone, walk, chunk, embed, and upsert. A git ingest triggered via `POST /run/git` SHALL run in a background task so the HTTP response is immediate and status is observable via `GET /runs/recent`.

#### Scenario: Triggered run is non-blocking

- **WHEN** a client calls `POST /run/git` with a valid `repo_url`
- **THEN** the response returns within one second with `{run_id, status: "queued"}` or `{run_id, status: "running"}`
- **AND** the same run is visible in `GET /runs/recent` with a matching `run_id`

### Requirement: Ingestion HTTP surface

The ingestion service SHALL expose the following HTTP endpoints on port `8100`:

- `GET /healthz` - liveness, returns `{"status":"ok"}`.
- `GET /readyz` - readiness; returns `200` once the underlying storage (Postgres + Qdrant + Ollama embeddings) is reachable.
- `GET /connectors` - returns a JSON array of `{name, supported, reason?}` entries. `git` MUST have `supported = true`. `confluence`, `custom-api`, and `web` MUST have `supported = false` with a `reason` naming the change that will implement them.
- `POST /run/git` - body `{"repo_url": <string>}`. MUST return `{run_id, status}` immediately and execute the git ingest in a background task using the same `pipeline_runner.run` code path as the CLI.
- `GET /runs/recent` - returns the most recent 100 runs as `[{run_id, connector, repo, started_at, finished_at, status, parents, chunks, error}]`, in-memory.

Run history MAY be in-memory only. Durability across container restarts is deferred to a follow-up change.

#### Scenario: Health endpoints

- **WHEN** the ingestion service is up
- **THEN** `GET /healthz` returns `200` with `{"status":"ok"}`
- **AND** `GET /readyz` returns `200` only when the storage backends are reachable

#### Scenario: Connectors enumeration

- **WHEN** a client calls `GET /connectors`
- **THEN** the response contains `git` with `supported = true`
- **AND** the response contains `confluence`, `custom-api`, and `web` with `supported = false` and a `reason` field

#### Scenario: Run lifecycle observable via /runs/recent

- **WHEN** a `POST /run/git` triggers a background run that eventually succeeds
- **THEN** `GET /runs/recent` shows the run progressing through `queued → running → succeeded`
- **AND** the final entry carries the populated `parents` and `chunks` counts

#### Scenario: Run failure surfaces error

- **WHEN** a `POST /run/git` triggers a background run that fails (e.g. unreachable repo)
- **THEN** the `/runs/recent` entry for that run reaches `status = failed`
- **AND** the entry carries a non-empty `error` string
