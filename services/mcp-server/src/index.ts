// MCP server entry point. Exposes both an HTTP `/healthz` and `/readyz` for
// compose orchestration, and the MCP tool surface over stdio for direct
// client use. A future change adds an HTTP-streamable MCP transport.

import { createServer } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { PipelineClient } from "./pipeline-client.js";
import {
  ConceptNotFoundError,
  NotImplementedInMvpError,
  TOOL_DEFINITIONS,
  callTool,
} from "./tools.js";

async function main() {
  const config = loadConfig();
  const pipeline = new PipelineClient(config.pipelineUrl);

  // ----- HTTP health endpoints (for docker compose healthcheck) ------------
  const http = createServer(async (req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (req.url === "/readyz") {
      const ok = await pipeline.health();
      res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: ok ? "ready" : "pipeline_unavailable" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  http.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.error(`[mcp-server] http listening on :${config.port}`);
  });

  // ----- MCP server over stdio ---------------------------------------------
  const server = new Server(
    { name: "cortex", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      const result = await callTool(req.params.name, req.params.arguments ?? {}, {
        config,
        pipeline,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const code =
        err instanceof NotImplementedInMvpError || err instanceof ConceptNotFoundError
          ? err.code
          : "error";
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ code, message }) }],
      };
    }
  });

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
