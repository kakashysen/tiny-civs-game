export const ACTIONS = Object.freeze({
  PLAY: 'play',
  LEARN: 'learn',
  EAT: 'eat',
  CARE: 'care',
  GATHER_FOOD: 'gather_food',
  GATHER_WOOD: 'gather_wood',
  BUILD_SHELTER: 'build_shelter',
  BUILD_STORAGE: 'build_storage',
  REST: 'rest',
  EXPLORE: 'explore',
  REPRODUCE: 'reproduce'
});

export const ACTION_VALUES = Object.freeze({
  [ACTIONS.PLAY]: { energyGain: 10, hungerDelta: 4, healthDelta: 1 },
  [ACTIONS.LEARN]: {
    chanceFood: 0.2,
    chanceWood: 0.2,
    energyCost: 1,
    hungerDelta: 3
  },
  [ACTIONS.EAT]: { hungerDelta: -25, energyGain: 8 },
  [ACTIONS.CARE]: {
    energyCost: 2,
    hungerDelta: 3,
    healTarget: 18,
    healSelf: 4
  },
  [ACTIONS.GATHER_FOOD]: { food: 2, energyCost: 2, hungerDelta: 4 },
  [ACTIONS.GATHER_WOOD]: { wood: 2, energyCost: 2, hungerDelta: 4 },
  [ACTIONS.BUILD_SHELTER]: {
    woodCost: 3,
    shelter: 1,
    energyCost: 3,
    hungerDelta: 6
  },
  [ACTIONS.BUILD_STORAGE]: {
    woodCost: 6,
    storage: 1,
    energyCost: 4,
    hungerDelta: 6
  },
  [ACTIONS.REST]: { energyGain: 18, hungerDelta: 5 },
  [ACTIONS.EXPLORE]: {
    chanceFood: 0.35,
    chanceWood: 0.35,
    energyCost: 3,
    hungerDelta: 8
  },
  [ACTIONS.REPRODUCE]: { energyCost: 6, hungerDelta: 10 }
});

export const YOUNG_ALLOWED_ACTIONS = Object.freeze([
  ACTIONS.PLAY,
  ACTIONS.LEARN,
  ACTIONS.REST
]);

export const ADULT_ALLOWED_ACTIONS = Object.freeze([
  ACTIONS.GATHER_FOOD,
  ACTIONS.GATHER_WOOD,
  ACTIONS.BUILD_SHELTER,
  ACTIONS.BUILD_STORAGE,
  ACTIONS.CARE,
  ACTIONS.REST,
  ACTIONS.EXPLORE,
  ACTIONS.REPRODUCE
]);

export const ACTION_DURATION_MINUTES = Object.freeze({
  [ACTIONS.PLAY]: 20,
  [ACTIONS.LEARN]: 30,
  [ACTIONS.EAT]: 10,
  [ACTIONS.CARE]: 40,
  [ACTIONS.GATHER_FOOD]: 20,
  [ACTIONS.GATHER_WOOD]: [3, 5],
  [ACTIONS.BUILD_SHELTER]: 50,
  [ACTIONS.BUILD_STORAGE]: 60,
  [ACTIONS.REST]: 60,
  [ACTIONS.EXPLORE]: 30,
  [ACTIONS.REPRODUCE]: 30
});

export const TIME = Object.freeze({
  MINUTES_PER_TICK: 30,
  MINUTES_PER_DAY: 24 * 60,
  DAYS_PER_MONTH: 30,
  MONTHS_PER_YEAR: 12,
  DAY_START_MINUTE: 6 * 60,
  NIGHT_START_MINUTE: 18 * 60
});

export const MILESTONES = Object.freeze({
  FIRE: 'fire',
  TOOLS: 'tools',
  SHELTER: 'shelter',
  AGRICULTURE: 'agriculture'
});

export const DEFAULT_CONFIG = Object.freeze({
  SIM_TICK_MS: 900,
  SIM_MAX_CIVLINGS: 6,
  SIM_SNAPSHOT_EVERY_TICKS: 10,
  INITIAL_CIVLINGS: 4
});
