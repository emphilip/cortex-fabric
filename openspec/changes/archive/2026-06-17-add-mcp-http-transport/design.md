## Context

`services/mcp-server/src/index.ts` already runs a Node `http.createServer` for `/healthz` and `/readyz` on `CORTEX__MCP__PORT` (container `8080`, host `8181`), and connects a single `Server` to a `StdioServerTransport`. Tool handlers (`ListToolsRequestSchema`, `CallToolRequestSchema`) are registered inline on that one server. The installed `@modelcontextprotocol/sdk@1.29.0` exports `StreamableHTTPServerTransport`. The pipeline client and tool logic are transport-agnostic.

## Goals / Non-Goals

**Goals:**

- Add a Streamable HTTP MCP endpoint at `/mcp` on the existing HTTP server/port.
- Keep stdio working identically.
- Optional bearer-token gate on `/mcp`, off by default with a visible warning.
- Identical tool behaviour across transports.

**Non-Goals:**

- OAuth 2.1 / dynamic client registration (directory-grade connectors) — deferred.
- A new port, pipeline change, or wire-type change.
- Multi-tenant identity from the HTTP request — identity stays the v0 env stub.

## Decisions

### Decision 1: Streamable HTTP, mounted on the existing server at `/mcp`

Use `StreamableHTTPServerTransport` (the current single-endpoint transport that superseded the deprecated HTTP+SSE pair). Route `req.url`-prefixed `/mcp` (POST/GET/DELETE) on the existing `http.createServer` handler; everything else keeps serving health. One process, one port (`8181`), already exposed by compose — no compose change.

*Alternative considered:* a second HTTP server on a separate port. Rejected — needless port + compose churn; the health server already listens.

### Decision 2: Stateful sessions keyed by `mcp-session-id`

> Corrected during implementation. A first attempt used **stateless** mode (a fresh transport+server per request). That breaks real clients: the MCP handshake is multi-request (`initialize` → `tools/call`), and a follow-up request lands on a fresh, *uninitialized* server, which the SDK rejects with HTTP 400. Verified live before committing.

Use the SDK's stateful pattern. On an `initialize` POST with no session id, create a `StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID, onsessioninitialized })`, connect a built `Server`, and register the transport in a module-level `Map` keyed by the generated session id (returned to the client in the `mcp-session-id` header). Follow-up requests carrying that header route to the same transport; `DELETE` and the transport's `onclose` evict it. A request with no/unknown session that isn't an `initialize` gets HTTP 400.

*Trade-off:* sessions persist in memory until the client disconnects or sends `DELETE`. Acceptable for the v0 single-process server; if it becomes a concern, add idle eviction in a follow-up.

### Decision 3: Extract a server factory

Refactor the inline handler registration into `buildMcpServer(deps)` returning a configured `Server`. stdio uses it once; each HTTP request uses it once. Guarantees identical tool surface and behaviour across transports and keeps `index.ts` readable.

### Decision 4: Bearer auth as a tiny gate before the transport

Read `CORTEX__MCP__HTTP_TOKEN` in config. In the `/mcp` branch, before constructing the transport: if a token is configured, require `Authorization: Bearer <token>` (constant-time compare); on mismatch return `401` with a JSON-RPC-style error body and stop. If no token is configured, proceed and emit a one-time `console.error` warning that the HTTP transport is unauthenticated. Health endpoints bypass the gate.

### Decision 5: DNS-rebinding protection left configurable, default off

`StreamableHTTPServerTransport` can validate `Host`/`Origin` to block DNS-rebinding. Because Cortex is run behind the operator's own host/tunnel with varied hostnames, default it off in v0 and document enabling it (and setting a token) when exposing publicly. Revisit with the OAuth follow-up.

## Risks / Trade-offs

- **Open endpoint exposes the catalogue** if `/mcp` is reachable beyond localhost without a token. → Default-off auth emits a visible warning; README/`.env.example` recommend setting `CORTEX__MCP__HTTP_TOKEN` whenever the port is tunneled or bound beyond loopback.
- **Per-request server construction overhead.** → Negligible against the pipeline round-trip; objects are tiny and closed promptly.
- **Streamable HTTP request-body handling in raw Node http.** → Use the SDK transport's `handleRequest(req, res, parsedBody?)`; read/parse the JSON body once and pass it in, matching the SDK's documented stateless pattern.

## Migration Plan

Additive and backward-compatible: stdio is untouched, the HTTP route is new, the token is optional. Rollback is reverting the commit. Operators who want remote access set `CORTEX__MCP__HTTP_TOKEN` and point a client at `http://<host>:8181/mcp`.

## Open Questions

- OAuth 2.1 for directory-grade "add by URL" connectors on claude.ai/Desktop — a separate follow-up once the bearer path is proven.
