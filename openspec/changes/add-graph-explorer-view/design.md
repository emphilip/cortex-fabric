# Design — interactive graph explorer view

## Context

`/graph` is currently list-based (Concepts / Candidate review / Vocabulary). The pipeline's `GET /graph/traverse` already returns a concept's neighbourhood as `{nodes: ConceptListItem[], edges: RelationshipEdge[]}` with `depth` (1–4, default 2), optional `types` filter, and `include_candidates`. There is no full-graph export endpoint and everything is paginated/seeded by a concept id, so the view is necessarily a *local* graph that grows as the operator navigates — which matches Obsidian's local-graph behaviour.

## Goals

- See concepts and relationships as a force-directed graph.
- Navigate by clicking nodes (re-center / expand), like Obsidian.
- Always label "core" nodes; label a selected node's neighbours on demand; keep labels dynamic w.r.t. selection and zoom.
- Behaviour-preserving: existing tabs and the moderation workflows are untouched.

## Decisions

### D1 — Library: `react-force-graph-2d`
Use `react-force-graph-2d` (canvas renderer over `d3-force`). Rationale: built-in force simulation, canvas scales to the hundreds of nodes a depth-2/3 traversal yields (SVG degrades past ~200), and `nodeCanvasObject` / `linkCanvasObject` hooks give us full control over dynamic label drawing. 

**Alternatives considered:** raw `d3-force` + SVG (more bespoke code, slower at scale, but no canvas/jsdom friction); `cytoscape.js` (heavier, its own styling DSL); `sigma.js`/WebGL (overkill for this size). 

**Risks & mitigations:** (a) the package uses `window`/`canvas`, so it must be loaded via `next/dynamic` with `ssr: false`; (b) canvas isn't implemented in jsdom, so the visual component is *not* unit-tested — instead the pure data-shaping and label-visibility logic lives in a separate `graph-model.ts` module that **is** vitest-covered.

### D2 — Data source: local incremental traversal (global view out of scope)
Seed from a focused concept and expand on interaction. This change ships the **local walk only**; a global "whole graph" view is explicitly out of scope and may be revisited later. The page reads `?focus=<concept_id>`; if absent, it **auto-seeds** a default = the first `confirmed` concept from `listGraphConcepts({ state: "confirmed", limit: 1 })` (falling back to candidate, else an empty-state prompt to pick a concept). The client fetches `traverse(focus, depth, include_candidates)` and renders `{nodes, edges}`. Navigation walks the graph node by node (see D4 click behaviour). This mirrors Obsidian's local graph and respects the API's `candidate_limit = min(limit×10, 2000)` guard — we never attempt to load the whole graph at once.

### D3 — Dynamic labelling rules
"Core nodes always labelled; neighbours of a selected node labelled" is implemented as a pure function `labelVisibility(model, { focusId, selectedId, hoverId, degreeThreshold, zoom })` returning the set of node ids to label:
- the **focused** node is always labelled;
- a node is **"core"** — i.e. an L1/high-traffic concept that anchors visual navigation — and always labelled when its degree ≥ `degreeThreshold` (default 4) **or** when zoom exceeds a threshold (zoomed in → label everything in view). "Core" is defined purely by **connection degree** (the most-connected concepts), so the densest hubs of the knowledge base stay labelled at all zoom levels, giving humans stable landmarks;
- when a node is selected or hovered, that node **and its direct neighbours** are labelled;
- otherwise nodes are unlabelled (dot only).

Drawn in `nodeCanvasObject`; recomputed each frame from the current selection/hover/zoom, so labels are dynamic. This keeps the rule testable independent of canvas.

### D4 — Surface, click behaviour, and the full Obsidian interaction feel
Add a `map` tab to the existing `TABS` array in `graph/page.tsx` (Concepts / Candidate review / Vocabulary / **Map**). The existing three tabs and their server-rendered content are unchanged. The Map tab renders a client `GraphExplorer` (dynamic import). This honours the prior change's "existing pages restyled without behavioural change" requirement.

**Click does both**: a single click on a node simultaneously (a) re-centers the traversal on that concept — it becomes the new `focus`, URL updated, neighbourhood refetched — and (b) opens that concept's detail card (reusing the existing `ConceptDetail` / detail-panel rendering). Hover highlights a node and labels its direct neighbours without navigating.

**Full Obsidian interaction feel**: the simulation runs d3-force so nodes settle into a stable layout; nodes are **draggable** (drag pins/repositions), the canvas supports **pan and zoom (scroll/pinch)**, a **zoom-to-fit** centers the current neighbourhood after each refocus, and hover dims non-adjacent nodes/links to spotlight the local cluster. These come largely for free from `react-force-graph-2d` and are configured rather than hand-built.

### D5 — Component placement & the stories rule
The explorer is **route-local** under `src/app/graph/` (like the existing `GraphActions.tsx`), not `src/components/`, so it is exempt from the "every shared component needs a `*.stories.tsx`" rule — consistent with `GraphActions` precedent and avoiding canvas-in-Storybook concerns. Pure helpers go in `src/app/graph/graph-model.ts` with `graph-model.test.ts`. If any small presentational control is promoted to `src/components/` it will get a story.

### D6 — Confirmed vs candidate styling
Reuse the existing state colour convention (confirmed = emerald, candidate = amber, tombstoned excluded). Confirmed edges solid; candidate edges dashed/dimmed. An `Include candidates` toggle drives the `include_candidates` traverse param and persists in the URL. Colours read from the current theme (works in both dark and light per the shadcn/Tremor token setup).

## Open questions

- **Degree/zoom thresholds** for "core" labelling are starting heuristics (degree ≥ 4, zoom ≥ 1.5×) and may be tuned after we see real graphs; they are not load-bearing on the spec.
- **Depth control**: ship a depth selector (1–3) in the toolbar; default 2. Depth 4 is allowed by the API but omitted from the UI to keep neighbourhoods legible.
