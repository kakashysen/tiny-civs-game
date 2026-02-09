import { ACTIONS } from '../../shared/constants.js';
import { decideDeterministicAction } from './deterministicProvider.js';
import { buildDecisionPrompt } from '../prompts/buildDecisionPrompt.js';

function fallbackEnvelope(reason) {
  return { action: ACTIONS.REST, reason, source: 'local_api' };
}

/**
 * @param {string} value
 */
function tryParseEnvelope(value) {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed?.action === 'string' && typeof parsed?.reason === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} content
 */
function extractEnvelope(content) {
  if (typeof content === 'string') {
    const direct = tryParseEnvelope(content);
    if (direct) {
      return direct;
    }

    const fencedMatch = content.match(/\{[\s\S]*\}/);
    if (!fencedMatch) {
      return null;
    }
    return tryParseEnvelope(fencedMatch[0]);
  }

  if (Array.isArray(content)) {
    const textChunk = content.find((item) => item?.type === 'text');
    if (textChunk && typeof textChunk.text === 'string') {
      return extractEnvelope(textChunk.text);
    }
  }

  return null;
}

/**
 * Best-effort parser for partially truncated JSON-like output.
 * @param {string} content
 */
function extractPartialEnvelope(content) {
  const actionMatch = content.match(/"action"\s*:\s*"([^"]+)"/i);
  if (!actionMatch) {
    return null;
  }

  const reasonMatch = content.match(/"reason"\s*:\s*"([^"\n\r}]*)/i);
  return {
    action: actionMatch[1],
    reason: reasonMatch?.[1]?.trim() || 'model_partial_reason'
  };
}

/**
 * @param {string} text
 * @param {number} max
 */
function clip(text, max = 1200) {
  if (!text) {
    return '';
  }
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}...<truncated>`;
}

/**
 * Prevent policy collapse where model repeats gather_food forever.
 * @param {import('../../shared/types.js').Civling} civling
 * @param {import('../../shared/types.js').WorldState} world
 * @param {import('../../shared/types.js').ActionEnvelope & {source?: string}} envelope
 */
function applyAntiLoopPolicy(civling, world, envelope) {
  const isGatherFood = envelope.action === ACTIONS.GATHER_FOOD;
  const lowHunger = civling.hunger <= 45;
  const aliveCivlings = world.civlings.filter((item) => item.status === 'alive').length;
  const reserveTarget = Math.max(6, aliveCivlings * 4);
  const foodStockHealthy = world.resources.food >= reserveTarget;
  const recentGatherCount = civling.memory
    .slice(-3)
    .filter((item) => item.includes('Gathered food')).length;
  const repeatingGather = recentGatherCount >= 2;

  if (isGatherFood && lowHunger && foodStockHealthy && repeatingGather) {
    const alternative = decideDeterministicAction(civling, world);
    if (alternative.action !== ACTIONS.GATHER_FOOD) {
      return {
        action: alternative.action,
        reason: `anti_loop_override:${envelope.reason}`,
        source: 'local_api_adjusted'
      };
    }
  }

  return envelope;
}

/**
 * Ensure survival actions under immediate risk.
 * @param {import('../../shared/types.js').Civling} civling
 * @param {import('../../shared/types.js').WorldState} world
 * @param {import('../../shared/types.js').ActionEnvelope & {source?: string}} envelope
 */
function applySurvivalPolicy(civling, world, envelope) {
  const starvationRisk = civling.hunger >= 70 || world.resources.food <= 0;
  const energyRisk = civling.energy <= 20;
  const notSurvivalAction =
    envelope.action !== ACTIONS.GATHER_FOOD && envelope.action !== ACTIONS.REST;

  if ((starvationRisk || energyRisk) && notSurvivalAction) {
    const alternative = decideDeterministicAction(civling, world);
    return {
      action: alternative.action,
      reason: `survival_override:${envelope.reason}`,
      source: 'local_api_adjusted'
    };
  }

  return envelope;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readErrorBody(response) {
  try {
    const text = await response.text();
    return text || `http_${response.status}`;
  } catch {
    return `http_${response.status}`;
  }
}

export class LocalApiProvider {
  /**
   * @param {{baseUrl: string, model: string, apiKey?: string, timeoutMs: number, maxRetries: number}} config
   */
  constructor(config) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.model = config.model;
    this.apiKey = config.apiKey ?? '';
    this.timeoutMs = config.timeoutMs;
    this.maxRetries = config.maxRetries;
  }

  /**
   * @param {import('../../shared/types.js').Civling} civling
   * @param {import('../../shared/types.js').WorldState} world
   */
  async decideAction(civling, world) {
    const prompt = buildDecisionPrompt(civling, world);
    const url = `${this.baseUrl}/chat/completions`;
    let lastRawResponse = '';
    let lastError = '';

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (this.apiKey) {
          headers.Authorization = `Bearer ${this.apiKey}`;
        }

        const basePayload = {
          model: this.model,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: 'Decide a safe and useful next action. Output JSON only.'
            },
            { role: 'user', content: prompt }
          ]
        };

        let payload = {
          ...basePayload,
          response_format: { type: 'json_object' }
        };

        let response = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          },
          this.timeoutMs
        );

        if (!response.ok && response.status === 400) {
          payload = basePayload;
          response = await fetchWithTimeout(
            url,
            {
              method: 'POST',
              headers,
              body: JSON.stringify(payload)
            },
            this.timeoutMs
          );
        }

        if (!response.ok) {
          lastError = await readErrorBody(response);
          continue;
        }

        const body = await response.json();
        const content = body?.choices?.[0]?.message?.content;
        lastRawResponse =
          typeof content === 'string' ? content : JSON.stringify(content ?? '', null, 2);
        let envelope = extractEnvelope(content);
        if (!envelope && typeof content === 'string') {
          envelope = extractPartialEnvelope(content);
        }
        if (envelope && Object.values(ACTIONS).includes(envelope.action)) {
          let adjusted = applyAntiLoopPolicy(civling, world, envelope);
          adjusted = applySurvivalPolicy(civling, world, adjusted);
          return {
            ...adjusted,
            source: adjusted.source ?? 'local_api',
            llmTrace: {
              prompt: clip(prompt),
              response: clip(lastRawResponse),
              status: 'ok'
            }
          };
        }
        lastError = 'parse_failed';
      } catch {
        // Retry path handled by loop.
        lastError = 'network_or_timeout';
      }
    }

    return {
      ...fallbackEnvelope('local_api_fallback_rest'),
      llmTrace: {
        prompt: clip(prompt),
        response: clip(lastRawResponse || lastError || 'no_response'),
        status: 'fallback'
      }
    };
  }
}

export const __testOnly = {
  extractEnvelope,
  tryParseEnvelope,
  extractPartialEnvelope
};
