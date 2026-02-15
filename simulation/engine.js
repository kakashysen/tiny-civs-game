import {
  ACTION_DURATION_MINUTES,
  ACTIONS,
  ACTION_VALUES,
  ADULT_ALLOWED_ACTIONS,
  MILESTONES,
  TIME,
  YOUNG_ALLOWED_ACTIONS
} from '../shared/constants.js';
import { GAME_RULES } from '../shared/gameRules.js';
import { createRandomPersonality } from '../shared/personalities.js';

const BASE_NAMES = ['Ari', 'Bex', 'Cori', 'Dax', 'Ena', 'Fio'];
const CARDINAL_DIRECTIONS = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomId(prefix) {
  return `${prefix}-${Math.random().toString(16).slice(2, 8)}`;
}

function addMemory(civling, message) {
  civling.memory.push(message);
  if (civling.memory.length > 10) {
    civling.memory = civling.memory.slice(-10);
  }
}

/**
 * Creates a stable key for grid coordinates.
 * @param {number} x
 * @param {number} y
 * @returns {string}
 */
function toCoordKey(x, y) {
  return `${x},${y}`;
}

/**
 * Returns inclusive world coordinate limits.
 * @param {import('../shared/types.js').WorldState} world
 * @returns {{minX: number, maxX: number, minY: number, maxY: number}}
 */
function getWorldBounds(world) {
  const halfWidth = Math.floor(world.map.width / 2);
  const halfHeight = Math.floor(world.map.height / 2);
  return {
    minX: -halfWidth,
    maxX: halfWidth - 1,
    minY: -halfHeight,
    maxY: halfHeight - 1
  };
}

/**
 * Returns true when a coordinate is inside world bounds.
 * @param {import('../shared/types.js').WorldState} world
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function isInWorldBounds(world, x, y) {
  const bounds = getWorldBounds(world);
  return (
    x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY
  );
}

/**
 * Returns a random coordinate inside world bounds.
 * @param {import('../shared/types.js').WorldState} world
 * @returns {{x: number, y: number}}
 */
function randomWorldPosition(world) {
  const bounds = getWorldBounds(world);
  const x = bounds.minX + Math.floor(Math.random() * world.map.width);
  const y = bounds.minY + Math.floor(Math.random() * world.map.height);
  return { x, y };
}

/**
 * Returns true when a tile is occupied by a non-walkable structure.
 * @param {import('../shared/types.js').WorldState} world
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function isBlockedTile(world, x, y) {
  return (
    world.shelters.some((item) => item.x === x && item.y === y) ||
    world.storages.some((item) => item.x === x && item.y === y)
  );
}

/**
 * Builds shortest walkable path between two tiles using BFS on Manhattan moves.
 * Path excludes the start tile and includes the goal tile.
 * @param {import('../shared/types.js').WorldState} world
 * @param {{x: number, y: number}} start
 * @param {{x: number, y: number}} goal
 * @returns {import('../shared/types.js').Position[]|null}
 */
function buildPath(world, start, goal) {
  if (start.x === goal.x && start.y === goal.y) {
    return [];
  }

  const queue = [{ x: start.x, y: start.y }];
  const visited = new Set([toCoordKey(start.x, start.y)]);
  const parentByCoord = new Map();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    for (const [dx, dy] of CARDINAL_DIRECTIONS) {
      const nextX = current.x + dx;
      const nextY = current.y + dy;
      if (!isInWorldBounds(world, nextX, nextY)) {
        continue;
      }
      if (
        (nextX !== goal.x || nextY !== goal.y) &&
        isBlockedTile(world, nextX, nextY)
      ) {
        continue;
      }
      const key = toCoordKey(nextX, nextY);
      if (visited.has(key)) {
        continue;
      }
      parentByCoord.set(key, current);
      if (nextX === goal.x && nextY === goal.y) {
        const path = [];
        let pointer = { x: nextX, y: nextY };
        while (pointer.x !== start.x || pointer.y !== start.y) {
          path.push({ x: pointer.x, y: pointer.y });
          const previous = parentByCoord.get(toCoordKey(pointer.x, pointer.y));
          if (!previous) {
            return null;
          }
          pointer = previous;
        }
        path.reverse();
        return path;
      }
      visited.add(key);
      queue.push({ x: nextX, y: nextY });
    }
  }

  return null;
}

/**
 * Creates a forest node at a world coordinate.
 * @param {number} x
 * @param {number} y
 * @returns {import('../shared/types.js').ForestNode}
 */
function createForestNode(x, y) {
  return {
    id: randomId('forest'),
    x,
    y,
    woodRemaining: GAME_RULES.forests.woodPerForest
  };
}

/**
 * Picks a free nearby tile for construction.
 * @param {import('../shared/types.js').WorldState} world
 * @param {{x: number, y: number}} origin
 * @returns {{x: number, y: number}|null}
 */
function findNearbyBuildTile(world, origin) {
  if (
    isInWorldBounds(world, origin.x, origin.y) &&
    !isBlockedTile(world, origin.x, origin.y)
  ) {
    return { x: origin.x, y: origin.y };
  }

  for (let radius = 1; radius <= 5; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.abs(dx) + Math.abs(dy) !== radius) {
          continue;
        }
        const x = origin.x + dx;
        const y = origin.y + dy;
        if (!isInWorldBounds(world, x, y) || isBlockedTile(world, x, y)) {
          continue;
        }
        return { x, y };
      }
    }
  }
  return null;
}

/**
 * Replenishes forests whose regrowth timer has elapsed.
 * @param {import('../shared/types.js').WorldState} world
 */
function applyForestRegrowth(world) {
  const ready = world.pendingForestRegrowth.filter(
    (entry) => entry.readyAtTick <= world.tick
  );
  world.pendingForestRegrowth = world.pendingForestRegrowth.filter(
    (entry) => entry.readyAtTick > world.tick
  );
  for (const entry of ready) {
    let position = null;
    if (
      typeof entry.x === 'number' &&
      typeof entry.y === 'number' &&
      isInWorldBounds(world, entry.x, entry.y) &&
      !isBlockedTile(world, entry.x, entry.y)
    ) {
      position = { x: entry.x, y: entry.y };
    }
    if (!position) {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const candidate = randomWorldPosition(world);
        if (!isBlockedTile(world, candidate.x, candidate.y)) {
          position = candidate;
          break;
        }
      }
    }
    if (position) {
      world.forests.push(createForestNode(position.x, position.y));
    }
  }
}

/**
 * Enqueues a depleted forest for delayed random regrowth.
 * @param {import('../shared/types.js').WorldState} world
 * @param {{x: number, y: number}} origin
 */
