import { app, BrowserWindow, ipcMain } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createInitialWorldState, runTick } from '../../simulation/engine.js';
import { writeSnapshot } from '../../simulation/snapshotStore.js';
import { readConfig } from '../../shared/config.js';
import { GAME_RULES } from '../../shared/gameRules.js';
import { createProvider } from '../../ai/providerFactory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
  process.loadEnvFile('.env');
} catch {
  // Ignore when .env does not exist or cannot be parsed.
}

const config = readConfig();
const provider = createProvider(config);
const DEFAULT_CIVLING_COUNT = Math.min(4, config.SIM_MAX_CIVLINGS);

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {NodeJS.Timeout | null} */
let ticker = null;
/** @type {NodeJS.Timeout | null} */
let restartTimer = null;
let tickInFlight = false;
/** @type {Array<{runId: string, ticks: number, milestones: number, cause: string|null, restartCount: number}>} */
let runHistory = [];
/** @type {Array<{runId: string, tick: number, civlingId: string, civlingName: string, action: string, reason: string, source: string, fallback: boolean}>} */
let thoughtLog = [];
/** @type {Array<{runId: string, tick: number, civlingId: string, civlingName: string, prompt: string, response: string, status: string}>} */
let llmExchangeLog = [];
/** @type {Array<{runId: string, tick: number, civlingId: string, civlingName: string, eventType: 'health_loss'|'death'|'hunger_spike', action: string, reason: string, summary: string, healthDelta: number, energyDelta: number, hungerDelta: number, weather: string, phase: string, memory: string}>} */
let diagnosticsLog = [];
let desiredCivlingCount = DEFAULT_CIVLING_COUNT;
let lastTickStartedAtMs = null;
let lastTickCompletedAtMs = null;
let lastTickDurationMs = null;

let world = createInitialWorldState({ civlingCount: desiredCivlingCount });

function sanitizeCivlingCount(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return desiredCivlingCount;
  }
  return Math.max(1, Math.min(config.SIM_MAX_CIVLINGS, parsed));
}

function rendererPath() {
  return join(__dirname, '../renderer/index.html');
}

function runsDir() {
  return join(app.getPath('userData'), 'data', 'runs');
}

function pushThought(entry) {
  thoughtLog = [entry, ...thoughtLog].slice(0, 250);
}

function pushLlmExchange(entry) {
  llmExchangeLog = [entry, ...llmExchangeLog].slice(0, 150);
}

function pushDiagnostic(entry) {
  diagnosticsLog = [entry, ...diagnosticsLog].slice(0, 500);
}

/**
 * Captures lightweight civling vitals snapshot for post-tick diagnostics.
 * @param {import('../../shared/types.js').WorldState} state
 */
function snapshotCivlingVitals(state) {
  return new Map(
    state.civlings.map((civling) => [
      civling.id,
      {
        status: civling.status,
        health: civling.health,
        energy: civling.energy,
        hunger: civling.hunger,
        starvationTicks: civling.starvationTicks ?? 0,
        lastStarvationStage: civling.lastStarvationStage ?? 'normal',
        memory: civling.memory[civling.memory.length - 1] ?? ''
      }
    ])
  );
}

/**
 * Appends diagnostics entries from per-tick civling deltas.
 * @param {import('../../shared/types.js').WorldState} state
 * @param {Map<string, {status: string, health: number, energy: number, hunger: number, starvationTicks: number, lastStarvationStage: string, memory: string}>} beforeById
 * @param {Map<string, {action: string, reason: string}>} decisionById
 */
