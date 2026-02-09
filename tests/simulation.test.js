import { describe, expect, it } from 'vitest';

import { ACTIONS } from '../shared/constants.js';
import { createInitialWorldState, runTick } from '../simulation/engine.js';

describe('simulation engine', () => {
  it('increments tick on each run', async () => {
    const world = createInitialWorldState({ civlingCount: 2 });

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));

    expect(world.tick).toBe(1);
  });

  it('applies actions and changes resources', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    const beforeFood = world.resources.food;

    await runTick(world, () => ({ action: ACTIONS.GATHER_FOOD, reason: 'test' }));

    expect(world.resources.food).toBeGreaterThan(beforeFood);
  });

  it('gathering food reduces hunger and triggers food consumption', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.civlings[0].hunger = 90;
    world.resources.food = 0;

    await runTick(world, () => ({ action: ACTIONS.GATHER_FOOD, reason: 'test' }));

    expect(world.civlings[0].hunger).toBeLessThan(90);
    expect(world.resources.food).toBeGreaterThanOrEqual(0);
    expect(world.civlings[0].foodEatenLastTick).toBeGreaterThanOrEqual(1);
  });

  it('gathering food at low hunger stores food instead of consuming immediately', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.civlings[0].hunger = 30;
    world.resources.food = 0;

    await runTick(world, () => ({ action: ACTIONS.GATHER_FOOD, reason: 'test' }));

    expect(world.civlings[0].foodEatenLastTick).toBe(0);
    expect(world.resources.food).toBeGreaterThanOrEqual(2);
  });

  it('marks extinction when everyone starts dead', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.civlings[0].status = 'dead';

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));

    expect(world.extinction.ended).toBe(true);
    expect(world.extinction.cause).toBe('all_civlings_dead');
  });

  it('supports restartCount when creating next run', () => {
    const world = createInitialWorldState({ civlingCount: 1, restartCount: 3 });

    expect(world.restartCount).toBe(3);
  });
});
