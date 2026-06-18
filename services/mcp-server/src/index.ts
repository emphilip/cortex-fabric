// MCP server entry point. Serves health endpoints and the MCP protocol over
// stdio + Streamable HTTP (`/mcp`). When CORTEX__MCP__OAUTH_PASSWORD is set, it
// also mounts the SDK's OAuth router so OAuth-only clients (claude.ai) can
// connect — see src/oauth.ts (a temporary stopgap).

import express from "express";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { loadConfig } from "./config.js";
import { createStopgapOAuth } from "./oauth.js";
import { PipelineClient } from "./pipeline-client.js";
import { buildMcpServer, dispatchMcp, handleMcpHttp } from "./server.js";

async function main() {
  const config = loadConfig();
  const pipeline = new PipelineClient(config.pipelineUrl);
  const ctx = { config, pipeline };

  const app = express();
  app.disable("x-powered-by");

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/readyz", async (_req, res) => {
    const ok = await pipeline.health();
    res.status(ok ? 200 : 503).json({ status: ok ? "ready" : "pipeline_unavailable" });
  });

  const oauthEnabled = Boolean(config.oauthPassword);
  if (oauthEnabled) {
    const { provider, approveHandler } = createStopgapOAuth({
      password: config.oauthPassword as string,
      staticToken: config.httpToken,
    });
    const issuerUrl = new URL(config.publicUrl);
    app.use(mcpAuthRouter({ provider, issuerUrl, resourceName: "Cortex MCP" }));
    app.post("/oauth/approve", express.urlencoded({ extended: false }), approveHandler);
    const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(issuerUrl);
    app.all(
      "/mcp",
      requireBearerAuth({ verifier: provider, resourceMetadataUrl }),
      (req, res) => {
        void dispatchMcp(req, res, ctx);
      },
    );
  } else {
    // OAuth disabled: static-bearer gate (or open) — unchanged behaviour.
    app.all("/mcp", (req, res) => {
      void handleMcpHttp(req, res, ctx);
    });
  }

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.error(`[mcp-server] http listening on :${config.port} (mcp at /mcp)`);
    if (oauthEnabled) {
      // eslint-disable-next-line no-console
      console.error(
        `[mcp-server] OAuth stopgap ENABLED — shared-password gate at /authorize, metadata under ${config.publicUrl}`,
      );
    } else if (!config.httpToken) {
      // eslint-disable-next-line no-console
      console.error(
        "[mcp-server] WARNING: HTTP /mcp transport is UNAUTHENTICATED — set CORTEX__MCP__HTTP_TOKEN (or CORTEX__MCP__OAUTH_PASSWORD) before exposing this port.",
      );
    }
  });

  // ----- MCP server over stdio (always on) ---------------------------------
  const server = buildMcpServer(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error("[mcp-server] mcp stdio transport connected");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[mcp-server] fatal:", err);
  process.exit(1);
});
