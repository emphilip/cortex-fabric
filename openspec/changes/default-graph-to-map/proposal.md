# Make the Map the default view of the /graph page

## Why

The graph explorer (Map) is the most useful entry point for understanding the knowledge graph — it shows shape and lets operators navigate spatially. Today `/graph` lands on the Concepts list and the operator must click into the Map. Making Map the default surfaces the highest-value view first.

## What changes

- When `/graph` is opened with no `tab` query parameter, the **Map** view renders by default instead of Concepts.
- The Concepts, Candidate review, and Vocabulary tabs remain reachable via their tab links and behave identically; only the default landing tab changes.

## Capabilities

- `admin-ui` — modifies the "Interactive graph exploration view" requirement to make Map the default graph view.

## Impact

- One-line change to the default tab resolution in `services/admin-ui/src/app/graph/page.tsx`.
- No new dependencies, routes, schemas, or wire types. The server-side default-seed resolution already runs for the Map tab.
