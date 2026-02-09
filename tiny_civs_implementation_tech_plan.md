# Tiny Civs Implementation Tech Plan

## 1) Objectives

- Deliver a playable, observable simulation MVP where 3-6 Civlings act autonomously.
- Keep architecture modular so AI provider, simulation rules, and rendering can evolve independently.
- Start simple (in-memory + JSON snapshots), then harden with test coverage and optional extra local providers.

## 2) Recommended Tech Stack

### Core Runtime

- Language: JavaScript (ES Modules)
- Runtime: Node.js 20 LTS
- Package manager: pnpm

### Desktop App + Visualization

- App shell: Electron
- Renderer UI: Vanilla JavaScript + HTML + CSS
- Rendering: Three.js (top-down 2D-style scene in WebGL)
- Why: Local macOS app experience, no React dependency, and flexible rendering.

### App Architecture

- Electron `main` process: simulation orchestration, local LLM integration, persistence
- Electron `renderer` process: world visualization, controls, metrics panels
- Electron `preload` bridge: secure IPC surface between renderer and main
- Transport: IPC channels (no HTTP server needed for MVP)

### AI Integration

- Primary: local LLM via API from Electron `main` process
- Local API options: Ollama or any OpenAI-compatible local endpoint
- Authentication: local runtime by default; optional API key only if local provider requires it
- Provider abstraction: `AIProvider` interface to support:
  - `LocalApiProvider` (default)
  - `DeterministicProvider` (testing/fallback)
  - `CodexCliProvider` (optional fallback)

### State & Persistence

- MVP: In-memory world state
- Snapshots: JSON files written periodically (per run) using Electron app data directory
- Future: SQLite for indexed run history and analytics

### Quality Tooling

- Lint: ESLint
- Format: Prettier
- Unit tests: Vitest
- Integration tests: Vitest + Electron test harness
- E2E (later): Playwright

## 3) Proposed Repository Structure

```txt
/desktop                 # Electron app (main, preload, renderer)
/simulation              # Pure tick engine, rules, lifecycle, events
/ai                      # Provider interface + prompt builders
/shared                  # Schemas, constants, utility modules
/data
  /runs                  # JSON snapshots and run outputs
```

## 4) Core Domain Model (MVP)

### Civling

- `id`, `name`
- `age`, `health`, `energy`, `hunger`
- `role` (generalist, gatherer, builder, thinker; start with 1 default role)
- `memory` (short action/event history)
- `status` (alive/dead)

### WorldState

- `tick`, `runId`, `restartCount`
- environment resources (food, wood, shelter capacity)
- discovered milestones (`fire`, `tools`, `shelter`, `agriculture`)
- civling list
- extinction metadata (if ended)

### Action Model

- Allowed action enum for each era (e.g., gather, build, explore, rest, teach)
- AI output must resolve to structured action JSON
- Main process validates action before applying

## 5) AI Decision Architecture

### Prompt Flow

1. Build Civling context packet (state + nearby world + goals + constraints)
2. Generate dynamic prompt with role/need/era/environment factors
3. Call local LLM API and request structured response (`action`, `reason`)
4. Validate with JSON schema (Ajv)
5. Fallback on invalid output (safe default action)

### Guardrails

- Hard action whitelist by era.
- Time budget per Civling decision.
- Retry once on malformed response, then fallback.
- Never allow model to mutate world directly; it only proposes action.

### Local LLM API Integration Contract (MVP)

- API calls live only in Electron `main`.
- Each Civling decision call includes:
  - `runId`, `tick`, `civlingId`
  - Prompt payload (compact JSON + instruction)
  - Timeout budget
- Parse response body into strict JSON action envelope.
- Capture timeout/error status codes for observability and fallback logic.

### Plan B: Hybrid Inference Engine (Cost/Latency Control)

- Default behavior: deterministic utility-based inference each tick (no LLM call).
- LLM escalation triggers only for high-impact events:
  - Era/milestone transition
  - Extinction-risk state
  - Repeated blocked plans
  - Scheduled global innovation pulse
- Enforce hard global budget (example: max calls/hour).
- When budget is exhausted or provider fails, continue deterministic-only mode.

## 6) Simulation Loop Implementation

1. Advance tick clock.
2. For each alive Civling:
   - Build decision context.
   - Get action from AI provider.
   - Validate and apply action.
3. Resolve resource updates + births/deaths.
4. Evaluate milestone unlocks and era progression.
5. Check extinction condition.
6. Emit tick events to renderer via IPC.
7. Snapshot state every N ticks.

## 7) Implementation Phases

### Phase 0 - Foundation (Week 1)

- Single repository setup with modular folders (`desktop`, `simulation`, `ai`, `shared`).
- Shared schemas and constants.
- Electron scaffold (main/preload/renderer) + Three.js scene bootstrap.
- CI basics: lint + unit tests.

