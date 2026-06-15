import { describe, expect, it } from "vitest";
import type { ConceptListItem, RelationshipEdge } from "@cortex/shared";
import { buildGraphModel, labelVisibility, type TraverseData } from "./graph-model";

function concept(id: string, overrides: Partial<ConceptListItem> = {}): ConceptListItem {
  return {
    concept_id: id,
    tenant: "t",
    name: `name-${id}`,
    state: "confirmed",
    confidence: 1,
    aliases: [],
    symbol_id: null,
    symbol_kind: null,
    updated_at: "2026-01-01T00:00:00Z",
    tombstoned_at: null,
    ...overrides,
  };
}

function edge(from: string, to: string, overrides: Partial<RelationshipEdge> = {}): RelationshipEdge {
  return {
    edge_id: `${from}->${to}`,
    tenant: "t",
    type: "relates_to",
    from_concept_id: from,
    to_concept_id: to,
    state: "confirmed",
    confidence: 1,
    extractor_version: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    tombstoned_at: null,
    ...overrides,
  };
}

// A hub "h" connected to five leaves; one extra leaf-leaf edge.
function star(): TraverseData {
  return {
    nodes: ["h", "a", "b", "c", "d", "e"].map((id) => concept(id)),
    edges: [
      edge("h", "a"),
      edge("h", "b"),
      edge("h", "c"),
      edge("h", "d"),
      edge("h", "e"),
      edge("a", "b"),
    ],
  };
}

describe("buildGraphModel", () => {
  it("computes degree as distinct neighbour count", () => {
    const model = buildGraphModel(star(), "h");
    const byId = Object.fromEntries(model.nodes.map((n) => [n.id, n]));
    expect(byId.h.degree).toBe(5);
    expect(byId.a.degree).toBe(2); // h and b
    expect(byId.c.degree).toBe(1);
    expect(byId.h.isFocus).toBe(true);
    expect(byId.a.isFocus).toBe(false);
  });

  it("drops edges to unknown nodes and self-loops", () => {
    const model = buildGraphModel(
      {
        nodes: [concept("a"), concept("b")],
        edges: [edge("a", "b"), edge("a", "ghost"), edge("a", "a")],
      },
      "a",
    );
    expect(model.links).toHaveLength(1);
    expect(model.nodes.find((n) => n.id === "a")!.degree).toBe(1);
  });

  it("handles empty input", () => {
    const model = buildGraphModel({ nodes: [], edges: [] }, null);
    expect(model.nodes).toHaveLength(0);
    expect(model.links).toHaveLength(0);
  });
});

describe("labelVisibility", () => {
  const model = buildGraphModel(star(), "h");

  it("always labels the focused node", () => {
    const labels = labelVisibility(model, { focusId: "a", degreeThreshold: 99 });
    expect(labels.has("a")).toBe(true);
  });

  it("always labels core (high-degree) nodes", () => {
    const labels = labelVisibility(model, { focusId: null, degreeThreshold: 5 });
    expect(labels.has("h")).toBe(true); // degree 5
    expect(labels.has("c")).toBe(false); // degree 1
  });

  it("labels a selected node and its neighbours", () => {
    const labels = labelVisibility(model, { focusId: null, selectedId: "a", degreeThreshold: 99 });
    expect(labels.has("a")).toBe(true);
    expect(labels.has("h")).toBe(true); // neighbour
    expect(labels.has("b")).toBe(true); // neighbour
    expect(labels.has("c")).toBe(false);
  });

  it("labels hovered node neighbours dynamically", () => {
    const labels = labelVisibility(model, { focusId: null, hoverId: "c", degreeThreshold: 99 });
    expect(labels.has("c")).toBe(true);
    expect(labels.has("h")).toBe(true);
    expect(labels.has("a")).toBe(false);
  });

  it("labels everything when zoomed in past the threshold", () => {
    const labels = labelVisibility(model, { focusId: null, degreeThreshold: 99, zoom: 2 });
    expect(labels.size).toBe(model.nodes.length);
  });

  it("returns empty for an empty model", () => {
    const empty = buildGraphModel({ nodes: [], edges: [] }, null);
    expect(labelVisibility(empty, { focusId: "x", zoom: 9 }).size).toBe(0);
  });
});
