import * as THREE from '../../node_modules/three/build/three.module.js';

const statusEl = document.getElementById('status');
const metricsEl = document.getElementById('metricsList');
const worldCanvasEl = document.getElementById('worldCanvas');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');

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

function setMetrics(world) {
  const alive = world.civlings.filter((c) => c.status === 'alive').length;
  const metrics = [
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

function upsertCivlings(world) {
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

function onWorld(world) {
  setMetrics(world);
  upsertCivlings(world);

  if (world.extinction.ended) {
    statusEl.textContent = `Status: ended (${world.extinction.cause})`;
  }
}

function initControls() {
  startBtn.addEventListener('click', async () => {
    await window.tinyCivs.start();
    statusEl.textContent = 'Status: running';
  });

  stopBtn.addEventListener('click', async () => {
    await window.tinyCivs.stop();
    statusEl.textContent = 'Status: paused';
  });

  resetBtn.addEventListener('click', async () => {
    const payload = await window.tinyCivs.reset();
    onWorld(payload.world);
    statusEl.textContent = 'Status: reset';
  });
}

function bindResize() {
  window.addEventListener('resize', () => {
    renderer.setSize(worldCanvasEl.clientWidth, worldCanvasEl.clientHeight);
  });
}

async function bootstrap() {
  initControls();
  bindResize();

  window.tinyCivs.onTick(({ world }) => onWorld(world));

  const initial = await window.tinyCivs.getState();
  onWorld(initial.world);
  renderFrame();
}

void bootstrap();
