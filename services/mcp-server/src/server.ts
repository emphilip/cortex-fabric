// MCP server wiring shared by both transports. `buildMcpServer` registers the
// tool handlers on a fresh `Server`; stdio connects one, and each HTTP request
// connects its own (stateless). `handleMcpHttp` mounts the Streamable HTTP
// transport at `/mcp` with an optional bearer-token gate.

import { randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  isInitializeRequest,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  ConceptNotFoundError,
  NotImplementedInMvpError,
  TOOL_DEFINITIONS,
  type ToolCallContext,
  callTool,
} from "./tools.js";

export function buildMcpServer(ctx: ToolCallContext): Server {
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
      const result = await callTool(req.params.name, req.params.arguments ?? {}, ctx);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
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

  return server;
}

// Returns true when the request may proceed. Open (true) when no token is
// configured; otherwise requires a constant-time-equal `Authorization: Bearer`.
export function bearerAllowed(authHeader: string | undefined, token: string | null): boolean {
  if (!token) return true;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authHeader.slice("Bearer ".length).trim());
  const expected = Buffer.from(token);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

// Live Streamable HTTP sessions, keyed by `mcp-session-id`. A real client does
// `initialize` (no session id) → gets an id back → reuses it on follow-up
// requests, so each session's server stays initialized across requests.
const transports = new Map<string, StreamableHTTPServerTransport>();

// Handle one `/mcp` request over the stateful Streamable HTTP transport.
export async function handleMcpHttp(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ToolCallContext,
): Promise<void> {
  if (!bearerAllowed(req.headers.authorization, ctx.config.httpToken)) {
    res.writeHead(401, {
      "content-type": "application/json",
      "www-authenticate": 'Bearer realm="cortex"',
    });
    res.end(
      JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "unauthorized" }, id: null }),
    );
    return;
  }
  await dispatchMcp(req, res, ctx);
}

// Route a `/mcp` request to its Streamable HTTP session WITHOUT any auth gate.
// Used directly behind OAuth `requireBearerAuth` middleware, and by
// `handleMcpHttp` (which adds the static-bearer gate) when OAuth is off.
export async function dispatchMcp(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ToolCallContext,
): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  // Follow-up request for an existing session (POST call, GET SSE, or DELETE).
  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!;
    const body = req.method === "POST" ? await readJsonBody(req) : undefined;
    await transport.handleRequest(req, res, body);
    return;
  }

  // A new session must begin with an `initialize` POST.
  if (req.method === "POST") {
    const body = await readJsonBody(req);
    if (!sessionId && isInitializeRequest(body)) {
      // The transport's option/`onclose` typing differs from the `Transport`
      // interface under `exactOptionalPropertyTypes`; the two casts below are
      // the SDK's documented usage, isolated to this boundary.
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid: string) => transports.set(sid, transport),
      } as unknown as ConstructorParameters<typeof StreamableHTTPServerTransport>[0]);
      transport.onclose = () => {
        if (transport.sessionId) transports.delete(transport.sessionId);
      };
      const server = buildMcpServer(ctx);
      await server.connect(transport as unknown as Parameters<typeof server.connect>[0]);
      await transport.handleRequest(req, res, body);
      return;
    }
  }

  res.writeHead(400, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "missing or invalid mcp session" },
      id: null,
    }),
  );
}
