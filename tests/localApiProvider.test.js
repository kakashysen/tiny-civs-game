import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ACTIONS } from '../shared/constants.js';
import { createInitialWorldState } from '../simulation/engine.js';
import { LocalApiProvider, __testOnly } from '../ai/providers/localApiProvider.js';

describe('localApiProvider parsing', () => {
  it('extracts valid envelope from plain JSON', () => {
    const parsed = __testOnly.extractEnvelope('{"action":"rest","reason":"ok"}');
    expect(parsed).toEqual({ action: 'rest', reason: 'ok' });
  });

  it('returns null for invalid envelope', () => {
    const parsed = __testOnly.extractEnvelope('{"bad":true}');
    expect(parsed).toBeNull();
  });
});

describe('LocalApiProvider decideAction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed action from provider response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '{"action":"gather_food","reason":"low food"}'
              }
            }
          ]
        })
      })
    );

    const provider = new LocalApiProvider({
      baseUrl: 'http://localhost:11434/v1',
      model: 'test',
      timeoutMs: 200,
      maxRetries: 0
    });

    const world = createInitialWorldState({ civlingCount: 1 });
    const action = await provider.decideAction(world.civlings[0], world);

    expect(action.action).toBe(ACTIONS.GATHER_FOOD);
  });

  it('falls back to rest on persistent failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({})
      })
    );

    const provider = new LocalApiProvider({
      baseUrl: 'http://localhost:11434/v1',
      model: 'test',
      timeoutMs: 50,
      maxRetries: 1
    });

    const world = createInitialWorldState({ civlingCount: 1 });
    const action = await provider.decideAction(world.civlings[0], world);

    expect(action).toEqual({ action: ACTIONS.REST, reason: 'local_api_fallback_rest' });
  });
});
