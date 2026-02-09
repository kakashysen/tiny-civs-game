import { describe, expect, it, vi } from 'vitest';

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

  it('build shelter uses configured wood cost and capacity gain', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.resources.wood = 4;
    world.resources.shelterCapacity = 0;

    await runTick(world, () => ({ action: ACTIONS.BUILD_SHELTER, reason: 'test' }));

    expect(world.resources.wood).toBe(0);
    expect(world.resources.shelterCapacity).toBe(2);
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

  it('creates a newborn only when adult partners choose reproduce with shelter capacity available', async () => {
    const world = createInitialWorldState({ civlingCount: 2 });
    world.resources.shelterCapacity = 3;
    const randomSpy = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.1);

    try {
      await runTick(world, () => ({ action: ACTIONS.REPRODUCE, reason: 'test' }));
    } finally {
      randomSpy.mockRestore();
    }

    expect(world.civlings).toHaveLength(3);
    const newborn = world.civlings[2];
    expect(newborn.age).toBe(0);
    expect(['male', 'female']).toContain(newborn.gender);
    expect(newborn.babyChance).toBeCloseTo(0.35, 5);
    expect(newborn.memory).toContain('Born this tick.');
    expect(world.civlings[0].reproductionAttempts).toBe(1);
    expect(world.civlings[1].reproductionAttempts).toBe(1);
  });

  it('does not create newborn when adults do not choose reproduce', async () => {
    const world = createInitialWorldState({ civlingCount: 2 });
    world.resources.shelterCapacity = 3;

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));

    expect(world.civlings).toHaveLength(2);
    expect(world.civlings[0].reproductionAttempts).toBe(0);
    expect(world.civlings[1].reproductionAttempts).toBe(0);
  });

  it('does not create newborn when shelter capacity is full', async () => {
    const world = createInitialWorldState({ civlingCount: 2 });
    world.resources.shelterCapacity = 2;

    await runTick(world, () => ({ action: ACTIONS.REPRODUCE, reason: 'test' }));

    expect(world.civlings).toHaveLength(2);
    expect(world.civlings[0].reproductionAttempts).toBe(0);
    expect(world.civlings[1].reproductionAttempts).toBe(0);
  });

  it('does not count sex attempts when only one civling chooses reproduce', async () => {
    const world = createInitialWorldState({ civlingCount: 2 });
    world.resources.shelterCapacity = 3;

    await runTick(world, (civling) => ({
      action: civling.id === world.civlings[0].id ? ACTIONS.REPRODUCE : ACTIONS.REST,
      reason: 'test'
    }));

    expect(world.civlings).toHaveLength(2);
    expect(world.civlings[0].reproductionAttempts).toBe(0);
    expect(world.civlings[1].reproductionAttempts).toBe(0);
  });

  it('tracks reproduction attempts when no baby is conceived', async () => {
    const world = createInitialWorldState({ civlingCount: 2 });
    world.resources.shelterCapacity = 3;
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);

    try {
      await runTick(world, () => ({ action: ACTIONS.REPRODUCE, reason: 'test' }));
    } finally {
      randomSpy.mockRestore();
    }

    expect(world.civlings).toHaveLength(2);
    expect(world.civlings[0].reproductionAttempts).toBe(1);
    expect(world.civlings[1].reproductionAttempts).toBe(1);
    expect(world.civlings[0].babiesBorn).toBe(0);
    expect(world.civlings[1].babiesBorn).toBe(0);
  });
});
