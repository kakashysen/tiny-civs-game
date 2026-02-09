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

let world = createInitialWorldState({ civlingCount: Math.min(4, config.SIM_MAX_CIVLINGS) });

function rendererPath() {
  return join(__dirname, '../renderer/index.html');
}

function runsDir() {
  return join(app.getPath('userData'), 'data', 'runs');
}

async function tickOnce() {
  world = await runTick(world, (civling, state) => provider.decideAction(civling, state));

  if (world.tick % config.SIM_SNAPSHOT_EVERY_TICKS === 0) {
    await writeSnapshot(runsDir(), world);
  }

  mainWindow?.webContents.send('sim:tick', {
    world,
    provider: config.AI_PROVIDER
  });

  if (world.extinction.ended) {
    stopSimulation();
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

  ipcMain.handle('sim:get-state', () => ({ world, provider: config.AI_PROVIDER }));
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
    return { world, provider: config.AI_PROVIDER };
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
