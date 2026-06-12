# Catalog Store

## Purpose

Store and manage tenant-scoped knowledge entities, including indexed administration queries and soft deletion.

## Requirements

### Requirement: Direct query

The catalog store SHALL accept structured filter queries from the admin UI via the pipeline's `GET /entities` endpoint and MUST evaluate them using existing indexes (`entity_classification_ix`, `entity_freshness_ix`, the `entity_source_uri_uq` covering source). No body-text scan is permitted for the admin list query.

#### Scenario: Admin list filters use indexed columns

- **WHEN** the pipeline queries the catalog with filters `(source, classification, freshness_state)` and pagination `(limit, offset)`
- **THEN** the query plan touches indexed columns only (`EXPLAIN` shows index scans, no sequential scan over `entity`)

### Requirement: Tombstone (soft delete)

The catalog store SHALL support a soft-delete operation that sets `tombstoned_at = now()` on the targeted row. Tombstoning MUST be idempotent: re-tombstoning a row preserves the original `tombstoned_at`. The operation MUST NOT remove the row, MUST NOT mutate any other column, and MUST NOT cascade.

#### Scenario: Tombstone is idempotent

- **WHEN** a caller tombstones an already-tombstoned row
- **THEN** the row's `tombstoned_at` is unchanged
- **AND** no other column is modified

#### Scenario: Tombstoned rows are excluded from retrieval

- **WHEN** an entity is tombstoned
- **THEN** subsequent calls to `lexical_search` from the retrieval pipeline do not return it
- **AND** the Qdrant payload still contains the entity until a future change adds tombstone-aware vector cleanup

### Requirement: Admin list query

The catalog store SHALL expose a function callable from the pipeline that lists entities with filters `(tenant, source?, classification?, freshness_state?)`, sorted by `updated_at DESC`, paginated by `(limit, offset)`. It MUST also return a `total` count for the same filter set (single round-trip is acceptable; a second SELECT count is acceptable in v1).

#### Scenario: List with all filters

- **WHEN** the pipeline calls the list function with `tenant="default", source="git", classification="internal", freshness_state="fresh", limit=50, offset=0`
- **THEN** the function returns an ordered slice of rows plus a `total` matching the count of rows satisfying the same filters

#### Scenario: List without filters

- **WHEN** the pipeline calls the list function with only `tenant` and pagination
- **THEN** all entities for the tenant are eligible
- **AND** results are ordered by `updated_at DESC`
