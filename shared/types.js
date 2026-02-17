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
 * @property {Object<string, unknown>} [meta]
 */

/**
 * @typedef {Object} WeatherProtection
 * @property {number} gearCharges
 * @property {number} foodBuffTicks
 */

/**
 * @typedef {'travel_to_source'|'work_at_source'|'travel_to_dropoff'|'deposit_output'|'done'} GatherTaskPhase
 */

/**
 * @typedef {Object} GatherTaskEndpoint
 * @property {string|null} id
 * @property {string} kind
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {Object} GatherTaskPaths
 * @property {Position[]} toSource
 * @property {Position[]} toDropoff
 */

/**
 * @typedef {Object} GatherTaskYield
 * @property {string} resource
 * @property {number} amount
 * @property {number} carried
 */

/**
 * @typedef {Object} GatherTaskMetadata
 * @property {GatherTaskPhase} phase
 * @property {GatherTaskEndpoint} source
 * @property {GatherTaskEndpoint|null} dropoff
 * @property {GatherTaskPaths} paths
 * @property {number} workMinutesRemaining
 * @property {GatherTaskYield} yield
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
 * @property {number} starvationTicks
 * @property {'normal'|'severe'|'critical'|'collapse'} lastStarvationStage
 * @property {CivlingTask|null} currentTask
 * @property {CivlingPersonality} personality
 * @property {WeatherProtection} weatherProtection
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {Object} Resources
 * @property {number} food
 * @property {number} wood
 * @property {number} fiber
 * @property {number} shelterCapacity
 */
/**
 * @typedef {Object} Position
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {Object} ForestNode
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} woodRemaining
 */

/**
 * @typedef {Object} MeadowNode
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} fiberRemaining
 */

/**
 * @typedef {Object} ShelterSite
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} woodStored
 * @property {number} woodCapacity
 */

/**
 * @typedef {Object} StorageSite
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} woodStored
 * @property {number} woodCapacity
 */

/**
 * @typedef {Object} PendingForestRegrowth
 * @property {number} readyAtTick
 * @property {number} [x]
 * @property {number} [y]
 */

/**
 * @typedef {Object} PendingMeadowRegrowth
 * @property {number} readyAtTick
 * @property {number} [x]
 * @property {number} [y]
 */

/**
 * @typedef {Object} WorldMap
 * @property {number} width
 * @property {number} height
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
 * @property {WorldMap} map
 * @property {ForestNode[]} forests
 * @property {MeadowNode[]} meadows
 * @property {ShelterSite[]} shelters
 * @property {StorageSite[]} storages
 * @property {PendingForestRegrowth[]} pendingForestRegrowth
 * @property {PendingMeadowRegrowth[]} pendingMeadowRegrowth
 * @property {ExtinctionMetadata} extinction
 */

/**
 * @typedef {Object} ActionEnvelope
 * @property {string} action
 * @property {string} reason
 */

export {};
