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
let desiredCivlingCount = DEFAULT_CIVLING_COUNT;

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

function sendTick(extra = {}) {
  mainWindow?.webContents.send('sim:tick', {
    world,
    provider: config.AI_PROVIDER,
    shelterCapacityPerUnit: GAME_RULES.shelter.capacityPerUnit,
    runHistory,
    thoughtLog,
    llmExchangeLog,
    desiredCivlingCount,
    ...extra
  });
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
  sendTick();
}

async function tickOnce() {
  if (tickInFlight) {
    return;
  }
  tickInFlight = true;

  try {
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

  ipcMain.handle('sim:get-state', () => ({
    world,
    provider: config.AI_PROVIDER,
    shelterCapacityPerUnit: GAME_RULES.shelter.capacityPerUnit,
    runHistory,
    thoughtLog,
    llmExchangeLog,
    desiredCivlingCount
  }));
  ipcMain.handle('sim:set-civling-count', (_event, count) => {
    desiredCivlingCount = sanitizeCivlingCount(count);
    if (!ticker) {
      world = createInitialWorldState({
        civlingCount: desiredCivlingCount,
        restartCount: world.restartCount
      });
      thoughtLog = [];
      llmExchangeLog = [];
    }
    return {
      world,
      provider: config.AI_PROVIDER,
      shelterCapacityPerUnit: GAME_RULES.shelter.capacityPerUnit,
      runHistory,
      thoughtLog,
      llmExchangeLog,
      desiredCivlingCount
    };
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
    return {
      world,
      provider: config.AI_PROVIDER,
      shelterCapacityPerUnit: GAME_RULES.shelter.capacityPerUnit,
      runHistory,
      thoughtLog,
      llmExchangeLog,
      desiredCivlingCount
    };
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
