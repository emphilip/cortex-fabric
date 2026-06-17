# mcp-server Specification

## Purpose
TBD - created by archiving change add-knowledge-graph. Update Purpose after archive.
## Requirements
### Requirement: MCP tool surface

The MCP server SHALL advertise the same five-tool surface as before (`search`, `retrieve_for_context`, `get_entity`, `traverse_graph`, `submit_feedback`). `retrieve_for_context` remains the canonical retrieval path. **`cortex/traverse_graph` MUST be functional** in this change — the `not_implemented_in_mvp` error path for this specific tool is removed.

The other three tools (`search`, `get_entity`, `submit_feedback`) MUST continue to return `not_implemented_in_mvp` until their respective follow-up changes ship.

#### Scenario: `tools/list` still advertises five tools

- **WHEN** an MCP client calls `tools/list` after this change ships
- **THEN** the server returns the five tools above
- **AND** each tool name is namespaced under `cortex/<tool>`

#### Scenario: `traverse_graph` returns real results

- **WHEN** a client calls `cortex/traverse_graph` with `{concept_id, depth, types?, limit?, include_candidates?}` against a populated graph
- **THEN** the server forwards to the pipeline's `GET /graph/traverse` and returns the resulting `{nodes, edges}` payload
- **AND** the response is the JSON returned by the pipeline (no MCP-side filtering)

#### Scenario: `traverse_graph` rejects unknown concept

- **WHEN** a client calls `cortex/traverse_graph` with a `concept_id` that does not exist
- **THEN** the server returns a structured error with `code = "concept_not_found"`

#### Scenario: Other deferred tools still error

- **WHEN** a client calls `cortex/search`, `cortex/get_entity`, or `cortex/submit_feedback`
- **THEN** the server returns `isError: true` with `code = "not_implemented_in_mvp"`

### Requirement: Streamable HTTP transport

The MCP server SHALL expose the MCP protocol over the Streamable HTTP transport at the path `/mcp` on its existing HTTP server (the same port used for `/healthz` and `/readyz`, configured by `CORTEX__MCP__PORT`), in addition to the existing stdio transport. The stdio transport MUST remain available and unchanged. The tool surface and behaviour MUST be identical across both transports — the same five tools, the same `cortex/<tool>` namespacing, and the same results and error codes.

#### Scenario: HTTP client completes an MCP session over /mcp

- **WHEN** an MCP client connects to `POST /mcp` and performs an `initialize` then `tools/list`
- **THEN** the server responds over the Streamable HTTP transport and returns the same five `cortex/<tool>` tools advertised over stdio

#### Scenario: stdio transport still works

- **WHEN** a client spawns the server as a subprocess and speaks MCP over stdio
- **THEN** the server behaves exactly as before this change (same tools and results)

#### Scenario: Health endpoints remain available

- **WHEN** the HTTP server is serving `/mcp`
- **THEN** `GET /healthz` and `GET /readyz` continue to respond as before on the same port

### Requirement: Optional bearer-token authentication for HTTP

The HTTP `/mcp` endpoint SHALL support optional bearer-token authentication controlled by `CORTEX__MCP__HTTP_TOKEN`. When the variable is set, requests to `/mcp` MUST include an `Authorization: Bearer <token>` header whose token matches; non-matching or missing tokens MUST be rejected with HTTP 401 and MUST NOT reach the MCP handlers. When the variable is unset or empty, `/mcp` MUST be served without authentication AND the server MUST log an explicit warning that the HTTP transport is unauthenticated. The `/healthz` and `/readyz` endpoints MUST remain unauthenticated regardless of the token setting.

#### Scenario: Authenticated request is accepted

- **WHEN** `CORTEX__MCP__HTTP_TOKEN` is set and a client calls `/mcp` with a matching `Authorization: Bearer` header
- **THEN** the request is handled normally by the MCP transport

#### Scenario: Missing or wrong token is rejected

- **WHEN** `CORTEX__MCP__HTTP_TOKEN` is set and a client calls `/mcp` without a matching bearer token
- **THEN** the server responds with HTTP 401 and does not invoke any tool

#### Scenario: Unauthenticated mode is explicit

- **WHEN** `CORTEX__MCP__HTTP_TOKEN` is unset or empty
- **THEN** `/mcp` is served without authentication AND the server logs a warning that the HTTP transport is unauthenticated

