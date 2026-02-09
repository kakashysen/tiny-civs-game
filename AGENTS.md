# AGENTS.md

## Purpose
This file defines how contributors should work in `tiny-civs-game` so changes stay consistent, testable, and easy to review.

## Project Context
- Stack: Electron + Node.js (ESM) + Three.js + Vitest.
- Entry points:
  - Main process: `desktop/main/index.js`
  - Preload bridge: `desktop/preload/index.js`
  - Renderer: `desktop/renderer/renderer.js`
  - Simulation core: `simulation/engine.js`
- Shared contracts/constants live in `shared/`.

## Core Workflow
1. Understand the target behavior and impacted module(s).
2. Implement the smallest safe change.
3. Add or update tests for behavior changes (`tests/`).
4. Run quality checks:
   - `npm run lint`
   - `npm run test`
   - `npm run format`
5. Verify Electron app behavior when UI, IPC, or simulation loop logic changes (`npm run dev`).

## Code Standards
- Use modern ESM JavaScript (`type: module`).
- Keep functions focused and side effects explicit.
- Prefer pure functions in `simulation/` when possible; isolate I/O (files, IPC) in dedicated modules.
- Reuse shared constants from `shared/constants.js`; avoid hard-coded action strings and magic numbers.
- Keep IPC channels namespaced and stable (`sim:*` pattern).
- Do not import Node-only APIs into renderer code.

## Required Function Documentation
- Every function must be documented for clarity.
- Minimum requirement:
  - A JSDoc block for each exported function.
  - Parameter and return types defined with JSDoc.
- Internal helper functions should also be documented when behavior is non-trivial, mutates state, or has assumptions.
- If a function is intentionally simple enough to skip a long description, include at least concise param/return annotations.

## Testing Standards
- Add/adjust Vitest tests for any simulation behavior, game rule, or regression risk.
- Keep tests deterministic when possible.
- For randomized behavior, test outcomes through controlled branches or invariant checks.
- Prefer assertions on state transitions (tick changes, resources, extinction flags, milestone unlocks).

## Architecture Rules
- `simulation/` owns world-state transitions.
- `ai/providers/` decides actions; it should not directly mutate world state.
- `desktop/main/` orchestrates app lifecycle, ticking, snapshot cadence, and IPC handlers.
- `desktop/preload/` is the only bridge surface exposed to renderer (`window.tinyCivs`).
- `desktop/renderer/` handles presentation and user input only.

## Change Management
- Keep PRs/slices small and reviewable.
- Update docs when behavior or contracts change.
- Preserve backward compatibility for IPC payload shapes unless a coordinated change is made.
- Never merge failing lint/tests.

## Documentation Expectations
- When adding new modules, include a short top-level summary comment if the module has orchestration logic.
- When adding new actions, update:
  - `shared/constants.js`
  - relevant simulation logic
  - tests covering the new behavior.
- Keep naming consistent with existing terms (`world`, `civling`, `tick`, `extinction`, `milestones`).
