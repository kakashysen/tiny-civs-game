import { app, BrowserWindow, ipcMain } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_CONFIG } from '../../shared/constants.js';
import { createInitialWorldState, runTick } from '../../simulation/engine.js';
import { writeSnapshot } from '../../simulation/snapshotStore.js';
import { decideDeterministicAction } from '../../ai/providers/deterministicProvider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {NodeJS.Timeout | null} */
let ticker = null;

let world = createInitialWorldState({ civlingCount: DEFAULT_CONFIG.INITIAL_CIVLINGS });

function rendererPath() {
  return join(__dirname, '../renderer/index.html');
}

function runsDir() {
  return join(app.getPath('userData'), 'data', 'runs');
}

async function tickOnce() {
  world = await runTick(world, decideDeterministicAction);

  if (world.tick % DEFAULT_CONFIG.SIM_SNAPSHOT_EVERY_TICKS === 0) {
    await writeSnapshot(runsDir(), world);
  }

  mainWindow?.webContents.send('sim:tick', {
    world
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
  }, DEFAULT_CONFIG.SIM_TICK_MS);
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

  ipcMain.handle('sim:get-state', () => ({ world }));
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
    world = createInitialWorldState({ civlingCount: DEFAULT_CONFIG.INITIAL_CIVLINGS });
    return { world };
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
