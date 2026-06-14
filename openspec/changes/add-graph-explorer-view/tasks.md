# Tasks — add-graph-explorer-view

## Phase 1 — Data layer

- [ ] 1.1 Add `traverseGraph(params: { conceptId: string; depth?: number; types?: string; includeCandidates?: boolean })` to `services/admin-ui/src/lib/api.ts`, returning `TraverseResponse` ({ nodes, edges }) via the existing graph proxy (`/api/proxy/graph/traverse`).
- [ ] 1.2 Confirm `TraverseResponse`, `ConceptListItem`, `RelationshipEdge` are exported from `@hive-mind/shared` and imported by the client (no new wire types).

## Phase 2 — Graph model + label logic (pure, tested)

- [ ] 2.1 Create `src/app/graph/graph-model.ts`: `buildGraphModel({ nodes, edges }, focusId)` → adjacency + degree map + force-graph data shape; and `labelVisibility(model, { focusId, selectedId, hoverId, degreeThreshold, zoom })` → `Set<conceptId>`.
- [ ] 2.2 Create `src/app/graph/graph-model.test.ts`: cover degree computation, focused-node-always-labelled, core-threshold labelling, selected/hover neighbour labelling, and empty-input handling.

## Phase 3 — Explorer component

- [ ] 3.1 Add `react-force-graph-2d` to `services/admin-ui/package.json`; `pnpm install`.
- [ ] 3.2 Create `src/app/graph/GraphExplorer.tsx` ("use client"): dynamic-import the force graph (`ssr: false`), fetch via `traverseGraph`, render nodes/edges, depth selector (1–3, default 2), and an "include candidates" toggle (URL-persisted). Wire **click = both** (re-center URL `focus` + open the concept detail card) and hover = spotlight + label neighbours.
- [ ] 3.3 Configure the full Obsidian feel: force simulation settling, draggable nodes, pan/zoom, zoom-to-fit after refocus, hover dimming of non-adjacent nodes/links.
- [ ] 3.4 Draw dynamic labels in `nodeCanvasObject` using `labelVisibility` (core = high-degree always-on); style confirmed vs candidate (emerald/solid vs amber/dashed) reading theme tokens; ensure legibility in light and dark.
- [ ] 3.5 Empty/error state when no focus concept or traverse fails (prompt to pick a concept).

## Phase 4 — Wire into the page

- [ ] 4.1 Add a `{ value: "map", label: "Map" }` entry to `TABS` in `src/app/graph/page.tsx`.
- [ ] 4.2 Render `GraphExplorer` for the `map` tab; pass the default seed concept id (first confirmed, fallback candidate) resolved server-side; leave the other three tabs and the detail view untouched.

## Phase 5 — Verify

- [ ] 5.1 `pnpm --filter @hive-mind/admin-ui test` (graph-model tests pass; existing suites green).
- [ ] 5.2 `pnpm --filter @hive-mind/admin-ui build` and `build-storybook` succeed.
- [ ] 5.3 Rebuild the admin-ui compose image; manually verify in a browser: Map tab renders, clicking re-centers, labels behave per spec, candidate toggle works, both themes legible.
- [ ] 5.4 `bash tests/smoke/run.sh` still PASSES (no regression).
- [ ] 5.5 Secret-scan staged diff; commit page-by-page; archive the change.
