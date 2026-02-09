import { ACTIONS } from '../../shared/constants.js';
import { GAME_RULES } from '../../shared/gameRules.js';

/**
 * @param {import('../../shared/types.js').Civling} civling
 * @param {import('../../shared/types.js').WorldState} world
 * @returns {import('../../shared/types.js').ActionEnvelope}
 */
export function decideDeterministicAction(civling, world) {
  const aliveCivlings = world.civlings.filter((item) => item.status === 'alive');
  const reserveTarget = Math.max(
    GAME_RULES.food.reserveMinimum,
    aliveCivlings.length * GAME_RULES.food.reservePerAliveCivling
  );

  if (civling.energy <= 20) {
    return { action: ACTIONS.REST, reason: 'low_energy' };
  }

  if (civling.hunger >= 65 || world.resources.food <= reserveTarget) {
    return { action: ACTIONS.GATHER_FOOD, reason: 'food_pressure' };
  }

  if (
    world.resources.shelterCapacity < world.civlings.length &&
    world.resources.wood >= GAME_RULES.shelter.woodCostPerUnit
  ) {
    return { action: ACTIONS.BUILD_SHELTER, reason: 'insufficient_shelter' };
  }

  if (world.resources.wood < 10) {
    return { action: ACTIONS.GATHER_WOOD, reason: 'wood_target' };
  }

  const hasShelterCapacity = world.resources.shelterCapacity > aliveCivlings.length;
  const hasFoodReserve = world.resources.food >= reserveTarget;
  const isAdult = civling.age >= GAME_RULES.reproduction.minAdultAge;
  const hasGoodVitals = civling.energy >= 60 && civling.hunger <= 55;
  const partnerExists = aliveCivlings.some(
    (item) =>
      item.id !== civling.id &&
      item.age >= GAME_RULES.reproduction.minAdultAge &&
      (GAME_RULES.reproduction.requiresMaleAndFemale ? item.gender !== civling.gender : true)
  );
  if (
    GAME_RULES.reproduction.enabled &&
    hasShelterCapacity &&
    hasFoodReserve &&
    isAdult &&
    hasGoodVitals &&
    partnerExists
  ) {
    return { action: ACTIONS.REPRODUCE, reason: 'stable_reproduction_window' };
  }

  return { action: ACTIONS.EXPLORE, reason: 'default_explore' };
}
