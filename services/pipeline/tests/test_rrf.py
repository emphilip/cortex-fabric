from __future__ import annotations

from opencg_pipeline.stages.hybrid_retrieval import reciprocal_rank_fusion


def test_rrf_combines_rankings():
    scores = reciprocal_rank_fusion([["a", "b", "c"], ["b", "a", "d"]])
    # 'a' is rank 0 in list 1 and rank 1 in list 2; 'b' is the opposite.
    # Both should score identically and beat c, d.
    assert scores["a"] == scores["b"]
    assert scores["a"] > scores["c"]
    assert scores["a"] > scores["d"]


def test_rrf_single_list():
    scores = reciprocal_rank_fusion([["x", "y"]])
    assert scores["x"] > scores["y"]
