# admin-ui

## ADDED Requirements

### Requirement: Interactive graph exploration view

The `/graph` page SHALL provide a force-directed graph exploration view ("Map" tab) that renders concepts as nodes and relationships as edges, seeded from a focused concept and expandable by navigation. The view SHALL consume the existing `GET /graph/traverse` endpoint via the graph proxy and MUST NOT require any new pipeline route, schema, or wire-type change. The existing Concepts, Candidate review, and Vocabulary tabs and their behaviour MUST remain unchanged.

#### Scenario: Map tab renders the focused neighbourhood

- **WHEN** an operator opens `/graph?tab=map` with a `focus` concept id (or a default seed when none is given)
- **THEN** the client calls `GET /graph/traverse` for that concept and renders the returned `nodes` as a force-directed layout with `edges` drawn between them, labelled relationship by type

#### Scenario: Clicking a node re-centers the graph and opens its detail

- **WHEN** an operator clicks a node in the Map view
- **THEN** that concept becomes the new focus (reflected in the URL query), the traversal is refetched and re-rendered around it, AND the concept's detail card is shown, so the operator can both walk the graph node by node and inspect the selected concept

#### Scenario: Obsidian-style interaction

- **WHEN** an operator interacts with the Map canvas
- **THEN** the layout settles via force simulation, nodes can be dragged, the canvas can be panned and zoomed, the view fits the current neighbourhood after a refocus, and hovering a node spotlights its local cluster

#### Scenario: Core nodes are always labelled

- **WHEN** the Map view renders any neighbourhood
- **THEN** the focused node and "core" nodes (degree at or above the core threshold) display their concept name label at all times

#### Scenario: A selected node's neighbours are labelled

- **WHEN** an operator selects or hovers a node
- **THEN** that node and its directly connected neighbour nodes display their name labels, and the labelling updates dynamically as the selection, hover, or zoom changes

#### Scenario: Candidate inclusion is toggleable and visually distinct

- **WHEN** an operator toggles "include candidates"
- **THEN** the traversal is refetched with `include_candidates` set accordingly, and candidate concepts/edges are rendered with a visually distinct style (e.g. amber / dashed) from confirmed ones in both light and dark themes

#### Scenario: Empty or unreachable graph degrades gracefully

- **WHEN** there is no concept to focus on, or the traverse request fails or returns no nodes
- **THEN** the Map view shows a clear empty/error state (e.g. a prompt to pick a concept) instead of a blank canvas or an unhandled error
