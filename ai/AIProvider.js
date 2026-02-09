/**
 * @interface
 */
export class AIProvider {
  /**
   * @param {import('../shared/types.js').Civling} civling
   * @param {import('../shared/types.js').WorldState} world
   * @returns {Promise<import('../shared/types.js').ActionEnvelope>}
   */
  async decideAction(_civling, _world) {
    throw new Error('AIProvider.decideAction must be implemented');
  }
}
