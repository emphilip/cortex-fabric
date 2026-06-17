// MCP server entry point. Exposes both an HTTP `/healthz` and `/readyz` for
// compose orchestration, and the MCP tool surface over stdio for direct
// client use. A future change adds an HTTP-streamable MCP transport.

import { createServer } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { PipelineClient } from "./pipeline-client.js";
import { buildMcpServer, handleMcpHttp } from "./server.js";

async function main() {
  const config = loadConfig();
  const pipeline = new PipelineClient(config.pipelineUrl);
  const ctx = { config, pipeline };

  // ----- HTTP: health endpoints + Streamable HTTP MCP transport at /mcp -----
  const http = createServer(async (req, res) => {
    const path = (req.url ?? "").split("?")[0];
    if (path === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (path === "/readyz") {
      const ok = await pipeline.health();
      res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: ok ? "ready" : "pipeline_unavailable" }));
      return;
    }
    if (path === "/mcp") {
      await handleMcpHttp(req, res, ctx);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  http.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.error(`[mcp-server] http listening on :${config.port} (mcp at /mcp)`);
    if (!config.httpToken) {
      // eslint-disable-next-line no-console
      console.error(
        "[mcp-server] WARNING: HTTP /mcp transport is UNAUTHENTICATED — set CORTEX__MCP__HTTP_TOKEN to require a bearer token before exposing this port.",
      );
    }
  });

  // ----- MCP server over stdio ---------------------------------------------
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
