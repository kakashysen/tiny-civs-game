import {
  ACTIONS,
  ADULT_ALLOWED_ACTIONS,
  MILESTONES,
  YOUNG_ALLOWED_ACTIONS
} from '../../shared/constants.js';
import { GAME_RULES } from '../../shared/gameRules.js';

/**
 * Returns shelter target including one free slot for reproduction when required.
 * @param {number} aliveCivlings
 * @returns {number}
 */
function getShelterTarget(aliveCivlings) {
  const needsReproductionSlot =
    GAME_RULES.reproduction.enabled &&
    GAME_RULES.reproduction.requiresShelterCapacityAvailable;
  return aliveCivlings + (needsReproductionSlot ? 1 : 0);
}

/**
 * Calculates reproduction readiness for the current civling.
 * @param {import('../../shared/types.js').Civling} civling
 * @param {import('../../shared/types.js').WorldState} world
 * @param {number} aliveCivlings
 * @param {number} reserveTarget
 */
function getReproductionContext(civling, world, aliveCivlings, reserveTarget) {
  const rules = GAME_RULES.reproduction;
  const shelterTarget = getShelterTarget(aliveCivlings);
  const firstAttemptUrgent =
    civling.age >= rules.minAdultAge + 8 &&
    (civling.reproductionAttempts ?? 0) === 0;
  if (!rules.enabled) {
    return { canReproduceNow: false, reason: 'disabled', firstAttemptUrgent };
  }
  if (civling.age < rules.minAdultAge) {
    return { canReproduceNow: false, reason: 'underage', firstAttemptUrgent };
  }
  if (civling.energy < 45 || civling.hunger > 70) {
    return { canReproduceNow: false, reason: 'low_vitals', firstAttemptUrgent };
  }
  if (
    world.resources.food <
    Math.max(GAME_RULES.food.reserveMinimum, reserveTarget - 2)
  ) {
    return {
      canReproduceNow: false,
      reason: 'food_reserve_low',
      firstAttemptUrgent
    };
  }
  if (
    rules.requiresShelterCapacityAvailable &&
    world.resources.shelterCapacity < shelterTarget
  ) {
    return {
      canReproduceNow: false,
      reason: 'no_shelter_capacity',
      firstAttemptUrgent
    };
  }
  const partnerExists = world.civlings.some(
    (item) =>
      item.status === 'alive' &&
      item.id !== civling.id &&
      item.age >= rules.minAdultAge &&
      (rules.requiresMaleAndFemale ? item.gender !== civling.gender : true)
  );
  if (!partnerExists) {
    return {
      canReproduceNow: false,
      reason: 'no_eligible_partner',
      firstAttemptUrgent
    };
  }
  return { canReproduceNow: true, reason: 'ready', firstAttemptUrgent };
}

/**
 * @param {import('../../shared/types.js').Civling} civling
 * @param {import('../../shared/types.js').WorldState} world
 */
