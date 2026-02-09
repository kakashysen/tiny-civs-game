import { describe, expect, it, vi } from 'vitest';

import { createInitialWorldState } from '../simulation/engine.js';
import { HybridProvider, __testOnly } from '../ai/providers/hybridProvider.js';

describe('hybrid provider triggers', () => {
  it('detects repeated failed plans', () => {
    const result = __testOnly.hasRepeatedBlocks({
      memory: ['Failed A', 'Failed B', 'Failed C']
    });

    expect(result).toBe(true);
  });

  it('detects innovation pulse every 25 ticks', () => {
    expect(__testOnly.isInnovationPulse({ tick: 25 })).toBe(true);
    expect(__testOnly.isInnovationPulse({ tick: 24 })).toBe(false);
  });
});

describe('HybridProvider decideAction', () => {
  it('uses local provider on escalation and budget availability', async () => {
    const localProvider = { decideAction: vi.fn().mockResolvedValue({ action: 'rest', reason: 'l' }) };
    const deterministicProvider = {
      decideAction: vi.fn().mockResolvedValue({ action: 'gather_food', reason: 'd' })
    };

    const provider = new HybridProvider({
      localProvider,
      deterministicProvider,
      maxCallsPerHour: 1
    });

    const world = createInitialWorldState({ civlingCount: 1 });
    world.tick = 25;

    await provider.decideAction(world.civlings[0], world);

    expect(localProvider.decideAction).toHaveBeenCalledTimes(1);
    expect(deterministicProvider.decideAction).toHaveBeenCalledTimes(0);
  });

  it('falls back to deterministic when budget is exhausted', async () => {
    const localProvider = { decideAction: vi.fn().mockResolvedValue({ action: 'rest', reason: 'l' }) };
    const deterministicProvider = {
      decideAction: vi.fn().mockResolvedValue({ action: 'gather_food', reason: 'd' })
    };

    const provider = new HybridProvider({
      localProvider,
      deterministicProvider,
      maxCallsPerHour: 0
    });

    const world = createInitialWorldState({ civlingCount: 1 });
    world.tick = 25;

    await provider.decideAction(world.civlings[0], world);

    expect(localProvider.decideAction).toHaveBeenCalledTimes(0);
    expect(deterministicProvider.decideAction).toHaveBeenCalledTimes(1);
  });
});
