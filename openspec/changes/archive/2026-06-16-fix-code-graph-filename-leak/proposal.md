## Why

The git connector hands the ingestion runner only a file's **body** plus its **repo-relative path** (`doc.metadata["path"]`, e.g. `evals/checks.py`); it never exposes an on-disk location. graphifyy, however, operates on a file path and derives every node label and per-symbol id from that path's stem. So `_extract_code` writes each code file to a randomly-named `NamedTemporaryFile` (`/tmp/tmpnfv6rtq0.py`) and feeds that to graphifyy — leaking the tempfile stem into the catalog and graph:

- Code-graph module/file nodes are named `tmpnfv6rtq0.py` instead of `evals/checks.py`.
- Catalog symbol ids become `tmpq9ufpyo0_add` instead of `checks_add`, so chunk titles read `evals/checks.py :: tmpq9ufpyo0_add`.

Because `path = Path(doc.metadata["path"])` is **relative**, `path.exists()` is always false for git ingests, so this fallback fires for *every* code file — not an edge case. Worse, the random stem makes `symbol_id` non-deterministic, which flows into the symbol chunk's `uuid5(_SYMBOL_NS, "{parent}:{symbol_id}")` entity id: **re-ingesting an unchanged file produces new chunk ids every run**, violating the knowledge-graph spec's idempotency guarantee and accumulating duplicate chunks.

## What Changes

- Re-materialise each code file under its **true repo-relative path** inside a per-file temp directory (`<tmpdir>/evals/checks.py`) before invoking graphifyy and `chunk_code_by_symbols`, so node labels and symbol ids derive from the real filename.
- Remove the random `NamedTemporaryFile` shape; clean up the per-file temp directory after extraction.
- Restore deterministic, idempotent symbol-chunk ids: two ingests of the same file produce identical `symbol_id` and chunk `entity_id` values.
- No change to `chunk_code_by_symbols`'s signature, `graph_writer`, dependencies, APIs, or compose.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `knowledge-graph`: code-graph node names and per-symbol ids MUST derive from the source file's repo-relative path, never a transient or randomly-named filesystem path; re-ingesting an unchanged file MUST reproduce identical `symbol_id` and symbol-chunk `entity_id` values.

## Impact

- **Code**: `services/ingestion/src/cortex_ingestion/pipeline_runner.py` — `_extract_code` re-materialisation logic (and a small path-materialisation helper). No signature changes elsewhere.
- **Data**: graphs ingested before this fix carry temp-stem names; correcting them requires a re-ingest. The currently-loaded banking knowledge base will need one re-ingest after the fix to display real filenames.
- **Tests**: ingestion unit tests asserting (a) node/symbol names reflect the real repo-relative path and (b) symbol ids are stable across two extractions of the same body.
- **No** dependency, API, compose, or migration changes.
