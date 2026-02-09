import { ACTIONS } from '../../shared/constants.js';

/**
 * @param {import('../../shared/types.js').Civling} civling
 * @param {import('../../shared/types.js').WorldState} world
 */
export function buildDecisionPrompt(civling, world) {
  const aliveCivlings = world.civlings.filter((item) => item.status === 'alive').length;
  const reserveTarget = Math.max(6, aliveCivlings * 4);
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
      aliveCivlings,
      milestones: world.milestones
    },
    allowedActions: Object.values(ACTIONS)
  };

  return [
    'You are deciding a Civling action for a simulation tick.',
    'Choose the most balanced action, not only immediate food gathering.',
    'Rules: maintain food reserve near foodReserveTarget; gather_food when below target, diversify when above target.',
    'Rules: if hunger <= 45 and world food >= foodReserveTarget, avoid gather_food and progress wood/shelter/explore.',
    'Rules: avoid repeating the same action many ticks in a row unless there is an emergency.',
    'Return JSON only with shape: {"action":"<allowed_action>","reason":"short string"}.',
    `Simulation context: ${JSON.stringify(payload)}`
  ].join('\n');
}
