import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import express from "express";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { request as undiciRequest } from "undici";
import { afterEach, describe, expect, it } from "vitest";
import { createStopgapOAuth } from "./oauth.js";

const ISSUER = "http://127.0.0.1";

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

describe("stopgap OAuth provider (unit)", () => {
  it("registers clients, gates authorize on the password, and verifies tokens", async () => {
    const { provider } = createStopgapOAuth({ password: "s3cret", staticToken: "STATIC" });

    const client = await provider.clientsStore.registerClient!({
      redirect_uris: ["https://app.example/cb"],
    } as never);
    expect(client.client_id).toBeTruthy();
    expect(await provider.clientsStore.getClient(client.client_id)).toBeTruthy();

    // static bearer is accepted by the verifier
    const stat = await provider.verifyAccessToken("STATIC");
    expect(stat.clientId).toBe("static-bearer");

    // unknown token rejected
    await expect(provider.verifyAccessToken("nope")).rejects.toThrow();
  });
});

describe("stopgap OAuth provider (http end-to-end)", () => {
  let http: HttpServer | null = null;
  afterEach(() => {
    http?.close();
    http = null;
  });

  async function start(password: string | null, staticToken: string | null) {
    const app = express();
    if (password) {
      const { provider, approveHandler } = createStopgapOAuth({ password, staticToken });
      app.use(mcpAuthRouter({ provider, issuerUrl: new URL(ISSUER) }));
      app.post("/oauth/approve", express.urlencoded({ extended: false }), approveHandler);
      app.all("/mcp", requireBearerAuth({ verifier: provider }), (_req, res) => {
        res.json({ ok: true });
      });
    }
    http = createServer(app);
    await new Promise<void>((r) => http!.listen(0, r));
    const addr = http!.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    return `http://127.0.0.1:${port}`;
  }

  it("advertises authorization-server metadata", async () => {
    const base = await start("s3cret", null);
    const res = await undiciRequest(`${base}/.well-known/oauth-authorization-server`);
    expect(res.statusCode).toBe(200);
    const meta = (await res.body.json()) as Record<string, string>;
    expect(meta.authorization_endpoint).toContain("/authorize");
    expect(meta.token_endpoint).toContain("/token");
  });

  it("rejects /mcp with no credentials (401 + WWW-Authenticate)", async () => {
    const base = await start("s3cret", null);
    const res = await undiciRequest(`${base}/mcp`, { method: "POST" });
    expect(res.statusCode).toBe(401);
    expect(String(res.headers["www-authenticate"] ?? "")).toMatch(/Bearer/i);
    await res.body.text();
  });

  it("accepts the static bearer on /mcp", async () => {
    const base = await start("s3cret", "STATIC");
    const res = await undiciRequest(`${base}/mcp`, {
      method: "POST",
      headers: { authorization: "Bearer STATIC" },
    });
    expect(res.statusCode).toBe(200);
    expect(await res.body.json()).toEqual({ ok: true });
  });

  it("completes register -> authorize(password) -> token -> /mcp", async () => {
    const base = await start("s3cret", null);
    const redirect = "https://app.example/cb";

    // 1. dynamic client registration
    const reg = await undiciRequest(`${base}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: [redirect], token_endpoint_auth_method: "none" }),
    });
    expect(reg.statusCode).toBe(201);
    const client = (await reg.body.json()) as { client_id: string };

    // 2. submit the password to /oauth/approve -> 302 with ?code=
    const { verifier, challenge } = pkce();
    const approve = await undiciRequest(`${base}/oauth/approve`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: client.client_id,
        redirect_uri: redirect,
        code_challenge: challenge,
        state: "xyz",
        password: "s3cret",
      }).toString(),
    });
    expect(approve.statusCode).toBe(302);
    const location = String(approve.headers.location);
    const code = new URL(location).searchParams.get("code");
    expect(code).toBeTruthy();

    // wrong password is rejected
    const bad = await undiciRequest(`${base}/oauth/approve`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: client.client_id,
        redirect_uri: redirect,
        code_challenge: challenge,
        password: "wrong",
      }).toString(),
    });
    expect(bad.statusCode).toBe(401);
    await bad.body.text();

    // 3. exchange the code (with PKCE verifier) for a token
    const tok = await undiciRequest(`${base}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code!,
        redirect_uri: redirect,
        client_id: client.client_id,
        code_verifier: verifier,
      }).toString(),
    });
    expect(tok.statusCode).toBe(200);
    const tokens = (await tok.body.json()) as { access_token: string };
    expect(tokens.access_token).toBeTruthy();

    // 4. the issued token is accepted on /mcp
    const mcp = await undiciRequest(`${base}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(mcp.statusCode).toBe(200);
    expect(await mcp.body.json()).toEqual({ ok: true });
  });
});
