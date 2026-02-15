# Phase 1 - Generic Task Pipeline Contract

## Goal
Define one reusable gather-task model for current and future resources without changing renderer behavior.

## Scope
1. Add generic JSDoc typedefs in `shared/types.js`:
- phases: `travel_to_source`, `work_at_source`, `travel_to_dropoff`, `deposit_output`, `done`
- metadata: `source`, `dropoff`, `paths`, `workMinutesRemaining`, `yield`
2. Define timing contract:
- `totalTaskMinutes = travelToSource + work + travelToDropoff`
3. Keep runtime behavior unchanged in this phase.

## Out of Scope
- Renderer interpolation
- Teleport-removal changes
- Non-gather action refactors

## Validation Gate
1. Add/adjust tests in `tests/simulation.test.js` for generic timing math and metadata contract.
2. Run:
- `npm run lint`
- `npm run test`
3. Reviewer sign-off that contract is generic and not wood-specific.
