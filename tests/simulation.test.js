import { describe, expect, it, vi } from 'vitest';

import { ACTIONS, MILESTONES, TIME } from '../shared/constants.js';
import { GAME_RULES } from '../shared/gameRules.js';
import { createInitialWorldState, runTick } from '../simulation/engine.js';

/**
 * Runs multiple ticks with a static action envelope.
 * @param {import('../shared/types.js').WorldState} world
 * @param {string} action
 * @param {number} ticks
 */
async function runTicks(world, action, ticks) {
  for (let index = 0; index < ticks; index += 1) {
    await runTick(world, () => ({ action, reason: 'test' }));
  }
}

/**
 * Advances ticks until the first civling has no active task.
 * @param {import('../shared/types.js').WorldState} world
 * @param {number} maxTicks
 */
async function runUntilTaskComplete(world, maxTicks = 12) {
  for (let index = 0; index < maxTicks; index += 1) {
    if (!world.civlings[0].currentTask) {
      return;
    }
    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));
  }
}

describe('simulation engine', () => {
  it('adds seasonal guidance memory so civlings account for winter risk', () => {
    const world = createInitialWorldState({ civlingCount: 1 });

    expect(
      world.civlings[0].memory.some((item) =>
        item.includes('Winter has harsh cold nights')
      )
    ).toBe(true);
  });

  it('increments tick on each run', async () => {
    const world = createInitialWorldState({ civlingCount: 2 });

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));

    expect(world.tick).toBe(1);
  });

  it('tracks calendar time and day/night phase', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.time.minuteOfDay = TIME.NIGHT_START_MINUTE - TIME.MINUTES_PER_TICK;

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));

    expect(world.time.phase).toBe('night');
    expect(world.time.minuteOfDay).toBe(TIME.NIGHT_START_MINUTE);
    expect(['warm', 'cold', 'snowy', 'rainy']).toContain(
      world.environment.weather
    );
  });

  it('rolls day/month/year when minute counter overflows', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.time.minuteOfDay = TIME.MINUTES_PER_DAY - TIME.MINUTES_PER_TICK;
    world.time.day = TIME.DAYS_PER_MONTH;
    world.time.month = TIME.MONTHS_PER_YEAR;
    world.time.year = 3;

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));

    expect(world.time.minuteOfDay).toBe(0);
    expect(world.time.day).toBe(1);
    expect(world.time.month).toBe(1);
    expect(world.time.year).toBe(4);
  });

  it('queues gather food first and applies it only after task duration', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    const beforeFood = world.resources.food;

    await runTick(world, () => ({
      action: ACTIONS.GATHER_FOOD,
      reason: 'test'
    }));
    expect(world.resources.food).toBe(beforeFood);
    expect(world.civlings[0].currentTask?.action).toBe(ACTIONS.GATHER_FOOD);

    await runTicks(world, ACTIONS.GATHER_FOOD, 2);
    expect(world.resources.food).toBeGreaterThan(beforeFood);
    expect(
      world.civlings[0].currentTask === null ||
        world.civlings[0].currentTask?.action === ACTIONS.GATHER_FOOD
    ).toBe(true);
  });

  it('gathers wood from a forest and stores in shelter when no storage exists', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.resources.wood = 0;
    world.forests = [{ id: 'forest-1', x: 2, y: 0, woodRemaining: 4 }];
    world.shelters = [
      { id: 'shelter-1', x: 0, y: 0, woodStored: 0, woodCapacity: 4 }
    ];
    world.civlings[0].x = 0;
    world.civlings[0].y = 0;

    await runTick(world, () => ({
      action: ACTIONS.GATHER_WOOD,
      reason: 'test'
    }));
    expect(world.civlings[0].currentTask?.action).toBe(ACTIONS.GATHER_WOOD);

    await runUntilTaskComplete(world);

    expect(world.resources.wood).toBeGreaterThan(0);
    expect(world.shelters[0].woodStored).toBeGreaterThan(0);
    expect(world.forests[0].woodRemaining).toBeLessThan(4);
  });

  it('creates gather wood tasks with the generic phase metadata contract', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.forests = [{ id: 'forest-1', x: 2, y: 0, woodRemaining: 12 }];
    world.shelters = [
      { id: 'shelter-1', x: 0, y: 0, woodStored: 0, woodCapacity: 12 }
    ];
    world.storages = [];
    world.civlings[0].x = 0;
    world.civlings[0].y = 0;

    await runTick(world, () => ({
      action: ACTIONS.GATHER_WOOD,
      reason: 'test'
    }));

    const task = world.civlings[0].currentTask;
    expect(task?.action).toBe(ACTIONS.GATHER_WOOD);
    expect(task?.totalMinutes).toBe(150);
    expect(task?.meta?.phase).toBe('travel_to_source');
    expect(task?.meta?.source).toEqual({
      id: 'forest-1',
      kind: 'forest',
      x: 2,
      y: 0
    });
    expect(task?.meta?.dropoff).toEqual({
      id: 'shelter-1',
      kind: 'shelter',
      x: 0,
      y: 0
    });
    expect(task?.meta?.paths?.toSource).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 }
    ]);
    expect(task?.meta?.paths?.toDropoff).toEqual([
      { x: 1, y: 0 },
      { x: 0, y: 0 }
    ]);
    expect(task?.meta?.workMinutesRemaining).toBe(30);
    expect(task?.meta?.yield).toEqual({
      resource: 'wood',
      amount: 2,
      carried: 0
    });
  });

  it('progresses gather wood phases deterministically without teleporting', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.resources.wood = 0;
    world.forests = [{ id: 'forest-1', x: 2, y: 0, woodRemaining: 12 }];
    world.shelters = [
      { id: 'shelter-1', x: 0, y: 0, woodStored: 0, woodCapacity: 12 }
    ];
    world.storages = [];
    world.civlings[0].x = 0;
    world.civlings[0].y = 0;

    await runTick(world, () => ({
      action: ACTIONS.GATHER_WOOD,
      reason: 'test'
    }));
    expect(world.civlings[0].currentTask?.meta?.phase).toBe('travel_to_source');
    expect([world.civlings[0].x, world.civlings[0].y]).toEqual([0, 0]);

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));
    expect([world.civlings[0].x, world.civlings[0].y]).toEqual([1, 0]);
    expect(world.civlings[0].currentTask?.meta?.phase).toBe('travel_to_source');

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));
    expect([world.civlings[0].x, world.civlings[0].y]).toEqual([2, 0]);
    expect(world.civlings[0].currentTask?.meta?.phase).toBe('work_at_source');

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));
    expect([world.civlings[0].x, world.civlings[0].y]).toEqual([2, 0]);
    expect(world.civlings[0].currentTask?.meta?.phase).toBe(
      'travel_to_dropoff'
    );

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));
    expect([world.civlings[0].x, world.civlings[0].y]).toEqual([1, 0]);
    expect(world.civlings[0].currentTask?.meta?.phase).toBe(
      'travel_to_dropoff'
    );

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));
    expect([world.civlings[0].x, world.civlings[0].y]).toEqual([0, 0]);
    expect(world.civlings[0].currentTask?.meta?.phase).toBe('deposit_output');

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));
    expect(world.civlings[0].currentTask).toBeNull();
    expect([world.civlings[0].x, world.civlings[0].y]).toEqual([0, 0]);
  });

  it('applies gather wood harvest and deposit at correct phase boundaries', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.resources.wood = 0;
    world.forests = [{ id: 'forest-1', x: 2, y: 0, woodRemaining: 10 }];
    world.shelters = [
      { id: 'shelter-1', x: 0, y: 0, woodStored: 0, woodCapacity: 12 }
    ];
    world.storages = [];
    world.civlings[0].x = 0;
    world.civlings[0].y = 0;

    await runTick(world, () => ({
      action: ACTIONS.GATHER_WOOD,
      reason: 'test'
    }));
    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));
    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));
    expect(world.forests[0].woodRemaining).toBe(10);
    expect(world.resources.wood).toBe(0);

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));
    expect(world.forests[0].woodRemaining).toBe(8);
    expect(world.resources.wood).toBe(0);
    expect(world.civlings[0].currentTask?.meta?.yield?.carried).toBe(2);

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));
    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));
    expect(world.resources.wood).toBe(0);

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));
    expect(world.resources.wood).toBe(2);
    expect(world.shelters[0].woodStored).toBe(2);
  });

  it('builds a storage structure at a physical world location', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.resources.wood = 12;

    await runTick(world, () => ({
      action: ACTIONS.BUILD_STORAGE,
      reason: 'test'
    }));
    await runUntilTaskComplete(world);

    expect(world.storages).toHaveLength(1);
    expect(world.storages[0].x).toEqual(expect.any(Number));
    expect(world.storages[0].y).toEqual(expect.any(Number));
    expect(world.resources.wood).toBe(4);
  });

  it('queues depleted forests for regrowth and respawns later', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.resources.wood = 0;
    world.forests = [{ id: 'forest-1', x: 1, y: 0, woodRemaining: 2 }];
    world.shelters = [
      { id: 'shelter-1', x: 0, y: 0, woodStored: 0, woodCapacity: 10 }
    ];

    await runTick(world, () => ({
      action: ACTIONS.GATHER_WOOD,
      reason: 'test'
    }));
    await runUntilTaskComplete(world);

    expect(world.forests).toHaveLength(0);
    expect(world.pendingForestRegrowth.length).toBeGreaterThan(0);
    world.pendingForestRegrowth[0].readyAtTick = world.tick + 1;

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));

    expect(world.forests.length).toBeGreaterThan(0);
  });

  it('auto-starts eating task when hunger is high and food is available', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.civlings[0].hunger = 90;
    world.resources.food = 3;

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));
    expect(world.civlings[0].currentTask?.action).toBe(ACTIONS.EAT);

    const hungerBeforeFinish = world.civlings[0].hunger;
    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));
    expect(world.civlings[0].currentTask).toBeNull();
    expect(world.civlings[0].hunger).toBeLessThan(hungerBeforeFinish);
    expect(world.resources.food).toBe(2);
  });

  it('applies starvation collapse as a grace period instead of instant death', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.environment.weather = 'warm';
    world.environment.nightTemperature = 'warm';
    world.time.phase = 'day';
    world.resources.food = 0;
    world.civlings[0].hunger = 100;
    world.civlings[0].health = 100;

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));

    expect(world.civlings[0].status).toBe('alive');
    expect(world.civlings[0].starvationTicks).toBe(1);
    expect(world.civlings[0].lastStarvationStage).toBe('collapse');
    expect(world.civlings[0].health).toBeGreaterThan(0);
  });

  it('kills civlings only after starvation collapse grace ticks are exhausted', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.environment.weather = 'warm';
    world.environment.nightTemperature = 'warm';
    world.time.phase = 'day';
    world.resources.food = 0;
    world.civlings[0].hunger = 100;
    world.civlings[0].health = 100;

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));
    expect(world.civlings[0].status).toBe('alive');

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));
    expect(world.civlings[0].status).toBe('dead');
    expect(world.civlings[0].starvationTicks).toBeGreaterThanOrEqual(
      GAME_RULES.survival.starvationDeathTicks
    );
  });

  it('resets starvation collapse counter after successful eating', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.environment.weather = 'warm';
    world.environment.nightTemperature = 'warm';
    world.time.phase = 'day';
    world.resources.food = 2;
    world.civlings[0].hunger = 100;
    world.civlings[0].health = 100;

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));
    expect(world.civlings[0].starvationTicks).toBe(1);

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));
    expect(world.civlings[0].status).toBe('alive');
    expect(world.civlings[0].starvationTicks).toBe(0);
    expect(world.civlings[0].lastStarvationStage).toBe('normal');
  });

  it('interrupts risky long tasks for emergency survival behavior', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.resources.food = 2;
    world.civlings[0].hunger = 90;
    world.civlings[0].currentTask = {
      action: ACTIONS.GATHER_WOOD,
      totalMinutes: 120,
      remainingMinutes: 90,
      startedAtTick: world.tick
    };
    const decisions = [];

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }), {
      onDecision: (entry) => decisions.push(entry)
    });

    expect(decisions[0]?.action).toBe(ACTIONS.EAT);
    expect(decisions[0]?.reason).toBe(
      'emergency_task_interrupted_for_survival'
    );
    expect(world.civlings[0].currentTask?.action).toBe(ACTIONS.EAT);
  });

  it('blocks risky wood/explore actions when hunger or energy is unsafe', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.civlings[0].hunger = GAME_RULES.survival.woodBlockHungerThreshold;
    world.resources.food = 1;
    const decisions = [];

    await runTick(
      world,
      () => ({ action: ACTIONS.GATHER_WOOD, reason: 'test-risky-wood' }),
      {
        onDecision: (entry) => decisions.push(entry)
      }
    );
    expect(decisions[0]?.action).toBe(ACTIONS.EAT);

    world.civlings[0].currentTask = null;
    world.civlings[0].hunger = GAME_RULES.survival.woodBlockHungerThreshold;
    world.resources.food = 0;
    decisions.length = 0;

    await runTick(
      world,
      () => ({ action: ACTIONS.EXPLORE, reason: 'test-risky-explore' }),
      {
        onDecision: (entry) => decisions.push(entry)
      }
    );
    expect(decisions[0]?.action).toBe(ACTIONS.GATHER_FOOD);
  });

  it('tracks shelter build attempts, successes, and failures separately', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.resources.wood = 4;

    await runTick(world, () => ({
      action: ACTIONS.BUILD_SHELTER,
      reason: 'test'
    }));
    await runTicks(world, ACTIONS.REST, 5);

    expect(world.civlings[0].shelterBuildAttempts).toBe(1);
    expect(world.civlings[0].shelterBuildSuccesses).toBe(1);
    expect(world.civlings[0].shelterBuildFailures).toBe(0);

    world.resources.wood = 0;
    world.civlings[0].currentTask = null;
    await runTick(world, () => ({
      action: ACTIONS.BUILD_SHELTER,
      reason: 'test'
    }));
    await runTicks(world, ACTIONS.REST, 5);

    expect(world.civlings[0].shelterBuildAttempts).toBe(2);
    expect(world.civlings[0].shelterBuildSuccesses).toBe(1);
    expect(world.civlings[0].shelterBuildFailures).toBe(1);
  });

  it('restores health at night when fire milestone exists and civling is sheltered', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.milestones.push(MILESTONES.FIRE);
    world.resources.shelterCapacity = 1;
    world.shelters = [
      { id: 'shelter-1', x: 0, y: 0, woodStored: 0, woodCapacity: 4 }
    ];
    world.civlings[0].x = 0;
    world.civlings[0].y = 0;
    world.environment.weather = 'cold';
    world.environment.nightTemperature = 'cold';
    world.time.phase = 'night';
    world.time.minuteOfDay = TIME.NIGHT_START_MINUTE;
    world.civlings[0].health = 50;
    world.civlings[0].hunger = 20;

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));

    expect(world.civlings[0].health).toBeGreaterThan(50);
  });

  it('restores health after eating when agriculture milestone exists', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.milestones.push(MILESTONES.AGRICULTURE);
    world.civlings[0].health = 60;
    world.civlings[0].hunger = 35;
    world.resources.food = 4;
    world.civlings[0].currentTask = {
      action: ACTIONS.EAT,
      totalMinutes: 10,
      remainingMinutes: 10,
      startedAtTick: world.tick
    };

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));

    expect(world.civlings[0].health).toBeGreaterThan(60);
  });

  it('restores health from eating even without agriculture milestone', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.civlings[0].health = 40;
    world.civlings[0].hunger = 80;
    world.resources.food = 2;
    world.civlings[0].currentTask = {
      action: ACTIONS.EAT,
      totalMinutes: 10,
      remainingMinutes: 10,
      startedAtTick: world.tick
    };

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));

    expect(world.civlings[0].health).toBeGreaterThan(40);
  });

  it('restores health over time while sheltered and not starving', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.shelters = [
      { id: 'shelter-1', x: 0, y: 0, woodStored: 0, woodCapacity: 4 }
    ];
    world.resources.shelterCapacity = 1;
    world.civlings[0].x = 0;
    world.civlings[0].y = 0;
    world.civlings[0].health = 50;
    world.civlings[0].hunger = 30;
    world.environment.weather = 'warm';
    world.environment.nightTemperature = 'warm';
    world.time.phase = 'day';

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));

    expect(world.civlings[0].health).toBeGreaterThan(50);
  });

  it('unlocks care action only after tools milestone', async () => {
    const world = createInitialWorldState({ civlingCount: 2 });
    world.civlings[1].health = 40;
    const decisionLog = [];

    await runTick(world, () => ({ action: ACTIONS.CARE, reason: 'test' }), {
      onDecision: (entry) => decisionLog.push(entry)
    });

    expect(decisionLog[0].action).toBe(ACTIONS.REST);
    expect(world.civlings[0].currentTask?.action).toBe(ACTIONS.REST);

    world.milestones.push(MILESTONES.TOOLS);
    world.civlings[0].currentTask = null;
    await runTick(world, () => ({ action: ACTIONS.CARE, reason: 'test' }), {
      onDecision: (entry) => decisionLog.push(entry)
    });
    await runTicks(world, ACTIONS.REST, 4);

    expect(world.civlings[1].health).toBeGreaterThan(40);
  });

  it('can heavily injure exposed civlings during snowy weather', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.environment.weather = 'snowy';
    world.resources.shelterCapacity = 0;
    world.civlings[0].health = 10;
    world.civlings[0].currentTask = {
      action: ACTIONS.EXPLORE,
      totalMinutes: 30,
      remainingMinutes: 20,
      startedAtTick: world.tick
    };

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));

    expect(world.civlings[0].status).toBe('alive');
    expect(world.civlings[0].health).toBeLessThan(10);
  });

  it('keeps sheltered civlings alive during snowy weather', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.environment.weather = 'snowy';
    world.resources.shelterCapacity = 1;
    world.shelters = [
      { id: 'shelter-1', x: 0, y: 0, woodStored: 0, woodCapacity: 4 }
    ];
    world.civlings[0].x = 0;
    world.civlings[0].y = 0;
    world.civlings[0].health = 35;
    world.civlings[0].currentTask = {
      action: ACTIONS.REST,
      totalMinutes: 60,
      remainingMinutes: 50,
      startedAtTick: world.tick
    };

    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));

    expect(world.civlings[0].status).toBe('alive');
  });

  it('returns exposed civlings toward shelter during harsh weather before other actions', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.environment.weather = 'warm';
    world.environment.nightTemperature = 'cold';
    world.time.minuteOfDay = TIME.NIGHT_START_MINUTE;
    world.time.phase = 'night';
    world.shelters = [
      { id: 'shelter-1', x: 0, y: 0, woodStored: 0, woodCapacity: 4 }
    ];
    world.civlings[0].x = 2;
    world.civlings[0].y = 0;
    world.civlings[0].health = 10;
    world.civlings[0].energy = 0;
    world.civlings[0].currentTask = {
      action: ACTIONS.GATHER_FOOD,
      totalMinutes: 30,
      remainingMinutes: 20,
      startedAtTick: world.tick
    };
    const decisions = [];

    await runTick(world, () => ({ action: ACTIONS.EXPLORE, reason: 'test' }), {
      onDecision: (entry) => decisions.push(entry)
    });

    expect(world.civlings[0].currentTask).toBeNull();
    expect([world.civlings[0].x, world.civlings[0].y]).toEqual([1, 0]);
    expect(decisions[0]?.reason).toBe('emergency_return_to_shelter');
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

  it('restricts young civlings to play/learn/rest actions', async () => {
    const world = createInitialWorldState({ civlingCount: 2 });
    world.civlings[0].age = 8;
    const decisionLog = [];

    await runTick(
      world,
      (civling) => ({
        action:
          civling.id === world.civlings[0].id
            ? ACTIONS.GATHER_FOOD
            : ACTIONS.REST,
        reason: 'test'
      }),
      {
        onDecision: (entry) => decisionLog.push(entry)
      }
    );

    const youngDecision = decisionLog.find(
      (entry) => entry.civlingId === world.civlings[0].id
    );
    expect(youngDecision?.action).toBe(ACTIONS.LEARN);
    expect(youngDecision?.fallback).toBe(true);

    await runTicks(world, ACTIONS.REST, 3);
    expect(
      world.civlings[0].memory.some((item) => item.includes('Learned'))
    ).toBe(true);
  });

  it('applies a care penalty when young civlings have no adults to help', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.civlings[0].age = 4;
    const healthBefore = world.civlings[0].health;

    await runTick(world, () => ({ action: ACTIONS.PLAY, reason: 'test' }));

    expect(world.civlings[0].health).toBeLessThan(healthBefore);
    expect(
      world.civlings[0].memory.some((item) =>
        item.includes('Needed adult help')
      )
    ).toBe(true);
  });

  it('marks adulthood transition and then enforces adult action set', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.civlings[0].age = GAME_RULES.reproduction.minAdultAge - 1 / 12;

    await runTick(world, () => ({ action: ACTIONS.PLAY, reason: 'test' }));
    expect(
      world.civlings[0].memory.some((item) =>
        item.includes('Reached adulthood and started helping the community.')
      )
    ).toBe(true);

    await runTicks(world, ACTIONS.REST, 3);
    const secondTickLog = [];
    await runTick(world, () => ({ action: ACTIONS.PLAY, reason: 'test' }), {
      onDecision: (entry) => secondTickLog.push(entry)
    });
    expect(secondTickLog[0].action).toBe(ACTIONS.REST);
  });

  it('assigns a personality profile to initial civlings', () => {
    const world = createInitialWorldState({ civlingCount: 2 });

    for (const civling of world.civlings) {
      expect(civling.personality).toBeTruthy();
      expect(civling.personality.archetype).toEqual(expect.any(String));
      expect(civling.personality.wayToAct).toEqual(expect.any(String));
      expect(civling.personality.goals).toHaveLength(2);
      expect(civling.personality.actionBiases[ACTIONS.GATHER_FOOD]).toEqual(
        expect.any(Number)
      );
    }
  });

  it('creates a newborn only when adult partners complete reproduce tasks with shelter capacity', async () => {
    const world = createInitialWorldState({ civlingCount: 2 });
    world.resources.shelterCapacity = 3;
    world.shelters = [
      { id: 'shelter-1', x: 0, y: 0, woodStored: 0, woodCapacity: 8 }
    ];
    world.civlings[0].x = 0;
    world.civlings[0].y = 0;
    world.civlings[1].x = 0;
    world.civlings[1].y = 0;
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);

    try {
      await runTicks(world, ACTIONS.REPRODUCE, 4);
    } finally {
      randomSpy.mockRestore();
    }

    expect(world.civlings).toHaveLength(3);
    const newborn = world.civlings[2];
    expect(newborn.age).toBeGreaterThanOrEqual(0);
    expect(newborn.age).toBeLessThanOrEqual(1 / 6);
    expect(['male', 'female']).toContain(newborn.gender);
    expect(newborn.babyChance).toBeCloseTo(0.35, 5);
    expect(newborn.memory).toContain('Born this tick.');
    expect(newborn.memory.some((item) => item.includes('Personality:'))).toBe(
      true
    );
    expect(newborn.personality.goals).toHaveLength(2);
    expect(world.civlings[0].reproductionAttempts).toBe(1);
    expect(world.civlings[1].reproductionAttempts).toBe(1);
  });

  it('does not create newborn when adults do not choose reproduce', async () => {
    const world = createInitialWorldState({ civlingCount: 2 });
    world.resources.shelterCapacity = 3;

    await runTicks(world, ACTIONS.REST, 5);

    expect(world.civlings).toHaveLength(2);
    expect(world.civlings[0].reproductionAttempts).toBe(0);
    expect(world.civlings[1].reproductionAttempts).toBe(0);
  });

  it('does not create newborn when shelter capacity is full', async () => {
    const world = createInitialWorldState({ civlingCount: 2 });
    world.resources.shelterCapacity = 2;

    await runTicks(world, ACTIONS.REPRODUCE, 4);

    expect(world.civlings).toHaveLength(2);
    expect(world.civlings[0].reproductionAttempts).toBe(0);
    expect(world.civlings[1].reproductionAttempts).toBe(0);
  });

  it('does not count reproduction attempts when only one civling chooses reproduce', async () => {
    const world = createInitialWorldState({ civlingCount: 2 });
    world.resources.shelterCapacity = 3;
    await runTicks(world, ACTIONS.REST, 3);

    await runTick(world, (civling) => ({
      action:
        civling.id === world.civlings[0].id ? ACTIONS.REPRODUCE : ACTIONS.REST,
      reason: 'test'
    }));
    await runTicks(world, ACTIONS.REST, 4);

    expect(world.civlings).toHaveLength(2);
    expect(world.civlings[0].reproductionAttempts).toBe(0);
    expect(world.civlings[1].reproductionAttempts).toBe(0);
  });

  it('tracks reproduction attempts when no baby is conceived', async () => {
    const world = createInitialWorldState({ civlingCount: 2 });
    world.resources.shelterCapacity = 3;
    world.shelters = [
      { id: 'shelter-1', x: 0, y: 0, woodStored: 0, woodCapacity: 8 }
    ];
    world.civlings[0].x = 0;
    world.civlings[0].y = 0;
    world.civlings[1].x = 0;
    world.civlings[1].y = 0;
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);

    try {
      await runTicks(world, ACTIONS.REPRODUCE, 4);
    } finally {
      randomSpy.mockRestore();
    }

    expect(world.civlings).toHaveLength(2);
    expect(world.civlings[0].reproductionAttempts).toBe(2);
    expect(world.civlings[1].reproductionAttempts).toBe(2);
    expect(world.civlings[0].babiesBorn).toBe(0);
    expect(world.civlings[1].babiesBorn).toBe(0);
  });

  it('seeds meadows and gathers fiber from them', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.meadows = [{ id: 'meadow-1', x: 1, y: 0, fiberRemaining: 2 }];
    world.resources.fiber = 0;

    await runTick(world, () => ({
      action: ACTIONS.GATHER_FIBER,
      reason: 'test'
    }));
    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));

    expect(world.resources.fiber).toBeGreaterThan(0);
    expect(world.meadows).toHaveLength(0);
    expect(world.pendingMeadowRegrowth.length).toBeGreaterThan(0);
  });

  it('requires shelter tile for reproduction attempts', async () => {
    const world = createInitialWorldState({ civlingCount: 2 });
    world.resources.shelterCapacity = 3;
    world.shelters = [
      { id: 'shelter-1', x: 0, y: 0, woodStored: 0, woodCapacity: 8 }
    ];
    world.civlings[0].x = 0;
    world.civlings[0].y = 0;
    world.civlings[1].x = 2;
    world.civlings[1].y = 0;

    await runTicks(world, ACTIONS.REPRODUCE, 4);

    expect(world.civlings[0].reproductionAttempts).toBe(0);
    expect(world.civlings[1].reproductionAttempts).toBe(0);
  });

  it('crafts clothes and applies weather protection charges', async () => {
    const world = createInitialWorldState({ civlingCount: 1 });
    world.resources.fiber = GAME_RULES.protection.fiberCostPerClothes;
    world.resources.wood = GAME_RULES.protection.woodCostPerClothes;

    await runTick(world, () => ({
      action: ACTIONS.CRAFT_CLOTHES,
      reason: 'test'
    }));
    await runUntilTaskComplete(world);
    expect(world.civlings[0].weatherProtection.gearCharges).toBeGreaterThan(0);

    world.environment.weather = 'snowy';
    world.time.phase = 'day';
    world.shelters = [];
    const beforeCharges = world.civlings[0].weatherProtection.gearCharges;
    await runTick(world, () => ({ action: ACTIONS.REST, reason: 'test' }));
    expect(world.civlings[0].weatherProtection.gearCharges).toBeLessThan(
      beforeCharges
    );
  });
});
