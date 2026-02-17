import { ACTIONS, MILESTONES, TIME } from '../../shared/constants.js';
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
 * Returns true when a civling currently occupies a shelter tile.
 * @param {import('../../shared/types.js').Civling} civling
 * @param {import('../../shared/types.js').WorldState} world
 * @returns {boolean}
 */
function isInsideShelter(civling, world) {
  return (world.shelters ?? []).some(
    (shelter) => shelter.x === civling.x && shelter.y === civling.y
  );
}

/**
 * @param {import('../../shared/types.js').Civling} civling
 * @returns {'normal'|'severe'|'critical'|'collapse'}
 */
function getStarvationStage(civling) {
  if (civling.hunger >= GAME_RULES.survival.collapseHungerThreshold) {
    return 'collapse';
  }
  if (civling.hunger >= GAME_RULES.survival.criticalHungerThreshold) {
    return 'critical';
  }
  if (civling.hunger >= GAME_RULES.survival.severeHungerThreshold) {
    return 'severe';
  }
  return 'normal';
}

/**
 * @param {string|undefined} action
 * @returns {boolean}
 */
function isAdultSurvivalAction(action) {
  return (
    action === ACTIONS.GATHER_FOOD ||
    action === ACTIONS.EAT ||
    action === ACTIONS.REST ||
    action === ACTIONS.PREPARE_WARM_MEAL ||
    action === ACTIONS.CRAFT_CLOTHES ||
    action === ACTIONS.BUILD_SHELTER
  );
}

/**
 * @param {number} month
 * @returns {'winter'|'spring'|'summer'|'autumn'}
 */
function getSeasonByMonth(month) {
  if ([12, 1, 2].includes(month)) {
    return 'winter';
  }
  if ([3, 4, 5].includes(month)) {
    return 'spring';
  }
  if ([6, 7, 8].includes(month)) {
    return 'summer';
  }
  return 'autumn';
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
    Math.ceil(
      aliveCivlings.length *
        GAME_RULES.food.reservePerAliveCivling *
        GAME_RULES.survival.foodReserveSafetyMultiplier
    )
  );
  const isAdult = civling.age >= GAME_RULES.reproduction.minAdultAge;
  const starvationStage = getStarvationStage(civling);
  const careUnlocked = world.milestones.includes(MILESTONES.TOOLS);
  const injuredExists = aliveCivlings.some((item) => item.health < 90);
  const hasStorage = (world.storages?.length ?? 0) > 0;
  const adultsOnSurvival = aliveCivlings.some(
    (item) =>
      item.age >= GAME_RULES.reproduction.minAdultAge &&
      isAdultSurvivalAction(item.currentTask?.action)
  );
  const inShelter = isInsideShelter(civling, world);
  const hasProtection =
    (civling.weatherProtection?.foodBuffTicks ?? 0) > 0 ||
    (civling.weatherProtection?.gearCharges ?? 0) > 0;
  const isSnowExposureRisk =
    world.environment.weather === 'snowy' && !inShelter && !hasProtection;
  const isColdNightExposureRisk =
    world.time.phase === 'night' &&
    world.environment.nightTemperature === 'cold' &&
    !inShelter &&
    !hasProtection;
  const vitalsTooWeakForRiskyWork =
    civling.hunger >= GAME_RULES.survival.woodBlockHungerThreshold ||
    civling.energy <= GAME_RULES.survival.woodBlockEnergyThreshold;
  const season = getSeasonByMonth(world.time.month);
  const isLateWinterDayWithColdNight =
    season === 'winter' &&
    world.time.phase === 'day' &&
    world.environment.nightTemperature === 'cold' &&
    world.time.minuteOfDay >=
      TIME.NIGHT_START_MINUTE - 2 * TIME.MINUTES_PER_TICK;

  if (isAdult && starvationStage === 'collapse' && world.resources.food > 0) {
    return { action: ACTIONS.EAT, reason: 'starvation_collapse_emergency_eat' };
  }
  if (
    isAdult &&
    (starvationStage === 'critical' || starvationStage === 'collapse')
  ) {
    return {
      action: ACTIONS.GATHER_FOOD,
      reason: 'starvation_critical_food_priority'
    };
  }
  if (
    isAdult &&
    civling.energy <= GAME_RULES.survival.emergencyInterruptEnergyThreshold
  ) {
    return { action: ACTIONS.REST, reason: 'emergency_low_energy_recovery' };
  }
  if (isAdult && isLateWinterDayWithColdNight && !inShelter && !hasProtection) {
    if (world.resources.wood >= GAME_RULES.shelter.woodCostPerUnit) {
      return {
        action: ACTIONS.BUILD_SHELTER,
        reason: 'winter_night_prep_build_shelter'
      };
    }
    if (world.resources.food >= GAME_RULES.protection.warmMealFoodCost) {
      return {
        action: ACTIONS.PREPARE_WARM_MEAL,
        reason: 'winter_night_prep_warm_meal'
      };
    }
    if (
      world.resources.fiber >= GAME_RULES.protection.fiberCostPerClothes &&
      world.resources.wood >= GAME_RULES.protection.woodCostPerClothes
    ) {
      return {
        action: ACTIONS.CRAFT_CLOTHES,
        reason: 'winter_night_prep_craft_clothes'
      };
    }
    return { action: ACTIONS.REST, reason: 'winter_night_prep_hold' };
  }
  if (isAdult && (isSnowExposureRisk || isColdNightExposureRisk)) {
    if (world.resources.wood >= GAME_RULES.shelter.woodCostPerUnit) {
      return {
        action: ACTIONS.BUILD_SHELTER,
        reason: 'weather_exposure_shelter_priority'
      };
    }
    if (
      !hasProtection &&
      world.resources.food >= GAME_RULES.protection.warmMealFoodCost
    ) {
      return {
        action: ACTIONS.PREPARE_WARM_MEAL,
        reason: 'weather_exposure_warm_meal_priority'
      };
    }
    if (
      !hasProtection &&
      world.resources.fiber >= GAME_RULES.protection.fiberCostPerClothes &&
      world.resources.wood >= GAME_RULES.protection.woodCostPerClothes
    ) {
      return {
        action: ACTIONS.CRAFT_CLOTHES,
        reason: 'weather_exposure_craft_clothes_priority'
      };
    }
    if (!hasProtection && (world.meadows?.length ?? 0) > 0) {
      return {
        action: ACTIONS.GATHER_FIBER,
        reason: 'weather_exposure_fiber_priority'
      };
    }
    if (
      hasProtection &&
      world.resources.wood < GAME_RULES.shelter.woodCostPerUnit &&
      !vitalsTooWeakForRiskyWork
    ) {
      return {
        action: ACTIONS.GATHER_WOOD,
        reason: 'weather_exposure_wood_priority_protected'
      };
    }
    return {
      action: ACTIONS.REST,
      reason: 'weather_exposure_hold_position'
    };
  }

  if (
    isAdult &&
    !adultsOnSurvival &&
    world.resources.food <= reserveTarget + 1
  ) {
    return { action: ACTIONS.GATHER_FOOD, reason: 'adult_survival_guardrail' };
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

  if (vitalsTooWeakForRiskyWork) {
    if (world.resources.food > 0 && civling.hunger >= 75) {
      return { action: ACTIONS.EAT, reason: 'vitals_guardrail_emergency_eat' };
    }
    return { action: ACTIONS.GATHER_FOOD, reason: 'vitals_guardrail_food' };
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
    inShelter &&
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
