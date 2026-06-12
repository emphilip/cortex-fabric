## MODIFIED Requirements

### Requirement: Per-stage token accounting

Token accounting attributes MUST continue to be emitted for every model invocation, but this change MODIFIES the `graph_extract` stage label set: the single `graph_extract` label proposed in `add-knowledge-graph` is replaced by two distinct labels, **`graph_extract_text`** and **`graph_extract_code`**.

- `graph_extract_text` MUST be used when the LLM extractor runs (markdown, plain text, future PDF / HTML / MDX). Token counters and OTel attributes MUST be emitted as before.
- `graph_extract_code` MUST be used for graphifyy invocations. Token counters MUST NOT be incremented for this label (graphifyy makes no model calls). An OTel span with `stage="graph_extract_code"`, `model="graphifyy"`, `provider="graphifyy"`, `tokens_in=0`, `tokens_out=0`, and `latency_ms` MUST still be emitted so the stage is observable in traces.

#### Scenario: Code extraction emits a token-zero span

- **WHEN** the ingestion service runs graphifyy on a Python file
- **THEN** an OTel span named `pipeline.graph_extract_code` is emitted with `model="graphifyy"`, `provider="graphifyy"`, `tokens_in=0`, `tokens_out=0`, and `latency_ms` set
- **AND** `hive_mind_tokens_total{stage="graph_extract_code"}` is NOT incremented

#### Scenario: Text extraction continues to count tokens

- **WHEN** the LLM extractor runs on a markdown chunk
- **THEN** an OTel span named `pipeline.graph_extract_text` is emitted with the chat model's `model`, `provider`, `tokens_in`, `tokens_out`, and `latency_ms`
- **AND** `hive_mind_tokens_total{stage="graph_extract_text"}` increases by the recorded counts
