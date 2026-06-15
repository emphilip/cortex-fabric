"""Apache AGE reflection helpers.

Postgres tables remain authoritative. These helpers update AGE inside the
caller's existing asyncpg transaction so a reflection failure rolls back the
relational rows as well.
"""

from __future__ import annotations

import json
import re
from typing import Any

_LABEL_RE = re.compile(r"^[a-z][a-z0-9_]*$")


async def reflect_concept(
    conn: Any,
    *,
    concept_id: str,
    tenant: str,
    name: str,
    state: str,
) -> None:
    params = json.dumps(
        {
            "concept_id": concept_id,
            "tenant": tenant,
            "name": name,
            "state": state,
        }
    )
    await conn.execute(
        """
        SELECT * FROM ag_catalog.cypher(
          'cortex',
          $cypher$
            MERGE (concept:Concept {concept_id: $concept_id})
            SET concept.tenant = $tenant,
                concept.name = $name,
                concept.state = $state
            RETURN concept
          $cypher$,
          $1::ag_catalog.agtype
        ) AS (concept ag_catalog.agtype)
        """,
        params,
    )


async def reflect_edge(
    conn: Any,
    *,
    edge_id: str,
    tenant: str,
    relationship_type: str,
    from_concept_id: str,
    to_concept_id: str,
    state: str,
    confidence: float,
) -> None:
    if not _LABEL_RE.fullmatch(relationship_type):
        raise ValueError(f"invalid AGE edge label: {relationship_type!r}")
    params = json.dumps(
        {
            "edge_id": edge_id,
            "tenant": tenant,
            "from_concept_id": from_concept_id,
            "to_concept_id": to_concept_id,
            "state": state,
            "confidence": confidence,
        }
    )
    await conn.execute(
        f"""
        SELECT * FROM ag_catalog.cypher(
          'cortex',
          $cypher$
            MATCH (source:Concept {{concept_id: $from_concept_id}})
            MATCH (target:Concept {{concept_id: $to_concept_id}})
            MERGE (source)-[edge:{relationship_type} {{edge_id: $edge_id}}]->(target)
            SET edge.tenant = $tenant,
                edge.state = $state,
                edge.confidence = $confidence
            RETURN edge
          $cypher$,
          $1::ag_catalog.agtype
        ) AS (edge ag_catalog.agtype)
        """,
        params,
    )


async def delete_reflected_edge(
    conn: Any,
    *,
    edge_id: str,
    relationship_type: str,
) -> None:
    if not _LABEL_RE.fullmatch(relationship_type):
        raise ValueError(f"invalid AGE edge label: {relationship_type!r}")
    params = json.dumps({"edge_id": edge_id})
    await conn.execute(
        f"""
        SELECT * FROM ag_catalog.cypher(
          'cortex',
          $cypher$
            MATCH ()-[edge:{relationship_type} {{edge_id: $edge_id}}]->()
            DELETE edge
            RETURN count(edge)
          $cypher$,
          $1::ag_catalog.agtype
        ) AS (deleted ag_catalog.agtype)
        """,
        params,
    )
