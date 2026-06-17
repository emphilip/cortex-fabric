## Context

Sidebar nav order lives in `NAV_ITEMS` in `services/admin-ui/src/components/Sidebar.tsx`; the graph tab order lives in the `TABS` array in `services/admin-ui/src/app/graph/page.tsx`. Both are plain arrays rendered in order. The admin-ui spec's "App shell with sidebar navigation" requirement names the sidebar order, so the change is spec-affecting.

## Goals / Non-Goals

**Goals:** reorder the sidebar to Overview, Graph, Vectors, Entities, Queries, Ingestion; make Map the first graph tab.

**Non-Goals:** no nesting/merging of pages, no route changes, no change to the default-view logic, no styling or behaviour changes.

## Decisions

### Decision: Reorder arrays only

Reorder the `NAV_ITEMS` and `TABS` array literals; nothing else changes. The Map-default behaviour is driven by `tab = params.tab || "map"`, which is independent of tab-array order, so it is unaffected. `Sidebar.test.tsx`'s order assertion is updated to the new sequence.

*Alternative considered:* nest Graph as a child of Overview. Rejected — the requested order lists Graph as a sibling top-level item, and there is no sub-navigation model in the shell.

## Risks / Trade-offs

- **Stale test expectation** on nav order → update `Sidebar.test.tsx` in the same change.

## Migration Plan

Pure presentational reorder. No data or route migration; rollback is reverting the commit.

## Open Questions

None.
