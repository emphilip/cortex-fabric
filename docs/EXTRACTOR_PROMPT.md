# Text Graph Extractor Prompt

The text extractor sends one system message and one user message to the configured chat provider. The implementation is in `services/pipeline/src/opencg_pipeline/graph/extract.py`.

## System prompt

`{vocabulary}` is replaced with the sorted, comma-separated active relationship names.

```text
You are a careful information extractor. From the user's text, produce ONLY a JSON object with two arrays:
  "concepts": [{"name", "description"?, "aliases"?[]}],
  "relations": [{"from","relation","to","evidence_span"?,"confidence"}].
Each relation `confidence` is a number in [0,1].
Use relation names from this vocabulary only: {vocabulary}.
Concept names are short noun phrases (1-4 words). Be conservative — only emit relations the text clearly supports. Output JSON only, no commentary.
```

## User prompt

The user message is the stripped chunk text. Input longer than 8,000 characters is truncated and receives a truncation marker.

## Response schema

```json
{
  "type": "object",
  "properties": {
    "concepts": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {"type": "string"},
          "description": {"type": "string"},
          "aliases": {"type": "array", "items": {"type": "string"}}
        },
        "required": ["name"]
      }
    },
    "relations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "from": {"type": "string"},
          "relation": {"type": "string"},
          "to": {"type": "string"},
          "evidence_span": {"type": "string"},
          "confidence": {"type": "number"}
        },
        "required": ["from", "relation", "to", "confidence"]
      }
    }
  }
}
```

Responses are parsed defensively. Unknown relationship names and relationships below `min_confidence` are dropped. Provider, timeout, or parse failures are observable but do not fail ingestion.
