export const ACTIONS = Object.freeze({
  GATHER_FOOD: 'gather_food',
  GATHER_WOOD: 'gather_wood',
  BUILD_SHELTER: 'build_shelter',
  REST: 'rest',
  EXPLORE: 'explore'
});

export const ACTION_VALUES = Object.freeze({
  [ACTIONS.GATHER_FOOD]: { food: 2, energyCost: 2, hungerDelta: -18 },
  [ACTIONS.GATHER_WOOD]: { wood: 2, energyCost: 2, hungerDelta: 4 },
  [ACTIONS.BUILD_SHELTER]: { woodCost: 3, shelter: 1, energyCost: 3, hungerDelta: 6 },
  [ACTIONS.REST]: { energyGain: 18, hungerDelta: 5 },
  [ACTIONS.EXPLORE]: { chanceFood: 0.35, chanceWood: 0.35, energyCost: 3, hungerDelta: 8 }
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
