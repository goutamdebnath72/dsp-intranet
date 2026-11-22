# src/records: the umbrella over the intranet's own records

The plan is `docs/QUERY_UMBRELLA_PLAN.md`. This folder is its first, hybrid build: **nothing that existed was removed.** The old paths (the model router, the SQL writer, the PAX, hospital and holiday engines, the circular search) all stay and still decide when the selection is **Everything**.

- `types.ts`, `domains.ts`: the fixed selections (People, PAX, Hospital OPD, Holidays, Degrees, Circulars & Notices) and, for People, its three facets (Name or number, Department & designation, Ask in words). Adding a selection is one entry in `domains.ts` plus its engine call in `src/lib/nl2sql/omnibar.ts`.
- `scope.ts`: which answer paths run under each selection (a chosen selection runs only its own, and says "nothing found" instead of falling through to the circulars).
- `plan.ts`, `collisions.ts`: the pure planner and its register of clashes. Hints and the shadow log only: it never routes a line unless the reader chose a selection.
- `records.selftest.ts`: the checks (run `npx tsx --tsconfig tsconfig.selftest.json src/records/records.selftest.ts </dev/null`).

Shared files name no domain; only `domains.ts` lists them.
