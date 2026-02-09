import { ACTIONS } from '../../shared/constants.js';
import { GAME_RULES } from '../../shared/gameRules.js';

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
  const payload = {
    runId: world.runId,
    tick: world.tick,
    civling: {
      id: civling.id,
      name: civling.name,
      health: civling.health,
      energy: civling.energy,
      hunger: civling.hunger,
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
    allowedActions: Object.values(ACTIONS)
  };

  return [
    'You are deciding a Civling action for a simulation tick.',
    'Choose the most balanced action, not only immediate food gathering.',
    'Be strict with the rules and constraints, and avoid suggesting actions that could lead to starvation or energy depletion.',
    'Priority order: 1) avoid starvation, 2) build enough shelter for alive civlings, 3) gather strategic reserves, 4) explore.',
    'Hard rule: choose build_shelter ONLY if world.shelterNeeded > 0.',
    'Hard rule: if world.shelterNeeded <= 0, do not choose build_shelter.',
    'Hard rule: if world.shelterNeeded > 0 and world.wood >= rules.shelter.woodCostPerUnit and civling.energy >= 35, prioritize build_shelter.',
    'Hard rule: do not choose rest unless civling.energy <= 35 or civling.hunger >= 80.',
    'Hard rule: if recent memory already contains repeated rest and there is no emergency, choose a productive action.',
    'Rules: maintain food reserve near foodReserveTarget; gather_food when below target, diversify when above target.',
    'Rules: if hunger <= 45 and world food >= foodReserveTarget, avoid gather_food and progress wood/shelter/explore.',
    'Rules: build_shelter is important because rest recovers more energy when shelter capacity covers civlings.',
    'Return JSON only with shape: {"action":"<allowed_action>","reason":"short string"}.',
    `Simulation context: ${JSON.stringify(payload)}`
  ].join('\n');
}
