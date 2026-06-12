"""Wire types shared between Python services. Mirrors packages/shared/src/index.ts."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class IdentityContext(BaseModel):
    model_config = ConfigDict(frozen=True)
    principal: str
    roles: tuple[str, ...]
    tenant: str


class RetrievalRequest(BaseModel):
    correlation_id: str
    identity: IdentityContext
    tool: str
    query: str
    top_k: int = 20
    token_budget: int = 4000
    filters: dict[str, Any] = Field(default_factory=dict)


class ContextFragment(BaseModel):
    entity_id: str
    source: str
    source_uri: str
    title: str | None = None
    text: str
    score: float
    tokens: int
    classification: str = "internal"


class StageUsage(BaseModel):
    stage: str
    model: str | None = None
    provider: str | None = None
    tokens_in: int = 0
    tokens_out: int = 0
    latency_ms: int = 0


class UsageEnvelope(BaseModel):
    total_tokens_in: int = 0
    total_tokens_out: int = 0
    total_latency_ms: int = 0
    by_stage: list[StageUsage] = Field(default_factory=list)


class RetrievalResponse(BaseModel):
    correlation_id: str
    fragments: list[ContextFragment]
    usage: UsageEnvelope
    final_context_hash: str
    vector_collection: str | None = None
    vector_snapshot_id: str | None = None


class AuditRecord(BaseModel):
    id: int
    created_at: datetime
    correlation_id: str
    tenant: str
    principal: str
    roles: list[str]
    tool: str
    query: str
    candidate_ids: list[str]
    final_entity_ids: list[str]
    final_context_hash: str
    tokens_in: int
    tokens_out: int
    latency_ms: int
    outcome: Literal["ok", "error"]
    error_code: str | None = None


class IngestEvent(BaseModel):
    type: Literal["document_created", "document_updated", "document_tombstoned"]
    tenant: str
    entity_id: str
    source: str
    source_uri: str
    content_hash: str


# --- Admin: catalog read ---------------------------------------------------


class EntityListItem(BaseModel):
    entity_id: str
    tenant: str
    source: str
    source_uri: str
    title: str | None = None
    classification: str
    freshness_state: str
    updated_at: datetime
    tombstoned_at: datetime | None = None


class EntityRef(BaseModel):
    entity_id: str
    title: str | None = None
    source_uri: str


class EntityLineage(BaseModel):
    parent: EntityRef | None = None
    children: list[EntityRef] = Field(default_factory=list)


class EntityAuditAppearance(BaseModel):
    id: int
    created_at: datetime
    correlation_id: str
    tool: str
    query: str
    outcome: Literal["ok", "error"]


class Entity(EntityListItem):
    body: str
    content_hash: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    source_revision: str | None = None
    parent_entity_id: str | None = None
    created_at: datetime
    ingested_at: datetime
    last_verified_at: datetime
    lineage: EntityLineage = Field(default_factory=EntityLineage)
    audit_appearances: list[EntityAuditAppearance] = Field(default_factory=list)


class EntityListResponse(BaseModel):
    items: list[EntityListItem]
    total: int
    limit: int
    offset: int


# --- Admin: vector search --------------------------------------------------


class VectorSearchHit(BaseModel):
    entity_id: str
    score: float
    source: str
    source_uri: str
    title: str | None = None
    classification: str = "internal"
    snippet: str
    collection: str | None = None


class VectorSearchResponse(BaseModel):
    hits: list[VectorSearchHit]
    model: str
    provider: str
    tokens_in: int


# --- Admin: ingestion ------------------------------------------------------


class ConnectorStatus(BaseModel):
    name: str
    supported: bool
    reason: str | None = None


IngestionRunStatus = Literal["queued", "running", "succeeded", "failed"]


class IngestionRun(BaseModel):
    run_id: str
    connector: str
    repo: str | None = None
    started_at: datetime
    finished_at: datetime | None = None
    status: IngestionRunStatus
    parents: int | None = None
    chunks: int | None = None
    error: str | None = None
