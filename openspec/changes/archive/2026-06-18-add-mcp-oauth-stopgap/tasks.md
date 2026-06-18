## 1. Config + dependency

- [x] 1.1 Add `express` to `services/mcp-server/package.json` dependencies (and `@types/express` dev); update the lockfile
- [x] 1.2 Add `publicUrl` (`CORTEX__MCP__PUBLIC_URL`, default `http://localhost:<port>`) and `oauthPassword` (`CORTEX__MCP__OAUTH_PASSWORD`, default null) to `McpConfig`/`loadConfig`

## 2. Stopgap OAuth provider

- [x] 2.1 Add `src/oauth.ts` with a prominent `REPLACE-BEFORE-PROD` banner and a minimal in-memory `OAuthServerProvider`: in-memory `clientsStore` (DCR auto-accepts), `authorize` (renders a password form; constant-time check against `CORTEX__MCP__OAUTH_PASSWORD`; issues a PKCE-bound code; disabled when the password is unset), `challengeForAuthorizationCode`, `exchangeAuthorizationCode` (issue opaque access token), `exchangeRefreshToken` (throw unsupported), `verifyAccessToken` (accept the static `CORTEX__MCP__HTTP_TOKEN` or a live issued token)
- [x] 2.2 Use short expiries + a cap on stored codes/tokens so the in-memory maps can't grow unbounded

## 3. Wire the HTTP layer onto Express

- [x] 3.1 Restructure the HTTP listener in `src/index.ts` onto an Express app: keep `/healthz` + `/readyz`; mount `mcpAuthRouter({ provider, issuerUrl: publicUrl })`; protect `/mcp` with `requireBearerAuth({ verifier: provider, resourceMetadataUrl })`; keep the stateful Streamable HTTP handler behind it
- [x] 3.2 Keep the stdio transport unchanged; log the OAuth status on startup (enabled when a password is set; otherwise note OAuth disabled and that only static-bearer/open applies)

## 4. Tests

- [x] 4.1 Provider unit tests: DCR returns a client_id; `authorize` issues a code only for the correct password and is disabled when unset; `exchangeAuthorizationCode` enforces PKCE and issues a token; `verifyAccessToken` accepts the static token and a live issued token and rejects others
- [x] 4.2 HTTP tests: `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` return metadata under the public URL; unauthenticated `/mcp` returns `401` with a `WWW-Authenticate` resource-metadata reference; `/mcp` with the static bearer still completes an `initialize`/session

## 5. Docs + verification

- [x] 5.1 Add `CORTEX__MCP__PUBLIC_URL` + `CORTEX__MCP__OAUTH_PASSWORD` (commented) to `.env.example`; add a "connect from claude.ai (OAuth)" subsection to the README MCP section, noting it is a temporary stopgap
- [x] 5.2 Run `pnpm --filter @cortex/mcp-server test` and `pnpm -r build`
- [x] 5.3 Rebuild + restart the mcp-server container; verify the well-known metadata is served, an unauthenticated `/mcp` returns 401 with the metadata pointer, and the static-bearer `/mcp` still works; then run the full OAuth dance end-to-end (register → authorize with the password → token → `/mcp` with the issued token)
- [ ] 5.4 Run `openspec validate add-mcp-oauth-stopgap --strict`, scan staged changes for secrets, commit, and push
