## Context

`pipeline_runner._extract_code` must hand graphifyy a path on disk, but the git connector (`connectors/git.py`) reads each file's bytes into `GitDocument.body` and discards the clone location — the only path it keeps is the **repo-relative** string in `doc.metadata["path"]` (e.g. `evals/checks.py`). The runner reconstructs `path = Path(doc.metadata.get("path", doc.title))`, which is therefore relative; `path.exists()` is evaluated against the container CWD and is **always false** for git ingests.

The current fallback writes the body to a `NamedTemporaryFile("w", suffix=path.suffix)` — a random name like `/tmp/tmpnfv6rtq0.py`. graphifyy derives node labels and per-symbol ids from that path's stem, so the leak hits **every** code file:

- module/file node `tmpnfv6rtq0.py` instead of `checks.py`
- `symbol_id` `tmpq9ufpyo0_add` instead of `checks_add`
- non-deterministic `symbol_id` ⇒ non-deterministic `uuid5(_SYMBOL_NS, "{parent}:{symbol_id}")` chunk id ⇒ duplicate chunks on every re-ingest

This is a single-service, no-dependency fix isolated to the ingestion runner.

## Goals / Non-Goals

**Goals:**

- graphifyy node labels and `symbol_id`s derive from the file's real repo-relative path.
- The same `(body, relative_path)` yields identical `symbol_id`s on every run, restoring idempotent symbol-chunk ids.
- The fix is local to `_extract_code`; `chunk_code_by_symbols`, `graph_writer`, the catalog schema, APIs, and dependencies are untouched.
- Any temporary on-disk materialisation is always cleaned up, including on the graphifyy-failure fallback path.

**Non-Goals:**

- Reworking the connector/runner lifecycle so a real clone stays on disk (larger change; see Decision 1 alternatives).
- Disambiguating two different files that share the same basename — that depends on graphifyy's id shape and is a pre-existing concern, not introduced here (see Risks).
- Backfilling already-ingested graphs in place; correction is via a re-ingest.

## Decisions

### Decision 1: Materialise under the real repo-relative path, not a random temp name

In `_extract_code`, when no usable on-disk path exists, create a per-file `tempfile.TemporaryDirectory()` and write `doc.body` to `<tmpdir>/<sanitised relative path>` (creating parent directories), then pass that path to both `graphify.extract([...])` and `chunk_code_by_symbols(...)`. This reproduces the layout graphifyy would have seen from a real clone, so it derives correct, deterministic names. Wrap the whole extraction in the `TemporaryDirectory` context so cleanup is guaranteed on success, exception, and fallback.

**Alternatives considered:**

- *Keep the clone alive for the whole ingest and pass absolute clone paths.* Most faithful to graphifyy's design, but requires the connector to stop discarding the clone dir and the runner to hold it open across the async loop — a cross-cutting lifecycle change with more risk for a bug fix. Deferred; the materialisation approach is self-contained and fully corrects the symptom.
- *Patch/ask graphifyy to accept a logical name alongside in-memory content.* Out of our control (third-party), and `extract` is path-oriented.
- *Keep `NamedTemporaryFile` but rename its stem to the basename.* A single flat temp dir per file under the real basename works for the common case but encodes no parent directory, so it is strictly weaker than mirroring the relative path. Rejected in favour of the relative-path mirror.

### Decision 2: Prefer a real path when one is actually present

Guard as: if `path.is_absolute()` and `path.exists()`, pass it straight through (no copy); otherwise materialise under the sanitised relative path. Today the git connector always lands in the materialise branch, but this keeps the runner correct for any future connector that yields a genuine on-disk absolute path and avoids a needless copy when one exists.

### Decision 3: Sanitise the relative path before joining

Normalise `doc.metadata["path"]`: strip any leading `/`, reject or strip `..` segments, and fall back to `doc.title`/basename if the result is empty. This prevents a crafted path from escaping the temp directory and keeps the join inside `<tmpdir>`.

### Decision 4: Keep module-node filtering consistent

`chunk_code_by_symbols` already drops the module-level node by matching `path.stem + path.suffix`. Because we now pass a path whose basename equals the real filename, that filter keeps working unchanged — no edits needed there.

## Risks / Trade-offs

- **Two different files with the same basename** (e.g. two `__init__.py`) may still collapse to the same graphifyy module stem / symbol-id prefix, and `graph_writer` dedupes concepts on normalised name. → This collision is inherent to graphifyy's stem-based ids and predates this change (a real clone would hit it too). Mirroring the **relative** path (Decision 1) is the best available mitigation; fully disambiguating is out of scope and noted as an open question.
- **Per-file temp directory churn** adds one mkdir + write + rmtree per code file. → Negligible versus the embedding and chat calls already in the loop; the body is already in memory.
- **Symbol ids change for already-ingested repos.** Re-ingesting after the fix produces new (correct) `entity_id`s, so old temp-named symbol chunks/concepts are not updated in place — they linger until the data is cleared. → Acceptable; the operator re-ingests against a cleared store (the current banking KB will get one re-ingest).

## Migration Plan

1. Land the runner change behind no flag (pure correctness fix).
2. Re-ingest affected repos against a cleared catalog + Qdrant collection so code-graph nodes and symbol ids reflect real filenames.
3. **Rollback:** revert the commit; behaviour returns to the temp-name fallback. No schema or data migration is involved, so rollback is safe at any time.

## Open Questions

- Should a follow-up change adopt Decision 1's deferred alternative (keep the clone on disk for the whole ingest) to also let same-basename files disambiguate by full path? Tracked as a non-goal here; revisit if same-basename collisions show up in real repos.
