import * as THREE from '../../node_modules/three/build/three.module.js';

const statusEl = document.getElementById('status');
const metricsEl = document.getElementById('metricsList');
const runHistoryEl = document.getElementById('runHistory');
const thoughtLogEl = document.getElementById('thoughtLog');
const llmExchangeLogEl = document.getElementById('llmExchangeLog');
const civlingStatsEl = document.getElementById('civlingStats');
const worldCanvasEl = document.getElementById('worldCanvas');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');
const civlingCountInput = document.getElementById('civlingCountInput');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(worldCanvasEl.clientWidth, worldCanvasEl.clientHeight);
worldCanvasEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f161c);

const camera = new THREE.OrthographicCamera(-18, 18, 12, -12, 0.1, 100);
camera.position.set(0, 0, 10);

const light = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(light);

const civlingMeshes = new Map();

function setStatus(message) {
  statusEl.textContent = `Status: ${message}`;
}

function setMetrics(world, provider) {
  const alive = world.civlings.filter((c) => c.status === 'alive').length;
  const metrics = [
    `Provider: ${provider}`,
    `Run ID: ${world.runId}`,
    `Restart Count: ${world.restartCount}`,
    `Tick: ${world.tick}`,
    `Alive: ${alive}/${world.civlings.length}`,
    `Food: ${world.resources.food}`,
    `Wood: ${world.resources.wood}`,
    `Shelter: ${world.resources.shelterCapacity}`,
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
      const lastMemory = civling.memory[civling.memory.length - 1] ?? 'No recent action';
      const latestAction = latestActionByCivlingId.get(civling.id);
      const actionNow = latestAction
        ? `${latestAction.action} (${latestAction.source})${latestAction.fallback ? ' fallback' : ''}`
        : 'n/a';
      const deadClass = civling.status === 'dead' ? 'civling-dead' : '';

      return `<tr class="${deadClass}">
        <td>${civling.name}</td>
        <td>${civling.status}</td>
        <td>${Math.round(civling.health)}</td>
        <td>${Math.round(civling.energy)}</td>
        <td>${Math.round(civling.hunger)}</td>
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
        <th>Status</th>
        <th>HP</th>
        <th>Energy</th>
        <th>Hunger</th>
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
    }
  }

  for (const civling of world.civlings) {
    let mesh = civlingMeshes.get(civling.id);
    if (!mesh) {
      const geometry = new THREE.CircleGeometry(0.6, 24);
      const material = new THREE.MeshBasicMaterial({ color: 0x8cc84b });
      mesh = new THREE.Mesh(geometry, material);
      civlingMeshes.set(civling.id, mesh);
      scene.add(mesh);
    }

    mesh.position.set(civling.x, civling.y, 0);
    mesh.material.color.setHex(civling.status === 'alive' ? 0x8cc84b : 0x6b7680);
  }
}

function renderFrame() {
  renderer.render(scene, camera);
  requestAnimationFrame(renderFrame);
}

function onState(world, provider, runHistory, thoughtLog, llmExchangeLog, error) {
  setMetrics(world, provider);
  setRunHistory(runHistory);
  setThoughtLog(thoughtLog);
  setLlmExchangeLog(llmExchangeLog);
  setCivlingStats(world.civlings, thoughtLog);
  upsertCivlings(world);

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
    payload.runHistory,
    payload.thoughtLog,
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

  stopBtn.addEventListener('click', async () => {
    try {
      await window.tinyCivs.stop();
      setStatus('paused');
    } catch (error) {
      setStatus('error (failed to stop simulation)');
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
        payload.runHistory,
        payload.thoughtLog,
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
}

function bindResize() {
  window.addEventListener('resize', () => {
    renderer.setSize(worldCanvasEl.clientWidth, worldCanvasEl.clientHeight);
  });
}

async function bootstrap() {
  if (!window.tinyCivs) {
    setStatus('error (preload bridge missing)');
    return;
  }

  initControls();
  bindResize();

  window.tinyCivs.onTick(({ world, provider, runHistory, thoughtLog, llmExchangeLog, error }) =>
    onState(world, provider, runHistory, thoughtLog, llmExchangeLog, error)
  );

  const initial = await window.tinyCivs.getState();
  civlingCountInput.value = String(initial.desiredCivlingCount ?? initial.world.civlings.length);
  onState(
    initial.world,
    initial.provider,
    initial.runHistory,
    initial.thoughtLog,
    initial.llmExchangeLog,
    initial.error
  );
  renderFrame();
}

void bootstrap();
