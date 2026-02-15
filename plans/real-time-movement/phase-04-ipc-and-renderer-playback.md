# Phase 4 - IPC and Renderer Playback

## Goal
Visualize movement continuously in the renderer using stable tick payloads.

## Scope
1. Keep `sim:tick` channel stable in `desktop/main/index.js`; add optional movement fields only.
2. Add interpolation cache in `desktop/renderer/renderer.js`:
- previous position
- current position
- interpolation progress tied to `SIM_TICK_MS`
3. Add optional debug UI for phase/path progress if needed for validation.

## Out of Scope
- Major renderer redesign
- New simulation rules

## Validation Gate
1. Manual `npm run dev` checks:
- smooth movement
- no jump flicker
- pause/resume/reset correctness
2. Run:
- `npm run lint`
- `npm run test`
3. Confirm old clients/panels still work with added optional payload fields.
