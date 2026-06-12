"""Postgres + Apache AGE access for the knowledge graph."""

from __future__ import annotations

import json
import re
from typing import Any

import asyncpg

_RELATION_RE = re.compile(r"^[a-z][a-z0-9_]*$")


class GraphStore:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        if self._pool is None:
            self._pool = await asyncpg.create_pool(self._dsn, min_size=1, max_size=8)

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    def _require_pool(self) -> asyncpg.Pool:
        if self._pool is None:
            raise RuntimeError("GraphStore.connect() must be called first")
        return self._pool

    async def list_vocabulary(self) -> list[dict[str, Any]]:
        async with self._require_pool().acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT name, description, inverse, directed, deprecated_at
                FROM hive_mind.relationship_vocab
                ORDER BY name
                """
            )
        return [dict(row) for row in rows]

    async def list_concepts(
        self,
        *,
        tenant: str,
        states: list[str],
        search: str | None,
        include_tombstoned: bool,
        limit: int,
        offset: int,
    ) -> tuple[list[dict[str, Any]], int]:
        clauses = ["tenant = $1"]
        params: list[Any] = [tenant]
        if states:
            params.append(states)
            clauses.append(f"state = ANY(${len(params)}::text[])")
        if not include_tombstoned:
            clauses.append("state <> 'tombstoned'")
        if search:
            params.append(f"%{search}%")
            clauses.append(f"name ILIKE ${len(params)}")
        where = " AND ".join(clauses)
        async with self._require_pool().acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT concept_id::text, tenant, name, state, confidence,
                       aliases, symbol_id, symbol_kind, updated_at, tombstoned_at
                FROM hive_mind.concept
                WHERE {where}
                ORDER BY updated_at DESC
                LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}
                """,
                *params,
                limit,
                offset,
            )
            total = await conn.fetchval(
                f"SELECT count(*) FROM hive_mind.concept WHERE {where}",
                *params,
            )
        return [dict(row) for row in rows], int(total or 0)

    async def get_concept(
        self, *, tenant: str, concept_id: str
    ) -> dict[str, Any] | None:
        async with self._require_pool().acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT concept_id::text, tenant, name, dedupe_key, description,
                       aliases, state, confidence, extractor_version,
                       source_entity_id::text, symbol_id, symbol_kind,
                       created_at, updated_at, tombstoned_at
                FROM hive_mind.concept
                WHERE tenant = $1 AND concept_id = $2
                """,
                tenant,
                concept_id,
            )
            if row is None:
                return None
            neighbours = await conn.fetch(
                """
                SELECT e.edge_id::text, e.tenant, e.type,
                       e.from_concept_id::text, e.to_concept_id::text,
                       e.state, e.confidence, e.extractor_version,
                       e.created_at, e.updated_at, e.tombstoned_at,
                       peer.concept_id::text AS peer_concept_id,
                       peer.tenant AS peer_tenant, peer.name AS peer_name,
                       peer.state AS peer_state, peer.confidence AS peer_confidence,
                       peer.aliases AS peer_aliases, peer.symbol_id AS peer_symbol_id,
                       peer.symbol_kind AS peer_symbol_kind,
                       peer.updated_at AS peer_updated_at,
                       peer.tombstoned_at AS peer_tombstoned_at,
                       COALESCE(array_agg(ev.entity_id::text)
                         FILTER (WHERE ev.entity_id IS NOT NULL), '{}') AS evidence_entity_ids
                FROM hive_mind.relationship_edge e
                JOIN hive_mind.concept peer
                  ON peer.concept_id = CASE
                    WHEN e.from_concept_id = $2 THEN e.to_concept_id
                    ELSE e.from_concept_id
                  END
                LEFT JOIN hive_mind.relationship_evidence ev ON ev.edge_id = e.edge_id
                WHERE e.tenant = $1
                  AND (e.from_concept_id = $2 OR e.to_concept_id = $2)
                  AND e.state <> 'tombstoned'
                  AND peer.state <> 'tombstoned'
                GROUP BY e.edge_id, peer.concept_id
                ORDER BY e.state, e.confidence DESC
                """,
                tenant,
                concept_id,
            )
        data = dict(row)
        data["neighbours_confirmed"] = []
        data["neighbours_candidate"] = []
        for item in neighbours:
            n = dict(item)
            neighbour = {
                "edge": {
                    key: n[key]
                    for key in (
                        "edge_id",
                        "tenant",
                        "type",
                        "from_concept_id",
                        "to_concept_id",
                        "state",
                        "confidence",
                        "extractor_version",
                        "created_at",
                        "updated_at",
                        "tombstoned_at",
                    )
                },
                "peer": {
                    "concept_id": n["peer_concept_id"],
                    "tenant": n["peer_tenant"],
                    "name": n["peer_name"],
                    "state": n["peer_state"],
                    "confidence": n["peer_confidence"],
                    "aliases": n["peer_aliases"],
                    "symbol_id": n["peer_symbol_id"],
                    "symbol_kind": n["peer_symbol_kind"],
                    "updated_at": n["peer_updated_at"],
                    "tombstoned_at": n["peer_tombstoned_at"],
                },
                "evidence_entity_ids": n["evidence_entity_ids"],
            }
            data[f"neighbours_{n['state']}"].append(neighbour)
        return data

    async def list_edges(
        self,
        *,
        tenant: str,
        state: str | None,
        relationship_type: str | None,
        limit: int,
        offset: int,
    ) -> tuple[list[dict[str, Any]], int]:
        clauses = ["e.tenant = $1", "e.state <> 'tombstoned'"]
        params: list[Any] = [tenant]
        if state:
            params.append(state)
            clauses.append(f"e.state = ${len(params)}")
        if relationship_type:
            params.append(relationship_type)
            clauses.append(f"e.type = ${len(params)}")
        where = " AND ".join(clauses)
        async with self._require_pool().acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT e.edge_id::text, e.tenant, e.type,
                       e.from_concept_id::text, e.to_concept_id::text,
                       e.state, e.confidence, e.extractor_version,
                       e.created_at, e.updated_at, e.tombstoned_at,
                       COALESCE(array_agg(ev.entity_id::text)
                         FILTER (WHERE ev.entity_id IS NOT NULL), '{{}}') AS evidence_entity_ids
                FROM hive_mind.relationship_edge e
                LEFT JOIN hive_mind.relationship_evidence ev ON ev.edge_id = e.edge_id
                WHERE {where}
                GROUP BY e.edge_id
                ORDER BY e.confidence DESC, e.created_at DESC
                LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}
                """,
                *params,
                limit,
                offset,
            )
            total = await conn.fetchval(
                f"SELECT count(*) FROM hive_mind.relationship_edge e WHERE {where}",
                *params,
            )
        return [dict(row) for row in rows], int(total or 0)

    async def traverse(
        self,
        *,
        tenant: str,
        concept_id: str,
        types: list[str] | None,
        depth: int,
        limit: int,
        include_candidates: bool,
    ) -> dict[str, list[dict[str, Any]]] | None:
        async with self._require_pool().acquire() as conn:
            exists = await conn.fetchval(
                """
                SELECT EXISTS(
                  SELECT 1 FROM hive_mind.concept
                  WHERE tenant = $1 AND concept_id = $2 AND state <> 'tombstoned'
                )
                """,
                tenant,
                concept_id,
            )
            if not exists:
                return None
            if types:
                vocab_rows = await conn.fetch(
                    """
                    SELECT name FROM hive_mind.relationship_vocab
                    WHERE name = ANY($1::text[])
                    """,
                    types,
                )
                valid_types = {row["name"] for row in vocab_rows}
                if valid_types != set(types):
                    raise ValueError("unknown relationship type")
                relation_pattern = ":" + "|".join(
                    sorted(_validated_relation(name) for name in valid_types)
                )
            else:
                relation_pattern = ""
            states = ["confirmed", "candidate"] if include_candidates else ["confirmed"]
            params = json.dumps(
                {
                    "concept_id": concept_id,
                    "states": states,
                    "limit": limit,
                }
            )
            peer_rows = await conn.fetch(
                f"""
                SELECT concept_id
                FROM ag_catalog.cypher(
                  'hive_mind',
                  $cypher$
                    MATCH (start:Concept {{concept_id: $concept_id}})
                          -[edges{relation_pattern}*1..{depth}]-
                          (peer:Concept)
                    WHERE all(edge IN edges WHERE edge.state IN $states)
                    RETURN DISTINCT peer.concept_id
                    LIMIT $limit
                  $cypher$,
                  $1::agtype
                ) AS (concept_id agtype)
                """,
                params,
            )
            ids = [concept_id]
            ids.extend(_agtype_text(row["concept_id"]) for row in peer_rows)
            ids = list(dict.fromkeys(ids))[:limit]
            nodes = await conn.fetch(
                """
                SELECT concept_id::text, tenant, name, state, confidence,
                       aliases, symbol_id, symbol_kind, updated_at, tombstoned_at
                FROM hive_mind.concept
                WHERE tenant = $1 AND concept_id = ANY($2::uuid[])
                """,
                tenant,
                ids,
            )
            edges = await conn.fetch(
                """
                SELECT edge_id::text, tenant, type, from_concept_id::text,
                       to_concept_id::text, state, confidence, extractor_version,
                       created_at, updated_at, tombstoned_at
                FROM hive_mind.relationship_edge
                WHERE tenant = $1
                  AND from_concept_id = ANY($2::uuid[])
                  AND to_concept_id = ANY($2::uuid[])
                  AND state = ANY($3::text[])
                  AND ($4::text[] IS NULL OR type = ANY($4::text[]))
                ORDER BY confidence DESC
                """,
                tenant,
                ids,
                states,
                types,
            )
        return {
            "nodes": [dict(row) for row in nodes],
            "edges": [dict(row) for row in edges],
        }


def _validated_relation(name: str) -> str:
    if not _RELATION_RE.fullmatch(name):
        raise ValueError(f"invalid relationship type: {name!r}")
    return name


def _agtype_text(value: Any) -> str:
    text = str(value)
    try:
        decoded = json.loads(text)
        return str(decoded)
    except json.JSONDecodeError:
        return text.strip('"')
