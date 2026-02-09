import { ACTIONS } from '../../shared/constants.js';
import { GAME_RULES } from '../../shared/gameRules.js';

/**
 * Returns shelter target including one free slot for reproduction when required.
 * @param {number} aliveCivlingCount
 * @returns {number}
 */
function getShelterTarget(aliveCivlingCount) {
  const needsReproductionSlot =
    GAME_RULES.reproduction.enabled && GAME_RULES.reproduction.requiresShelterCapacityAvailable;
  return aliveCivlingCount + (needsReproductionSlot ? 1 : 0);
}

/**
 * @param {import('../../shared/types.js').Civling} civling
 * @param {import('../../shared/types.js').WorldState} world
 * @returns {import('../../shared/types.js').ActionEnvelope}
 */
export function decideDeterministicAction(civling, world) {
  const aliveCivlings = world.civlings.filter((item) => item.status === 'alive');
  const shelterTarget = getShelterTarget(aliveCivlings.length);
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
    world.resources.shelterCapacity < shelterTarget &&
    world.resources.wood >= GAME_RULES.shelter.woodCostPerUnit
  ) {
    return { action: ACTIONS.BUILD_SHELTER, reason: 'insufficient_shelter' };
  }

  if (world.resources.wood < 10) {
    return { action: ACTIONS.GATHER_WOOD, reason: 'wood_target' };
  }

  const hasShelterCapacity = world.resources.shelterCapacity >= shelterTarget;
  const hasFoodReserve = world.resources.food >= Math.max(GAME_RULES.food.reserveMinimum, reserveTarget - 2);
  const isAdult = civling.age >= GAME_RULES.reproduction.minAdultAge;
  const hasGoodVitals = civling.energy >= 45 && civling.hunger <= 70;
  const partnerExists = aliveCivlings.some(
    (item) =>
      item.id !== civling.id &&
      item.age >= GAME_RULES.reproduction.minAdultAge &&
      (GAME_RULES.reproduction.requiresMaleAndFemale ? item.gender !== civling.gender : true)
  );
  const shouldPrioritizeFirstAttempt =
    isAdult &&
    (civling.reproductionAttempts ?? 0) === 0 &&
    civling.age >= GAME_RULES.reproduction.minAdultAge + 8;
  if (
    GAME_RULES.reproduction.enabled &&
    hasShelterCapacity &&
    hasFoodReserve &&
    isAdult &&
    hasGoodVitals &&
    partnerExists &&
    (shouldPrioritizeFirstAttempt || civling.energy >= 55)
  ) {
    return { action: ACTIONS.REPRODUCE, reason: 'stable_reproduction_window' };
  }

  return { action: ACTIONS.EXPLORE, reason: 'default_explore' };
}