function queueForestRegrowth(world, origin) {
  const minTicks = Math.max(1, GAME_RULES.forests.regrowthTicksMin);
  const maxTicks = Math.max(minTicks, GAME_RULES.forests.regrowthTicksMax);
  const delay =
    minTicks + Math.floor(Math.random() * (maxTicks - minTicks + 1));
  world.pendingForestRegrowth.push({
    readyAtTick: world.tick + delay,
    x: origin.x,
    y: origin.y
  });
}

/**
 * Returns whether shelter capacity can currently cover all alive civlings.
 * @param {import('../shared/types.js').WorldState} world
 * @returns {boolean}
 */
function hasFullShelterCoverage(world) {
  const aliveCount = getAliveCivlings(world).length;
  return aliveCount > 0 && world.resources.shelterCapacity >= aliveCount;
}

/**
 * Returns whether a civling is exposed to harsh weather.
 * @param {import('../shared/types.js').Civling} civling
 * @param {import('../shared/types.js').WorldState} world
 * @returns {boolean}
 */
function isExposedToWeather(civling, world) {
  if (!hasFullShelterCoverage(world)) {
    return true;
  }
  const action = civling.currentTask?.action;
  if (!action) {
    return false;
  }
  return (
    action !== ACTIONS.REST &&
    action !== ACTIONS.BUILD_SHELTER &&
    action !== ACTIONS.BUILD_STORAGE &&
    action !== ACTIONS.EAT
  );
}

function markDeadIfNeeded(civling) {
  if (civling.health <= 0 || civling.hunger >= 100) {
    civling.status = 'dead';
    civling.health = 0;
  }
}

/**
 * Checks whether a civling is below adult age.
 * @param {import('../shared/types.js').Civling} civling
 * @returns {boolean}
 */
function isYoungCivling(civling) {
  return civling.age < GAME_RULES.reproduction.minAdultAge;
}

/**
 * Returns true when a milestone is unlocked.
 * @param {import('../shared/types.js').WorldState} world
 * @param {string} milestone
 * @returns {boolean}
 */
function hasMilestone(world, milestone) {
  return world.milestones.includes(milestone);
}

/**
 * Returns whether this civling can use care action.
 * @param {import('../shared/types.js').WorldState} world
 * @param {import('../shared/types.js').Civling} civling
 * @returns {boolean}
 */
function canUseCareAction(world, civling) {
  return (
    !isYoungCivling(civling) &&
    hasMilestone(world, MILESTONES.TOOLS) &&
    civling.energy >= GAME_RULES.healing.careMinEnergy &&
    civling.hunger <= GAME_RULES.healing.careMaxHunger
  );
}

/**
 * Returns age-appropriate allowed actions for a civling.
 * @param {import('../shared/types.js').Civling} civling
 * @returns {readonly string[]}
 */
export function getAllowedActionsForCivling(civling, world = null) {
  const base = isYoungCivling(civling)
    ? YOUNG_ALLOWED_ACTIONS
    : ADULT_ALLOWED_ACTIONS;
  if (!world || !base.includes(ACTIONS.CARE)) {
    return base;
  }
  return canUseCareAction(world, civling)
    ? base
    : base.filter((action) => action !== ACTIONS.CARE);
}

/**
 * Resolves an action while enforcing age restrictions.
 * @param {import('../shared/types.js').Civling} civling
 * @param {string|undefined} requestedAction
 * @returns {string}
 */
function resolveCivlingAction(world, civling, requestedAction) {
  if (requestedAction === ACTIONS.EAT) {
    return ACTIONS.EAT;
  }
  const allowed = getAllowedActionsForCivling(civling, world);
  if (requestedAction && allowed.includes(requestedAction)) {
    return requestedAction;
  }
  if (isYoungCivling(civling)) {
    return civling.energy <= 35 ? ACTIONS.REST : ACTIONS.LEARN;
  }
  return ACTIONS.REST;
}

/**
 * Creates a display name for newly born civlings.
 * @param {import('../shared/types.js').WorldState} world
 * @returns {string}
 */
function createNewbornName(world) {
  return `${BASE_NAMES[world.civlings.length % BASE_NAMES.length]}-${world.tick}`;
}

/**
 * Returns weighted daily weather by month.
 * @param {number} month
 * @returns {'warm'|'cold'|'snowy'|'rainy'}
 */