function collectTickDiagnostics(state, beforeById, decisionById) {
  for (const civling of state.civlings) {
    const before = beforeById.get(civling.id);
    if (!before) {
      continue;
    }
    const healthDelta =
      Math.round((civling.health - before.health) * 100) / 100;
    const energyDelta =
      Math.round((civling.energy - before.energy) * 100) / 100;
    const hungerDelta =
      Math.round((civling.hunger - before.hunger) * 100) / 100;
    const decision = decisionById.get(civling.id);
    const action = decision?.action ?? civling.currentTask?.action ?? 'none';
    const decisionReason = decision?.reason ?? 'no_decision_recorded';
    let diagnosticReason = decisionReason;
    const latestMemory =
      civling.memory[civling.memory.length - 1] ?? before.memory;
    const starvationStage = civling.lastStarvationStage ?? 'normal';
    if (starvationStage === 'severe') {
      diagnosticReason = 'starvation_severe';
    }
    if (starvationStage === 'critical') {
      diagnosticReason = 'starvation_critical';
    }
    if (starvationStage === 'collapse') {
      diagnosticReason = `starvation_collapse_tick_${civling.starvationTicks ?? 0}`;
    }

    if (healthDelta < 0) {
      pushDiagnostic({
        runId: state.runId,
        tick: state.tick,
        civlingId: civling.id,
        civlingName: civling.name,
        eventType: 'health_loss',
        action,
        reason: diagnosticReason,
        summary: `${civling.name} lost ${Math.abs(healthDelta)} health.`,
        healthDelta,
        energyDelta,
        hungerDelta,
        weather: state.environment.weather,
        phase: state.time.phase,
        memory: latestMemory
      });
    }

    if (before.status !== 'dead' && civling.status === 'dead') {
      const starvationDeath =
        starvationStage === 'collapse' &&
        (civling.starvationTicks ?? 0) >=
          GAME_RULES.survival.starvationDeathTicks;
      pushDiagnostic({
        runId: state.runId,
        tick: state.tick,
        civlingId: civling.id,
        civlingName: civling.name,
        eventType: 'death',
        action,
        reason: starvationDeath
          ? 'starvation_death_after_grace'
          : diagnosticReason,
        summary: starvationDeath
          ? `${civling.name} died after starvation collapse grace period (hunger=${Math.round(civling.hunger)}).`
          : `${civling.name} died (health=${Math.round(civling.health)}, hunger=${Math.round(civling.hunger)}).`,
        healthDelta,
        energyDelta,
        hungerDelta,
        weather: state.environment.weather,
        phase: state.time.phase,
        memory: latestMemory
      });
      continue;
    }

    if (hungerDelta >= 10) {
      pushDiagnostic({
        runId: state.runId,
        tick: state.tick,
        civlingId: civling.id,
        civlingName: civling.name,
        eventType: 'hunger_spike',
        action,
        reason: decisionReason,
        summary: `${civling.name} hunger spiked by ${hungerDelta}.`,
        healthDelta,
        energyDelta,
        hungerDelta,
        weather: state.environment.weather,
        phase: state.time.phase,
        memory: latestMemory
      });
    }
  }
}

/**
 * Builds additive movement metadata for renderer interpolation and debugging.
 * @returns {{
 *  tickIntervalMs: number,
 *  lastTickStartedAtMs: number|null,
 *  lastTickCompletedAtMs: number|null,
 *  lastTickDurationMs: number|null,
 *  publishedTick: number,
 *  serverNowMs: number
 * }}
 */
function buildMovementPayload() {
  return {
    tickIntervalMs: config.SIM_TICK_MS,
    lastTickStartedAtMs,
    lastTickCompletedAtMs,
    lastTickDurationMs,
    publishedTick: world.tick,
    serverNowMs: Date.now()
  };
}

/**
 * Creates the stable IPC envelope for simulation state responses.
 * @param {Record<string, unknown>} [extra]
 * @returns {Record<string, unknown>}
 */
function buildSimPayload(extra = {}) {
  return {
    world,
    provider: config.AI_PROVIDER,
    shelterCapacityPerUnit: GAME_RULES.shelter.capacityPerUnit,
    runHistory,
    thoughtLog,
    llmExchangeLog,
    diagnosticsLog,
    desiredCivlingCount,
    movement: buildMovementPayload(),
    ...extra
  };
}

function sendTick(extra = {}) {
  mainWindow?.webContents.send('sim:tick', buildSimPayload(extra));
}

function archiveCurrentRun() {
  runHistory = [
    {
      runId: world.runId,
      ticks: world.tick,
      milestones: world.milestones.length,
      cause: world.extinction.cause,
      restartCount: world.restartCount
    },
    ...runHistory
  ].slice(0, 12);
}

function restartCivilization() {
  const nextRestartCount = world.restartCount + 1;
  world = createInitialWorldState({
    civlingCount: desiredCivlingCount,
    restartCount: nextRestartCount
  });
  lastTickStartedAtMs = null;
  lastTickCompletedAtMs = null;
  lastTickDurationMs = null;
  sendTick();
}

