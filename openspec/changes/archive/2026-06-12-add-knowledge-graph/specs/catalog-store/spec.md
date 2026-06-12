## ADDED Requirements

### Requirement: Evidence linkage between chunks and edges

The catalog store SHALL host a join table `hive_mind.relationship_evidence(edge_id, entity_id, span TEXT, extractor_version TEXT, confidence FLOAT, created_at TIMESTAMPTZ)` linking each candidate edge to the chunk(s) it was extracted from. `entity_id` MUST be a FK into `hive_mind.entity`. Cascading delete of a tombstoned chunk MUST NOT remove evidence rows; tombstoning is soft, and evidence is retained for audit replay.

The catalog store SHALL expose a helper `get_evidence_chunks(edge_id) -> list[EntityRef]` used by the admin UI to render evidence per edge.

#### Scenario: Evidence is written alongside a candidate edge

- **WHEN** the extractor inserts a candidate edge derived from chunk `C1`
- **THEN** a `relationship_evidence` row is written linking that edge to `C1`

#### Scenario: Tombstoning a chunk preserves evidence

- **WHEN** an admin tombstones a chunk that supports a candidate edge
- **THEN** the `relationship_evidence` row is preserved
- **AND** the chunk's body is still fetchable via `GET /entities/{id}` (which already returns tombstoned rows)
