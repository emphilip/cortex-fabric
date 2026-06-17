import { createServer, type Server as HttpServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { request as undiciRequest } from "undici";
import { afterEach, describe, expect, it } from "vitest";
import type { McpConfig } from "./config.js";
import { bearerAllowed, buildMcpServer, handleMcpHttp } from "./server.js";

function ctx(httpToken: string | null = null) {
  const config: McpConfig = {
    tenant: "default",
    identity: { principal: "t", roles: ["reader"] },
    pipelineUrl: "http://unused",
    port: 8080,
    httpToken,
  };
  const pipeline = {
    retrieve: async () => ({}),
    traverse: async () => ({ nodes: [], edges: [] }),
    health: async () => true,
  } as never;
  return { config, pipeline };
}

const FIVE_TOOLS = [
  "cortex/get_entity",
  "cortex/retrieve_for_context",
  "cortex/search",
  "cortex/submit_feedback",
  "cortex/traverse_graph",
];

describe("buildMcpServer", () => {
  it("advertises the five cortex tools over an in-memory client", async () => {
    const server = buildMcpServer(ctx());
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "test", version: "0" }, { capabilities: {} });
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...FIVE_TOOLS].sort());
    await client.close();
  });
});

describe("bearerAllowed", () => {
  it("is open when no token is configured", () => {
    expect(bearerAllowed(undefined, null)).toBe(true);
    expect(bearerAllowed("Bearer anything", null)).toBe(true);
  });
  it("rejects a missing or malformed header when a token is set", () => {
    expect(bearerAllowed(undefined, "s3cret")).toBe(false);
    expect(bearerAllowed("s3cret", "s3cret")).toBe(false);
  });
  it("rejects a wrong token and accepts the right one", () => {
    expect(bearerAllowed("Bearer nope", "s3cret")).toBe(false);
    expect(bearerAllowed("Bearer s3cret", "s3cret")).toBe(true);
  });
});

describe("handleMcpHttp", () => {
  let http: HttpServer | null = null;

  afterEach(() => {
    http?.close();
    http = null;
  });

  async function start(token: string | null) {
    const c = ctx(token);
    http = createServer((req, res) => {
      if ((req.url ?? "").split("?")[0] === "/mcp") void handleMcpHttp(req, res, c);
      else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) => http!.listen(0, resolve));
    const addr = http!.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    return `http://127.0.0.1:${port}/mcp`;
  }

  const initBody = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } },
  });
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };

  it("completes initialize then tools/list over a session (open mode)", async () => {
    const url = await start(null);
    const res = await undiciRequest(url, { method: "POST", headers, body: initBody });
    expect(res.statusCode).toBe(200);
    const sessionId = res.headers["mcp-session-id"] as string | undefined;
    expect(sessionId).toBeTruthy();
    expect(await res.body.text()).toContain("cortex");

    // Follow-up request on the same session must reach an initialized server.
    const res2 = await undiciRequest(url, {
      method: "POST",
      headers: { ...headers, "mcp-session-id": sessionId! },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    expect(res2.statusCode).toBe(200);
    const text2 = await res2.body.text();
    for (const tool of FIVE_TOOLS) expect(text2).toContain(tool);
  });

  it("rejects a follow-up with no/unknown session", async () => {
    const url = await start(null);
    const res = await undiciRequest(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list" }),
    });
    expect(res.statusCode).toBe(400);
    await res.body.text();
  });

  it("returns 401 when a token is set and the bearer is missing", async () => {
    const url = await start("s3cret");
    const res = await undiciRequest(url, { method: "POST", headers, body: initBody });
    expect(res.statusCode).toBe(401);
    await res.body.text();
  });

  it("accepts the request when the correct bearer is provided", async () => {
    const url = await start("s3cret");
    const res = await undiciRequest(url, {
      method: "POST",
      headers: { ...headers, authorization: "Bearer s3cret" },
      body: initBody,
    });
    expect(res.statusCode).toBe(200);
    expect(await res.body.text()).toContain("serverInfo");
  });
});
