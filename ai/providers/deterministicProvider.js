import { ACTIONS } from '../../shared/constants.js';

/**
 * @param {import('../../shared/types.js').Civling} civling
 * @param {import('../../shared/types.js').WorldState} world
 * @returns {import('../../shared/types.js').ActionEnvelope}
 */
export function decideDeterministicAction(civling, world) {
  if (civling.energy <= 20) {
    return { action: ACTIONS.REST, reason: 'low_energy' };
  }

  if (civling.hunger >= 65 || world.resources.food <= 2) {
    return { action: ACTIONS.GATHER_FOOD, reason: 'food_pressure' };
  }

  if (world.resources.shelterCapacity < Math.ceil(world.civlings.length / 2) && world.resources.wood >= 3) {
    return { action: ACTIONS.BUILD_SHELTER, reason: 'insufficient_shelter' };
  }

  if (world.resources.wood < 10) {
    return { action: ACTIONS.GATHER_WOOD, reason: 'wood_target' };
  }

  return { action: ACTIONS.EXPLORE, reason: 'default_explore' };
}
