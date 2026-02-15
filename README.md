# Tiny Civs Game

Tiny Civs is an Electron desktop simulation where small AI-driven civlings gather resources, build structures, survive day/night cycles, and evolve over simulation ticks.

## Tech Stack
- Electron
- Node.js (ESM)
- Three.js
- Vitest

## Quick Start
Requirements:
- Node.js 20+ (recommended)
- npm

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

## Scripts
- `npm run dev` - start Electron app
- `npm run start` - start Electron app
- `npm run test` - run Vitest suite
- `npm run lint` - run ESLint
- `npm run format` - run Prettier check

## Project Structure
- `desktop/main/index.js` - Electron main process, ticking, IPC handlers
- `desktop/preload/index.cjs` - secure renderer bridge (`window.tinyCivs`)
- `desktop/renderer/renderer.js` - UI and Three.js world rendering
- `simulation/engine.js` - simulation world transitions and action/task progression
- `ai/` - provider selection and AI decision strategies
- `shared/` - constants, rules, config parsing, shared type contracts
- `tests/` - Vitest coverage for simulation and AI provider behavior

## Configuration
Environment variables are read from `.env` (or process env). Key settings include:
- `SIM_TICK_MS`
- `SIM_MAX_CIVLINGS`
- `SIM_SNAPSHOT_EVERY_TICKS`
- `AI_PROVIDER` (`deterministic` or `local_api`)
- `LOCAL_LLM_BASE_URL`
- `LOCAL_LLM_MODEL`

See:
- `.env.example`
- `shared/config.js`
- `config/game_rules.json`

## Development Notes
- Contributor workflow and coding standards: `AGENTS.md`
- Fast architecture/context snapshot for coding sessions: `MEMORY_BANK.md`

## Testing and Quality
Before merging changes:

```bash
npm run lint
npm run test
npm run format
```

