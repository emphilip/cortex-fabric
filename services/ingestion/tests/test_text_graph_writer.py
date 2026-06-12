from __future__ import annotations

import pytest

from hive_mind_ingestion import text_graph_writer
from hive_mind_ingestion.text_graph_writer import write_text_graph
from hive_mind_pipeline.storage.catalog import CatalogStore
from hive_mind_shared import ExtractionResult


class _Tx:
    def __init__(self, conn: "_Conn") -> None:
        self._conn = conn

    async def __aenter__(self) -> "_Conn":
        self._conn.tx_started = True
        return self._conn

    async def __aexit__(self, exc_type, exc, tb) -> None:
        self._conn.tx_finished = True
        self._conn.rolled_back = exc_type is not None


class _Conn:
    def __init__(self) -> None:
        self.statements: list[tuple[str, tuple[object, ...]]] = []
        self.tx_started = False
        self.tx_finished = False
        self.rolled_back = False

    async def execute(self, sql: str, *args: object) -> None:
        self.statements.append((sql, args))

    def transaction(self) -> _Tx:
        return _Tx(self)


class _Acquire:
    def __init__(self, conn: _Conn) -> None:
        self._conn = conn

    async def __aenter__(self) -> _Conn:
        return self._conn

    async def __aexit__(self, *exc: object) -> None:
        return None


class _Pool:
    def __init__(self, conn: _Conn) -> None:
        self._conn = conn

    def acquire(self) -> _Acquire:
        return _Acquire(self._conn)


def _catalog(conn: _Conn) -> CatalogStore:
    catalog = CatalogStore("postgresql://unused")
    catalog._pool = _Pool(conn)  # type: ignore[assignment]
    return catalog


def _result() -> ExtractionResult:
    return ExtractionResult.model_validate(
        {
            "concepts": [
                {
                    "name": " Prompt   Caching ",
                    "description": "Caches model prompts.",
                    "aliases": ["prompt cache"],
                },
                {"name": "Token Store"},
            ],
            "relations": [
                {
                    "from": "Prompt Caching",
                    "relation": "depends_on",
                    "to": "Token Store",
                    "evidence_span": "Prompt caching depends on the token store.",
                    "confidence": 0.9,
                }
            ],
        }
    )


@pytest.mark.asyncio
async def test_writes_normalized_concepts_edge_evidence_and_age():
    conn = _Conn()
    concepts, edges = await write_text_graph(
        catalog=_catalog(conn),
        tenant="default",
        chunk_entity_id="chunk-1",
        result=_result(),
        extractor_version="text-extractor/gemma3:4b",
    )

    assert (concepts, edges) == (2, 1)
    concept_insert = next(
        args
        for sql, args in conn.statements
        if "INSERT INTO hive_mind.concept" in sql
    )
    assert concept_insert[3] == "prompt caching"
    assert concept_insert[5] == ["prompt cache"]
    assert any("ag_catalog.cypher" in sql for sql, _ in conn.statements)
    assert any(
        "INSERT INTO hive_mind.relationship_evidence" in sql
        for sql, _ in conn.statements
    )
    assert conn.tx_started and conn.tx_finished and not conn.rolled_back


@pytest.mark.asyncio
async def test_invalid_vocabulary_name_rolls_back_transaction():
    conn = _Conn()
    result = _result()
    result.relations[0].relation = "not-valid"

    with pytest.raises(ValueError, match="invalid AGE edge label"):
        await write_text_graph(
            catalog=_catalog(conn),
            tenant="default",
            chunk_entity_id="chunk-1",
            result=result,
            extractor_version="text-extractor/test",
        )

    assert conn.rolled_back


@pytest.mark.asyncio
async def test_age_failure_rolls_back_transaction(monkeypatch):
    conn = _Conn()

    async def fail_age(*args, **kwargs):
        raise RuntimeError("AGE unavailable")

    monkeypatch.setattr(text_graph_writer, "reflect_edge", fail_age)

    with pytest.raises(RuntimeError, match="AGE unavailable"):
        await write_text_graph(
            catalog=_catalog(conn),
            tenant="default",
            chunk_entity_id="chunk-1",
            result=_result(),
            extractor_version="text-extractor/test",
        )

    assert conn.rolled_back
