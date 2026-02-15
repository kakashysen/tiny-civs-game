import * as THREE from '../../node_modules/three/build/three.module.js';

const statusEl = document.getElementById('status');
const metricsEl = document.getElementById('metricsList');
const runHistoryEl = document.getElementById('runHistory');
const thoughtLogEl = document.getElementById('thoughtLog');
const diagnosticsLogEl = document.getElementById('diagnosticsLog');
const llmExchangeLogEl = document.getElementById('llmExchangeLog');
const actionChartEl = document.getElementById('actionChart');
const civlingStatsEl = document.getElementById('civlingStats');
const worldCanvasEl = document.getElementById('worldCanvas');
const worldCanvasWrapperEl = document.getElementById('worldCanvasWrapper');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const resetBtn = document.getElementById('resetBtn');
const civlingCountInput = document.getElementById('civlingCountInput');
const showGridCheckboxEl = document.getElementById('showGridCheckbox');
const gridTopLabelsEl = document.getElementById('gridTopLabels');
const gridLeftLabelsEl = document.getElementById('gridLeftLabels');
const movementDebugEnabled =
  new URLSearchParams(window.location.search).get('movementDebug') === '1';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(worldCanvasEl.clientWidth, worldCanvasEl.clientHeight);
renderer.domElement.style.display = 'block';
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
worldCanvasEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f161c);

const camera = new THREE.OrthographicCamera(-18, 18, 12, -12, 0.1, 100);
camera.position.set(0, 0, 10);

const light = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(light);

const civlingMeshes = new Map();
const forestMeshes = new Map();
const meadowMeshes = new Map();
const shelterMeshes = new Map();
const storageMeshes = new Map();
const civlingMotionCache = new Map();
let worldGridLines = null;
let worldGridSignature = '';
let showGrid = false;
let latestWorld = null;
let resizeRafId = null;
let lastObservedTick = null;
let lastObservedTickAtMs = null;
let estimatedTickDurationMs = 900;
let movementDebugEl = null;

const CIVLING_COLORS = Object.freeze({
  male: 0x3b82f6,
  female: 0xec4899,
  dead: 0x6b7280
});

const SHELTER_COLOR = 0x8b5a2b;
const FOREST_COLOR = 0x2f9e44;
const MEADOW_COLOR = 0xd6b85a;
const ENTITY_SCALE = Object.freeze({
  civlingRadius: 0.34,
  shelterSize: 0.78,
  treeRadius: 1.02,
  meadowRadius: 0.72,
  storageSize: 0.9
});

const INTERPOLATION_BOUNDS_MS = Object.freeze({
  min: 120,
  max: 2000
});

/**
 * Clamps a number between minimum and maximum bounds.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Normalizes an observed tick interval into a safe interpolation duration.
 * @param {number} intervalMs
 * @returns {number}
 */
function normalizeTickDurationMs(intervalMs) {
  if (!Number.isFinite(intervalMs)) {
    return estimatedTickDurationMs;
  }
  return clamp(
    intervalMs,
    INTERPOLATION_BOUNDS_MS.min,
    INTERPOLATION_BOUNDS_MS.max
  );
}

/**
 * Updates the estimated simulation tick duration based on observed tick arrivals.
 * @param {number} tick
 * @param {number} nowMs
 */
function updateEstimatedTickDuration(tick, nowMs) {
  if (
    lastObservedTick !== null &&
    tick > lastObservedTick &&
    lastObservedTickAtMs !== null
  ) {
    const observedDurationMs = normalizeTickDurationMs(
      nowMs - lastObservedTickAtMs
    );
    estimatedTickDurationMs = Math.round(
      estimatedTickDurationMs * 0.5 + observedDurationMs * 0.5
    );
  }
  lastObservedTick = tick;
  lastObservedTickAtMs = nowMs;
}

/**
 * Returns the current visual position for a civling interpolation snapshot.
 * @param {{fromX: number, fromY: number, toX: number, toY: number, startedAtMs: number, durationMs: number}} snapshot
 * @param {number} nowMs
 * @returns {{x: number, y: number}}
 */
