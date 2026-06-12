## ADDED Requirements

### Requirement: Symbol-aware chunk id derivation

For chunks produced by the symbol chunker (code files processed by `chunk_code_by_symbols`), the catalog store SHALL derive the chunk `entity_id` as `uuid5(_SYMBOL_NS, f"{parent_entity_id}:{symbol_id}")` where `symbol_id` is graphifyy's stable per-symbol identifier. For oversized symbols that get paragraph-split, the seed MUST include the sub-chunk index: `uuid5(_SYMBOL_NS, f"{parent_entity_id}:{symbol_id}:{sub_index}")`.

For chunks produced by the paragraph chunker (text, markdown, future PDF / HTML / MDX), the catalog store SHALL continue to derive the chunk `entity_id` as `uuid5(_CHUNK_NS, f"{parent_entity_id}:{chunk_index}")` as established by `bootstrap-thin-mvp`.

Both schemes MUST be deterministic: re-ingest of an unchanged input MUST produce the same chunk id.

#### Scenario: Stable symbol-chunk id across re-ingest

- **WHEN** a Python file with three functions is ingested twice without changes
- **THEN** the same three `entity_id` values appear in `hive_mind.entity` both times
- **AND** the upsert path is taken (no duplicate rows)

#### Scenario: Adding a function above existing ones does not renumber

- **WHEN** a developer adds a new function `helper_a` at the top of a Python file that previously had `existing_b` and `existing_c`
- **THEN** the chunks for `existing_b` and `existing_c` retain their original `entity_id` values
- **AND** a new chunk row is created for `helper_a`
- **AND** the vector index does not require re-upserting the unchanged chunks

#### Scenario: Oversized symbol sub-chunks share the parent symbol id

- **WHEN** a function whose body exceeds the symbol size limit is paragraph-split into N sub-chunks
- **THEN** each sub-chunk row carries the same parent symbol id in metadata
- **AND** each sub-chunk's entity_id is distinct via the sub_index seed
