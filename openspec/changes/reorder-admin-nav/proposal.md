## Why

The knowledge graph is the centrepiece of Cortex, but the sidebar lists Graph **last** and, within the graph page, the Map (the default view) is the **last** tab. The navigation should foreground the graph: put Graph directly under Overview and make Map the first graph tab.

## What Changes

- Reorder the sidebar navigation to: **Overview, Graph, Vectors, Entities, Queries, Ingestion** (was Overview, Queries, Vectors, Entities, Ingestion, Graph).
- Make **Map** the first tab on the `/graph` page's tab bar (was last), ahead of Concepts, Candidate review, and Vocabulary. Map remains the default view.
- No route, endpoint, behaviour, or component-API change — only ordering of existing nav links and tabs.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `admin-ui`: changes the sidebar navigation order and adds a graph tab-order requirement (Map first). No new routes or wire types.

## Impact

- **Code**: `services/admin-ui` only — `src/components/Sidebar.tsx` (`NAV_ITEMS` order) and `src/app/graph/page.tsx` (`TABS` order). The `Sidebar.test.tsx` order expectation is updated.
- **No** backend, pipeline, wire-type, or compose change.