function getInterpolatedPosition(snapshot, nowMs) {
  const elapsedMs = nowMs - snapshot.startedAtMs;
  const progress = clamp(elapsedMs / snapshot.durationMs, 0, 1);
  return {
    x: snapshot.fromX + (snapshot.toX - snapshot.fromX) * progress,
    y: snapshot.fromY + (snapshot.toY - snapshot.fromY) * progress
  };
}

/**
 * Rebuilds civling interpolation snapshots for a new world tick.
 * @param {import('../../shared/types.js').WorldState} world
 * @param {number} nowMs
 */
function updateCivlingMotionCache(world, nowMs) {
  const isFirstWorld = latestWorld === null;
  const worldReset =
    !isFirstWorld &&
    (world.runId !== latestWorld.runId || world.tick < latestWorld.tick);
  if (worldReset) {
    civlingMotionCache.clear();
  }

  updateEstimatedTickDuration(world.tick, nowMs);
  const activeIds = new Set(world.civlings.map((civling) => civling.id));
  for (const id of civlingMotionCache.keys()) {
    if (!activeIds.has(id)) {
      civlingMotionCache.delete(id);
    }
  }

  for (const civling of world.civlings) {
    const existing = civlingMotionCache.get(civling.id);
    if (!existing) {
      civlingMotionCache.set(civling.id, {
        fromX: civling.x,
        fromY: civling.y,
        toX: civling.x,
        toY: civling.y,
        startedAtMs: nowMs,
        durationMs: estimatedTickDurationMs
      });
      continue;
    }

    const from = getInterpolatedPosition(existing, nowMs);
    existing.fromX = from.x;
    existing.fromY = from.y;
    existing.toX = civling.x;
    existing.toY = civling.y;
    existing.startedAtMs = nowMs;
    existing.durationMs = estimatedTickDurationMs;
  }
}

function getWorldBounds(world) {
  const halfWidth = Math.floor((world.map?.width ?? 36) / 2);
  const halfHeight = Math.floor((world.map?.height ?? 24) / 2);
  return {
    minX: -halfWidth,
    maxX: halfWidth - 1,
    minY: -halfHeight,
    maxY: halfHeight - 1
  };
}

function worldToCanvasX(worldX, canvasWidth) {
  return ((worldX - camera.left) / (camera.right - camera.left)) * canvasWidth;
}

function worldToCanvasY(worldY, canvasHeight) {
  return ((camera.top - worldY) / (camera.top - camera.bottom)) * canvasHeight;
}

function updateCameraProjection(world, viewportWidth, viewportHeight) {
  const bounds = getWorldBounds(world);
  const worldWidth = bounds.maxX - bounds.minX + 1;
  const worldHeight = bounds.maxY - bounds.minY + 1;
  const padding = 2;
  const targetWidth = worldWidth + padding;
  const targetHeight = worldHeight + padding;
  const aspect = viewportWidth / viewportHeight;
  const targetAspect = targetWidth / targetHeight;

  let viewWidth = targetWidth;
  let viewHeight = targetHeight;
  if (aspect > targetAspect) {
    viewWidth = targetHeight * aspect;
  } else {
    viewHeight = targetWidth / aspect;
  }

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  camera.left = centerX - viewWidth / 2;
  camera.right = centerX + viewWidth / 2;
  camera.top = centerY + viewHeight / 2;
  camera.bottom = centerY - viewHeight / 2;
  camera.updateProjectionMatrix();
}

function clearGridLabels() {
  gridTopLabelsEl.innerHTML = '';
  gridLeftLabelsEl.innerHTML = '';
}

function buildGridLabels(world) {
  if (!showGrid) {
    clearGridLabels();
    return;
  }

  const bounds = getWorldBounds(world);
  const canvasWidth = worldCanvasEl.clientWidth;
  const canvasHeight = worldCanvasEl.clientHeight;

  const topParts = [];
  for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
    const left = worldToCanvasX(x, canvasWidth);
    topParts.push(
      `<span class="grid-label" style="left:${left.toFixed(1)}px">${x}</span>`
    );
  }
  gridTopLabelsEl.innerHTML = topParts.join('');

  const leftParts = [];
  for (let y = bounds.maxY; y >= bounds.minY; y -= 1) {
    const top = worldToCanvasY(y, canvasHeight);
    leftParts.push(
      `<span class="grid-label" style="top:${top.toFixed(1)}px">${y}</span>`
    );
  }
  gridLeftLabelsEl.innerHTML = leftParts.join('');
}

