## ADDED Requirements

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
