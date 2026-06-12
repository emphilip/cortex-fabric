# Admin UI

## Purpose

Provide operators with review and management surfaces for vectors, catalogue entities, ingestion, and retrieval activity.

## Requirements

### Requirement: Vector neighbourhood exploration

The admin UI SHALL expose a vector search surface at `/vectors`. Operators MUST be able to enter free-text and receive the top-K nearest catalog entities ordered by score, with `entity_id`, `source`, `source_uri`, `title`, `classification`, a text snippet, and the model + provider used. From any result the operator MUST be able to drill into "show neighbours of this entity" which re-runs the search keyed on the entity's stored vector.

The page MUST display the currently configured embedding model + dimension in a small status header so operators recognise which index they are searching.

#### Scenario: Free-text vector search

- **WHEN** an operator submits a query string with `top_k = 20`
- **THEN** the page calls `POST /search/vector` on the pipeline and renders an ordered list of up to 20 hits with the required fields
- **AND** each hit shows the score formatted to four decimal places

#### Scenario: Show neighbours of an entity

- **WHEN** an operator clicks "show neighbours" on a hit for `entity_id = E1`
- **THEN** the page calls `POST /search/vector` with the stored vector keyed on `E1` (or, in v0+1, re-embeds the entity's text)
- **AND** the first hit is `E1` itself with the highest score

#### Scenario: Status header reflects active model

- **WHEN** the page loads
- **THEN** the status header shows `embedding_model` and `vector_size` sourced from `GET /readyz` or a dedicated `/config` endpoint on the pipeline

### Requirement: Content management

The admin UI SHALL expose an entity browser at `/entities` and an entity detail page at `/entities/[id]`. The browser MUST support filtering by `source`, `classification`, and `freshness_state`, and MUST paginate with `limit` and `offset`. The detail page MUST show entity title, `source`, `source_uri`, `classification`, `freshness_state`, `last_verified_at`, `content_hash`, metadata JSON, lineage (parent entity if present + listing of chunks if this is a parent), the body text (first 50 KB with a "show full" toggle), and the audit appearances of this entity in the last N retrievals.

The detail page MUST expose a "Tombstone" action that posts `DELETE /entities/{id}` to the pipeline. Tombstoned entities MUST render with a visible banner indicating their state and the tombstone timestamp.

#### Scenario: Browse entities by source

- **WHEN** an operator filters the entity browser by `source=git, classification=internal`
- **THEN** the response calls `GET /entities?source=git&classification=internal&limit=50&offset=0`
- **AND** the list renders the returned rows with `title`, `source_uri`, `classification`, `freshness_state`, and `updated_at`

#### Scenario: Inspect entity detail

- **WHEN** an operator opens `/entities/{id}`
- **THEN** the page shows the required fields and the lineage block
- **AND** the body section is collapsed to the first 50 KB with a "Show full body" toggle that fetches the rest

#### Scenario: Tombstone an entity

- **WHEN** an operator confirms the tombstone dialog for `entity_id = E1`
- **THEN** the page issues `DELETE /entities/E1` to the pipeline
- **AND** on success the page shows a "Tombstoned at …" banner
- **AND** subsequent calls to `GET /entities/E1` return the entity with a non-null `tombstoned_at`

### Requirement: Content ingestion control

The admin UI SHALL expose `/ingestion`. The page MUST list configured connectors with `name`, `supported`, `last_run_at`, `last_run_status`, `last_run_error` if any, and recent runs (last 20) with `started_at`, `finished_at`, `status`, `parents`, `chunks`, and `error`. The page MUST include a "Run now" form for the git connector accepting a `repo_url` field, which POSTs `/ingestion/git/run` to the pipeline.

#### Scenario: Trigger a git ingest from the UI

- **WHEN** an operator submits `repo_url = https://github.com/<owner>/<repo>` in the Run-now form
- **THEN** the UI calls `POST /ingestion/git/run` and renders a row in the recent-runs list for the new run with `status = queued` or `status = running`
- **AND** the row updates to `succeeded` (with `parents` and `chunks` counts) or `failed` (with `error`) as the run completes

#### Scenario: Connector listing surfaces deferred connectors

- **WHEN** the page renders the connector list
- **THEN** the git connector appears with `supported = true`
- **AND** the deferred connectors (`confluence`, `custom-api`, `web`) appear with `supported = false` and a `Reason` tooltip naming the follow-up change

### Requirement: Graph relationship management

The admin UI SHALL NOT expose any graph relationship management surface until the `add-knowledge-graph` change adds it.

#### Scenario: Graph management still absent

- **WHEN** an operator navigates the admin UI
- **THEN** no graph relationship management route is reachable

### Requirement: Storybook coverage for every new component

Every new shared component introduced by this capability (`EntityRow`, `EntityDetail`, `VectorHit`, `ConnectorCard`, `IngestionRunRow`) MUST have a neighbour `*.stories.tsx` file with at least three stories covering the canonical, empty, and error states.

#### Scenario: Stories exist alongside components

- **WHEN** the components above are added under `services/admin-ui/src/components/`
- **THEN** each component has a `<Name>.stories.tsx` neighbour file in the same directory
- **AND** Storybook builds without error under `pnpm --filter @hive-mind/admin-ui build-storybook`
