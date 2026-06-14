import type { ConceptListItem, RelationshipEdge } from "@hive-mind/shared";

export interface GraphNode {
  id: string;
  name: string;
  state: ConceptListItem["state"];
  degree: number;
  isFocus: boolean;
}

export interface GraphLink {
  source: string;
  target: string;
  type: string;
  state: RelationshipEdge["state"];
}

export interface GraphModel {
  nodes: GraphNode[];
  links: GraphLink[];
  adjacency: Map<string, Set<string>>;
}

export interface TraverseData {
  nodes: readonly ConceptListItem[];
  edges: readonly RelationshipEdge[];
}

// Build a force-graph-ready model from a traverse response. Degree is the
// number of distinct neighbours, so "core" labelling tracks how connected a
// concept is rather than how many parallel edges it has.
export function buildGraphModel(data: TraverseData, focusId: string | null): GraphModel {
  const ids = new Set(data.nodes.map((n) => n.concept_id));
  const adjacency = new Map<string, Set<string>>();
  for (const id of ids) adjacency.set(id, new Set());

  const links: GraphLink[] = [];
  for (const edge of data.edges) {
    const { from_concept_id: from, to_concept_id: to } = edge;
    if (!ids.has(from) || !ids.has(to) || from === to) continue;
    adjacency.get(from)!.add(to);
    adjacency.get(to)!.add(from);
    links.push({ source: from, target: to, type: edge.type, state: edge.state });
  }

  const nodes: GraphNode[] = data.nodes.map((n) => ({
    id: n.concept_id,
    name: n.name,
    state: n.state,
    degree: adjacency.get(n.concept_id)!.size,
    isFocus: n.concept_id === focusId,
  }));

  return { nodes, links, adjacency };
}

export interface LabelContext {
  focusId: string | null;
  selectedId?: string | null;
  hoverId?: string | null;
  degreeThreshold?: number;
  zoom?: number;
  zoomLabelAll?: number;
}

// Decide which node ids show a name label. Pure so it can be unit-tested
// without a canvas; the component calls it every frame from current state.
export function labelVisibility(model: GraphModel, ctx: LabelContext): Set<string> {
  const ids = new Set(model.nodes.map((n) => n.id));
  const result = new Set<string>();
  if (ids.size === 0) return result;

  const { zoom, zoomLabelAll = 1.5 } = ctx;
  if (zoom !== undefined && zoom >= zoomLabelAll) {
    for (const id of ids) result.add(id);
    return result;
  }

  const degreeThreshold = ctx.degreeThreshold ?? 4;

  // Focused node is always labelled.
  if (ctx.focusId && ids.has(ctx.focusId)) result.add(ctx.focusId);

  // Core (high-degree / L1) nodes are always labelled.
  for (const node of model.nodes) {
    if (node.degree >= degreeThreshold) result.add(node.id);
  }

  // A selected or hovered node labels itself and its direct neighbours.
  for (const anchor of [ctx.selectedId, ctx.hoverId]) {
    if (!anchor || !ids.has(anchor)) continue;
    result.add(anchor);
    for (const neighbour of model.adjacency.get(anchor) ?? []) result.add(neighbour);
  }

  return result;
}
