import { app, BrowserWindow, ipcMain } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createInitialWorldState, runTick } from '../../simulation/engine.js';
import { writeSnapshot } from '../../simulation/snapshotStore.js';
import { readConfig } from '../../shared/config.js';
import { createProvider } from '../../ai/providerFactory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = readConfig();
const provider = createProvider(config);

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {NodeJS.Timeout | null} */
let ticker = null;
/** @type {NodeJS.Timeout | null} */
let restartTimer = null;
/** @type {Array<{runId: string, ticks: number, milestones: number, cause: string|null, restartCount: number}>} */
let runHistory = [];

let world = createInitialWorldState({ civlingCount: Math.min(4, config.SIM_MAX_CIVLINGS) });

function rendererPath() {
  return join(__dirname, '../renderer/index.html');
}

function runsDir() {
  return join(app.getPath('userData'), 'data', 'runs');
}

function sendTick() {
  mainWindow?.webContents.send('sim:tick', {
    world,
    provider: config.AI_PROVIDER,
    runHistory
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
    civlingCount: Math.min(4, config.SIM_MAX_CIVLINGS),
    restartCount: nextRestartCount
  });
  sendTick();
}

async function tickOnce() {
  world = await runTick(world, (civling, state) => provider.decideAction(civling, state));

  if (world.tick % config.SIM_SNAPSHOT_EVERY_TICKS === 0 || world.extinction.ended) {
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
}

function startSimulation() {
  if (ticker) {
    return;
  }

  ticker = setInterval(() => {
    void tickOnce();
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
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  void mainWindow.loadFile(rendererPath());
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle('sim:get-state', () => ({ world, provider: config.AI_PROVIDER, runHistory }));
  ipcMain.handle('sim:start', () => {
    startSimulation();
    return { started: true };
  });
  ipcMain.handle('sim:stop', () => {
    stopSimulation();
    return { stopped: true };
  });
  ipcMain.handle('sim:reset', () => {
    stopSimulation();
    world = createInitialWorldState({ civlingCount: Math.min(4, config.SIM_MAX_CIVLINGS) });
    runHistory = [];
    return { world, provider: config.AI_PROVIDER, runHistory };
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