export function buildDecisionPrompt(civling, world) {
  const isYoung = civling.age < GAME_RULES.reproduction.minAdultAge;
  const careUnlocked = world.milestones.includes(MILESTONES.TOOLS);
  const allowedActionsBase = isYoung
    ? YOUNG_ALLOWED_ACTIONS
    : ADULT_ALLOWED_ACTIONS;
  const allowedActions = careUnlocked
    ? allowedActionsBase
    : allowedActionsBase.filter((action) => action !== ACTIONS.CARE);
  const aliveCivlings = world.civlings.filter(
    (item) => item.status === 'alive'
  ).length;
  const reserveTarget = Math.max(
    GAME_RULES.food.reserveMinimum,
    aliveCivlings * GAME_RULES.food.reservePerAliveCivling
  );
  const shelterTarget = getShelterTarget(aliveCivlings);
  const reproduction = getReproductionContext(
    civling,
    world,
    aliveCivlings,
    reserveTarget
  );
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
      currentTask: civling.currentTask,
      personality: civling.personality,
      reproductionAttempts: civling.reproductionAttempts ?? 0,
      memory: civling.memory.slice(-3)
    },
    world: {
      food: world.resources.food,
      foodReserveTarget: reserveTarget,
      wood: world.resources.wood,
      forestsAvailable: world.forests?.length ?? 0,
      storagesBuilt: world.storages?.length ?? 0,
      sheltersBuilt: world.shelters?.length ?? 0,
      time: world.time,
      environment: world.environment,
      shelterCapacity: world.resources.shelterCapacity,
      shelterTarget,
      shelterNeeded: Math.max(
        0,
        shelterTarget - world.resources.shelterCapacity
      ),
      aliveCivlings,
      milestones: world.milestones
    },
    rules: {
      shelter: GAME_RULES.shelter,
      storage: GAME_RULES.storage,
      reproduction: GAME_RULES.reproduction,
      healing: GAME_RULES.healing
    },
    reproduction,
    allowedActions
  };

  return [
    'You are deciding a Civling action for a simulation tick.',
    `Age stage: ${isYoung ? 'young (must play/learn/rest only)' : 'adult (must help community)'}.`,
    'Actions are timed tasks and do not complete instantly; choose actions that fit long-term needs.',
    'Choose the most balanced action, not only immediate food gathering.',
    'Follow the civling personality style and goals when there is no survival emergency.',
    'Be strict with the rules and constraints, and avoid suggesting actions that could lead to starvation or energy depletion.',
    'Priority order: 1) avoid starvation, 2) secure wood logistics (storage/shelter capacity), 3) build enough shelter for alive civlings, 4) reproduce only when stable, 5) explore.',
    'Hard rule: if no storage exists and wood >= rules.storage.woodCostPerUnit, prefer build_storage.',
    'Hard rule: if no storage exists and wood < rules.storage.woodCostPerUnit, prioritize gather_wood unless there is immediate food risk.',
    'Hard rule: choose build_shelter ONLY if world.shelterNeeded > 0.',
    'Hard rule: if world.shelterNeeded <= 0, do not choose build_shelter.',
    'Hard rule: if world.shelterNeeded > 0 and world.wood >= rules.shelter.woodCostPerUnit and civling.energy >= 35, prioritize build_shelter.',
    'Hard rule: when weather is snowy and shelter is insufficient, prioritize build_shelter or gather_wood; exposed civlings can die.',
    'Hard rule: during cold nights with insufficient shelter, avoid risky outdoor actions.',
    'Hard rule: do not choose rest unless civling.energy <= 35 or civling.hunger >= 80.',
    'Hard rule: if recent memory already contains repeated rest and there is no emergency, choose a productive action.',
    'Rules: maintain food reserve near foodReserveTarget; gather_food when below target, diversify when above target.',
    'Rules: if hunger <= 45 and world food >= foodReserveTarget, avoid gather_food and progress wood/shelter/explore.',
    'Rules: build_shelter is important because rest recovers more energy when shelter capacity covers civlings.',
    'Rules: gather_wood now requires travel to finite forests and carrying logs to storage/shelter.',
    'Hard rule: choose reproduce only if reproduction.canReproduceNow is true.',
    'Hard rule: when reproduction.canReproduceNow is false, do not choose reproduce.',
    'Hard rule: if civling is young, choose only play, learn, or rest.',
    'Hard rule: if civling is adult, do not choose play or learn.',
    'Hard rule: choose care only when tools milestone is unlocked, at least one civling is injured, and civling vitals satisfy rules.healing thresholds.',
    'Rules: personality.actionBiases values > 1.0 indicate preferred actions and should influence your choice.',
    'Rules: keep your reason short and mention personality alignment when relevant.',
    'Rules: if reproduction.canReproduceNow is true and no urgent risk exists, prefer reproduce over explore.',
    'Rules: if reproduction.firstAttemptUrgent is true and reproduction.canReproduceNow is true, prioritize reproduce over gather_wood/explore.',
    'Return JSON only with shape: {"action":"<allowed_action>","reason":"short string"}.',
    `Simulation context: ${JSON.stringify(payload)}`
  ].join('\n');
}
