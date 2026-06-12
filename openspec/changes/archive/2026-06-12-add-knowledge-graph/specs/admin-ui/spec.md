## MODIFIED Requirements

### Requirement: Graph relationship management

The admin UI SHALL expose a graph management surface at `/graph` containing three sub-views:

1. **Concept browser** — filter by `state` (default: `confirmed,candidate`), free-text name search, paginated list with `state` badge, `aliases`, last `updated_at`. Clicking a row opens the concept detail.
2. **Concept detail** — header with the concept name and editable description + aliases; "Tombstone" and "Merge into…" actions; two neighbour tables (confirmed + candidate) each listing the edge `type`, peer concept name, `confidence`, and the evidence chunk(s). Per-edge actions: promote, demote, edit type, delete.
3. **Candidate review queue** — paginated list of `candidate` edges ordered by `confidence DESC`. Per-row actions: promote, demote, edit type, delete. Each row links the edge to its evidence chunk via the existing `/entities/[id]` page.

A small "Vocabulary" panel within `/graph` lists relationship types from the API; admins can add a new type, edit its `description`, or mark it deprecated. The UI MUST NOT include a visual graph rendering in this change (tabular only — visual rendering is a follow-up).

Storybook coverage is mandatory for every new component (`ConceptRow`, `ConceptDetail`, `CandidateEdgeRow`, `RelationshipTypeBadge`, `VocabRow`).

#### Scenario: Concept browser default filter

- **WHEN** an operator navigates to `/graph` with no query parameters
- **THEN** the page renders the concept browser with `state = confirmed,candidate`, no search filter, `limit = 50`
- **AND** the page calls `GET /graph/concepts?state=confirmed,candidate&limit=50&offset=0`

#### Scenario: Candidate review queue lists by confidence

- **WHEN** an operator opens the candidate review queue tab
- **THEN** the page calls `GET /graph/edges?state=candidate&limit=50`
- **AND** rows render ordered by `confidence DESC`

#### Scenario: Promote a candidate edge from the review queue

- **WHEN** an operator clicks "Promote" on a row in the candidate review queue
- **THEN** the UI posts `/graph/edges/{id}/promote` with the reason field
- **AND** on success the row is removed from the queue
- **AND** a "promoted" toast appears

#### Scenario: Edit a vocabulary entry's description

- **WHEN** an admin edits the description of `depends_on` in the vocabulary panel
- **THEN** the UI patches `/graph/vocab/depends_on`
- **AND** subsequent reads show the new description

#### Scenario: Storybook covers the new components

- **WHEN** `pnpm --filter @hive-mind/admin-ui build-storybook` is run after this change ships
- **THEN** at least one story exists for each of `ConceptRow`, `ConceptDetail`, `CandidateEdgeRow`, `RelationshipTypeBadge`, `VocabRow`
- **AND** Storybook builds without warnings
