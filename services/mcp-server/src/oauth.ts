// ============================================================================
// REPLACE-BEFORE-PROD — temporary stopgap OAuth authorization server.
//
// This exists ONLY so OAuth-only MCP clients (claude.ai, Claude Desktop's
// custom-connector GUI) can connect. It is NOT production auth:
//   * a SINGLE SHARED PASSWORD gates everyone — there is no per-user identity;
//   * clients / auth codes / access tokens live IN MEMORY (lost on restart,
//     single-process only, no rotation, no persistent revocation);
//   * tokens are self-issued — the MCP server is its own authorization server,
//     with no external IdP / OPA trust anchor.
// Replace with a real IdP (SDK ProxyOAuthServerProvider) or OPA-backed identity
// as part of the `add-foundation` auth work. See
// openspec/changes/archive/*-add-mcp-oauth-stopgap/.
// ============================================================================

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

const CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 1000;

interface CodeRecord {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  expiresAt: number;
}
interface TokenRecord {
  clientId: string;
  expiresAt: number;
}

function token(): string {
  return randomBytes(32).toString("hex");
}

function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function prune(map: Map<string, { expiresAt: number }>): void {
  const now = Date.now();
  for (const [k, v] of map) if (v.expiresAt < now) map.delete(k);
  while (map.size > MAX_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function renderForm(
  fields: Record<string, string>,
  error?: string,
): string {
  const hidden = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}" />`)
    .join("\n      ");
  const err = error ? `<p style="color:#b00">${esc(error)}</p>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>openCG — authorize</title>
<style>body{font-family:system-ui,sans-serif;max-width:24rem;margin:4rem auto;padding:0 1rem}
input[type=password]{width:100%;padding:.5rem;margin:.5rem 0}button{padding:.5rem 1rem}</style></head>
<body><h2>Authorize openCG MCP access</h2>${err}
<form method="post" action="/oauth/approve">
      ${hidden}
  <label>Access password<input type="password" name="password" autofocus required></label>
  <button type="submit">Authorize</button>
</form></body></html>`;
}

export interface StopgapOAuth {
  provider: OAuthServerProvider;
  approveHandler: (req: Request, res: Response) => void;
}

// `password` must be non-empty; callers gate OAuth on its presence.
export function createStopgapOAuth(opts: {
  password: string;
  staticToken: string | null;
}): StopgapOAuth {
  const clients = new Map<string, OAuthClientInformationFull>();
  const codes = new Map<string, CodeRecord>();
  const tokens = new Map<string, TokenRecord>();

  const clientsStore: OAuthRegisteredClientsStore = {
    getClient: (id) => clients.get(id),
    registerClient: (client) => {
      const full = {
        ...client,
        client_id: token(),
        client_id_issued_at: Math.floor(Date.now() / 1000),
      } as OAuthClientInformationFull;
      if (clients.size >= MAX_ENTRIES) clients.delete(clients.keys().next().value as string);
      clients.set(full.client_id, full);
      return full;
    },
  };

  const provider: OAuthServerProvider = {
    get clientsStore() {
      return clientsStore;
    },

    async authorize(client, params: AuthorizationParams, res: Response) {
      res
        .status(200)
        .set("content-type", "text/html")
        .send(
          renderForm({
            client_id: client.client_id,
            redirect_uri: params.redirectUri,
            code_challenge: params.codeChallenge,
            state: params.state ?? "",
            scope: (params.scopes ?? []).join(" "),
            resource: params.resource?.href ?? "",
          }),
        );
    },

    async challengeForAuthorizationCode(client, authorizationCode) {
      prune(codes);
      const rec = codes.get(authorizationCode);
      if (!rec || rec.expiresAt < Date.now() || rec.clientId !== client.client_id) {
        throw new Error("invalid authorization code");
      }
      return rec.codeChallenge;
    },

    async exchangeAuthorizationCode(client, authorizationCode, _verifier, redirectUri) {
      const rec = codes.get(authorizationCode);
      if (!rec || rec.expiresAt < Date.now() || rec.clientId !== client.client_id) {
        throw new Error("invalid authorization code");
      }
      if (redirectUri !== undefined && redirectUri !== rec.redirectUri) {
        throw new Error("redirect_uri mismatch");
      }
      codes.delete(authorizationCode); // one-time use
      const access = token();
      if (tokens.size >= MAX_ENTRIES) tokens.delete(tokens.keys().next().value as string);
      tokens.set(access, { clientId: client.client_id, expiresAt: Date.now() + ACCESS_TTL_MS });
      const out: OAuthTokens = {
        access_token: access,
        token_type: "bearer",
        expires_in: Math.floor(ACCESS_TTL_MS / 1000),
      };
      return out;
    },

    async exchangeRefreshToken() {
      throw new Error("refresh tokens are not supported by the stopgap provider");
    },

    async verifyAccessToken(t): Promise<AuthInfo> {
      if (opts.staticToken && constantTimeEqual(t, opts.staticToken)) {
        // The static token doesn't expire; the SDK middleware requires an
        // expiry, so present a rolling one (re-evaluated each request).
        return {
          token: t,
          clientId: "static-bearer",
          scopes: [],
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        };
      }
      prune(tokens);
      const rec = tokens.get(t);
      if (rec && rec.expiresAt >= Date.now()) {
        return {
          token: t,
          clientId: rec.clientId,
          scopes: [],
          expiresAt: Math.floor(rec.expiresAt / 1000),
        };
      }
      throw new Error("invalid or expired access token");
    },
  };

  function approveHandler(req: Request, res: Response): void {
    const body = (req.body ?? {}) as Record<string, string>;
    const fields = {
      client_id: body.client_id ?? "",
      redirect_uri: body.redirect_uri ?? "",
      code_challenge: body.code_challenge ?? "",
      state: body.state ?? "",
      scope: body.scope ?? "",
      resource: body.resource ?? "",
    };
    const password = body.password ?? "";

    if (!constantTimeEqual(password, opts.password)) {
      res.status(401).set("content-type", "text/html").send(renderForm(fields, "Incorrect password."));
      return;
    }
    const client = clients.get(fields.client_id);
    if (!client || !client.redirect_uris.includes(fields.redirect_uri)) {
      res.status(400).set("content-type", "text/html").send(renderForm(fields, "Unknown client or redirect URI."));
      return;
    }
    prune(codes);
    const code = token();
    if (codes.size >= MAX_ENTRIES) codes.delete(codes.keys().next().value as string);
    codes.set(code, {
      clientId: fields.client_id,
      codeChallenge: fields.code_challenge,
      redirectUri: fields.redirect_uri,
      expiresAt: Date.now() + CODE_TTL_MS,
    });
    const url = new URL(fields.redirect_uri);
    url.searchParams.set("code", code);
    if (fields.state) url.searchParams.set("state", fields.state);
    res.redirect(302, url.href);
  }

  return { provider, approveHandler };
}
