## Why

Cortex's MCP server is **stdio-only**: every client must spawn it as a subprocess, so it can't be added as a remote connector by URL and can't be reached across a network or tunnel. The installed MCP SDK (1.29.0) already ships `StreamableHTTPServerTransport`; exposing it turns Cortex into a real remote MCP endpoint for Claude Code (`--transport http`), Cursor, and any HTTP MCP client — the missing piece called out by the "future change adds an HTTP-streamable MCP transport" note in the server entry point.

## What Changes

- Serve the MCP protocol over **Streamable HTTP** at `/mcp` (POST/GET/DELETE) on the existing HTTP server, alongside `/healthz` and `/readyz`, on the already-exposed MCP port (host `8181`). No new port.
- Keep the **stdio** transport working unchanged, so existing subprocess clients (the documented `docker run -i …` / `node …` setups) are unaffected.
- Add **optional bearer-token auth**: when `CORTEX__MCP__HTTP_TOKEN` is set, `/mcp` requires `Authorization: Bearer <token>` (HTTP 401 otherwise); when unset, `/mcp` is open and the server logs an explicit "unauthenticated" warning (local-dev default). Health endpoints stay unauthenticated.
- Refactor the tool-handler wiring into a small factory so stdio and each HTTP request share identical tool behaviour.
- Document the remote URL connection (Claude Code/Cursor) in the README and add `CORTEX__MCP__HTTP_TOKEN` to `.env.example`.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `mcp-server`: adds a Streamable HTTP transport at `/mcp` with optional bearer-token auth, in addition to the existing stdio transport. The five-tool surface and its behaviour are unchanged across transports.

## Impact

- **Code**: `services/mcp-server` only — `src/index.ts` (mount `/mcp`, auth gate, transport/handler factory), `src/config.ts` (read `CORTEX__MCP__HTTP_TOKEN`), a new vitest. `package.json` SDK range updated to reflect the version already resolved (`1.29.0`); no resolved-dependency change.
- **Config/docs**: `.env.example` gains an optional `CORTEX__MCP__HTTP_TOKEN`; the README MCP section gains the remote-URL option.
- **No** pipeline route, wire-type (`@cortex/shared`), schema, or new compose port. `/mcp` is reachable at `http://localhost:8181/mcp` once `make up-d` is running.
- **Not in scope**: OAuth 2.1 (the directory-grade "add by URL" flow on claude.ai/Desktop) — deferred to a follow-up; bearer auth covers Claude Code, Cursor, and tunneled use now.
