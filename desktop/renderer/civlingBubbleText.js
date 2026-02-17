const HUMANIZED_REASON_BY_CODE = Object.freeze({
  task_in_progress: 'continuing current task',
  task_completed: 'completed task, choosing next',
  auto_eat_needed: 'needs food now',
  emergency_return_to_shelter: 'seeking shelter from harsh weather',
  emergency_hold_outdoor_no_path: 'waiting outside, no safe path',
  fallback_after_decision_error: 'recovering from decision error'
});

/**
 * @param {string | null | undefined} action
 * @returns {string}
 */
export function formatActionLabel(action) {
  if (typeof action !== 'string' || !action.trim()) {
    return 'idle';
  }
  return action.replaceAll('_', ' ').trim();
}

/**
 * @param {string | null | undefined} reason
 * @returns {string}
 */
export function humanizeReason(reason) {
  if (typeof reason !== 'string' || !reason.trim()) {
    return 'waiting for next decision';
  }
  const normalized = reason.trim();
  return (
    HUMANIZED_REASON_BY_CODE[normalized] ??
    normalized.replaceAll('_', ' ').trim()
  );
}

/**
 * @param {Array<{runId: string, civlingId: string, action: string, reason: string}>} thoughtLog
 * @param {string} runId
 * @returns {Map<string, {runId: string, civlingId: string, action: string, reason: string}>}
 */
export function buildLatestThoughtByCivling(thoughtLog, runId) {
  const latestById = new Map();
  for (const entry of thoughtLog) {
    if (entry.runId !== runId) {
      continue;
    }
    if (!latestById.has(entry.civlingId)) {
      latestById.set(entry.civlingId, entry);
    }
  }
  return latestById;
}

/**
 * @param {{currentTask?: {action?: string}|null}} civling
 * @param {{action?: string, reason?: string}|undefined} latestThought
 * @returns {{doingText: string, planningText: string}}
 */
export function deriveBubbleModel(civling, latestThought) {
  const doingAction =
    civling?.currentTask?.action ?? latestThought?.action ?? 'idle';
  return {
    doingText: formatActionLabel(doingAction),
    planningText: humanizeReason(latestThought?.reason)
  };
}

