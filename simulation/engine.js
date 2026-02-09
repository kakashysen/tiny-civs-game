import { ACTIONS, ACTION_VALUES, MILESTONES } from '../shared/constants.js';
import { GAME_RULES } from '../shared/gameRules.js';

const BASE_NAMES = ['Ari', 'Bex', 'Cori', 'Dax', 'Ena', 'Fio'];

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

function markDeadIfNeeded(civling) {
  if (civling.health <= 0 || civling.hunger >= 100) {
    civling.status = 'dead';
    civling.health = 0;
  }
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
 * @param {{runId?: string, civlingCount?: number, restartCount?: number}} options
 */
export function createInitialWorldState(options = {}) {
  const runId = options.runId ?? randomId('run');
  const civlingCount = options.civlingCount ?? 4;
  const restartCount = options.restartCount ?? 0;
  const defaultBabyChance = clamp(GAME_RULES.reproduction.conceptionChance ?? 0.35, 0, 1);

  const civlings = Array.from({ length: civlingCount }, (_, idx) => ({
    id: randomId('civ'),
    name: BASE_NAMES[idx % BASE_NAMES.length],
    age: 18 + idx,
    health: 100,
    energy: 70,
    hunger: 30,
    role: 'generalist',
    gender: idx % 2 === 0 ? 'male' : 'female',
    memory: [],
    status: 'alive',
    foodEatenLastTick: 0,
    reproductionAttempts: 0,
    babiesBorn: 0,
    babyChance: defaultBabyChance,
    reproduceIntentTick: null,
    x: idx * 2,
    y: 0
  }));

  return {
    runId,
    tick: 0,
    restartCount,
    resources: {
      food: 12,
      wood: 6,
      shelterCapacity: 0
    },
    milestones: [],
    civlings,
    extinction: {
      ended: false,
      cause: null,
      tick: null
    }
  };
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
  if (world.resources.shelterCapacity > 0 && !world.milestones.includes(MILESTONES.SHELTER)) {
    world.milestones.push(MILESTONES.SHELTER);
  }
  if (world.resources.wood >= 18 && !world.milestones.includes(MILESTONES.TOOLS)) {
    world.milestones.push(MILESTONES.TOOLS);
  }
  if (world.resources.food >= 30 && !world.milestones.includes(MILESTONES.AGRICULTURE)) {
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

function updateVitals(civling, { hungerDelta = 0, energyDelta = 0, healthDelta = 0 }) {
  civling.hunger = clamp(civling.hunger + hungerDelta, 0, 100);
  civling.energy = clamp(civling.energy + energyDelta, 0, 100);
  civling.health = clamp(civling.health + healthDelta, 0, 100);
}

/**
 * Civlings can consume from shared food stock to reduce hunger.
 * @param {import('../shared/types.js').WorldState} world
 * @param {import('../shared/types.js').Civling} civling
 * @param {number} hungerThreshold
 * @param {number} hungerRelief
 */
function consumeFood(
  world,
  civling,
  hungerThreshold = GAME_RULES.food.eatHungerThreshold,
  hungerRelief = GAME_RULES.food.eatHungerRelief
) {
  if (world.resources.food <= 0 || civling.hunger < hungerThreshold) {
    return false;
  }

  world.resources.food -= 1;
  civling.hunger = clamp(civling.hunger - hungerRelief, 0, 100);
  civling.energy = clamp(civling.energy + GAME_RULES.food.eatEnergyGain, 0, 100);
  civling.foodEatenLastTick = (civling.foodEatenLastTick ?? 0) + 1;
  addMemory(civling, 'Ate stored food.');
  return true;
}

/**
 * @param {import('../shared/types.js').WorldState} world
 * @param {import('../shared/types.js').Civling} civling
 * @param {string} action
 */
export function applyAction(world, civling, action) {
  const values = ACTION_VALUES[action] ?? ACTION_VALUES[ACTIONS.REST];

  if (action === ACTIONS.GATHER_FOOD) {
    world.resources.food += values.food;
    updateVitals(civling, {
      hungerDelta: values.hungerDelta,
      energyDelta: -values.energyCost
    });
    addMemory(civling, 'Gathered food.');
  }

  if (action === ACTIONS.GATHER_WOOD) {
    world.resources.wood += values.wood;
    updateVitals(civling, {
      hungerDelta: values.hungerDelta,
      energyDelta: -values.energyCost
    });
    addMemory(civling, 'Collected wood.');
  }

  if (action === ACTIONS.BUILD_SHELTER) {
    const shelterWoodCost = GAME_RULES.shelter.woodCostPerUnit;
    const shelterCapacityGain = GAME_RULES.shelter.capacityPerUnit;
    if (world.resources.wood >= shelterWoodCost) {
      world.resources.wood -= shelterWoodCost;
      world.resources.shelterCapacity += shelterCapacityGain;
      addMemory(civling, 'Expanded shelter.');
    } else {
      addMemory(civling, 'Failed to build shelter (no wood).');
    }
    updateVitals(civling, {
      hungerDelta: values.hungerDelta,
      energyDelta: -values.energyCost
    });
  }

  if (action === ACTIONS.REST) {
    const aliveCount = getAliveCivlings(world).length;
    const hasShelterCoverage = world.resources.shelterCapacity >= aliveCount && aliveCount > 0;
    const shelterBonus = hasShelterCoverage ? GAME_RULES.shelter.restEnergyBonusWhenSheltered : 0;
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
    civling.x += Math.random() > 0.5 ? 1 : -1;
    civling.y += Math.random() > 0.5 ? 1 : -1;
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
 * @param {import('../shared/types.js').WorldState} world
 */
function postTickWorldEffects(world) {
  const alive = getAliveCivlings(world);

  for (const civling of alive) {
    civling.age += 1 / 12;
    civling.hunger = clamp(civling.hunger + 3, 0, 100);

    consumeFood(world, civling);

    if (civling.hunger >= 85) {
      civling.health = clamp(civling.health - 8, 0, 100);
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
      civling.age >= rules.minAdultAge && civling.reproduceIntentTick === world.tick
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
  if (rules.requiresShelterCapacityAvailable && world.resources.shelterCapacity <= aliveCount) {
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
  const newborn = {
    id: randomId('civ'),
    name: createNewbornName(world),
    age: 0,
    health: 100,
    energy: 70,
    hunger: 25,
    role: 'generalist',
    gender: newbornGender,
    memory: ['Born this tick.'],
    status: 'alive',
    foodEatenLastTick: 0,
    reproductionAttempts: 0,
    babiesBorn: 0,
    babyChance: conceptionChance,
    reproduceIntentTick: null,
    x: mother?.x ?? 0,
    y: mother?.y ?? 0
  };

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

  for (const civling of getAliveCivlings(world)) {
    civling.foodEatenLastTick = 0;
    civling.reproduceIntentTick = null;
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

    const action = isValidAction(envelope?.action) ? envelope.action : ACTIONS.REST;
    if (action !== envelope?.action) {
      fallback = true;
    }

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

    applyAction(world, civling, action);
  }

  postTickWorldEffects(world);
  applyReproduction(world);
  evaluateMilestones(world);
  return world;
}