function clearGridLines() {
  if (worldGridLines) {
    scene.remove(worldGridLines);
    worldGridLines.geometry.dispose();
    worldGridLines.material.dispose();
    worldGridLines = null;
  }
  worldGridSignature = '';
}

function ensureGridLines(world) {
  const signature = `${world.map.width}x${world.map.height}`;
  if (worldGridLines && worldGridSignature === signature) {
    worldGridLines.visible = showGrid;
    return;
  }

  clearGridLines();
  const bounds = getWorldBounds(world);
  const points = [];

  for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
    points.push(new THREE.Vector3(x, bounds.minY, -0.12));
    points.push(new THREE.Vector3(x, bounds.maxY, -0.12));
  }
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    points.push(new THREE.Vector3(bounds.minX, y, -0.12));
    points.push(new THREE.Vector3(bounds.maxX, y, -0.12));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0x3b5161,
    transparent: true,
    opacity: 0.45
  });

  worldGridLines = new THREE.LineSegments(geometry, material);
  worldGridLines.visible = showGrid;
  scene.add(worldGridLines);
  worldGridSignature = signature;
}

function updateGridVisibility(world) {
  ensureGridLines(world);
  buildGridLabels(world);
  gridTopLabelsEl.style.display = showGrid ? 'block' : 'none';
  gridLeftLabelsEl.style.display = showGrid ? 'block' : 'none';
}

