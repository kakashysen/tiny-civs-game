import { ACTIONS } from '../../shared/constants.js';
import { buildDecisionPrompt } from '../prompts/buildDecisionPrompt.js';

function fallbackEnvelope(reason) {
  return { action: ACTIONS.REST, reason };
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

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
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

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (this.apiKey) {
          headers.Authorization = `Bearer ${this.apiKey}`;
        }

        const response = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: this.model,
              temperature: 0.2,
              messages: [
                {
                  role: 'system',
                  content: 'Decide a safe and useful next action. Output JSON only.'
                },
                { role: 'user', content: prompt }
              ]
            })
          },
          this.timeoutMs
        );

        if (!response.ok) {
          continue;
        }

        const body = await response.json();
        const content = body?.choices?.[0]?.message?.content;
        const envelope = extractEnvelope(content);
        if (envelope && Object.values(ACTIONS).includes(envelope.action)) {
          return envelope;
        }
      } catch {
        // Retry path handled by loop.
      }
    }

    return fallbackEnvelope('local_api_fallback_rest');
  }
}

export const __testOnly = {
  extractEnvelope,
  tryParseEnvelope
};
