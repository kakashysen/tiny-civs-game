# Phase 3 - Migrate Gather Wood

## Goal
Move `gather_wood` to the generic gather pipeline end-to-end.

## Scope
1. Refactor wood planning in `simulation/engine.js` to adapter-style helpers:
- source selection
- dropoff selection
- yield rules
2. Apply harvest and deposit effects only at proper phase boundaries.
3. Remove current teleport-style completion behavior for `gather_wood`.

## Out of Scope
- Adding new gather resource actions
- Renderer interpolation

## Validation Gate
1. Add regression tests in `tests/simulation.test.js`:
- no teleport behavior for `gather_wood`
- correct phase order
- correct resource accounting timing
2. Run:
- `npm run lint`
- `npm run test`
3. Confirm no behavior regression in existing non-gather actions.
