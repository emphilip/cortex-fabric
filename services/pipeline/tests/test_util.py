from __future__ import annotations

from cortex_pipeline.util import estimate_tokens, hash_context


def test_estimate_tokens_zero_on_empty():
    assert estimate_tokens("") == 0


def test_estimate_tokens_monotonic():
    assert estimate_tokens("a" * 100) < estimate_tokens("a" * 200)


def test_hash_context_deterministic():
    a = [{"entity_id": "e1", "score": 0.5, "text": "hello"}]
    b = [{"entity_id": "e1", "score": 0.5, "text": "hello"}]
    assert hash_context(a) == hash_context(b)


def test_hash_context_order_sensitive():
    a = [
        {"entity_id": "e1", "score": 0.5, "text": "hello"},
        {"entity_id": "e2", "score": 0.4, "text": "world"},
    ]
    b = [
        {"entity_id": "e2", "score": 0.4, "text": "world"},
        {"entity_id": "e1", "score": 0.5, "text": "hello"},
    ]
    assert hash_context(a) != hash_context(b)
