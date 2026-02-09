/**
 * @typedef {'alive'|'dead'} CivlingStatus
 */

/**
 * @typedef {'generalist'} CivlingRole
 */

/**
 * @typedef {Object} Civling
 * @property {string} id
 * @property {string} name
 * @property {number} age
 * @property {number} health
 * @property {number} energy
 * @property {number} hunger
 * @property {CivlingRole} role
 * @property {string[]} memory
 * @property {CivlingStatus} status
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {Object} Resources
 * @property {number} food
 * @property {number} wood
 * @property {number} shelterCapacity
 */

/**
 * @typedef {Object} ExtinctionMetadata
 * @property {boolean} ended
 * @property {string|null} cause
 * @property {number|null} tick
 */

/**
 * @typedef {Object} WorldState
 * @property {string} runId
 * @property {number} tick
 * @property {number} restartCount
 * @property {Resources} resources
 * @property {string[]} milestones
 * @property {Civling[]} civlings
 * @property {ExtinctionMetadata} extinction
 */

/**
 * @typedef {Object} ActionEnvelope
 * @property {string} action
 * @property {string} reason
 */

export {};
