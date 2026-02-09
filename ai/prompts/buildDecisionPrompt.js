import { ACTIONS } from '../../shared/constants.js';
import { GAME_RULES } from '../../shared/gameRules.js';

/**
 * Calculates reproduction readiness for the current civling.
 * @param {import('../../shared/types.js').Civling} civling
 * @param {import('../../shared/types.js').WorldState} world
 * @param {number} aliveCivlings
 * @param {number} reserveTarget
 */
function getReproductionContext(civling, world, aliveCivlings, reserveTarget) {
  const rules = GAME_RULES.reproduction;
  if (!rules.enabled) {
    return { canReproduceNow: false, reason: 'disabled' };
  }
  if (civling.age < rules.minAdultAge) {
    return { canReproduceNow: false, reason: 'underage' };
  }
  if (civling.energy < 60 || civling.hunger > 55) {
    return { canReproduceNow: false, reason: 'low_vitals' };
  }
  if (world.resources.food < reserveTarget) {
    return { canReproduceNow: false, reason: 'food_reserve_low' };
  }
  if (rules.requiresShelterCapacityAvailable && world.resources.shelterCapacity <= aliveCivlings) {
    return { canReproduceNow: false, reason: 'no_shelter_capacity' };
  }
  const partnerExists = world.civlings.some(
    (item) =>
      item.status === 'alive' &&
      item.id !== civling.id &&
      item.age >= rules.minAdultAge &&
      (rules.requiresMaleAndFemale ? item.gender !== civling.gender : true)
  );
  if (!partnerExists) {
    return { canReproduceNow: false, reason: 'no_eligible_partner' };
  }
  return { canReproduceNow: true, reason: 'ready' };
}

/**
 * @param {import('../../shared/types.js').Civling} civling
 * @param {import('../../shared/types.js').WorldState} world
 */
export function buildDecisionPrompt(civling, world) {
  const aliveCivlings = world.civlings.filter(
    (item) => item.status === 'alive'
  ).length;
  const reserveTarget = Math.max(
    GAME_RULES.food.reserveMinimum,
    aliveCivlings * GAME_RULES.food.reservePerAliveCivling
  );
  const reproduction = getReproductionContext(civling, world, aliveCivlings, reserveTarget);
  const payload = {
    runId: world.runId,
    tick: world.tick,
    civling: {
      id: civling.id,
      name: civling.name,
      health: civling.health,
      energy: civling.energy,
      hunger: civling.hunger,
      age: civling.age,
      gender: civling.gender,
      memory: civling.memory.slice(-3)
    },
    world: {
      food: world.resources.food,
      foodReserveTarget: reserveTarget,
      wood: world.resources.wood,
      shelterCapacity: world.resources.shelterCapacity,
      shelterNeeded: Math.max(0, aliveCivlings - world.resources.shelterCapacity),
      aliveCivlings,
      milestones: world.milestones
    },
    rules: {
      shelter: GAME_RULES.shelter,
      reproduction: GAME_RULES.reproduction
    },
    reproduction,
    allowedActions: Object.values(ACTIONS)
  };

  return [
    'You are deciding a Civling action for a simulation tick.',
    'Choose the most balanced action, not only immediate food gathering.',
    'Be strict with the rules and constraints, and avoid suggesting actions that could lead to starvation or energy depletion.',
    'Priority order: 1) avoid starvation, 2) build enough shelter for alive civlings, 3) gather strategic reserves, 4) reproduce only when stable, 5) explore.',
    'Hard rule: choose build_shelter ONLY if world.shelterNeeded > 0.',
    'Hard rule: if world.shelterNeeded <= 0, do not choose build_shelter.',
    'Hard rule: if world.shelterNeeded > 0 and world.wood >= rules.shelter.woodCostPerUnit and civling.energy >= 35, prioritize build_shelter.',
    'Hard rule: do not choose rest unless civling.energy <= 35 or civling.hunger >= 80.',
    'Hard rule: if recent memory already contains repeated rest and there is no emergency, choose a productive action.',
    'Rules: maintain food reserve near foodReserveTarget; gather_food when below target, diversify when above target.',
    'Rules: if hunger <= 45 and world food >= foodReserveTarget, avoid gather_food and progress wood/shelter/explore.',
    'Rules: build_shelter is important because rest recovers more energy when shelter capacity covers civlings.',
    'Hard rule: choose reproduce only if reproduction.canReproduceNow is true.',
    'Hard rule: when reproduction.canReproduceNow is false, do not choose reproduce.',
    'Rules: if reproduction.canReproduceNow is true and no urgent risk exists, prefer reproduce over explore.',
    'Return JSON only with shape: {"action":"<allowed_action>","reason":"short string"}.',
    `Simulation context: ${JSON.stringify(payload)}`
  ].join('\n');
}
