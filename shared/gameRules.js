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
    eatEnergyGain: 8,
    passiveHungerPerTick: 2,
    snowyExtraHungerPerTick: 0
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
  meadows: {
    initialCount: 4,
    fiberPerMeadow: 10,
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
    lowEnergyRiskThreshold: 20,
    severeHungerThreshold: 85,
    criticalHungerThreshold: 95,
    collapseHungerThreshold: 100,
    severeHungerHealthLoss: 8,
    criticalHungerHealthLoss: 12,
    criticalHungerEnergyLoss: 6,
    collapseHealthLossPerTick: 18,
    starvationDeathTicks: 2,
    emergencyInterruptHungerThreshold: 80,
    emergencyInterruptEnergyThreshold: 10,
    forceEatHungerThreshold: 85,
    woodBlockHungerThreshold: 70,
    woodBlockEnergyThreshold: 25,
    foodReserveSafetyMultiplier: 1.35
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
    eatRecoveryHeal: 3,
    starvationRecoveryHealWhenFed: 6,
    shelterRecoveryHealPerTick: 2,
    shelterRecoveryMaxHunger: 75,
    careMinEnergy: 30,
    careMaxHunger: 75
  },
  weather: {
    snowyExposedHealthLossPerTick: 12,
    snowyExposedEnergyLossPerTick: 8,
    snowyCriticalExtraHealthLoss: 8,
    coldNightExposedHealthLossPerTick: 4,
    coldNightExposedEnergyLossPerTick: 5,
    coldNightShelteredEnergyLossPerTick: 2
  },
  protection: {
    fiberPerGather: 2,
    fiberCostPerClothes: 6,
    woodCostPerClothes: 2,
    gearChargesPerCraft: 8,
    warmMealFoodCost: 1,
    warmMealBuffTicks: 3,
    snowyDamageReductionWithProtection: 8,
    coldNightDamageReductionWithProtection: 3
  }
});

function mergeRules(overrides = {}) {
  return {
    food: { ...DEFAULT_GAME_RULES.food, ...(overrides.food ?? {}) },
    shelter: { ...DEFAULT_GAME_RULES.shelter, ...(overrides.shelter ?? {}) },
    storage: { ...DEFAULT_GAME_RULES.storage, ...(overrides.storage ?? {}) },
    forests: { ...DEFAULT_GAME_RULES.forests, ...(overrides.forests ?? {}) },
    meadows: { ...DEFAULT_GAME_RULES.meadows, ...(overrides.meadows ?? {}) },
    world: { ...DEFAULT_GAME_RULES.world, ...(overrides.world ?? {}) },
    survival: { ...DEFAULT_GAME_RULES.survival, ...(overrides.survival ?? {}) },
    reproduction: {
      ...DEFAULT_GAME_RULES.reproduction,
      ...(overrides.reproduction ?? {})
    },
    healing: { ...DEFAULT_GAME_RULES.healing, ...(overrides.healing ?? {}) },
    weather: { ...DEFAULT_GAME_RULES.weather, ...(overrides.weather ?? {}) },
    protection: {
      ...DEFAULT_GAME_RULES.protection,
      ...(overrides.protection ?? {})
    }
  };
}

/**
 * Parses JSONC content allowing // and /* *\/ style comments.
 * @param {string} raw
 * @returns {Record<string, unknown>}
 */
function parseJsonc(raw) {
  const withoutBlockComments = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutLineComments = withoutBlockComments.replace(
    /(^|[^:\\])\/\/.*$/gm,
    '$1'
  );
  return JSON.parse(withoutLineComments);
}

export function loadGameRules() {
  try {
    const path = join(__dirname, '../config/game_rules.jsonc');
    const raw = readFileSync(path, 'utf-8');
    return mergeRules(parseJsonc(raw));
  } catch {
    return mergeRules();
  }
}

export const GAME_RULES = Object.freeze(loadGameRules());
