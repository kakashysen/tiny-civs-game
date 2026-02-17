import { describe, expect, it } from 'vitest';

import {
  buildLatestThoughtByCivling,
  deriveBubbleModel,
  formatActionLabel,
  humanizeReason
} from '../desktop/renderer/civlingBubbleText.js';

describe('civling bubble text helpers', () => {
  it('formats snake_case actions to readable labels', () => {
    expect(formatActionLabel('gather_wood')).toBe('gather wood');
    expect(formatActionLabel('')).toBe('idle');
  });

  it('humanizes known reason codes and falls back to underscore spacing', () => {
    expect(humanizeReason('task_in_progress')).toBe('continuing current task');
    expect(humanizeReason('starvation_critical_food_priority')).toBe(
      'starvation critical food priority'
    );
  });

  it('builds latest thought entries by civling for a run', () => {
    const thoughtLog = [
      {
        runId: 'run-b',
        civlingId: 'c-1',
        action: 'rest',
        reason: 'other_run'
      },
      {
        runId: 'run-a',
        civlingId: 'c-1',
        action: 'gather_food',
        reason: 'first'
      },
      {
        runId: 'run-a',
        civlingId: 'c-1',
        action: 'build_shelter',
        reason: 'newer_but_ignored'
      },
      {
        runId: 'run-a',
        civlingId: 'c-2',
        action: 'explore',
        reason: 'scout'
      }
    ];
    const latest = buildLatestThoughtByCivling(thoughtLog, 'run-a');

    expect(latest.get('c-1')).toMatchObject({
      action: 'gather_food',
      reason: 'first'
    });
    expect(latest.get('c-2')).toMatchObject({ action: 'explore' });
    expect(latest.size).toBe(2);
  });

  it('derives doing/planning text with correct fallbacks', () => {
    expect(
      deriveBubbleModel(
        { currentTask: { action: 'gather_wood' } },
        { action: 'explore', reason: 'task_in_progress' }
      )
    ).toEqual({
      doingText: 'gather wood',
      planningText: 'continuing current task'
    });

    expect(deriveBubbleModel({ currentTask: null }, undefined)).toEqual({
      doingText: 'idle',
      planningText: 'waiting for next decision'
    });
  });
});

