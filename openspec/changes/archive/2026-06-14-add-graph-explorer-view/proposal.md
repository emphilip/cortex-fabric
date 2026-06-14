# Add an interactive graph explorer view to the admin UI

## Why

The `/graph` page today is list-and-table only: Concepts, Candidate review, Vocabulary. Operators can read a concept's neighbours one detail card at a time, but they cannot *see* the shape of the knowledge graph or navigate it spatially. An Obsidian-style force-directed view makes relationships legible at a glance and lets an operator walk the graph by clicking from node to node — far faster than paging through lists.

The pipeline already exposes everything we need: `GET /graph/traverse?concept_id=&depth=&types=&include_candidates=` returns `{nodes, edges}` for a concept's neighbourhood. This change is presentation-only — a new client-rendered visualization tab plus one read-only API client wrapper. No pipeline routes, schemas, or data contracts change.

## What changes

- Add a **"Map"** tab to `/graph` rendering a force-directed graph of concepts (nodes) and relationships (edges).
- Seed the view from a focused concept (`?focus=<concept_id>`); clicking a node re-centers traversal on it, expanding the visible neighbourhood dynamically.
- **Dynamic labelling**: the focused node and high-degree "core" nodes are always labelled; selecting/hovering a node additionally labels its direct neighbours. Labels respond to selection and zoom.
- Distinguish confirmed vs candidate concepts/edges by colour and stroke, with a toggle to include candidates.
- Add a `traverseGraph()` client API function and use the existing graph proxy passthrough.
- Add the force-layout dependency (`react-force-graph-2d`, d3-force + canvas).

## Capabilities

- `admin-ui` — new requirement: interactive graph exploration view.

## Impact

- **New deps**: `react-force-graph-2d` (+ its d3-force transitive deps) in `services/admin-ui`.
- **Affected**: `services/admin-ui/src/app/graph/` (new tab + client explorer + model helpers), `src/lib/api.ts` (+`traverseGraph`). Existing tabs and all behaviour unchanged.
- **No** changes to pipeline, proxy contract, DB, or wire types (consumes existing `TraverseResponse`).
- Client-only rendering (dynamic import, `ssr: false`); canvas is excluded from unit tests — pure model/label helpers are tested instead.
