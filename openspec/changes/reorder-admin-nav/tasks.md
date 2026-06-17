## 1. Reorder navigation

- [x] 1.1 Reorder `NAV_ITEMS` in `src/components/Sidebar.tsx` to Overview, Graph, Vectors, Entities, Queries, Ingestion (keep each item's href + icon)
- [x] 1.2 Reorder `TABS` in `src/app/graph/page.tsx` so Map is first, then Concepts, Candidate review, Vocabulary; confirm the default-view logic (`params.tab || "map"`) is unchanged

## 2. Tests and verification

- [x] 2.1 Update/confirm `Sidebar.test.tsx` asserts the new nav order; add an assertion that Graph is the second item
- [x] 2.2 Run `pnpm --filter @cortex/admin-ui test` and `pnpm -r build`
- [x] 2.3 Run `openspec validate reorder-admin-nav --strict`, scan staged changes for secrets, commit, and push
