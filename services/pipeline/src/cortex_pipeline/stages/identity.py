"""Stage 1: validate the identity envelope and stamp the correlation context."""

from __future__ import annotations

from cortex_shared import IdentityContext, RetrievalRequest


def run(req: RetrievalRequest) -> IdentityContext:
    if not req.identity.principal:
        raise ValueError("identity.principal is required")
    if not req.identity.tenant:
        raise ValueError("identity.tenant is required")
    return req.identity
