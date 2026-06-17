## MODIFIED Requirements

### Requirement: App shell with sidebar navigation

The admin UI SHALL present a persistent left sidebar containing the product name, navigation links in the order **Overview, Graph, Vectors, Entities, Queries, Ingestion**, each with a lucide icon, an active-route highlight, and the theme toggle. On narrow viewports the sidebar SHALL collapse into a toggleable drawer. The previous inline-styled horizontal header is removed.

#### Scenario: Navigation links appear in the defined order

- **WHEN** the sidebar renders
- **THEN** its navigation links appear top-to-bottom as Overview, Graph, Vectors, Entities, Queries, Ingestion

#### Scenario: Active route is highlighted

- **WHEN** an operator is on `/entities`
- **THEN** the sidebar renders the Entities item in its active state and all other items in their inactive state

#### Scenario: Sidebar collapses on narrow viewports

- **WHEN** the viewport is narrower than the configured breakpoint
- **THEN** the sidebar is hidden behind a menu button that opens it as a drawer

## ADDED Requirements

### Requirement: Graph page tab order

The `/graph` page's tab bar SHALL list its tabs in the order **Map, Concepts, Candidate review, Vocabulary**, so the Map (the default view) is the first tab. Reordering the tab bar MUST NOT change which view is the default for `/graph` with no `tab` query parameter (Map remains the default).

#### Scenario: Map is the first graph tab

- **WHEN** an operator opens the `/graph` page
- **THEN** the tab bar lists Map first, followed by Concepts, Candidate review, and Vocabulary
- **AND** opening `/graph` with no `tab` query parameter still renders the Map view by default
