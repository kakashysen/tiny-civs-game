# Phase 5 - Extensibility and Hardening

## Goal
Prove generic reuse and cover high-risk edge cases before extending features.

## Scope
1. Add one additional gather-style adapter pattern (or test fixture) to validate reuse.
2. Add edge-case tests in `tests/simulation.test.js`:
- unreachable source
- full dropoff
- source depletion during task
- civling death during task
3. Update technical docs in `tiny_civs_implementation_tech_plan.md` with the generic gather pipeline contract.

## Out of Scope
- Production rollout of multiple new resource systems
- AI strategy changes

## Validation Gate
1. Run:
- `npm run lint`
- `npm run test`
- `npm run format`
2. Manual smoke run with local API provider:
- set `AI_PROVIDER=local_api` in `.env`
- run `npm run dev`
3. Reviewer sign-off that gather pipeline is reusable and stable.
