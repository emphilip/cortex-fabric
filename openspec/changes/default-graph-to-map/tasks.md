# Tasks — default-graph-to-map

## Phase 1 — Implement

- [x] 1.1 In `services/admin-ui/src/app/graph/page.tsx`, change the default tab resolution from `params.tab || "concepts"` to default to `"map"`.

## Phase 2 — Verify

- [x] 2.1 `pnpm --filter @hive-mind/admin-ui build` succeeds.
- [x] 2.2 Rebuild the admin-ui compose image; confirm `/graph` (no query) lands on the Map and the other three tabs are still reachable.
- [x] 2.3 Commit and archive the change.
