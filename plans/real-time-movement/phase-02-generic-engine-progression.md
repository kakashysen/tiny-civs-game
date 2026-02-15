# Phase 2 - Generic Engine Progression

## Goal
Execute gather-task phases deterministically in simulation with one shared progression engine.

## Scope
1. Add full path builder in `simulation/engine.js` (not distance-only).
2. Implement generic phase executor that:
- consumes `TIME.MINUTES_PER_TICK`
- advances path progress phase-by-phase
- transitions to next phase deterministically
3. Keep non-gather actions on current flow.

## Out of Scope
- Renderer motion smoothing
- IPC shape redesign

## Validation Gate
1. Add deterministic tests in `tests/simulation.test.js`:
- phase transitions
- time accounting
- path progression without teleport behavior inside gather flow
2. Run:
- `npm run lint`
- `npm run test`
3. Manual assertion from test logs that timer and phase states stay aligned.
