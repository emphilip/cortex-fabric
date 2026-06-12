"""Shared Python building blocks for Hive Mind services."""

from hive_mind_shared.config import HiveMindConfig, load_config
from hive_mind_shared.metrics import metrics_app, record_stage_tokens, record_request
from hive_mind_shared.otel import setup_otel
from hive_mind_shared.types import (
    AuditRecord,
    ConnectorStatus,
    ContextFragment,
    Entity,
    EntityAuditAppearance,
    EntityLineage,
    EntityListItem,
    EntityListResponse,
    EntityRef,
    IdentityContext,
    IngestEvent,
    IngestionRun,
    IngestionRunStatus,
    RetrievalRequest,
    RetrievalResponse,
    StageUsage,
    UsageEnvelope,
    VectorSearchHit,
    VectorSearchResponse,
)

__all__ = [
    "AuditRecord",
    "ConnectorStatus",
    "ContextFragment",
    "Entity",
    "EntityAuditAppearance",
    "EntityLineage",
    "EntityListItem",
    "EntityListResponse",
    "EntityRef",
    "HiveMindConfig",
    "IdentityContext",
    "IngestEvent",
    "IngestionRun",
    "IngestionRunStatus",
    "RetrievalRequest",
    "RetrievalResponse",
    "StageUsage",
    "UsageEnvelope",
    "VectorSearchHit",
    "VectorSearchResponse",
    "load_config",
    "metrics_app",
    "record_request",
    "record_stage_tokens",
    "setup_otel",
]