async function tickOnce() {
  if (tickInFlight) {
    return;
  }
  tickInFlight = true;
  const tickStartedAt = Date.now();
  lastTickStartedAtMs = tickStartedAt;

  try {
    const beforeById = snapshotCivlingVitals(world);
    const decisionById = new Map();
    world = await runTick(
      world,
      async (civling, state) => {
        const decision = await provider.decideAction(civling, state);
        return {
          ...decision,
          source: decision?.source ?? config.AI_PROVIDER
        };
      },
      {
        onDecision: (entry) => {
          pushThought({
            runId: world.runId,
            tick: entry.tick,
            civlingId: entry.civlingId,
            civlingName: entry.civlingName,
            action: entry.action,
            reason: entry.reason,
            source: entry.source,
            fallback: entry.fallback
          });
          decisionById.set(entry.civlingId, {
            action: entry.action,
            reason: entry.reason
          });
          if (entry.llmTrace) {
            pushLlmExchange({
              runId: world.runId,
              tick: entry.tick,
              civlingId: entry.civlingId,
              civlingName: entry.civlingName,
              prompt: entry.llmTrace.prompt,
              response: entry.llmTrace.response,
              status: entry.llmTrace.status
            });
          }
        }
      }
    );
    collectTickDiagnostics(world, beforeById, decisionById);

    if (
      world.tick % config.SIM_SNAPSHOT_EVERY_TICKS === 0 ||
      world.extinction.ended
    ) {
      await writeSnapshot(runsDir(), world);
    }

    sendTick();

    if (world.extinction.ended) {
      stopSimulation();
      archiveCurrentRun();

      if (config.SIM_AUTO_RESTART) {
        restartTimer = setTimeout(() => {
          restartCivilization();
          startSimulation();
        }, config.SIM_RESTART_DELAY_MS);
      }
    }
  } finally {
    lastTickCompletedAtMs = Date.now();
    lastTickDurationMs = Math.max(0, lastTickCompletedAtMs - tickStartedAt);
    tickInFlight = false;
  }
}

function startSimulation() {
  if (ticker) {
    return;
  }

  void tickOnce().catch((error) => {
    console.error('tickOnce failed:', error);
    sendTick({ error: 'Tick failed. Check provider configuration.' });
    stopSimulation();
  });

  ticker = setInterval(() => {
    void tickOnce().catch((error) => {
      console.error('tickOnce failed:', error);
      sendTick({ error: 'Tick failed. Check provider configuration.' });
      stopSimulation();
    });
  }, config.SIM_TICK_MS);
}

function stopSimulation() {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  if (!ticker) {
    return;
  }
  clearInterval(ticker);
  ticker = null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  void mainWindow.loadFile(rendererPath());
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle('sim:get-state', () => buildSimPayload());
  ipcMain.handle('sim:set-civling-count', (_event, count) => {
    desiredCivlingCount = sanitizeCivlingCount(count);
    if (!ticker) {
      world = createInitialWorldState({
        civlingCount: desiredCivlingCount,
        restartCount: world.restartCount
      });
      thoughtLog = [];
      llmExchangeLog = [];
      diagnosticsLog = [];
      lastTickStartedAtMs = null;
      lastTickCompletedAtMs = null;
      lastTickDurationMs = null;
    }
    return buildSimPayload();
  });
  ipcMain.handle('sim:start', () => {
    startSimulation();
    return { started: true };
  });
  ipcMain.handle('sim:resume', () => {
    startSimulation();
    return { resumed: true };
  });
  ipcMain.handle('sim:pause', () => {
    stopSimulation();
    return { paused: true };
  });
  ipcMain.handle('sim:stop', () => {
    stopSimulation();
    return { stopped: true };
  });
  ipcMain.handle('sim:reset', () => {
    stopSimulation();
    world = createInitialWorldState({ civlingCount: desiredCivlingCount });
    runHistory = [];
    thoughtLog = [];
    llmExchangeLog = [];
    diagnosticsLog = [];
    lastTickStartedAtMs = null;
    lastTickCompletedAtMs = null;
    lastTickDurationMs = null;
    return buildSimPayload();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
