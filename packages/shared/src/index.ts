// Wire types shared between MCP server and admin UI. Pydantic mirrors in
// packages/shared-py/hive_mind_shared/types.py — keep in sync.

export interface IdentityContext {
  principal: string;
  roles: readonly string[];
  tenant: string;
}

export interface RetrievalRequest {
  correlation_id: string;
  identity: IdentityContext;
  tool: string;
  query: string;
  top_k?: number;
  token_budget?: number;
  filters?: Record<string, unknown>;
}

export interface ContextFragment {
  entity_id: string;
  source: string;
  source_uri: string;
  title?: string;
  text: string;
  score: number;
  tokens: number;
  classification: string;
}

export interface StageUsage {
  stage: string;
  model?: string;
  provider?: string;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
}

export interface UsageEnvelope {
  total_tokens_in: number;
  total_tokens_out: number;
  total_latency_ms: number;
  by_stage: readonly StageUsage[];
}

export interface RetrievalResponse {
  correlation_id: string;
  fragments: readonly ContextFragment[];
  usage: UsageEnvelope;
  final_context_hash: string;
  vector_collection?: string;
  vector_snapshot_id?: string;
}

export interface AuditRecord {
  id: number;
  created_at: string;
  correlation_id: string;
  tenant: string;
  principal: string;
  roles: readonly string[];
  tool: string;
  query: string;
  candidate_ids: readonly string[];
  final_entity_ids: readonly string[];
  final_context_hash: string;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  outcome: "ok" | "error";
  error_code?: string;
}

export interface IngestEvent {
  type: "document_created" | "document_updated" | "document_tombstoned";
  tenant: string;
  entity_id: string;
  source: string;
  source_uri: string;
  content_hash: string;
}

// --- Admin: catalog read ---------------------------------------------------

export interface EntityListItem {
  entity_id: string;
  tenant: string;
  source: string;
  source_uri: string;
  title?: string | null;
  classification: string;
  freshness_state: string;
  updated_at: string;
  tombstoned_at?: string | null;
}

export interface EntityRef {
  entity_id: string;
  title?: string | null;
  source_uri: string;
}

export interface EntityLineage {
  parent?: EntityRef | null;
  children: readonly EntityRef[];
}

export interface EntityAuditAppearance {
  id: number;
  created_at: string;
  correlation_id: string;
  tool: string;
  query: string;
  outcome: "ok" | "error";
}

export interface Entity extends EntityListItem {
  body: string;
  content_hash: string;
  metadata: Record<string, unknown>;
  source_revision?: string | null;
  parent_entity_id?: string | null;
  created_at: string;
  ingested_at: string;
  last_verified_at: string;
  lineage: EntityLineage;
  audit_appearances: readonly EntityAuditAppearance[];
}

export interface EntityListResponse {
  items: readonly EntityListItem[];
  total: number;
  limit: number;
  offset: number;
}

// --- Admin: vector search --------------------------------------------------

export interface VectorSearchHit {
  entity_id: string;
  score: number;
  source: string;
  source_uri: string;
  title?: string | null;
  classification: string;
  snippet: string;
  collection?: string;
}

export interface VectorSearchResponse {
  hits: readonly VectorSearchHit[];
  model: string;
  provider: string;
  tokens_in: number;
}

// --- Admin: ingestion ------------------------------------------------------

export interface ConnectorStatus {
  name: string;
  supported: boolean;
  reason?: string;
}

export type IngestionRunStatus = "queued" | "running" | "succeeded" | "failed";

export interface IngestionRun {
  run_id: string;
  connector: string;
  repo?: string;
  started_at: string;
  finished_at?: string | null;
  status: IngestionRunStatus;
  parents?: number;
  chunks?: number;
  error?: string | null;
}
