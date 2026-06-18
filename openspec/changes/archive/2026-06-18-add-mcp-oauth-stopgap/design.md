## Context

`services/mcp-server/src/index.ts` runs a raw Node `http.createServer` serving `/healthz`, `/readyz`, and `/mcp` (Streamable HTTP, stateful sessions, optional static bearer), plus a stdio transport. The installed `@modelcontextprotocol/sdk@1.29` ships a complete **Express-based** OAuth framework under `server/auth/`: `mcpAuthRouter` (mounts metadata + `/authorize` + `/token` + `/register` + `/revoke`), `requireBearerAuth` (validates tokens), and the `OAuthServerProvider` interface we implement. claude.ai requires this OAuth flow; it cannot send a static bearer.

## Goals / Non-Goals

**Goals:** let claude.ai connect securely via OAuth, with the least code by leaning on the SDK; keep stdio and the static-bearer path working; make the temporary nature unmissable.

**Non-Goals:** real per-user identity, a real IdP, persistence, token rotation, scopes/consent granularity, OPA. Those are the *replacement*, not this.

## Decisions

### Decision 1: Use the SDK's OAuth router on an Express shell

Restructure the MCP server's HTTP listener from raw `http` onto a small Express app and mount `mcpAuthRouter({ provider, issuerUrl: PUBLIC_URL })`. The SDK then provides spec-correct metadata, DCR, PKCE, and token endpoints — we write only the provider. Health routes and `/mcp` become Express handlers (Express `req`/`res` extend Node's, so `StreamableHTTPServerTransport.handleRequest` works unchanged). Add `express` as a dependency.

*Alternative considered:* hand-roll the OAuth endpoints on raw `http`. Rejected — far more code and easy to get subtly wrong (metadata shape, PKCE), and claude.ai is unforgiving about spec conformance.

### Decision 2: Minimal in-memory `OAuthServerProvider` gated by a shared password

Implement `src/oauth.ts`:
- **clientsStore** — in-memory `Map`; DCR auto-registers any client and returns a generated `client_id`.
- **authorize(client, params, res)** — render a tiny HTML form (one password field + hidden flow params). On POST, constant-time-compare against `CORTEX__MCP__OAUTH_PASSWORD`; on match, generate an auth code, store `{ code_challenge, redirect_uri, client_id, expiry }`, and redirect to `params.redirectUri` with `code` + `state`; on mismatch, re-render with an error. If `CORTEX__MCP__OAUTH_PASSWORD` is unset, the authorize endpoint returns an error (OAuth disabled, not open).
- **challengeForAuthorizationCode(client, code)** — return the stored `code_challenge` so the SDK's token handler verifies PKCE.
- **exchangeAuthorizationCode(...)** — validate + consume the code, issue an opaque random access token, store `{ token → authInfo, expiry }`, return `OAuthTokens` (no refresh token in the stopgap).
- **exchangeRefreshToken(...)** — throw "unsupported" (stopgap issues no refresh tokens).
- **verifyAccessToken(token)** — accept the static `CORTEX__MCP__HTTP_TOKEN` (synthetic authInfo) **or** a live issued token; else throw.

A single shared password (not auto-approve) is deliberate: auto-approve would make OAuth no more secure than the open endpoint, defeating the purpose.

### Decision 3: One verifier covers both credentials

Protect `/mcp` with `requireBearerAuth({ verifier: provider, resourceMetadataUrl })`. Because `provider.verifyAccessToken` accepts the static token too, Claude Code/Cursor configs keep working with their existing `Authorization: Bearer <CORTEX__MCP__HTTP_TOKEN>` — no second auth path to maintain.

### Decision 4: Public URL configuration

OAuth metadata must advertise absolute, externally-reachable endpoints. Add `CORTEX__MCP__PUBLIC_URL` (e.g. the ngrok HTTPS URL); `issuerUrl`/`baseUrl` for `mcpAuthRouter` derive from it. Locally it defaults to `http://localhost:<port>`.

### Decision 5: Unmissable "replace" marker

`src/oauth.ts` opens with a `REPLACE-BEFORE-PROD` banner listing the limitations; the proposal's "Replace later" section is the canonical record. The real fix (SDK `ProxyOAuthServerProvider` to an external IdP, or OPA-backed identity) is part of `add-foundation`.

## Risks / Trade-offs

- **In-memory state** → tokens/clients vanish on restart; clients re-auth. Acceptable for a stopgap; documented.
- **Shared password = shared identity** → no per-user audit distinction. Acceptable for v0's stubbed identity; the real IdP fixes it.
- **Express dependency added** to a previously dependency-light service. Small, ubiquitous, and it's what the SDK's auth router targets.
- **Self-issued tokens** have no external trust anchor. Fine while Cortex is its own AS; the proxy-provider replacement removes this.

## Migration Plan

Additive: stdio and the static-bearer path are unchanged; OAuth endpoints are new and inert unless `CORTEX__MCP__OAUTH_PASSWORD` is set. To enable for claude.ai: set `CORTEX__MCP__PUBLIC_URL` + `CORTEX__MCP__OAUTH_PASSWORD`, restart, and add the public URL as a custom connector. Rollback = revert; nothing persists.

## Open Questions

- None blocking. The replacement (real IdP / OPA) is tracked under `add-foundation`'s auth scope; this change intentionally does not attempt it.
