# Tiny Civs Memory Bank

Last updated: 2026-02-15

## 1) Project At A Glance
- Stack: Electron + Node.js ESM + Three.js + Vitest.
- Goal: run a tiny civilization simulation with AI-assisted decision making and visualize world state in real time.
- Core ownership boundaries:
  - `simulation/`: world-state transitions and game rules execution.
  - `ai/providers/`: action decision strategy only (no direct world mutation).
  - `desktop/main/`: app lifecycle, tick loop, IPC orchestration, snapshot cadence.
  - `desktop/preload/`: safe renderer bridge (`window.tinyCivs`).
  - `desktop/renderer/`: UI + Three.js rendering + user controls.

## 2) Runtime Entry Points
- Main process: `desktop/main/index.js`
- Preload bridge: `desktop/preload/index.cjs`
- Renderer: `desktop/renderer/renderer.js`
- Simulation engine: `simulation/engine.js`
- Shared constants/contracts: `shared/constants.js`, `shared/types.js`, `shared/gameRules.js`

## 3) Main Runtime Flow
1. Electron starts `desktop/main/index.js`.
2. Config is loaded via `readConfig()` from env + defaults.
3. AI provider is created via `createProvider(config)`.
4. Initial world is created with `createInitialWorldState`.
5. Renderer requests initial state via `sim:get-state`.
6. Tick loop (`tickOnce`) runs every `SIM_TICK_MS`:
   - calls `runTick(world, providerDecisionFn, { onDecision })`
   - persists snapshots every `SIM_SNAPSHOT_EVERY_TICKS` or on extinction
   - emits `sim:tick` payload to renderer.
7. On extinction:
   - simulation stops
   - run metadata is archived in history
   - optional auto-restart after `SIM_RESTART_DELAY_MS`.

## 4) Stable IPC Contract
Exposed through `window.tinyCivs` in preload:
- `getState()` -> `sim:get-state`
- `setCivlingCount(count)` -> `sim:set-civling-count`
- `start()` -> `sim:start`
- `resume()` -> `sim:resume`
- `pause()` -> `sim:pause`
- `stop()` -> `sim:stop`
- `reset()` -> `sim:reset`
- `onTick(handler)` subscribes to `sim:tick`

`sim:tick` and `sim:get-state` payload shape (built in `buildSimPayload`):
- `world`
- `provider`
- `shelterCapacityPerUnit`
- `runHistory`
- `thoughtLog`
- `llmExchangeLog`
- `desiredCivlingCount`
- `movement`:
  - `tickIntervalMs`
  - `lastTickStartedAtMs`
  - `lastTickCompletedAtMs`
  - `lastTickDurationMs`
  - `publishedTick`
  - `serverNowMs`

## 5) Simulation Model Notes
- Tick/time constants live in `shared/constants.js` (`TIME.MINUTES_PER_TICK`, day/night boundaries, etc.).
- Actions and values are centrally defined in `shared/constants.js` (`ACTIONS`, `ACTION_VALUES`, `ACTION_DURATION_MINUTES`).
- Rules are loaded from `config/game_rules.jsonc` merged with defaults in `shared/gameRules.js`.
- World supports physical coordinates with bounded map (`GAME_RULES.world.width/height`).
- Pathing uses Manhattan BFS in `simulation/engine.js` and avoids blocked structures.
- Forest wood is finite and regrows via pending regrowth queue.

## 6) Generic Task Pipeline (Current Focus)
- Engine supports multi-phase tasks (not just instant actions).
- Gather-wood uses a phase contract (from tests and engine behavior):
  - `travel_to_source`
  - `work_at_source`
  - `travel_to_dropoff`
  - `deposit_output`
- Task metadata tracks:
  - source/dropoff descriptors
  - explicit paths
  - work remaining
  - output yield/carried amount
- Movement is deterministic and non-teleporting across ticks (validated by tests).

## 7) AI Provider Architecture
- Factory: `ai/providerFactory.js`
- Modes:
  - `deterministic` (default)
  - `local_api`
  - `local_api` with hybrid escalation when `AI_ESCALATION_MODE=hybrid`
- Hybrid escalation criteria (`ai/providers/hybridProvider.js`):
  - extinction risk civling
  - repeated recent blocked actions
  - periodic innovation pulse (every 25 ticks)
- Local API provider supports timeout + retry config.

## 8) Configuration Surface (Env)
Defined by `shared/config.js`:
- Simulation:
  - `SIM_TICK_MS`
  - `SIM_SNAPSHOT_EVERY_TICKS`
  - `SIM_MAX_CIVLINGS`
  - `SIM_AUTO_RESTART`
  - `SIM_RESTART_DELAY_MS`
- AI:
  - `AI_PROVIDER`
  - `LOCAL_LLM_BASE_URL`
  - `LOCAL_LLM_MODEL`
  - `LOCAL_LLM_API_KEY`
  - `AI_DECISION_TIMEOUT_MS`
  - `AI_MAX_RETRIES`
  - `AI_ESCALATION_MODE`
  - `AI_MAX_CALLS_PER_HOUR`

## 9) Testing And Quality Gates
- Test runner: Vitest (`tests/*.test.js`)
- Lint/format: ESLint + Prettier
- Standard checks:
  - `npm run lint`
  - `npm run test`
  - `npm run format`
- High-value regression file: `tests/simulation.test.js` (time, tasks, movement, resources, milestones).

## 10) Where To Edit By Task
- Add/change action semantics:
  - `shared/constants.js`
  - `simulation/engine.js`
  - `tests/simulation.test.js`
- Add/adjust game rule knobs:
  - `config/game_rules.jsonc`
  - `shared/gameRules.js`
  - tests that assert resulting behavior
- Modify AI behavior:
  - `ai/providers/*.js`
  - `ai/providerFactory.js`
  - `tests/localApiProvider.test.js` / `tests/hybridProvider.test.js`
- Change renderer visualization/interpolation:
  - `desktop/renderer/renderer.js`
  - `desktop/renderer/styles.css`
  - IPC payload fields in `desktop/main/index.js` if needed
- Change bridge/API surface:
  - `desktop/preload/index.cjs`
  - `desktop/main/index.js`
  - renderer calls

## 11) Current Roadmap Context
- Active planning artifacts live in `plans/real-time-movement/`.
- Roadmap is structured in phases:
  - phase 01: generic task pipeline contract
  - phase 02: generic engine progression
  - phase 03: migrate gather wood
  - phase 04: IPC + renderer playback
  - phase 05: extensibility + hardening

## 12) Non-Negotiable Conventions
- Reuse shared constants; avoid magic action strings.
- Keep IPC channels stable and namespaced (`sim:*`).
- Do not import Node-only APIs into renderer.
- Keep simulation deterministic where practical and covered by tests.
- Keep payload shape backward compatible unless intentionally coordinated.

## 13) Fast Context Prompt (For Future LLM Sessions)
Use this when starting a coding session:

```text
You are working on tiny-civs-game (Electron + Node ESM + Three.js + Vitest).
Read MEMORY_BANK.md first, then only open files relevant to the requested change.
Respect module ownership:
- simulation/ mutates world
- ai/providers chooses actions only
- desktop/main owns tick loop + IPC
- desktop/preload exposes window.tinyCivs
- desktop/renderer handles UI/render only
Before finishing: run npm run lint, npm run test, npm run format.
```
