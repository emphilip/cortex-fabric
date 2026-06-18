## ADDED Requirements

### Requirement: Stopgap OAuth authorization for the HTTP transport

The MCP server SHALL provide an OAuth 2.1 authorization surface on its HTTP listener so OAuth-only MCP clients (claude.ai, Claude Desktop's custom-connector GUI) can authenticate. It MUST expose the discovery and flow endpoints the MCP authorization spec requires — authorization-server metadata, protected-resource metadata, authorization, token, dynamic client registration, and revocation — built on the MCP SDK's OAuth router so the protocol (including PKCE) is spec-conformant. The OAuth metadata MUST advertise endpoints under the server's configured public base URL (`CORTEX__MCP__PUBLIC_URL`).

This authorization surface is an explicitly **temporary stopgap**: state MAY be in-memory and identity MAY be a single shared secret. The implementation MUST carry a prominent in-code marker indicating it is to be replaced before production.

#### Scenario: OAuth discovery is advertised

- **WHEN** a client requests `/.well-known/oauth-protected-resource` or `/.well-known/oauth-authorization-server`
- **THEN** the server returns metadata pointing at this server's authorize, token, and registration endpoints under `CORTEX__MCP__PUBLIC_URL`

#### Scenario: An unauthenticated /mcp request advertises how to authenticate

- **WHEN** a client calls `/mcp` with no access token and no static bearer token
- **THEN** the server responds `401` with a `WWW-Authenticate` header referencing the protected-resource metadata URL

#### Scenario: A full OAuth flow yields a working access token

- **WHEN** a client registers (DCR), completes the authorize step with the correct operator password, and exchanges the PKCE-bound code at the token endpoint
- **THEN** the server issues an access token that is accepted on subsequent `/mcp` requests

### Requirement: Shared-password authorization gate

The `/authorize` step SHALL require the operator password configured in `CORTEX__MCP__OAUTH_PASSWORD`. A request presenting the correct password MUST proceed to issue an authorization code bound to the request's PKCE challenge and redirect URI; an incorrect or missing password MUST NOT issue a code. When `CORTEX__MCP__OAUTH_PASSWORD` is not set, the OAuth authorization endpoints MUST be disabled (not silently open).

#### Scenario: Correct password authorizes

- **WHEN** the user submits the correct `CORTEX__MCP__OAUTH_PASSWORD` at the authorize step
- **THEN** the server redirects back to the client with an authorization code

#### Scenario: Wrong password is rejected

- **WHEN** the user submits an incorrect or empty password at the authorize step
- **THEN** no authorization code is issued and the user is not redirected with a code

### Requirement: Static bearer and OAuth tokens both accepted on /mcp

`/mcp` MUST accept **either** an access token issued by this server's OAuth flow **or** the static `CORTEX__MCP__HTTP_TOKEN` (when set), so existing Claude Code / Cursor configurations using the static bearer continue to work unchanged alongside OAuth clients. The stdio transport MUST remain unaffected by all HTTP authentication.

#### Scenario: Static bearer still works

- **WHEN** a client calls `/mcp` with `Authorization: Bearer <CORTEX__MCP__HTTP_TOKEN>`
- **THEN** the request is handled normally without any OAuth flow

#### Scenario: OAuth-issued token works

- **WHEN** a client calls `/mcp` with a valid access token issued by this server's token endpoint
- **THEN** the request is handled normally
