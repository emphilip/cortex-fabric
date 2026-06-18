// Tiny config loader for the TS MCP server: env-vars only (the source of
// truth is cortex.yaml consumed by the Python services; the MCP server
// only needs identity-stub + pipeline URL).

export interface McpConfig {
  tenant: string;
  identity: { principal: string; roles: string[] };
  pipelineUrl: string;
  port: number;
  // Optional bearer token for the HTTP `/mcp` transport. null/empty = open.
  httpToken: string | null;
  // Public base URL used in OAuth metadata (e.g. the ngrok HTTPS URL).
  publicUrl: string;
  // Operator password gating the stopgap OAuth `/authorize`. null = OAuth off.
  oauthPassword: string | null;
}

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback === undefined) {
      throw new Error(`Missing required env var: ${name}`);
    }
    return fallback;
  }
  return v;
}

export function loadConfig(): McpConfig {
  return {
    tenant: env("CORTEX__TENANT", "default"),
    identity: {
      principal: env("CORTEX__IDENTITY__PRINCIPAL", "local-dev"),
      roles: env("CORTEX__IDENTITY__ROLES", "admin,reader")
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean),
    },
    pipelineUrl: env("CORTEX__PIPELINE__URL", "http://pipeline:8000"),
    port: Number(env("CORTEX__MCP__PORT", "8080")),
    httpToken: (process.env.CORTEX__MCP__HTTP_TOKEN ?? "").trim() || null,
    publicUrl:
      (process.env.CORTEX__MCP__PUBLIC_URL ?? "").trim() ||
      `http://localhost:${env("CORTEX__MCP__PORT", "8080")}`,
    oauthPassword: (process.env.CORTEX__MCP__OAUTH_PASSWORD ?? "").trim() || null,
  };
}
