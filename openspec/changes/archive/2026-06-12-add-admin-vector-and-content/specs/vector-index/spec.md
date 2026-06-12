## ADDED Requirements

### Requirement: Vector-search wrapper for admin queries

The vector index module SHALL expose a single function used by both the retrieval pipeline's stage 3 and the new admin `/search/vector` endpoint: given a query vector (and optional filters), return ordered hits across all source collections fused with Reciprocal Rank Fusion. Per-collection top-K MUST be the same `top_k` value the caller passes; fused result count MUST also be `top_k`.

The wrapper MUST surface the collection name in each hit (`collection`) so the admin UI can render which Qdrant collection the hit came from.

#### Scenario: Cross-collection search

- **WHEN** the pipeline calls the wrapper with `top_k = 10` and no filter
- **THEN** the wrapper queries every Qdrant collection matching the configured prefix
- **AND** returns the top 10 fused hits with `collection` populated per hit

#### Scenario: Filter pushdown via wrapper

- **WHEN** the pipeline calls the wrapper with a filter `{source: "git"}`
- **THEN** only collections whose name resolves to `source = "git"` are queried, OR the filter is pushed down per query
- **AND** non-matching points are excluded