### Phase 1 - Deterministic Simulation Core (Week 1-2)

- Build `simulation` tick engine with deterministic rule-based actions (no AI yet).
- Add extinction detection + restart counter.
- JSON snapshot writer.
- Minimal UI rendering of Civlings and resource counters.

### Phase 2 - Local LLM API Decisions (Week 2-3)

- Add `AIProvider` abstraction and `LocalApiProvider`.
- Dynamic prompt template system.
- Structured output validation + fallback path.
- Compare deterministic vs AI mode via config flag.

### Phase 3 - Evolution + Milestones (Week 3-4)

- Implement milestone unlock system and era-gated actions.
- Add memory effects (short history influences decision prompts).
- Add run summary panel (duration, milestones, extinction cause).

### Phase 4 - Observability + Experimentation (Week 4)

- Add run metrics panels and CSV/JSON export.
- Add A/B evaluation harness (provider comparison).
- Add benchmark script for tick latency and decision time.

### Phase 5 - Optional Local LLM (Post-MVP)

- Implement additional providers (`CodexCliProvider`, other local engines).
- Add provider selection and compatibility tests.

## 8) Engineering Guidelines

### Code Design

- Keep simulation engine pure and deterministic given seed + actions.
- Keep AI calls outside core simulation module (adapter boundary).
- Prefer small domain-focused modules over large service classes.

### SOLID + Clean Architecture

- Apply SOLID across modules:
  - Single Responsibility: each module/file owns one concern (rendering, simulation, AI integration, persistence).
  - Open/Closed: add providers and simulation rules through extension points, not invasive rewrites.
  - Liskov Substitution: all `AIProvider` implementations must be interchangeable by contract.
  - Interface Segregation: keep interfaces focused (`AIProvider`, `SnapshotStore`, `TickRunner`).
  - Dependency Inversion: high-level simulation orchestration depends on interfaces, not concrete provider clients.
- Follow Clean Architecture boundaries:
  - Entities: Civling and world domain models in `shared`/`simulation`.
  - Use cases: tick progression, action resolution, milestone unlocks in `simulation`.
  - Interface adapters: local LLM API adapter, file persistence adapter, IPC handlers in `ai` and `desktop/main`.
  - Frameworks/drivers: Electron and Three.js at the outer layer only.
- Dependency rule: inner layers never import outer layers (simulation must not depend on Electron/Three.js/provider API details).

### Type Safety

- Use JSDoc typedefs in core domain modules for clear contracts.
- Validate all external inputs (IPC payloads + AI outputs) with JSON schemas.
- Share schema and constants from `shared`; avoid duplicating contracts.

### Testing Strategy

- Unit test simulation rules and milestone transitions.
- Snapshot test run summaries for regression safety.
- Contract test AI response parsing/validation behavior.
- Add deterministic seed tests for repeatable runs.

### Reliability

- Timeouts and retry policies for local LLM API calls.
- Circuit breaker/fallback mode if provider degrades.
- Graceful handling of partial failures per tick.

### Performance Targets (MVP)

- Tick duration target: <700ms with 6 Civlings in local-LLM mode.
- UI render: 30+ FPS target for minimal Three.js scene.
- Snapshot write frequency tunable by config.

### Security & Ops

- Do not expose provider networking directly to renderer; use preload IPC whitelist only.
- Keep local provider endpoints configurable; never hardcode secrets in source.
- Log prompts/responses in redacted form when persisted.
- Add run-level IDs for traceability in logs.

## 9) Configuration Standards

- `SIM_TICK_MS`
- `SIM_SNAPSHOT_EVERY_TICKS`
- `SIM_MAX_CIVLINGS`
- `AI_PROVIDER` (`local_api` | `codex_cli` | `deterministic`)
- `LOCAL_LLM_BASE_URL`
- `LOCAL_LLM_MODEL`
- `LOCAL_LLM_API_KEY` (optional)
- `AI_DECISION_TIMEOUT_MS`
- `AI_MAX_RETRIES`
- `AI_MAX_CALLS_PER_HOUR`
- `AI_ESCALATION_MODE` (`always` | `hybrid`)
- `ELECTRON_DEVTOOLS` (`true` | `false`)

## 10) Definition of Done (MVP)

- A civilization runs end-to-end with 4-6 Civlings.
- AI-driven actions affect resources and survivability.
- Milestones unlock at least 4 progression states.
- Extinction triggers restart and increments counters.
- JSON snapshots + run summary available.
- App runs as local Electron desktop app on macOS.
- Test suite passes and core paths are covered.

## 11) Immediate Next Tasks

1. Create single-repo module scaffolding and baseline tooling.
2. Implement `Civling`, `WorldState`, and `Action` schemas in `shared`.
3. Build deterministic tick engine before plugging AI provider.
4. Add first dynamic prompt template + `LocalApiProvider` adapter in Electron main.
