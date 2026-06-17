## 1. Path materialisation

- [x] 1.1 Add a helper in `pipeline_runner.py` that, given `doc.body` and the repo-relative path, sanitises the relative path (strip leading `/`, drop `..` segments, fall back to basename/`doc.title` if empty) and writes the body under `<TemporaryDirectory>/<relative path>`, creating parent dirs; returns the on-disk path and owns the temp dir for cleanup
- [x] 1.2 Rewrite `_extract_code` to use the helper: if `path.is_absolute()` and `path.exists()`, pass it through unchanged; otherwise materialise under the real relative path. Remove the random `NamedTemporaryFile` branch
- [x] 1.3 Ensure the temp directory is always cleaned up — wrap extraction in the `TemporaryDirectory` context so success, the graphifyy-failure fallback (`return chunk_text(...)`), and exceptions all release it
- [x] 1.4 Confirm `chunk_code_by_symbols`'s module-node filter (`path.stem + path.suffix`) still matches now that the path carries the real basename — no change expected, verify by test

## 2. Tests

- [x] 2.1 Unit test: a code file whose path does not exist on disk is extracted under its real basename — assert the module/file node label is the real filename and no node label or `symbol_id` contains a `tmp`-prefixed random stem
- [x] 2.2 Unit test: extracting the same `(body, relative_path)` twice yields identical `symbol_id`s, and the derived `uuid5(_SYMBOL_NS, ...)` chunk `entity_id`s are equal across runs (idempotency)
- [x] 2.3 Unit test: the temp directory created during materialisation does not exist after `_extract_code` returns, on both the success and graphifyy-failure paths
- [x] 2.4 Unit test: a relative path containing `..` is sanitised so the write stays inside the temp directory

## 3. Verification

- [x] 3.1 Run `uv run --package cortex-ingestion --extra test python -m pytest services/ingestion/tests` and `uv run --package cortex-pipeline --extra test python -m pytest services/pipeline/tests`
- [ ] 3.2 _DEFERRED (operator decision): Re-ingest the banking knowledge base against a cleared catalog + Qdrant collection; confirm the `/graph` Map view shows real filenames (`evals/checks.py`) and no `tmp*.py` nodes, and that `cortex.concept` has zero rows matching `^tmp[a-z0-9]+\.py$`. Behaviour is proven by the unit tests in `test_code_path_materialisation.py` (which reproduced the bug in RED); the live re-ingest is deferred until the operator re-loads the corpus.
- [ ] 3.3 _DEFERRED (operator decision): Re-ingest the same repo a second time and confirm symbol-chunk `entity_id` counts are unchanged (idempotent upsert, no duplicate rows). Idempotency is covered by `test_extract_code_symbol_ids_are_stable`.
- [x] 3.4 Run `openspec validate fix-code-graph-filename-leak --strict`, scan staged changes for secrets, commit, and push
