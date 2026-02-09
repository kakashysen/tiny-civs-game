/**
 * @param {import('../../shared/types.js').Civling} civling
 */
function isExtinctionRisk(civling) {
  return civling.health <= 35 || civling.hunger >= 80;
}

/**
 * @param {import('../../shared/types.js').Civling} civling
 */
function hasRepeatedBlocks(civling) {
  const recent = civling.memory.slice(-3);
  return recent.length === 3 && recent.every((item) => item.includes('Failed'));
}

/**
 * @param {import('../../shared/types.js').WorldState} world
 */
function isInnovationPulse(world) {
  return world.tick > 0 && world.tick % 25 === 0;
}

export class HybridProvider {
  /**
   * @param {{
   * localProvider: {decideAction: Function},
   * deterministicProvider: {decideAction: Function},
   * maxCallsPerHour: number
   * }} options
   */
  constructor(options) {
    this.localProvider = options.localProvider;
    this.deterministicProvider = options.deterministicProvider;
    this.maxCallsPerHour = options.maxCallsPerHour;
    /** @type {number[]} */
    this.callTimestamps = [];
  }

  canCallLocal() {
    const now = Date.now();
    this.callTimestamps = this.callTimestamps.filter((ts) => now - ts < 60 * 60 * 1000);
    return this.callTimestamps.length < this.maxCallsPerHour;
  }

  shouldEscalate(civling, world) {
    return isExtinctionRisk(civling) || hasRepeatedBlocks(civling) || isInnovationPulse(world);
  }

  /**
   * @param {import('../../shared/types.js').Civling} civling
   * @param {import('../../shared/types.js').WorldState} world
   */
  async decideAction(civling, world) {
    if (this.shouldEscalate(civling, world) && this.canCallLocal()) {
      this.callTimestamps.push(Date.now());
      return this.localProvider.decideAction(civling, world);
    }

    return this.deterministicProvider.decideAction(civling, world);
  }
}

export const __testOnly = {
  hasRepeatedBlocks,
  isExtinctionRisk,
  isInnovationPulse
};
