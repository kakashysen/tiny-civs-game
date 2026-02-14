import { ACTIONS, MILESTONES } from '../../shared/constants.js';
import { GAME_RULES } from '../../shared/gameRules.js';
import { pickPersonalityAction } from '../../shared/personalities.js';

/**
 * Returns shelter target including one free slot for reproduction when required.
 * @param {number} aliveCivlingCount
 * @returns {number}
 */
function getShelterTarget(aliveCivlingCount) {
  const needsReproductionSlot =
    GAME_RULES.reproduction.enabled &&
    GAME_RULES.reproduction.requiresShelterCapacityAvailable;
  return aliveCivlingCount + (needsReproductionSlot ? 1 : 0);
}

/**
 * @param {import('../../shared/types.js').Civling} civling
 * @param {import('../../shared/types.js').WorldState} world
 * @returns {import('../../shared/types.js').ActionEnvelope}
 */
export function decideDeterministicAction(civling, world) {
  const aliveCivlings = world.civlings.filter(
    (item) => item.status === 'alive'
  );
  const aliveAdults = aliveCivlings.filter(
    (item) => item.age >= GAME_RULES.reproduction.minAdultAge
  ).length;
  const shelterTarget = getShelterTarget(aliveCivlings.length);
  const reserveTarget = Math.max(
    GAME_RULES.food.reserveMinimum,
    aliveCivlings.length * GAME_RULES.food.reservePerAliveCivling
  );
  const isAdult = civling.age >= GAME_RULES.reproduction.minAdultAge;
  const careUnlocked = world.milestones.includes(MILESTONES.TOOLS);
  const injuredExists = aliveCivlings.some((item) => item.health < 90);
  const shelterDeficit = shelterTarget - world.resources.shelterCapacity;
  const hasStorage = (world.storages?.length ?? 0) > 0;
  const isSnowExposureRisk =
    world.environment.weather === 'snowy' && shelterDeficit > 0;
  const isColdNightExposureRisk =
    world.time.phase === 'night' &&
    world.environment.nightTemperature === 'cold' &&
    shelterDeficit > 0;

  if (isAdult && (isSnowExposureRisk || isColdNightExposureRisk)) {
    if (world.resources.wood >= GAME_RULES.shelter.woodCostPerUnit) {
      return {
        action: ACTIONS.BUILD_SHELTER,
        reason: 'weather_exposure_shelter_priority'
      };
    }
    return {
      action: ACTIONS.GATHER_WOOD,
      reason: 'weather_exposure_wood_priority'
    };
  }

  if (!isAdult) {
    if (isSnowExposureRisk) {
      return { action: ACTIONS.REST, reason: 'young_weather_shelter_wait' };
    }
    if (civling.energy <= 25) {
      return { action: ACTIONS.REST, reason: 'young_low_energy' };
    }
    const action = pickPersonalityAction(
      civling,
      aliveAdults > 0
        ? [ACTIONS.LEARN, ACTIONS.PLAY, ACTIONS.REST]
        : [ACTIONS.LEARN, ACTIONS.REST, ACTIONS.PLAY],
      ACTIONS.LEARN
    );
    return {
      action,
      reason:
        aliveAdults > 0
          ? 'young_learning_from_adults'
          : 'young_learning_from_environment'
    };
  }

  if (civling.energy <= 20) {
    return { action: ACTIONS.REST, reason: 'low_energy' };
  }

  if (civling.hunger >= 65 || world.resources.food <= reserveTarget) {
    return { action: ACTIONS.GATHER_FOOD, reason: 'food_pressure' };
  }

  if (
    !hasStorage &&
    world.resources.wood >= GAME_RULES.storage.woodCostPerUnit
  ) {
    return { action: ACTIONS.BUILD_STORAGE, reason: 'missing_storage' };
  }

  if (
    world.resources.shelterCapacity < shelterTarget &&
    world.resources.wood >= GAME_RULES.shelter.woodCostPerUnit
  ) {
    return { action: ACTIONS.BUILD_SHELTER, reason: 'insufficient_shelter' };
  }

  if (
    !hasStorage &&
    world.resources.wood < GAME_RULES.storage.woodCostPerUnit
  ) {
    return { action: ACTIONS.GATHER_WOOD, reason: 'storage_wood_target' };
  }

  if (
    careUnlocked &&
    isAdult &&
    injuredExists &&
    civling.energy >= GAME_RULES.healing.careMinEnergy &&
    civling.hunger <= GAME_RULES.healing.careMaxHunger
  ) {
    const action = pickPersonalityAction(
      civling,
      [ACTIONS.CARE, ACTIONS.REST, ACTIONS.GATHER_FOOD],
      ACTIONS.CARE
    );
    return { action, reason: 'tools_unlocked_community_care' };
  }

  if (world.resources.wood < 10) {
    return { action: ACTIONS.GATHER_WOOD, reason: 'wood_target' };
  }

  const hasShelterCapacity = world.resources.shelterCapacity >= shelterTarget;
  const hasFoodReserve =
    world.resources.food >=
    Math.max(GAME_RULES.food.reserveMinimum, reserveTarget - 2);
  const hasGoodVitals = civling.energy >= 45 && civling.hunger <= 70;
  const partnerExists = aliveCivlings.some(
    (item) =>
      item.id !== civling.id &&
      item.age >= GAME_RULES.reproduction.minAdultAge &&
      (GAME_RULES.reproduction.requiresMaleAndFemale
        ? item.gender !== civling.gender
        : true)
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
    const action = pickPersonalityAction(
      civling,
      [ACTIONS.REPRODUCE, ACTIONS.EXPLORE, ACTIONS.GATHER_WOOD],
      ACTIONS.REPRODUCE
    );
    return {
      action,
      reason: `personality_${civling.personality?.wayToAct ?? 'balanced'}_reproduction_window`
    };
  }

  const action = pickPersonalityAction(
    civling,
    [ACTIONS.EXPLORE, ACTIONS.GATHER_WOOD, ACTIONS.REST],
    ACTIONS.EXPLORE
  );
  return {
    action,
    reason: `personality_${civling.personality?.wayToAct ?? 'balanced'}_default`
  };
}
