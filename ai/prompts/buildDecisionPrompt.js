import { ACTIONS } from '../../shared/constants.js';

/**
 * @param {import('../../shared/types.js').Civling} civling
 * @param {import('../../shared/types.js').WorldState} world
 */
export function buildDecisionPrompt(civling, world) {
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
      wood: world.resources.wood,
      shelterCapacity: world.resources.shelterCapacity,
      aliveCivlings: world.civlings.filter((item) => item.status === 'alive').length,
      milestones: world.milestones
    },
    allowedActions: Object.values(ACTIONS)
  };

  return [
    'You are deciding a Civling action for a simulation tick.',
    'Return JSON only with shape: {"action":"<allowed_action>","reason":"short string"}.',
    `Simulation context: ${JSON.stringify(payload)}`
  ].join('\n');
}