function rollDailyWeather(month) {
  const winter = [12, 1, 2].includes(month);
  const summer = [6, 7, 8].includes(month);
  const spring = [3, 4, 5].includes(month);
  if (winter) {
    const pool = ['snowy', 'cold', 'cold', 'rainy', 'warm'];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (summer) {
    const pool = ['warm', 'warm', 'warm', 'rainy', 'cold'];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (spring) {
    const pool = ['rainy', 'warm', 'warm', 'cold', 'rainy'];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const pool = ['cold', 'rainy', 'warm', 'cold', 'rainy'];
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Returns if the current minute is daytime.
 * @param {number} minuteOfDay
 * @returns {'day'|'night'}
 */
function getPhase(minuteOfDay) {
  if (
    minuteOfDay >= TIME.DAY_START_MINUTE &&
    minuteOfDay < TIME.NIGHT_START_MINUTE
  ) {
    return 'day';
  }
  return 'night';
}

/**
 * Refreshes weather and night temperature at day rollover.
 * @param {import('../shared/types.js').WorldState} world
 */
function rollDailyEnvironment(world) {
  world.environment.weather = rollDailyWeather(world.time.month);
  world.environment.nightTemperature = Math.random() < 0.2 ? 'warm' : 'cold';
}

/**
 * Advances game clock and updates day/night transitions.
 * @param {import('../shared/types.js').WorldState} world
 */
function advanceWorldTime(world) {
  world.time.minuteOfDay += TIME.MINUTES_PER_TICK;
  while (world.time.minuteOfDay >= TIME.MINUTES_PER_DAY) {
    world.time.minuteOfDay -= TIME.MINUTES_PER_DAY;
    world.time.day += 1;
    if (world.time.day > TIME.DAYS_PER_MONTH) {
      world.time.day = 1;
      world.time.month += 1;
      if (world.time.month > TIME.MONTHS_PER_YEAR) {
        world.time.month = 1;
        world.time.year += 1;
      }
    }
    rollDailyEnvironment(world);
  }
  world.time.phase = getPhase(world.time.minuteOfDay);
}

/**
 * Resolves duration in minutes for an action.
 * @param {string} action
 * @returns {number}
 */
function getActionDurationMinutes(action) {
  const base = ACTION_DURATION_MINUTES[action] ?? TIME.MINUTES_PER_TICK;
  if (Array.isArray(base)) {
    return base[Math.floor(Math.random() * base.length)];
  }
  return base;
}

/**
 * Finds the nearest reachable forest with remaining wood.
 * @param {import('../shared/types.js').WorldState} world
 * @param {import('../shared/types.js').Civling} civling
 * @returns {{forest: import('../shared/types.js').ForestNode, path: import('../shared/types.js').Position[]}|null}
 */
function findNearestReachableForest(world, civling) {
  let best = null;
  for (const forest of world.forests) {
    if (forest.woodRemaining <= 0) {
      continue;
    }
    const path = buildPath(world, civling, forest);
    if (!path) {
      continue;
    }
    if (!best || path.length < best.path.length) {
      best = { forest, path };
    }
  }
  return best;
}

/**
 * Finds the best drop-off site for carrying wood.
 * @param {import('../shared/types.js').WorldState} world
 * @param {{x: number, y: number}} from
 * @returns {{site: import('../shared/types.js').StorageSite|import('../shared/types.js').ShelterSite, type: 'storage'|'shelter', path: import('../shared/types.js').Position[]}|null}
 */
function findNearestWoodDropoff(world, from) {
  const storagesWithSpace = world.storages.filter(
    (site) => site.woodStored < site.woodCapacity
  );
  const sheltersWithSpace = world.shelters.filter(
    (site) => site.woodStored < site.woodCapacity
  );
  const candidates =
    storagesWithSpace.length > 0
      ? storagesWithSpace.map((site) => ({ site, type: 'storage' }))
      : sheltersWithSpace.map((site) => ({ site, type: 'shelter' }));
  let best = null;
  for (const candidate of candidates) {
    const path = buildPath(world, from, candidate.site);
    if (!path) {
      continue;
    }
    if (!best || path.length < best.path.length) {
      best = { ...candidate, path };
    }
  }
  return best;
}

/**
 * Builds task metadata for gathering wood through travel, harvest, and drop-off.
 * @param {import('../shared/types.js').WorldState} world
 * @param {import('../shared/types.js').Civling} civling
 * @returns {{duration: number, meta: Object<string, unknown>}}
 */
function getGatherWoodTaskPlan(world, civling) {
  const nearestForest = findNearestReachableForest(world, civling);
  if (!nearestForest) {
    return {
      duration: TIME.MINUTES_PER_TICK,
      meta: { failed: true, reason: 'no_reachable_forest' }
    };
  }
  const dropoff = findNearestWoodDropoff(world, nearestForest.forest);
  const harvestMinutes = Math.max(
    TIME.MINUTES_PER_TICK,
    GAME_RULES.forests.harvestMinutes
  );
  const walkMinutes = nearestForest.path.length * TIME.MINUTES_PER_TICK;
  const returnMinutes = dropoff ? dropoff.path.length * TIME.MINUTES_PER_TICK : 0;
  const initialPhase =
    nearestForest.path.length > 0 ? 'travel_to_source' : 'work_at_source';
  return {
    duration: Math.max(
      TIME.MINUTES_PER_TICK,
      harvestMinutes + walkMinutes + returnMinutes
    ),
    meta: {
      phase: initialPhase,
      source: {
        id: nearestForest.forest.id,
        kind: 'forest',
        x: nearestForest.forest.x,
        y: nearestForest.forest.y
      },
      dropoff: dropoff
        ? {
            id: dropoff.site.id,
            kind: dropoff.type,
            x: dropoff.site.x,
            y: dropoff.site.y
          }
        : null,
      paths: {
        toSource: nearestForest.path,
        toDropoff: dropoff?.path ?? []
      },
      pathProgress: {
        toSource: 0,
        toDropoff: 0
      },
      workMinutesRemaining: harvestMinutes,
      yield: {
        resource: 'wood',
        amount: ACTION_VALUES[ACTIONS.GATHER_WOOD].wood,
        carried: 0
      },
      totalTaskMinutes: walkMinutes + harvestMinutes + returnMinutes,
      phases: {
        travelToSourceMinutes: walkMinutes,
        workMinutes: harvestMinutes,
        travelToDropoffMinutes: returnMinutes
      }
    }
  };
}

/**
 * Returns true when task metadata follows the gather-task contract.
 * @param {Object<string, unknown>|null|undefined} taskMeta
 * @returns {boolean}
 */
function isGatherTaskMeta(taskMeta) {
  return Boolean(
    taskMeta &&
      typeof taskMeta === 'object' &&
      typeof taskMeta.phase === 'string' &&
      taskMeta.paths &&
      typeof taskMeta.paths === 'object' &&
      taskMeta.yield &&
      typeof taskMeta.yield === 'object'
  );
}

/**
 * Resolves a forest node from gather metadata.
 * @param {import('../shared/types.js').WorldState} world
 * @param {Object<string, unknown>} taskMeta
 * @returns {import('../shared/types.js').ForestNode|null}
 */
function resolveGatherForest(world, taskMeta) {
  const source = taskMeta.source;
  if (!source || typeof source !== 'object' || typeof source.id !== 'string') {
    return null;
  }
  return world.forests.find((node) => node.id === source.id) ?? null;
}

/**
 * Applies gather harvest output when work phase completes.
 * @param {import('../shared/types.js').WorldState} world
 * @param {import('../shared/types.js').Civling} civling
 * @param {Object<string, unknown>} taskMeta
 */
function applyGatherHarvest(world, civling, taskMeta) {
  if (taskMeta.failed) {
    return;
  }
  const forest = resolveGatherForest(world, taskMeta);
  const yieldInfo =
    taskMeta.yield && typeof taskMeta.yield === 'object' ? taskMeta.yield : null;
  const plannedAmount =
    yieldInfo && typeof yieldInfo.amount === 'number' ? yieldInfo.amount : 0;

  if (!forest || forest.woodRemaining <= 0) {
    taskMeta.failed = true;
    taskMeta.reason = 'forest_depleted_before_work';
    taskMeta.phase = 'done';
    return;
  }

  const harvested = Math.min(plannedAmount, forest.woodRemaining);
  forest.woodRemaining -= harvested;
  if (yieldInfo) {
    yieldInfo.carried = harvested;
  }

  if (forest.woodRemaining <= 0) {
    world.forests = world.forests.filter((node) => node.id !== forest.id);
    queueForestRegrowth(world, { x: forest.x, y: forest.y });
    addMemory(civling, `Depleted forest at ${forest.x},${forest.y}.`);
  }
}

/**
 * Applies gather deposit output at dropoff phase boundary.
 * @param {import('../shared/types.js').WorldState} world
 * @param {import('../shared/types.js').Civling} civling
 * @param {Object<string, unknown>} taskMeta
 */
function applyGatherDeposit(world, civling, taskMeta) {
  const yieldInfo =
    taskMeta.yield && typeof taskMeta.yield === 'object' ? taskMeta.yield : null;
  const carried =
    yieldInfo && typeof yieldInfo.carried === 'number' ? yieldInfo.carried : 0;
  if (carried <= 0) {
    return;
  }

  if (!taskMeta.dropoff) {
    addMemory(civling, 'Harvested wood but no shelter/storage had room.');
    if (yieldInfo) {
      yieldInfo.carried = 0;
    }
    return;
  }

  const dropoffSite = resolveDropoffByTaskMeta(world, taskMeta);
  if (!dropoffSite) {
    addMemory(civling, 'Harvested wood but no shelter/storage had room.');
    if (yieldInfo) {
      yieldInfo.carried = 0;
    }
    return;
  }

  const freeCapacity = Math.max(0, dropoffSite.woodCapacity - dropoffSite.woodStored);
  const storedAmount = Math.min(carried, freeCapacity);
  if (storedAmount > 0) {
    dropoffSite.woodStored += storedAmount;
    world.resources.wood += storedAmount;
    addMemory(
      civling,
      `Collected ${storedAmount} wood and stored it at ${dropoffSite.x},${dropoffSite.y}.`
    );
  } else {
    addMemory(civling, 'All nearby shelter/storage wood slots were full.');
  }
  if (yieldInfo) {
    yieldInfo.carried = 0;
  }
}

/**
 * Progresses gather-task phases using one tick of movement/work budget.
 * @param {import('../shared/types.js').WorldState} world
 * @param {import('../shared/types.js').Civling} civling
 * @param {Object<string, unknown>} taskMeta
 * @returns {number}
 */
function progressGatherTask(world, civling, taskMeta) {
  let minutesConsumed = 0;
  let minutesBudget = TIME.MINUTES_PER_TICK;

  while (minutesBudget > 0 && taskMeta.phase !== 'done') {
    if (taskMeta.phase === 'travel_to_source') {
      const paths = taskMeta.paths;
      if (!taskMeta.pathProgress || typeof taskMeta.pathProgress !== 'object') {
        taskMeta.pathProgress = { toSource: 0, toDropoff: 0 };
      }
      const progress = taskMeta.pathProgress;
      const path = Array.isArray(paths?.toSource) ? paths.toSource : [];
      const pathIndex =
        progress && typeof progress.toSource === 'number' ? progress.toSource : 0;
      if (pathIndex >= path.length) {
        taskMeta.phase = 'work_at_source';
        continue;
      }
      if (minutesBudget < TIME.MINUTES_PER_TICK) {
        break;
      }
      const nextTile = path[pathIndex];
      if (!nextTile) {
        taskMeta.phase = 'work_at_source';
        continue;
      }
      civling.x = nextTile.x;
      civling.y = nextTile.y;
      progress.toSource = pathIndex + 1;
      minutesConsumed += TIME.MINUTES_PER_TICK;
      minutesBudget -= TIME.MINUTES_PER_TICK;
      if (progress.toSource >= path.length) {
        taskMeta.phase = 'work_at_source';
      }
      continue;
    }

    if (taskMeta.phase === 'work_at_source') {
      const workRemaining =
        typeof taskMeta.workMinutesRemaining === 'number'
          ? taskMeta.workMinutesRemaining
          : 0;
      if (workRemaining <= 0) {
        applyGatherHarvest(world, civling, taskMeta);
        if (taskMeta.phase === 'done') {
          break;
        }
        taskMeta.phase = taskMeta.dropoff ? 'travel_to_dropoff' : 'deposit_output';
        continue;
      }
      const workSlice = Math.min(workRemaining, minutesBudget);
      taskMeta.workMinutesRemaining = workRemaining - workSlice;
      minutesConsumed += workSlice;
      minutesBudget -= workSlice;
      if (taskMeta.workMinutesRemaining <= 0) {
        applyGatherHarvest(world, civling, taskMeta);
        if (taskMeta.phase === 'done') {
          break;
        }
        taskMeta.phase = taskMeta.dropoff ? 'travel_to_dropoff' : 'deposit_output';
      }
      continue;
    }

    if (taskMeta.phase === 'travel_to_dropoff') {
      const paths = taskMeta.paths;
      if (!taskMeta.pathProgress || typeof taskMeta.pathProgress !== 'object') {
        taskMeta.pathProgress = { toSource: 0, toDropoff: 0 };
      }
      const progress = taskMeta.pathProgress;
      const path = Array.isArray(paths?.toDropoff) ? paths.toDropoff : [];
      const pathIndex =
        progress && typeof progress.toDropoff === 'number'
          ? progress.toDropoff
          : 0;
      if (pathIndex >= path.length) {
        taskMeta.phase = 'deposit_output';
        continue;
      }
      if (minutesBudget < TIME.MINUTES_PER_TICK) {
        break;
      }
      const nextTile = path[pathIndex];
      if (!nextTile) {
        taskMeta.phase = 'deposit_output';
        continue;
      }
      civling.x = nextTile.x;
      civling.y = nextTile.y;
      progress.toDropoff = pathIndex + 1;
      minutesConsumed += TIME.MINUTES_PER_TICK;
      minutesBudget -= TIME.MINUTES_PER_TICK;
      if (progress.toDropoff >= path.length) {
        taskMeta.phase = 'deposit_output';
      }
      continue;
    }

    if (taskMeta.phase === 'deposit_output') {
      applyGatherDeposit(world, civling, taskMeta);
      taskMeta.phase = 'done';
    }
  }

  return minutesConsumed;
}

/**
 * Starts a timed task for a civling.
 * @param {import('../shared/types.js').WorldState} world
 * @param {import('../shared/types.js').Civling} civling
 * @param {string} action
 * @param {number} tick
 */
function startTask(world, civling, action, tick) {
  const plan =
    action === ACTIONS.GATHER_WOOD
      ? getGatherWoodTaskPlan(world, civling)
      : { duration: getActionDurationMinutes(action), meta: null };
  const duration =
    action === ACTIONS.GATHER_WOOD &&
    plan.meta &&
    typeof plan.meta === 'object' &&
    typeof plan.meta.totalTaskMinutes === 'number'
      ? Math.max(TIME.MINUTES_PER_TICK, plan.meta.totalTaskMinutes)
      : plan.duration;
  civling.currentTask = {
    action,
    totalMinutes: duration,
    remainingMinutes: duration,
    startedAtTick: tick,
    meta: plan.meta ?? undefined
  };
}

/**
 * Progresses a task by one simulation tick.
 * @param {import('../shared/types.js').WorldState} world
 * @param {import('../shared/types.js').Civling} civling
 * @returns {{inProgress: boolean, completedAction: string|null}}
 */
function progressTask(world, civling) {
  if (!civling.currentTask) {
    return { inProgress: false, completedAction: null };
  }

  let minutesSpent = TIME.MINUTES_PER_TICK;
  if (
    civling.currentTask.action === ACTIONS.GATHER_WOOD &&
    isGatherTaskMeta(civling.currentTask.meta)
  ) {
    minutesSpent = progressGatherTask(world, civling, civling.currentTask.meta);
  }
  civling.currentTask.remainingMinutes -= minutesSpent;

  if (civling.currentTask.remainingMinutes > 0) {
    return { inProgress: true, completedAction: null };
  }
  if (
    civling.currentTask.action === ACTIONS.GATHER_WOOD &&
    isGatherTaskMeta(civling.currentTask.meta) &&
    civling.currentTask.meta.phase !== 'done'
  ) {
    return { inProgress: true, completedAction: null };
  }

  const task = civling.currentTask;
  const completedAction = task.action;
  civling.currentTask = null;
  applyAction(world, civling, completedAction, task.meta ?? null);
  return { inProgress: false, completedAction };
}

/**
 * Starts an automatic eat task if hunger is high and food exists.
 * @param {import('../shared/types.js').WorldState} world
 * @param {import('../shared/types.js').Civling} civling
 * @returns {boolean}
 */
function maybeStartEatTask(world, civling) {
  if (civling.currentTask || world.resources.food <= 0) {
    return false;
  }
  if (civling.hunger < GAME_RULES.food.eatHungerThreshold) {
    return false;
  }
  startTask(world, civling, ACTIONS.EAT, world.tick);
  return true;
}

/**
 * Finds an injured civling to receive care.
 * @param {import('../shared/types.js').WorldState} world
 * @param {import('../shared/types.js').Civling} caregiver
 * @returns {import('../shared/types.js').Civling|null}
 */
function findCareTarget(world, caregiver) {
  const injured = getAliveCivlings(world)
    .filter((candidate) => candidate.health < 100)
    .sort((left, right) => left.health - right.health);
  if (!injured.length) {
    return null;
  }
  return (
    injured.find((candidate) => candidate.id !== caregiver.id) ?? injured[0]
  );
}

/**
 * Creates a full civling object with randomized personality traits.
 * @param {Object} options
 * @param {string} options.id
 * @param {string} options.name
 * @param {number} options.age
 * @param {'male'|'female'} options.gender
 * @param {number} options.babyChance
 * @param {number} options.x
 * @param {number} options.y
 * @param {string[]} [options.memory]
 * @returns {import('../shared/types.js').Civling}
 */
function createCivling({
  id,
  name,
  age,
  gender,
  babyChance,
  x,
  y,
  memory = []
}) {
  const personality = createRandomPersonality();
  return {
    id,
    name,
    age,
    health: 100,
    energy: 70,
    hunger: age === 0 ? 25 : 30,
    role: 'generalist',
    gender,
    memory: [...memory],
    status: 'alive',
    foodEatenLastTick: 0,
    reproductionAttempts: 0,
    babiesBorn: 0,
    shelterBuildAttempts: 0,
    shelterBuildSuccesses: 0,
    shelterBuildFailures: 0,
    babyChance,
    reproduceIntentTick: null,
    currentTask: null,
    personality,
    x,
    y
  };
}

/**
 * Seeds initial forests at random walkable positions.
 * @param {import('../shared/types.js').WorldState} world
 */
function seedInitialForests(world) {
  const desired = Math.max(1, GAME_RULES.forests.initialCount);
  const occupied = new Set(
    world.civlings.map((item) => toCoordKey(item.x, item.y))
  );
  for (let count = 0; count < desired; count += 1) {
    let position = null;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const candidate = randomWorldPosition(world);
      const key = toCoordKey(candidate.x, candidate.y);
      if (occupied.has(key) || isBlockedTile(world, candidate.x, candidate.y)) {
        continue;
      }
      position = candidate;
      occupied.add(key);
      break;
    }
    if (position) {
      world.forests.push(createForestNode(position.x, position.y));
    }
  }
}

/**
 * @param {{runId?: string, civlingCount?: number, restartCount?: number}} options
 */
export function createInitialWorldState(options = {}) {
  const runId = options.runId ?? randomId('run');
  const civlingCount = options.civlingCount ?? 4;
  const restartCount = options.restartCount ?? 0;
  const defaultBabyChance = clamp(
    GAME_RULES.reproduction.conceptionChance ?? 0.35,
    0,
    1
  );

  const civlings = Array.from({ length: civlingCount }, (_, idx) =>
    createCivling({
      id: randomId('civ'),
      name: BASE_NAMES[idx % BASE_NAMES.length],
      age: 18 + idx,
      gender: idx % 2 === 0 ? 'male' : 'female',
      babyChance: defaultBabyChance,
      x: idx * 2,
      y: 0
    })
  );

  /** @type {import('../shared/types.js').WorldState} */
  const world = {
    runId,
    tick: 0,
    restartCount,
    time: {
      minuteOfDay: TIME.DAY_START_MINUTE,
      day: 1,
      month: 1,
      year: 1,
      phase: 'day'
    },
    environment: {
      weather: 'cold',
      nightTemperature: 'cold'
    },
    resources: {
      food: 12,
      wood: 6,
      shelterCapacity: 0
    },
    milestones: [],
    civlings,
    map: {
      width: GAME_RULES.world.width,
      height: GAME_RULES.world.height
    },
    forests: [],
    shelters: [],
    storages: [],
    pendingForestRegrowth: [],
    extinction: {
      ended: false,
      cause: null,
      tick: null
    }
  };
  seedInitialForests(world);
  return world;
}

/**
 * @param {string} action
 */
export function isValidAction(action) {
  return Object.values(ACTIONS).includes(action);
}

/**
 * @param {import('../shared/types.js').WorldState} world
 */
export function getAliveCivlings(world) {
  return world.civlings.filter((civling) => civling.status === 'alive');
}

/**
 * @param {import('../shared/types.js').WorldState} world
 */
export function evaluateMilestones(world) {
  if (
    world.resources.shelterCapacity > 0 &&
    !world.milestones.includes(MILESTONES.SHELTER)
  ) {
    world.milestones.push(MILESTONES.SHELTER);
  }
  if (
    world.resources.wood >= 18 &&
    !world.milestones.includes(MILESTONES.TOOLS)
  ) {
    world.milestones.push(MILESTONES.TOOLS);
  }
  if (
    world.resources.food >= 30 &&
    !world.milestones.includes(MILESTONES.AGRICULTURE)
  ) {
    world.milestones.push(MILESTONES.AGRICULTURE);
  }
  if (
    world.milestones.includes(MILESTONES.SHELTER) &&
    world.milestones.includes(MILESTONES.TOOLS) &&
    !world.milestones.includes(MILESTONES.FIRE)
  ) {
    world.milestones.push(MILESTONES.FIRE);
  }
}

function updateVitals(
  civling,
  { hungerDelta = 0, energyDelta = 0, healthDelta = 0 }
) {
  civling.hunger = clamp(civling.hunger + hungerDelta, 0, 100);
  civling.energy = clamp(civling.energy + energyDelta, 0, 100);
  civling.health = clamp(civling.health + healthDelta, 0, 100);
}

/**
 * Finds a dropoff structure by task metadata.
 * @param {import('../shared/types.js').WorldState} world
 * @param {Object<string, unknown>|null} taskMeta
 * @returns {import('../shared/types.js').StorageSite|import('../shared/types.js').ShelterSite|null}
 */
function resolveDropoffByTaskMeta(world, taskMeta) {
  if (!taskMeta || typeof taskMeta !== 'object') {
    return null;
  }
  const modernDropoff = taskMeta.dropoff;
  if (
    modernDropoff &&
    typeof modernDropoff === 'object' &&
    typeof modernDropoff.id === 'string' &&
    typeof modernDropoff.kind === 'string'
  ) {
    if (modernDropoff.kind === 'storage') {
      return world.storages.find((site) => site.id === modernDropoff.id) ?? null;
    }
    if (modernDropoff.kind === 'shelter') {
      return world.shelters.find((site) => site.id === modernDropoff.id) ?? null;
    }
  }

  const dropoffId = taskMeta.dropoffId;
  const dropoffType = taskMeta.dropoffType;
  if (typeof dropoffId !== 'string' || typeof dropoffType !== 'string') {
    return null;
  }
  if (dropoffType === 'storage') {
    return world.storages.find((site) => site.id === dropoffId) ?? null;
  }
  if (dropoffType === 'shelter') {
    return world.shelters.find((site) => site.id === dropoffId) ?? null;
  }
  return null;
}

/**
 * Applies action effects after the timed task completes.
 * @param {import('../shared/types.js').WorldState} world
 * @param {import('../shared/types.js').Civling} civling
 * @param {string} action
 * @param {Object<string, unknown>|null} [taskMeta]
 */
export function applyAction(world, civling, action, taskMeta = null) {
  const values = ACTION_VALUES[action] ?? ACTION_VALUES[ACTIONS.REST];
  const aliveAdults = getAliveCivlings(world).filter(
    (item) => item.age >= GAME_RULES.reproduction.minAdultAge
  ).length;

  if (action === ACTIONS.PLAY) {
    updateVitals(civling, {
      hungerDelta: values.hungerDelta,
      energyDelta: values.energyGain,
      healthDelta: values.healthDelta + (aliveAdults > 0 ? 1 : -2)
    });
    addMemory(
      civling,
      aliveAdults > 0
        ? 'Played under adult supervision.'
        : 'Played alone and felt unsafe.'
    );
  }

  if (action === ACTIONS.LEARN) {
    if (Math.random() < values.chanceFood) {
      world.resources.food += 1;
    }
    if (Math.random() < values.chanceWood) {
      world.resources.wood += 1;
    }
    updateVitals(civling, {
      hungerDelta: values.hungerDelta,
      energyDelta: -values.energyCost,
      healthDelta: aliveAdults > 0 ? 1 : -1
    });
    addMemory(
      civling,
      aliveAdults > 0
        ? 'Learned from adults and nearby nature.'
        : 'Learned from the environment without adult help.'
    );
  }

  if (action === ACTIONS.EAT) {
    if (world.resources.food > 0) {
      world.resources.food -= 1;
      updateVitals(civling, {
        hungerDelta: values.hungerDelta,
        energyDelta: values.energyGain
      });
      civling.foodEatenLastTick = (civling.foodEatenLastTick ?? 0) + 1;
      addMemory(civling, 'Finished eating shared food.');
    } else {
      addMemory(civling, 'Tried to eat but no food was available.');
    }
  }

  if (action === ACTIONS.CARE) {
    const target = findCareTarget(world, civling);
    updateVitals(civling, {
      hungerDelta: values.hungerDelta,
      energyDelta: -values.energyCost,
      healthDelta: values.healSelf
    });
    if (target) {
      target.health = clamp(target.health + values.healTarget, 0, 100);
      addMemory(civling, `Provided care to ${target.name}.`);
      addMemory(target, `Received care from ${civling.name}.`);
    } else {
      addMemory(civling, 'Prepared healing supplies, but nobody needed care.');
    }
  }

  if (action === ACTIONS.GATHER_FOOD) {
    world.resources.food += values.food;
    updateVitals(civling, {
      hungerDelta: values.hungerDelta,
      energyDelta: -values.energyCost
    });
    addMemory(civling, 'Gathered food.');
  }

  if (action === ACTIONS.GATHER_WOOD) {
    if (isGatherTaskMeta(taskMeta)) {
      if (taskMeta.failed) {
        addMemory(civling, 'Could not gather wood (no reachable forest).');
      } else if (
        taskMeta.yield &&
        typeof taskMeta.yield === 'object' &&
        typeof taskMeta.yield.amount === 'number'
      ) {
        addMemory(civling, `Completed wood run (${taskMeta.yield.amount} planned).`);
      } else {
        addMemory(civling, 'Completed wood run.');
      }
      updateVitals(civling, {
        hungerDelta: values.hungerDelta,
        energyDelta: -values.energyCost
      });
    } else if (taskMeta?.failed) {
      addMemory(civling, 'Could not gather wood (no reachable forest).');
      updateVitals(civling, {
        hungerDelta: values.hungerDelta,
        energyDelta: -values.energyCost
      });
    } else {
      const forestId =
        taskMeta && typeof taskMeta.forestId === 'string'
          ? taskMeta.forestId
          : null;
      const forest =
        (forestId && world.forests.find((node) => node.id === forestId)) ??
        findNearestReachableForest(world, civling)?.forest ??
        null;
      if (!forest || forest.woodRemaining <= 0) {
        addMemory(civling, 'Arrived for wood, but the forest was depleted.');
      } else {
        const harvested = Math.min(values.wood, forest.woodRemaining);
        forest.woodRemaining -= harvested;
        civling.x = forest.x;
        civling.y = forest.y;
        if (forest.woodRemaining <= 0) {
          world.forests = world.forests.filter((node) => node.id !== forest.id);
          queueForestRegrowth(world, { x: forest.x, y: forest.y });
          addMemory(civling, `Depleted forest at ${forest.x},${forest.y}.`);
        }

        const dropoffSite =
          resolveDropoffByTaskMeta(world, taskMeta) ??
          findNearestWoodDropoff(world, forest)?.site ??
          null;
        if (!dropoffSite) {
          addMemory(civling, 'Harvested wood but no shelter/storage had room.');
        } else {
          const freeCapacity = Math.max(
            0,
            dropoffSite.woodCapacity - dropoffSite.woodStored
          );
          const storedAmount = Math.min(harvested, freeCapacity);
          if (storedAmount > 0) {
            dropoffSite.woodStored += storedAmount;
            world.resources.wood += storedAmount;
            civling.x = dropoffSite.x;
            civling.y = dropoffSite.y;
            addMemory(
              civling,
              `Collected ${storedAmount} wood and stored it at ${dropoffSite.x},${dropoffSite.y}.`
            );
          } else {
            addMemory(
              civling,
              'All nearby shelter/storage wood slots were full.'
            );
          }
        }
      }
      updateVitals(civling, {
        hungerDelta: values.hungerDelta,
        energyDelta: -values.energyCost
      });
    }
  }

  if (action === ACTIONS.BUILD_SHELTER) {
    civling.shelterBuildAttempts = (civling.shelterBuildAttempts ?? 0) + 1;
    const shelterWoodCost = GAME_RULES.shelter.woodCostPerUnit;
    const shelterCapacityGain = GAME_RULES.shelter.capacityPerUnit;
    if (world.resources.wood >= shelterWoodCost) {
      world.resources.wood -= shelterWoodCost;
      world.resources.shelterCapacity += shelterCapacityGain;
      const buildAt = findNearbyBuildTile(world, civling);
      if (buildAt) {
        world.shelters.push({
          id: randomId('shelter'),
          x: buildAt.x,
          y: buildAt.y,
          woodStored: 0,
          woodCapacity: GAME_RULES.shelter.woodCapacityPerUnit
        });
        civling.x = buildAt.x;
        civling.y = buildAt.y;
      }
      civling.shelterBuildSuccesses = (civling.shelterBuildSuccesses ?? 0) + 1;
      addMemory(civling, 'Expanded shelter with local wood storage.');
    } else {
      civling.shelterBuildFailures = (civling.shelterBuildFailures ?? 0) + 1;
      addMemory(civling, 'Failed to build shelter (no wood).');
    }
    updateVitals(civling, {
      hungerDelta: values.hungerDelta,
      energyDelta: -values.energyCost
    });
  }

  if (action === ACTIONS.BUILD_STORAGE) {
    const storageWoodCost = GAME_RULES.storage.woodCostPerUnit;
    if (world.resources.wood >= storageWoodCost) {
      world.resources.wood -= storageWoodCost;
      const buildAt = findNearbyBuildTile(world, civling);
      if (buildAt) {
        world.storages.push({
          id: randomId('storage'),
          x: buildAt.x,
          y: buildAt.y,
          woodStored: 0,
          woodCapacity: GAME_RULES.storage.woodCapacityPerUnit
        });
        civling.x = buildAt.x;
        civling.y = buildAt.y;
        addMemory(civling, `Built storage at ${buildAt.x},${buildAt.y}.`);
      } else {
        addMemory(civling, 'Had wood for storage but found no buildable tile.');
      }
    } else {
      addMemory(civling, 'Failed to build storage (no wood).');
    }
    updateVitals(civling, {
      hungerDelta: values.hungerDelta,
      energyDelta: -values.energyCost
    });
  }

  if (action === ACTIONS.REST) {
    const aliveCount = getAliveCivlings(world).length;
    const hasShelterCoverage =
      world.resources.shelterCapacity >= aliveCount && aliveCount > 0;
    const shelterBonus = hasShelterCoverage
      ? GAME_RULES.shelter.restEnergyBonusWhenSheltered
      : 0;
    updateVitals(civling, {
      hungerDelta: values.hungerDelta,
      energyDelta: values.energyGain + shelterBonus
    });
    addMemory(civling, 'Rested to recover energy.');
  }

  if (action === ACTIONS.EXPLORE) {
    if (Math.random() < values.chanceFood) {
      world.resources.food += 1;
    }
    if (Math.random() < values.chanceWood) {
      world.resources.wood += 1;
    }
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const [dx, dy] =
        CARDINAL_DIRECTIONS[
          Math.floor(Math.random() * CARDINAL_DIRECTIONS.length)
        ];
      const nextX = civling.x + dx;
      const nextY = civling.y + dy;
      if (
        !isInWorldBounds(world, nextX, nextY) ||
        isBlockedTile(world, nextX, nextY)
      ) {
        continue;
      }
      civling.x = nextX;
      civling.y = nextY;
      break;
    }
    updateVitals(civling, {
      hungerDelta: values.hungerDelta,
      energyDelta: -values.energyCost
    });
    addMemory(civling, 'Explored nearby terrain.');
  }

  if (action === ACTIONS.REPRODUCE) {
    civling.reproduceIntentTick = world.tick;
    updateVitals(civling, {
      hungerDelta: values.hungerDelta,
      energyDelta: -values.energyCost
    });
    addMemory(civling, 'Attempted to reproduce.');
  }

  markDeadIfNeeded(civling);
}

/**
 * Applies global effects at end of tick.
 * @param {import('../shared/types.js').WorldState} world
 */
function postTickWorldEffects(world) {
  const alive = getAliveCivlings(world);
  const aliveAdults = alive.filter(
    (civling) => civling.age >= GAME_RULES.reproduction.minAdultAge
  );

  for (const civling of alive) {
    const wasYoung = isYoungCivling(civling);
    const exposed = isExposedToWeather(civling, world);
    civling.age += 1 / 12;
    civling.hunger = clamp(civling.hunger + 3, 0, 100);

    if (world.environment.weather === 'snowy') {
      civling.hunger = clamp(civling.hunger + 1, 0, 100);
      if (exposed) {
        civling.health = clamp(civling.health - 30, 0, 100);
        civling.energy = clamp(civling.energy - 12, 0, 100);
        addMemory(civling, 'Suffered severe snow exposure without shelter.');
        if (civling.energy <= 25 || civling.hunger >= 80) {
          civling.health = clamp(civling.health - 20, 0, 100);
        }
      }
    }
    if (
      world.time.phase === 'night' &&
      world.environment.nightTemperature === 'cold'
    ) {
      civling.energy = clamp(civling.energy - (exposed ? 8 : 2), 0, 100);
      if (exposed) {
        civling.health = clamp(civling.health - 10, 0, 100);
        addMemory(civling, 'Took cold-night damage while exposed outside.');
      }
    }

    if (wasYoung && aliveAdults.length === 0) {
      civling.health = clamp(civling.health - 5, 0, 100);
      addMemory(civling, 'Needed adult help, but no grown-ups were available.');
    }

    if (wasYoung && !isYoungCivling(civling)) {
      addMemory(
        civling,
        'Reached adulthood and started helping the community.'
      );
    }

    if (civling.hunger >= 85) {
      civling.health = clamp(civling.health - 8, 0, 100);
    }

    const sheltered = !isExposedToWeather(civling, world);
    if (
      hasMilestone(world, MILESTONES.FIRE) &&
      world.time.phase === 'night' &&
      sheltered
    ) {
      civling.health = clamp(
        civling.health + GAME_RULES.healing.fireNightShelterHeal,
        0,
        100
      );
    }

    if (
      hasMilestone(world, MILESTONES.AGRICULTURE) &&
      civling.hunger <= GAME_RULES.healing.agricultureHungerThreshold &&
      civling.foodEatenLastTick > 0
    ) {
      civling.health = clamp(
        civling.health + GAME_RULES.healing.agricultureNutritionHeal,
        0,
        100
      );
    }

    markDeadIfNeeded(civling);
  }

  if (getAliveCivlings(world).length === 0) {
    world.extinction.ended = true;
    world.extinction.cause = 'all_civlings_dead';
    world.extinction.tick = world.tick;
  }
}

/**
 * Attempts to create one newborn civling when reproduction requirements are met.
 * @param {import('../shared/types.js').WorldState} world
 */
function applyReproduction(world) {
  const rules = GAME_RULES.reproduction;
  if (!rules.enabled) {
    return;
  }

  const adults = getAliveCivlings(world).filter(
    (civling) =>
      civling.age >= rules.minAdultAge &&
      civling.reproduceIntentTick === world.tick
  );
  if (adults.length < 2) {
    return;
  }

  let mother = adults.find((civling) => civling.gender === 'female');
  let father = adults.find((civling) => civling.gender === 'male');

  if (rules.requiresMaleAndFemale && (!mother || !father)) {
    return;
  }

  if (!rules.requiresMaleAndFemale) {
    mother = mother ?? adults[0];
    father = father ?? adults[1];
  }

  const aliveCount = getAliveCivlings(world).length;
  if (
    rules.requiresShelterCapacityAvailable &&
    world.resources.shelterCapacity <= aliveCount
  ) {
    return;
  }

  const conceptionChance = clamp(rules.conceptionChance ?? 0.35, 0, 1);
  if (mother) {
    mother.reproductionAttempts = (mother.reproductionAttempts ?? 0) + 1;
  }
  if (father) {
    father.reproductionAttempts = (father.reproductionAttempts ?? 0) + 1;
  }

  if (Math.random() >= conceptionChance) {
    if (mother) {
      addMemory(mother, 'No baby this time.');
    }
    if (father) {
      addMemory(father, 'No baby this time.');
    }
    return;
  }

  const newbornGender = Math.random() < 0.5 ? 'male' : 'female';
  const newborn = createCivling({
    id: randomId('civ'),
    name: createNewbornName(world),
    age: 0,
    gender: newbornGender,
    babyChance: conceptionChance,
    x: mother?.x ?? 0,
    y: mother?.y ?? 0,
    memory: ['Born this tick.']
  });
  addMemory(
    newborn,
    `Personality: ${newborn.personality.archetype} (${newborn.personality.wayToAct}).`
  );

  world.civlings.push(newborn);

  if (mother) {
    mother.babiesBorn = (mother.babiesBorn ?? 0) + 1;
    addMemory(mother, `Had a child (${newborn.name}).`);
  }
  if (father) {
    father.babiesBorn = (father.babiesBorn ?? 0) + 1;
    addMemory(father, `Had a child (${newborn.name}).`);
  }
}

/**
 * @param {import('../shared/types.js').WorldState} world
 * @param {(civling: import('../shared/types.js').Civling, world: import('../shared/types.js').WorldState) => import('../shared/types.js').ActionEnvelope | Promise<import('../shared/types.js').ActionEnvelope>} decideAction
 * @param {{onDecision?: (entry: {tick: number, civlingId: string, civlingName: string, action: string, reason: string, fallback: boolean, source: string, llmTrace?: {prompt: string, response: string, status: string}|null}) => void}} [options]
 */
export async function runTick(world, decideAction, options = {}) {
  if (world.extinction.ended) {
    return world;
  }

  world.tick += 1;
  advanceWorldTime(world);
  applyForestRegrowth(world);

  for (const civling of getAliveCivlings(world)) {
    civling.foodEatenLastTick = 0;
    civling.reproduceIntentTick = null;

    const taskProgress = progressTask(world, civling);
    if (taskProgress.inProgress) {
      options.onDecision?.({
        tick: world.tick,
        civlingId: civling.id,
        civlingName: civling.name,
        action: civling.currentTask?.action ?? ACTIONS.REST,
        reason: 'task_in_progress',
        fallback: false,
        source: 'task',
        llmTrace: null
      });
      continue;
    }

    if (taskProgress.completedAction) {
      options.onDecision?.({
        tick: world.tick,
        civlingId: civling.id,
        civlingName: civling.name,
        action: taskProgress.completedAction,
        reason: 'task_completed',
        fallback: false,
        source: 'task',
        llmTrace: null
      });
      continue;
    }

    if (maybeStartEatTask(world, civling)) {
      options.onDecision?.({
        tick: world.tick,
        civlingId: civling.id,
        civlingName: civling.name,
        action: ACTIONS.EAT,
        reason: 'auto_eat_needed',
        fallback: false,
        source: 'system',
        llmTrace: null
      });
      continue;
    }

    let envelope;
    let fallback = false;
    try {
      envelope = await decideAction(civling, world);
    } catch {
      envelope = {
        action: ACTIONS.REST,
        reason: 'fallback_after_decision_error',
        source: 'fallback'
      };
      fallback = true;
    }

    const requestedAction = isValidAction(envelope?.action)
      ? envelope.action
      : undefined;
    const action = resolveCivlingAction(world, civling, requestedAction);
    if (action !== envelope?.action) {
      fallback = true;
    }

    startTask(world, civling, action, world.tick);
    options.onDecision?.({
      tick: world.tick,
      civlingId: civling.id,
      civlingName: civling.name,
      action,
      reason: envelope?.reason ?? 'missing_reason',
      fallback,
      source: envelope?.source ?? 'provider',
      llmTrace: envelope?.llmTrace ?? null
    });
  }

  postTickWorldEffects(world);
  applyReproduction(world);
  evaluateMilestones(world);
  return world;
}
