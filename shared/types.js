/**
 * @typedef {'alive'|'dead'} CivlingStatus
 */

/**
 * @typedef {'generalist'} CivlingRole
 */

/**
 * @typedef {'male'|'female'} CivlingGender
 */

/**
 * @typedef {Object} CivlingPersonality
 * @property {string} archetype
 * @property {string} wayToAct
 * @property {string[]} goals
 * @property {Object.<string, number>} actionBiases
 */

/**
 * @typedef {Object} CivlingTask
 * @property {string} action
 * @property {number} totalMinutes
 * @property {number} remainingMinutes
 * @property {number} startedAtTick
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
 * @property {CivlingGender} gender
 * @property {string[]} memory
 * @property {CivlingStatus} status
 * @property {number} foodEatenLastTick
 * @property {number} reproductionAttempts
 * @property {number} babiesBorn
 * @property {number} shelterBuildAttempts
 * @property {number} shelterBuildSuccesses
 * @property {number} shelterBuildFailures
 * @property {number} babyChance
 * @property {number|null} reproduceIntentTick
 * @property {CivlingTask|null} currentTask
 * @property {CivlingPersonality} personality
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
 * @typedef {Object} TimeState
 * @property {number} minuteOfDay
 * @property {number} day
 * @property {number} month
 * @property {number} year
 * @property {'day'|'night'} phase
 */

/**
 * @typedef {Object} EnvironmentState
 * @property {'warm'|'cold'|'snowy'|'rainy'} weather
 * @property {'warm'|'cold'} nightTemperature
 */

/**
 * @typedef {Object} WorldState
 * @property {string} runId
 * @property {number} tick
 * @property {number} restartCount
 * @property {TimeState} time
 * @property {EnvironmentState} environment
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
