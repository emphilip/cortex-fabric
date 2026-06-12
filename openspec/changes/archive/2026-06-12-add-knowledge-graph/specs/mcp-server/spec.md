## ADDED Requirements

### Requirement: MCP tool surface

The MCP server SHALL advertise the same five-tool surface as before (`search`, `retrieve_for_context`, `get_entity`, `traverse_graph`, `submit_feedback`). `retrieve_for_context` remains the canonical retrieval path. **`hive_mind/traverse_graph` MUST be functional** in this change — the `not_implemented_in_mvp` error path for this specific tool is removed.

The other three tools (`search`, `get_entity`, `submit_feedback`) MUST continue to return `not_implemented_in_mvp` until their respective follow-up changes ship.

#### Scenario: `tools/list` still advertises five tools

- **WHEN** an MCP client calls `tools/list` after this change ships
- **THEN** the server returns the five tools above
- **AND** each tool name is namespaced under `hive_mind/<tool>`

#### Scenario: `traverse_graph` returns real results

- **WHEN** a client calls `hive_mind/traverse_graph` with `{concept_id, depth, types?, limit?, include_candidates?}` against a populated graph
- **THEN** the server forwards to the pipeline's `GET /graph/traverse` and returns the resulting `{nodes, edges}` payload
- **AND** the response is the JSON returned by the pipeline (no MCP-side filtering)

#### Scenario: `traverse_graph` rejects unknown concept

- **WHEN** a client calls `hive_mind/traverse_graph` with a `concept_id` that does not exist
- **THEN** the server returns a structured error with `code = "concept_not_found"`

#### Scenario: Other deferred tools still error

- **WHEN** a client calls `hive_mind/search`, `hive_mind/get_entity`, or `hive_mind/submit_feedback`
- **THEN** the server returns `isError: true` with `code = "not_implemented_in_mvp"`
