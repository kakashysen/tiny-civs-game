# Developer Task Allocation - Real-Time Movement

## Purpose
Define clear ownership so multiple developers can implement the feature with minimal merge conflicts and controlled dependencies.

## Team Roles
- Developer A: Simulation contract and engine behavior
- Developer B: Renderer movement playback
- Developer C: IPC compatibility and integration validation
- Manager: Sequencing, review gates, and release decision

## Shared Rules
1. Do not change another developer's owned files unless explicitly agreed in writing.
2. Keep pull requests small and phase-scoped.
3. Every PR must pass:
- `npm run lint`
- `npm run test`
4. Follow `AGENTS.md` architecture boundaries and JSDoc requirements.
5. Treat Phase 1 contract as the source of truth for movement metadata.

## Ownership Matrix

### Developer A (Simulation Lead)
- Own files:
- `shared/types.js`
- `simulation/engine.js`
- `tests/simulation.test.js`
- Responsibilities:
- Implement and lock the generic gather-task contract.
- Implement phase progression and path-based movement in simulation.
- Migrate `gather_wood` to generic pipeline.
- Deliver deterministic tests for timing, phase transitions, and resource accounting.
- Deliverables:
- Merged PR for Phase 1 + Phase 2 + Phase 3 simulation scope.

### Developer B (Renderer Lead)
- Own files:
- `desktop/renderer/renderer.js`
- `desktop/renderer/styles.css`
- Responsibilities:
- Implement smooth interpolation of civling positions between ticks.
- Add optional movement debug visualization if needed (phase/path indicators).
- Keep existing panels and controls stable.
- Deliverables:
- Merged PR for Phase 4 renderer scope.

### Developer C (Integration Lead, Optional)
- Own files:
- `desktop/main/index.js`
- `desktop/preload/index.cjs` (only if interface additions are needed)
- Responsibilities:
- Keep IPC payload backward-compatible.
- Add only optional movement fields; avoid breaking existing payload shape.
- Validate end-to-end behavior and prepare integration notes.
- Deliverables:
- Merged PR for Phase 4 IPC/integration scope plus smoke validation checklist.

### Manager
- Responsibilities:
- Approve phase completion gates before next phase starts.
- Enforce merge order and ownership boundaries.
- Resolve cross-team API changes quickly.
- Deliverables:
- Signed checklist per phase and final go/no-go decision.

## Execution Sequence (Required)
1. Phase 1 contract PR (Developer A) must merge first.
2. Phase 2-3 simulation PR (Developer A) can proceed after Phase 1 merge.
3. Phase 4 renderer/IPC PRs (Developer B and C) start after Phase 1 merge; final merge after Phase 3 is green.
4. Phase 5 hardening can be split between A/B/C, coordinated by manager.

## Merge and Dependency Policy
- Hard dependency:
- Renderer work depends on finalized movement metadata contract.
- Soft dependency:
- IPC additions can be developed in parallel if they are additive only.
- Conflict hotspots:
- `simulation/engine.js`, `tests/simulation.test.js`, `desktop/renderer/renderer.js`
- Mitigation:
- Daily rebase on main branch.
- One owner per hotspot file.

## Phase Gates Checklist

### Gate 1 (after Phase 1)
- Generic metadata typedefs merged.
- Timing contract documented and tested.
- No runtime regression.

### Gate 2 (after Phase 2-3)
- No teleport behavior for `gather_wood`.
- Phase progression deterministic in tests.
- Resource updates occur only at correct phase boundaries.

### Gate 3 (after Phase 4)
- Smooth movement visible in app.
- Pause/resume/reset behavior stable.
- IPC remains backward-compatible.

### Gate 4 (after Phase 5)
- Edge-case test suite merged.
- Full checks pass (`lint`, `test`, `format`).
- Manager signs off for feature completion.
