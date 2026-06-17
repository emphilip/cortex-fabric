## 1. Server factory + config

- [x] 1.1 Extract the inline `ListTools`/`CallTool` handler registration in `services/mcp-server/src/index.ts` into a `buildMcpServer(deps)` factory returning a configured `Server`; use it for the stdio connection
- [x] 1.2 Add `httpToken: string | null` to `McpConfig`/`loadConfig` in `src/config.ts`, read from `CORTEX__MCP__HTTP_TOKEN` (default null/empty)

## 2. Streamable HTTP transport

- [x] 2.1 In the existing `http.createServer` handler, add a `/mcp` branch handling POST/GET/DELETE via a per-request stateless `StreamableHTTPServerTransport({ sessionIdGenerator: undefined })` connected to a freshly built server; read/parse the JSON body and pass it to `handleRequest`; close transport + server when the response finishes. Keep `/healthz` and `/readyz` behaviour unchanged
- [x] 2.2 Add the bearer-auth gate on `/mcp`: when `httpToken` is set, require a matching `Authorization: Bearer` header (constant-time compare) else respond `401`; when unset, serve open and log a one-time "HTTP transport unauthenticated" warning. Health endpoints bypass the gate
- [x] 2.3 Log the `/mcp` endpoint on startup; bump the `@modelcontextprotocol/sdk` range in `package.json` to reflect the resolved `^1.29`

## 3. Tests

- [x] 3.1 Unit test the factory: `buildMcpServer` yields a server whose `tools/list` advertises the five `cortex/<tool>` tools (reuse existing tool-surface assertions)
- [x] 3.2 HTTP test: drive `POST /mcp` with an `initialize` + `tools/list` body and assert a valid Streamable-HTTP response carrying the five tools (against a stub pipeline)
- [x] 3.3 Auth tests: token set + matching bearer → handled; token set + missing/wrong → `401` and no tool invocation; token unset → handled and the unauthenticated warning is emitted

## 4. Docs + verification

- [x] 4.1 Add `CORTEX__MCP__HTTP_TOKEN` (optional, commented) to `.env.example`; add a "remote (HTTP) connection" note to the README MCP section — Claude Code `claude mcp add --transport http cortex http://localhost:8181/mcp --header "Authorization: Bearer …"` and the Cursor `url` form, including the token recommendation when exposed
- [x] 4.2 Run `pnpm --filter @cortex/mcp-server test` and `pnpm -r build`
- [x] 4.3 Rebuild + restart the mcp-server container; verify `POST http://localhost:8181/mcp` completes an `initialize`/`tools/list` handshake (open mode), then set a token and confirm 401 without it / 200 with it
- [x] 4.4 Run `openspec validate add-mcp-http-transport --strict`, scan staged changes for secrets, commit, and push
