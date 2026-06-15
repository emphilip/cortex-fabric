// Tiny config loader for the TS MCP server: env-vars only (the source of
// truth is cortex.yaml consumed by the Python services; the MCP server
// only needs identity-stub + pipeline URL).

export interface McpConfig {
  tenant: string;
  identity: { principal: string; roles: string[] };
  pipelineUrl: string;
  port: number;
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
  };
}
