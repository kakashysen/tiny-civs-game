import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_GAME_RULES = Object.freeze({
  food: {
    reservePerAliveCivling: 4,
    reserveMinimum: 6,
    eatHungerThreshold: 60,
    eatHungerRelief: 25,
    eatEnergyGain: 8
  },
  shelter: {
    woodCostPerUnit: 4,
    capacityPerUnit: 2,
    restEnergyBonusWhenSheltered: 8,
    woodCapacityPerUnit: 4
  },
  storage: {
    woodCostPerUnit: 8,
    woodCapacityPerUnit: 24
  },
  forests: {
    initialCount: 5,
    woodPerForest: 12,
    regrowthTicksMin: 8,
    regrowthTicksMax: 16,
    harvestMinutes: 30
  },
  world: {
    width: 36,
    height: 24
  },
  survival: {
    starvationHungerRiskThreshold: 70,
    foodRiskThreshold: 0,
    lowEnergyRiskThreshold: 20
  },
  reproduction: {
    enabled: true,
    requiresMaleAndFemale: true,
    requiresShelterCapacityAvailable: true,
    minAdultAge: 18,
    conceptionChance: 0.35
  },
  healing: {
    fireNightShelterHeal: 2,
    agricultureNutritionHeal: 2,
    agricultureHungerThreshold: 40,
    careMinEnergy: 30,
    careMaxHunger: 75
  }
});

function mergeRules(overrides = {}) {
  return {
    food: { ...DEFAULT_GAME_RULES.food, ...(overrides.food ?? {}) },
    shelter: { ...DEFAULT_GAME_RULES.shelter, ...(overrides.shelter ?? {}) },
    storage: { ...DEFAULT_GAME_RULES.storage, ...(overrides.storage ?? {}) },
    forests: { ...DEFAULT_GAME_RULES.forests, ...(overrides.forests ?? {}) },
    world: { ...DEFAULT_GAME_RULES.world, ...(overrides.world ?? {}) },
    survival: { ...DEFAULT_GAME_RULES.survival, ...(overrides.survival ?? {}) },
    reproduction: {
      ...DEFAULT_GAME_RULES.reproduction,
      ...(overrides.reproduction ?? {})
    },
    healing: { ...DEFAULT_GAME_RULES.healing, ...(overrides.healing ?? {}) }
  };
}

export function loadGameRules() {
  try {
    const path = join(__dirname, '../config/game_rules.json');
    const raw = readFileSync(path, 'utf-8');
    return mergeRules(JSON.parse(raw));
  } catch {
    return mergeRules();
  }
}

export const GAME_RULES = Object.freeze(loadGameRules());
