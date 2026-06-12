// Pipeline-service client used by server components and a handful of client
// actions. Shared types live in @hive-mind/shared.

import type {
  ConnectorStatus,
  Entity,
  EntityListItem,
  EntityListResponse,
  IngestionRun,
  VectorSearchResponse,
} from "@hive-mind/shared";

const PIPELINE_URL =
  process.env.HIVE_MIND__PIPELINE__URL || "http://pipeline:8000";

const NO_STORE: RequestInit = { cache: "no-store" };

export interface AuditRow {
  id: number;
  created_at: string;
  correlation_id: string;
  tenant: string;
  principal: string;
  roles: string[];
  tool: string;
  query: string;
  final_entity_ids: string[];
  candidate_ids: string[];
  final_context_hash: string;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  outcome: "ok" | "error";
  error_code?: string | null;
}

// --- Audits ----------------------------------------------------------------

export async function listRecentAudits(limit = 50): Promise<AuditRow[]> {
  const res = await fetch(`${PIPELINE_URL}/audit/recent?limit=${limit}`, NO_STORE);
  if (!res.ok) return [];
  const body = (await res.json()) as { items: AuditRow[] };
  return body.items ?? [];
}

export async function getAudit(id: number): Promise<AuditRow | null> {
  const res = await fetch(`${PIPELINE_URL}/audit/${id}`, NO_STORE);
  if (!res.ok) return null;
  return (await res.json()) as AuditRow;
}

// --- Pipeline readyz (status header on the vector page) -------------------

export interface ReadyzInfo {
  status: string;
  tenant?: string;
  embedding_model?: string;
  vector_size?: number;
}

export async function getReadyz(): Promise<ReadyzInfo | null> {
  try {
    const res = await fetch(`${PIPELINE_URL}/readyz`, NO_STORE);
    if (!res.ok) return null;
    return (await res.json()) as ReadyzInfo;
  } catch {
    return null;
  }
}

// --- Entities --------------------------------------------------------------

export interface ListEntitiesParams {
  source?: string;
  classification?: string;
  freshness_state?: string;
  limit?: number;
  offset?: number;
}

export async function listEntities(
  params: ListEntitiesParams = {},
): Promise<EntityListResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const res = await fetch(`${PIPELINE_URL}/entities?${qs}`, NO_STORE);
  if (!res.ok) {
    return { items: [] as EntityListItem[], total: 0, limit: params.limit ?? 50, offset: params.offset ?? 0 };
  }
  return (await res.json()) as EntityListResponse;
}

export async function getEntity(entityId: string): Promise<Entity | null> {
  const res = await fetch(`${PIPELINE_URL}/entities/${entityId}`, NO_STORE);
  if (!res.ok) return null;
  return (await res.json()) as Entity;
}

export async function tombstoneEntity(entityId: string): Promise<EntityListItem | null> {
  const res = await fetch(`${PIPELINE_URL}/entities/${entityId}`, {
    method: "DELETE",
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as EntityListItem;
}

// --- Vector search ---------------------------------------------------------

export interface VectorSearchInput {
  query: string;
  top_k?: number;
  filters?: Record<string, unknown>;
}

export async function vectorSearch(
  input: VectorSearchInput,
): Promise<VectorSearchResponse | null> {
  const res = await fetch(`${PIPELINE_URL}/search/vector`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as VectorSearchResponse;
}

// --- Ingestion (via pipeline proxy) ----------------------------------------

export async function listConnectors(): Promise<ConnectorStatus[]> {
  const res = await fetch(`${PIPELINE_URL}/ingestion/connectors`, NO_STORE);
  if (!res.ok) return [];
  return (await res.json()) as ConnectorStatus[];
}

export async function listRecentRuns(): Promise<IngestionRun[]> {
  const res = await fetch(`${PIPELINE_URL}/ingestion/runs/recent`, NO_STORE);
  if (!res.ok) return [];
  return (await res.json()) as IngestionRun[];
}

export async function runGit(repoUrl: string): Promise<IngestionRun | null> {
  const res = await fetch(`${PIPELINE_URL}/ingestion/git/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo_url: repoUrl }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as IngestionRun;
}
