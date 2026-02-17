import { describe, expect, it } from 'vitest';

import { ACTIONS } from '../shared/constants.js';
import { GAME_RULES } from '../shared/gameRules.js';
import { createInitialWorldState } from '../simulation/engine.js';
import { decideDeterministicAction } from '../ai/providers/deterministicProvider.js';

describe('deterministicProvider starvation safety policy', () => {
  it('forces eat during starvation collapse when food is available', () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    const civling = world.civlings[0];
    world.resources.food = 2;
    civling.hunger = GAME_RULES.survival.collapseHungerThreshold;

    const decision = decideDeterministicAction(civling, world);

    expect(decision.action).toBe(ACTIONS.EAT);
    expect(decision.reason).toBe('starvation_collapse_emergency_eat');
  });

  it('forces gather_food during critical starvation when no food exists', () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    const civling = world.civlings[0];
    world.resources.food = 0;
    civling.hunger = GAME_RULES.survival.criticalHungerThreshold;

    const decision = decideDeterministicAction(civling, world);

    expect(decision.action).toBe(ACTIONS.GATHER_FOOD);
    expect(decision.reason).toBe('starvation_critical_food_priority');
  });

  it('avoids risky wood actions when vitals are weak', () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    const civling = world.civlings[0];
    world.resources.food = 0;
    civling.hunger = GAME_RULES.survival.woodBlockHungerThreshold;

    const decision = decideDeterministicAction(civling, world);

    expect(decision.action).toBe(ACTIONS.GATHER_FOOD);
    expect(decision.reason).toMatch(/guardrail|food/);
  });

  it('prepares for winter cold night by avoiding late risky outdoor starts', () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    const civling = world.civlings[0];
    world.time.month = 1;
    world.time.phase = 'day';
    world.time.minuteOfDay = 17 * 60;
    world.environment.nightTemperature = 'cold';
    world.resources.wood = GAME_RULES.shelter.woodCostPerUnit;
    civling.hunger = 40;
    civling.energy = 70;

    const decision = decideDeterministicAction(civling, world);

    expect(decision.action).toBe(ACTIONS.BUILD_SHELTER);
    expect(decision.reason).toBe('winter_night_prep_build_shelter');
  });
});