function resizeWorldCanvas() {
  const width = Math.max(1, Math.round(worldCanvasEl.clientWidth));
  const height = Math.max(1, Math.round(worldCanvasEl.clientHeight));
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(width, height, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  if (latestWorld) {
    updateCameraProjection(latestWorld, width, height);
    buildGridLabels(latestWorld);
  }
}

function scheduleWorldResize() {
  if (resizeRafId !== null) {
    cancelAnimationFrame(resizeRafId);
  }
  resizeRafId = requestAnimationFrame(() => {
    resizeWorldCanvas();
    resizeRafId = requestAnimationFrame(() => {
      resizeWorldCanvas();
      resizeRafId = null;
    });
  });
}

function setStatus(message) {
  statusEl.textContent = `Status: ${message}`;
}

function formatShelterUnits(shelterCapacity, shelterCapacityPerUnit) {
  if (shelterCapacityPerUnit <= 0) {
    return 'n/a';
  }
  const units = shelterCapacity / shelterCapacityPerUnit;
  if (Number.isInteger(units)) {
    return String(units);
  }
  return units.toFixed(1);
}

function setMetrics(world, provider, shelterCapacityPerUnit = 2) {
  const alive = world.civlings.filter((c) => c.status === 'alive').length;
  const sheltered = Math.min(alive, world.resources.shelterCapacity);
  const unsheltered = Math.max(0, alive - sheltered);
  const sheltersBuilt = formatShelterUnits(
    world.resources.shelterCapacity,
    shelterCapacityPerUnit
  );
  const hour = Math.floor(world.time.minuteOfDay / 60)
    .toString()
    .padStart(2, '0');
  const minute = (world.time.minuteOfDay % 60).toString().padStart(2, '0');
  const metrics = [
    `Provider: ${provider}`,
    `Run ID: ${world.runId}`,
    `Restart Count: ${world.restartCount}`,
    `Tick: ${world.tick}`,
    `Date: Y${world.time.year} M${world.time.month} D${world.time.day} ${hour}:${minute}`,
    `Phase: ${world.time.phase}`,
    `Weather: ${world.environment.weather} | Night temp: ${world.environment.nightTemperature}`,
    `Alive: ${alive}/${world.civlings.length}`,
    `Food: ${world.resources.food}`,
    `Wood: ${world.resources.wood}`,
    `Fiber: ${world.resources.fiber ?? 0}`,
    `Forests: ${world.forests?.length ?? 0}`,
    `Meadows: ${world.meadows?.length ?? 0}`,
    `Storages: ${world.storages?.length ?? 0}`,
    `Shelter wood slots: ${(world.shelters ?? []).reduce((sum, item) => sum + item.woodStored, 0)}/${(world.shelters ?? []).reduce((sum, item) => sum + item.woodCapacity, 0)}`,
    `Storage wood slots: ${(world.storages ?? []).reduce((sum, item) => sum + item.woodStored, 0)}/${(world.storages ?? []).reduce((sum, item) => sum + item.woodCapacity, 0)}`,
    `Shelters built: ${sheltersBuilt}`,
    `Sheltered civlings: ${sheltered}/${alive}`,
    `Unsheltered civlings: ${unsheltered}`,
    `Shelter capacity slots: ${world.resources.shelterCapacity}`,
    `Milestones: ${world.milestones.join(', ') || 'none'}`,
    `Extinction: ${world.extinction.ended ? world.extinction.cause : 'no'}`
  ];

  metricsEl.innerHTML = metrics.map((item) => `<li>${item}</li>`).join('');
}

function setRunHistory(runHistory) {
  if (!runHistory.length) {
    runHistoryEl.innerHTML = '<li>No completed runs yet.</li>';
    return;
  }

  runHistoryEl.innerHTML = runHistory
    .map(
      (run) =>
        `<li>#${run.restartCount} ${run.runId} | ticks ${run.ticks} | milestones ${run.milestones} | ${run.cause}</li>`
    )
    .join('');
}

function setThoughtLog(thoughtLog) {
  if (!thoughtLog.length) {
    thoughtLogEl.innerHTML = '<li>No decisions yet.</li>';
    return;
  }

  thoughtLogEl.innerHTML = thoughtLog
    .map((entry) => {
      const fallback = entry.fallback ? ' | fallback' : '';
      return `<li>[t${entry.tick}] ${entry.civlingName} -> ${entry.action} (${entry.source})${fallback}<br/>Reason: ${entry.reason}</li>`;
    })
    .join('');
}

function setLlmExchangeLog(llmExchangeLog) {
  if (!llmExchangeLog.length) {
    llmExchangeLogEl.innerHTML = '<li>No LLM exchanges yet.</li>';
    return;
  }

  llmExchangeLogEl.innerHTML = llmExchangeLog
    .map((entry) => {
      return `<li>[t${entry.tick}] ${entry.civlingName} | ${entry.status}
        <div class="llm-label">Prompt</div>
        <pre class="llm-block">${entry.prompt}</pre>
        <div class="llm-label">Response</div>
        <pre class="llm-block">${entry.response}</pre>
      </li>`;
    })
    .join('');
}

function setDiagnosticsLog(diagnosticsLog) {
  if (!diagnosticsLog.length) {
    diagnosticsLogEl.innerHTML = '<li>No diagnostics yet.</li>';
    return;
  }

  diagnosticsLogEl.innerHTML = diagnosticsLog
    .map((entry) => {
      const deltas = `HP ${entry.healthDelta}, EN ${entry.energyDelta}, HU ${entry.hungerDelta}`;
      return `<li>[t${entry.tick}] ${entry.eventType} | ${entry.civlingName}<br/>${entry.summary}<br/>Action: ${entry.action} (${entry.reason}) | ${entry.weather}/${entry.phase}<br/>${deltas}<br/>Memory: ${entry.memory}</li>`;
    })
    .join('');
}

function setActionChart(civlings, thoughtLog, runId) {
  if (!civlings.length) {
    actionChartEl.innerHTML = '<p>No civlings in world.</p>';
    return;
  }

  const rows = [];
  const actions = [
    'play',
    'learn',
    'eat',
    'care',
    'gather_food',
    'gather_wood',
    'build_storage',
    'rest',
    'explore',
    'reproduce'
  ];
  const runThoughts = thoughtLog.filter((entry) => entry.runId === runId);

  for (const civling of civlings) {
    const civThoughts = runThoughts.filter(
      (entry) => entry.civlingId === civling.id
    );
    const counts = new Map(actions.map((action) => [action, 0]));
    for (const entry of civThoughts) {
      counts.set(entry.action, (counts.get(entry.action) ?? 0) + 1);
    }
    counts.set('reproduce', civling.reproductionAttempts ?? 0);
    const shelterAttempts = civling.shelterBuildAttempts ?? 0;
    const shelterSuccesses = civling.shelterBuildSuccesses ?? 0;
    const shelterFailures = civling.shelterBuildFailures ?? 0;
    const maxCount = Math.max(
      1,
      shelterAttempts,
      ...actions.map((action) => counts.get(action) ?? 0)
    );
    const attempts = civling.reproductionAttempts ?? 0;
    const babiesBorn = civling.babiesBorn ?? 0;
    const baseChance = Math.round((civling.babyChance ?? 0) * 100);
    const successChance =
      attempts > 0 ? Math.round((babiesBorn / attempts) * 100) : 0;

    const actionRows = actions
      .map((action) => {
        const count = counts.get(action) ?? 0;
        const width = Math.round((count / maxCount) * 100);
        const label =
          action === 'reproduce'
            ? 'reproduction attempts'
            : action.replaceAll('_', ' ');
        return `<div class="action-row">
          <div class="action-label">${label}</div>
          <div class="action-bar-track"><div class="action-bar-fill" style="width:${width}%"></div></div>
          <div class="action-count">${count}</div>
        </div>`;
      })
      .join('');
    const shelterWidth = Math.round((shelterAttempts / maxCount) * 100);
    const shelterSuccessWidth =
      shelterAttempts > 0
        ? Math.round((shelterSuccesses / shelterAttempts) * 100)
        : 0;
    const shelterFailureWidth =
      shelterAttempts > 0 ? 100 - shelterSuccessWidth : 0;
    const shelterRow = `<div class="action-row">
      <div class="action-label">build shelter</div>
      <div class="action-bar-track">
        <div class="action-bar-fill action-bar-shelter" style="width:${shelterWidth}%">
          <div class="action-bar-shelter-success" style="width:${shelterSuccessWidth}%"></div>
          <div class="action-bar-shelter-failure" style="width:${shelterFailureWidth}%"></div>
        </div>
      </div>
      <div class="action-count">a:${shelterAttempts} s:${shelterSuccesses} f:${shelterFailures}</div>
    </div>`;

    rows.push(`<div class="action-civling">
      <p class="action-civling-title">${civling.name} | ${civling.personality?.archetype ?? 'Unknown'}</p>
      <p>Way to act: ${civling.personality?.wayToAct ?? 'n/a'}</p>
      <p>Goals: ${(civling.personality?.goals ?? []).join(' • ') || 'n/a'}</p>
      <p>Baby chance: ${baseChance}% | Success so far: ${successChance}% (${babiesBorn}/${attempts})</p>
      ${shelterRow}
      ${actionRows}
    </div>`);
  }

  actionChartEl.innerHTML = `<div class="action-chart">${rows.join('')}</div>`;
}

function setCivlingStats(civlings, thoughtLog) {
  if (!civlings.length) {
    civlingStatsEl.innerHTML = '<p>No civlings in world.</p>';
    return;
  }

  const latestActionByCivlingId = new Map();
  for (const entry of thoughtLog) {
    if (!latestActionByCivlingId.has(entry.civlingId)) {
      latestActionByCivlingId.set(entry.civlingId, entry);
    }
  }

  const rows = civlings
    .map((civling) => {
      const lastMemory =
        civling.memory[civling.memory.length - 1] ?? 'No recent action';
      const latestAction = latestActionByCivlingId.get(civling.id);
      const actionNow = latestAction
        ? `${latestAction.action} (${latestAction.source})${latestAction.fallback ? ' fallback' : ''}`
        : 'n/a';
      const deadClass = civling.status === 'dead' ? 'civling-dead' : '';

      return `<tr class="${deadClass}">
        <td>${civling.name}</td>
        <td>${civling.gender}</td>
        <td>${civling.personality?.archetype ?? 'n/a'}</td>
        <td>${civling.personality?.wayToAct ?? 'n/a'}</td>
        <td>${(civling.personality?.goals ?? []).join(' | ') || 'n/a'}</td>
        <td>${civling.status}</td>
        <td>${Math.round(civling.health)}</td>
        <td>${Math.round(civling.energy)}</td>
        <td>${Math.round(civling.hunger)}</td>
        <td>${civling.foodEatenLastTick ?? 0}</td>
        <td>${civling.age.toFixed(1)}</td>
        <td>${civling.x},${civling.y}</td>
        <td>${actionNow}</td>
        <td>${lastMemory}</td>
      </tr>`;
    })
    .join('');

  civlingStatsEl.innerHTML = `<table class="civling-table">
    <thead>
      <tr>
        <th>Name</th>
        <th>Gender</th>
        <th>Personality</th>
        <th>Way</th>
        <th>Goals</th>
        <th>Status</th>
        <th>HP</th>
        <th>Energy</th>
        <th>Hunger</th>
        <th>Ate</th>
        <th>Age</th>
        <th>Pos</th>
        <th>Action Now</th>
        <th>Last Action</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function upsertCivlings(world) {
  const activeIds = new Set(world.civlings.map((civling) => civling.id));

  for (const [id, mesh] of civlingMeshes.entries()) {
    if (!activeIds.has(id)) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      civlingMeshes.delete(id);
      civlingMotionCache.delete(id);
    }
  }

  for (const civling of world.civlings) {
    let mesh = civlingMeshes.get(civling.id);
    if (!mesh) {
      const geometry = new THREE.CircleGeometry(ENTITY_SCALE.civlingRadius, 24);
      const material = new THREE.MeshBasicMaterial({
        color:
          civling.gender === 'male'
            ? CIVLING_COLORS.male
            : CIVLING_COLORS.female
      });
      mesh = new THREE.Mesh(geometry, material);
      civlingMeshes.set(civling.id, mesh);
      scene.add(mesh);
    }

    const snapshot = civlingMotionCache.get(civling.id);
    if (snapshot) {
      mesh.position.set(snapshot.toX, snapshot.toY, 0);
    } else {
      mesh.position.set(civling.x, civling.y, 0);
    }
    if (civling.status === 'alive') {
      mesh.material.color.setHex(
        civling.gender === 'male' ? CIVLING_COLORS.male : CIVLING_COLORS.female
      );
    } else {
      mesh.material.color.setHex(CIVLING_COLORS.dead);
    }
  }
}

/**
 * Applies interpolation updates to civling mesh positions for the current frame.
 * @param {number} nowMs
 */
function updateInterpolatedCivlingMeshes(nowMs) {
  for (const [id, mesh] of civlingMeshes.entries()) {
    const snapshot = civlingMotionCache.get(id);
    if (!snapshot) {
      continue;
    }
    const current = getInterpolatedPosition(snapshot, nowMs);
    mesh.position.set(current.x, current.y, 0);
  }
}

/**
 * Lazily mounts renderer debug text for movement playback diagnostics.
 * @returns {HTMLDivElement|null}
 */
function ensureMovementDebugElement() {
  if (!movementDebugEnabled) {
    return null;
  }
  if (movementDebugEl) {
    return movementDebugEl;
  }
  const element = document.createElement('div');
  element.className = 'movement-debug';
  element.setAttribute('aria-live', 'polite');
  worldCanvasWrapperEl.appendChild(element);
  movementDebugEl = element;
  return movementDebugEl;
}

/**
 * Updates optional movement debugging text from current interpolation state.
 * @param {import('../../shared/types.js').WorldState} world
 * @param {number} nowMs
 */
function updateMovementDebug(world, nowMs) {
  const debugEl = ensureMovementDebugElement();
  if (!debugEl) {
    return;
  }
  const lines = [`tick=${world.tick}`, `tickMs~${estimatedTickDurationMs}`];
  const preview = world.civlings.slice(0, 3);
  for (const civling of preview) {
    const snapshot = civlingMotionCache.get(civling.id);
    if (!snapshot) {
      lines.push(`${civling.name}:(${civling.x},${civling.y})`);
      continue;
    }
    const elapsedMs = nowMs - snapshot.startedAtMs;
    const progress = clamp(elapsedMs / snapshot.durationMs, 0, 1);
    const phase = String(civling.currentTask?.meta?.phase ?? '-');
    lines.push(
      `${civling.name}: p${progress.toFixed(2)} phase:${phase} task:${civling.currentTask?.action ?? '-'}`
    );
  }
  debugEl.textContent = lines.join(' | ');
}

function upsertStaticEntities(world) {
  const forests = world.forests ?? [];
  const meadows = world.meadows ?? [];
  const shelters = world.shelters ?? [];
  const storages = world.storages ?? [];

  const activeForestIds = new Set(forests.map((item) => item.id));
  for (const [id, mesh] of forestMeshes.entries()) {
    if (!activeForestIds.has(id)) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      forestMeshes.delete(id);
    }
  }
  for (const forest of forests) {
    let mesh = forestMeshes.get(forest.id);
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.CircleGeometry(ENTITY_SCALE.treeRadius, 20),
        new THREE.MeshBasicMaterial({ color: FOREST_COLOR })
      );
      forestMeshes.set(forest.id, mesh);
      scene.add(mesh);
    }
    mesh.position.set(forest.x, forest.y, -0.02);
  }

  const activeMeadowIds = new Set(meadows.map((item) => item.id));
  for (const [id, mesh] of meadowMeshes.entries()) {
    if (!activeMeadowIds.has(id)) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      meadowMeshes.delete(id);
    }
  }
  for (const meadow of meadows) {
    let mesh = meadowMeshes.get(meadow.id);
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.CircleGeometry(ENTITY_SCALE.meadowRadius, 18),
        new THREE.MeshBasicMaterial({ color: MEADOW_COLOR })
      );
      meadowMeshes.set(meadow.id, mesh);
      scene.add(mesh);
    }
    mesh.position.set(meadow.x, meadow.y, -0.025);
  }

  const activeShelterIds = new Set(shelters.map((item) => item.id));
  for (const [id, mesh] of shelterMeshes.entries()) {
    if (!activeShelterIds.has(id)) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      shelterMeshes.delete(id);
    }
  }
  for (const shelter of shelters) {
    let mesh = shelterMeshes.get(shelter.id);
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(
          ENTITY_SCALE.shelterSize,
          ENTITY_SCALE.shelterSize,
          0.1
        ),
        new THREE.MeshBasicMaterial({ color: SHELTER_COLOR })
      );
      shelterMeshes.set(shelter.id, mesh);
      scene.add(mesh);
    }
    mesh.position.set(shelter.x, shelter.y, -0.03);
  }

  const activeStorageIds = new Set(storages.map((item) => item.id));
  for (const [id, mesh] of storageMeshes.entries()) {
    if (!activeStorageIds.has(id)) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      storageMeshes.delete(id);
    }
  }
  for (const storage of storages) {
    let mesh = storageMeshes.get(storage.id);
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(
          ENTITY_SCALE.storageSize,
          ENTITY_SCALE.storageSize,
          0.1
        ),
        new THREE.MeshBasicMaterial({ color: 0x4c6ef5 })
      );
      storageMeshes.set(storage.id, mesh);
      scene.add(mesh);
    }
    mesh.position.set(storage.x, storage.y, -0.04);
  }
}

function renderFrame() {
  const nowMs = performance.now();
  updateInterpolatedCivlingMeshes(nowMs);
  if (latestWorld) {
    updateMovementDebug(latestWorld, nowMs);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(renderFrame);
}

function onState(
  world,
  provider,
  shelterCapacityPerUnit,
  runHistory,
  thoughtLog,
  diagnosticsLog,
  llmExchangeLog,
  error
) {
  const nowMs = performance.now();
  updateCivlingMotionCache(world, nowMs);
  updateMovementDebug(world, nowMs);
  latestWorld = world;
  setMetrics(world, provider, shelterCapacityPerUnit);
  setRunHistory(runHistory);
  setThoughtLog(thoughtLog);
  setDiagnosticsLog(diagnosticsLog);
  setLlmExchangeLog(llmExchangeLog);
  setActionChart(world.civlings, thoughtLog, world.runId);
  setCivlingStats(world.civlings, thoughtLog);
  upsertCivlings(world);
  upsertStaticEntities(world);
  updateGridVisibility(world);

  if (error) {
    setStatus(`error (${error})`);
    return;
  }

  if (world.extinction.ended) {
    setStatus(`ended (${world.extinction.cause})`);
  }
}

function normalizeCountInput(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return 4;
  }
  const max = Number.parseInt(civlingCountInput.max || '6', 10);
  return Math.max(1, Math.min(max, parsed));
}

async function applyDesiredCivlingCount() {
  const count = normalizeCountInput(civlingCountInput.value);
  const payload = await window.tinyCivs.setCivlingCount(count);
  civlingCountInput.value = String(payload.desiredCivlingCount);
  onState(
    payload.world,
    payload.provider,
    payload.shelterCapacityPerUnit,
    payload.runHistory,
    payload.thoughtLog,
    payload.diagnosticsLog,
    payload.llmExchangeLog,
    payload.error
  );
}

function initControls() {
  startBtn.addEventListener('click', async () => {
    try {
      await applyDesiredCivlingCount();
      await window.tinyCivs.start();
      setStatus('running');
    } catch (error) {
      setStatus('error (failed to start simulation)');
      console.error(error);
    }
  });

  pauseBtn.addEventListener('click', async () => {
    try {
      await window.tinyCivs.pause();
      setStatus('paused');
    } catch (error) {
      setStatus('error (failed to pause simulation)');
      console.error(error);
    }
  });

  resumeBtn.addEventListener('click', async () => {
    try {
      await window.tinyCivs.resume();
      setStatus('running');
    } catch (error) {
      setStatus('error (failed to resume simulation)');
      console.error(error);
    }
  });

  resetBtn.addEventListener('click', async () => {
    try {
      await applyDesiredCivlingCount();
      const payload = await window.tinyCivs.reset();
      onState(
        payload.world,
        payload.provider,
        payload.shelterCapacityPerUnit,
        payload.runHistory,
        payload.thoughtLog,
        payload.diagnosticsLog,
        payload.llmExchangeLog,
        payload.error
      );
      setStatus('reset');
    } catch (error) {
      setStatus('error (failed to reset simulation)');
      console.error(error);
    }
  });

  civlingCountInput.addEventListener('change', async () => {
    try {
      await applyDesiredCivlingCount();
    } catch (error) {
      setStatus('error (failed to apply civling count)');
      console.error(error);
    }
  });

  showGridCheckboxEl.addEventListener('change', () => {
    showGrid = showGridCheckboxEl.checked;
    if (latestWorld) {
      updateGridVisibility(latestWorld);
    }
  });
}

function bindResize() {
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => {
      scheduleWorldResize();
    });
    observer.observe(worldCanvasWrapperEl);
    observer.observe(worldCanvasEl);
  }

  window.addEventListener('resize', () => {
    scheduleWorldResize();
  });
}

async function bootstrap() {
  if (!window.tinyCivs) {
    setStatus('error (preload bridge missing)');
    return;
  }

  initControls();
  bindResize();

  window.tinyCivs.onTick(
    ({
      world,
      provider,
      shelterCapacityPerUnit,
      runHistory,
      thoughtLog,
      diagnosticsLog,
      llmExchangeLog,
      error
    }) =>
      onState(
        world,
        provider,
        shelterCapacityPerUnit,
        runHistory,
        thoughtLog,
        diagnosticsLog,
        llmExchangeLog,
        error
      )
  );

  const initial = await window.tinyCivs.getState();
  civlingCountInput.value = String(
    initial.desiredCivlingCount ?? initial.world.civlings.length
  );
  onState(
    initial.world,
    initial.provider,
    initial.shelterCapacityPerUnit,
    initial.runHistory,
    initial.thoughtLog,
    initial.diagnosticsLog,
    initial.llmExchangeLog,
    initial.error
  );
  scheduleWorldResize();
  renderFrame();
}

void bootstrap();
