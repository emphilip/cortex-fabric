## Why

claude.ai (and Claude Desktop's "Add custom connector") authenticate remote MCP servers via an **OAuth 2.1** flow — they cannot send a static bearer header. So Cortex's HTTP `/mcp`, even when reachable over HTTPS, can't be added securely from those GUIs: open = the catalogue is public; token = claude.ai gets 401. The only secure path is for the MCP server to speak OAuth.

This change adds a **deliberately minimal, stopgap** OAuth authorization server embedded in the MCP server, built on the SDK's OAuth framework, so claude.ai can connect securely. **It is explicitly temporary** (see "Replace later") and intended to be swapped for a real identity provider.

## What Changes

- Mount the MCP SDK's `mcpAuthRouter` on the MCP server's HTTP listener, exposing the OAuth endpoints claude.ai expects: `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`, `/authorize`, `/token`, `/register` (dynamic client registration), `/revoke`.
- Protect `/mcp` with the SDK's `requireBearerAuth`, so requests must carry a valid access token issued by this server **or** the existing static `CORTEX__MCP__HTTP_TOKEN` (Claude Code/Cursor keep working unchanged).
- Implement a minimal in-memory `OAuthServerProvider`: dynamic client registration auto-accepts; `/authorize` gates the user behind a **single shared operator password** (`CORTEX__MCP__OAUTH_PASSWORD`) and issues a PKCE-bound auth code; `/token` exchanges it for an opaque access token. State (clients, codes, tokens) is in-memory.
- Add `CORTEX__MCP__PUBLIC_URL` (the server's public base URL, e.g. the ngrok HTTPS URL) so the OAuth metadata advertises correct endpoints; add `CORTEX__MCP__OAUTH_PASSWORD`.
- Restructure the MCP server's HTTP layer onto Express (small dep add) to host the SDK router + middleware; stdio transport is unchanged.
- Document the claude.ai connect flow and the new env in README + `.env.example`, with the temporary nature called out.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `mcp-server`: adds a stopgap OAuth 2.1 authorization surface for the HTTP transport (SDK-based, single shared-password gate, in-memory tokens), in addition to the existing stdio + Streamable HTTP + static-bearer support.

## Impact

- **Code**: `services/mcp-server` only — Express shell in `src/index.ts`, a new `src/oauth.ts` (minimal `OAuthServerProvider`), config additions. `package.json` gains `express`. stdio + the static-token path are preserved.
- **Config/docs**: `.env.example` + README gain `CORTEX__MCP__PUBLIC_URL` and `CORTEX__MCP__OAUTH_PASSWORD` and the claude.ai connector steps.
- **No** pipeline, wire-type, schema, or new compose port (reuses 8181).

## Replace later

This is a **temporary stopgap**, not production auth. It MUST be replaced before any real multi-user/hosted deployment. Known limitations, to be encoded as code markers and tracked:

- **Single shared password**, not per-user identity — everyone who connects authenticates as the same v0 identity stub.
- **In-memory** clients/codes/tokens — lost on restart, single-process only, no rotation or persistent revocation.
- **Self-issued tokens**; the MCP server is its own authorization server (no real IdP, no OPA).

The real replacement (an external IdP via the SDK's `ProxyOAuthServerProvider`, or OPA-backed identity) lands with the `add-foundation` auth work. Code that implements this stopgap MUST carry a prominent `REPLACE-BEFORE-PROD` marker.
