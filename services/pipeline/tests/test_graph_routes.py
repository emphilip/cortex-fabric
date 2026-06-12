from __future__ import annotations

from datetime import datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient
from hive_mind_shared import HiveMindConfig

from hive_mind_pipeline.graph import routes


def _concept(concept_id: str = "c1", state: str = "confirmed") -> dict:
    now = datetime(2026, 6, 12)
    return {
        "concept_id": concept_id,
        "tenant": "default",
        "name": f"Concept {concept_id}",
        "state": state,
        "confidence": 0.9,
        "aliases": [],
        "symbol_id": None,
        "symbol_kind": None,
        "updated_at": now,
        "tombstoned_at": None,
    }


def _edge(edge_id: str = "e1", state: str = "confirmed") -> dict:
    now = datetime(2026, 6, 12)
    return {
        "edge_id": edge_id,
        "tenant": "default",
        "type": "depends_on",
        "from_concept_id": "c1",
        "to_concept_id": "c2",
        "state": state,
        "confidence": 0.9,
        "extractor_version": "test",
        "created_at": now,
        "updated_at": now,
        "tombstoned_at": None,
    }


class FakeGraph:
    last: tuple[str, dict] | None = None
    concept_result: dict | None
    traverse_result: dict | None

    def __init__(self) -> None:
        self.concept_result = {
            **_concept(),
            "dedupe_key": "concept c1",
            "description": None,
            "extractor_version": "test",
            "source_entity_id": None,
            "created_at": datetime(2026, 6, 12),
            "neighbours_confirmed": [],
            "neighbours_candidate": [],
        }
        self.traverse_result = {
            "nodes": [_concept("c1"), _concept("c2")],
            "edges": [_edge()],
        }

    async def list_vocabulary(self):
        return [
            {
                "name": "depends_on",
                "description": "dependency",
                "inverse": None,
                "directed": True,
                "deprecated_at": None,
            }
        ]

    async def list_concepts(self, **kwargs):
        self.last = ("list_concepts", kwargs)
        return [_concept()], 1

    async def get_concept(self, **kwargs):
        self.last = ("get_concept", kwargs)
        return self.concept_result

    async def list_edges(self, **kwargs):
        self.last = ("list_edges", kwargs)
        return [_edge(state="candidate")], 1

    async def traverse(self, **kwargs):
        self.last = ("traverse", kwargs)
        return self.traverse_result


def _client(graph: FakeGraph | None = None) -> tuple[TestClient, FakeGraph]:
    app = FastAPI()
    app.include_router(routes.router)
    app.state.cfg = HiveMindConfig()
    fake = graph or FakeGraph()
    app.state.graph = fake
    return TestClient(app), fake


def test_list_vocabulary():
    client, _ = _client()
    response = client.get("/graph/vocab")
    assert response.status_code == 200
    assert response.json()["items"][0]["name"] == "depends_on"


def test_list_concepts_parses_filters():
    client, graph = _client()
    response = client.get(
        "/graph/concepts",
        params={"state": "candidate,confirmed", "search": "prompt", "limit": 10},
    )
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert graph.last == (
        "list_concepts",
        {
            "tenant": "default",
            "states": ["candidate", "confirmed"],
            "search": "prompt",
            "include_tombstoned": False,
            "limit": 10,
            "offset": 0,
        },
    )


def test_list_concepts_rejects_invalid_state():
    client, _ = _client()
    response = client.get("/graph/concepts", params={"state": "unknown"})
    assert response.status_code == 400


def test_get_concept_detail_and_not_found():
    graph = FakeGraph()
    client, _ = _client(graph)
    response = client.get("/graph/concepts/c1")
    assert response.status_code == 200
    assert response.json()["concept_id"] == "c1"

    graph.concept_result = None
    response = client.get("/graph/concepts/missing")
    assert response.status_code == 404


def test_list_candidate_edges():
    client, graph = _client()
    response = client.get(
        "/graph/edges",
        params={"state": "candidate", "type": "depends_on", "limit": 20},
    )
    assert response.status_code == 200
    assert response.json()["items"][0]["state"] == "candidate"
    assert graph.last == (
        "list_edges",
        {
            "tenant": "default",
            "state": "candidate",
            "relationship_type": "depends_on",
            "limit": 20,
            "offset": 0,
        },
    )


def test_traverse_and_concept_not_found():
    graph = FakeGraph()
    client, _ = _client(graph)
    response = client.get(
        "/graph/traverse",
        params={
            "concept_id": "c1",
            "types": "depends_on,mentions",
            "depth": 2,
            "include_candidates": True,
        },
    )
    assert response.status_code == 200
    assert len(response.json()["nodes"]) == 2
    assert graph.last == (
        "traverse",
        {
            "tenant": "default",
            "concept_id": "c1",
            "types": ["depends_on", "mentions"],
            "depth": 2,
            "limit": 50,
            "include_candidates": True,
        },
    )

    graph.traverse_result = None
    response = client.get("/graph/traverse", params={"concept_id": "missing"})
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "concept_not_found"


def test_traverse_enforces_caps():
    client, _ = _client()
    assert client.get(
        "/graph/traverse", params={"concept_id": "c1", "depth": 5}
    ).status_code == 422
    assert client.get(
        "/graph/traverse", params={"concept_id": "c1", "limit": 201}
    ).status_code == 422
