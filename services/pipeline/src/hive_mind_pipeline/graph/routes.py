"""Knowledge graph read and administration HTTP routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request
from hive_mind_shared import ConceptDetail, ConceptListItem, TraverseResponse

router = APIRouter(prefix="/graph", tags=["graph"])

_VALID_STATES = {"candidate", "confirmed", "tombstoned"}


def _csv(value: str | None) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]


@router.get("/vocab")
async def list_vocabulary(request: Request) -> dict:
    return {"items": await request.app.state.graph.list_vocabulary()}


@router.get("/concepts")
async def list_concepts(
    request: Request,
    state: str = "confirmed,candidate",
    search: str | None = None,
    include_tombstoned: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict:
    states = _csv(state)
    if any(item not in _VALID_STATES for item in states):
        raise HTTPException(status_code=400, detail="invalid concept state")
    rows, total = await request.app.state.graph.list_concepts(
        tenant=request.app.state.cfg.tenant,
        states=states,
        search=search,
        include_tombstoned=include_tombstoned,
        limit=limit,
        offset=offset,
    )
    return {
        "items": [ConceptListItem.model_validate(row) for row in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/concepts/{concept_id}", response_model=ConceptDetail)
async def get_concept(request: Request, concept_id: str) -> ConceptDetail:
    row = await request.app.state.graph.get_concept(
        tenant=request.app.state.cfg.tenant,
        concept_id=concept_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="concept not found")
    return ConceptDetail.model_validate(row)


@router.get("/edges")
async def list_edges(
    request: Request,
    state: str | None = None,
    type: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict:
    if state is not None and state not in _VALID_STATES:
        raise HTTPException(status_code=400, detail="invalid edge state")
    rows, total = await request.app.state.graph.list_edges(
        tenant=request.app.state.cfg.tenant,
        state=state,
        relationship_type=type,
        limit=limit,
        offset=offset,
    )
    return {"items": rows, "total": total, "limit": limit, "offset": offset}


@router.get("/traverse", response_model=TraverseResponse)
async def traverse(
    request: Request,
    concept_id: str,
    types: str | None = None,
    depth: int = Query(default=2, ge=1, le=4),
    limit: int = Query(default=50, ge=1, le=200),
    include_candidates: bool = False,
) -> TraverseResponse:
    try:
        result = await request.app.state.graph.traverse(
            tenant=request.app.state.cfg.tenant,
            concept_id=concept_id,
            types=_csv(types) or None,
            depth=depth,
            limit=limit,
            include_candidates=include_candidates,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "concept_not_found", "concept_id": concept_id},
        )
    return TraverseResponse.model_validate(result)
