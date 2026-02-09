import { decideDeterministicAction } from './providers/deterministicProvider.js';
import { LocalApiProvider } from './providers/localApiProvider.js';

function deterministicProvider() {
  return {
    async decideAction(civling, world) {
      return decideDeterministicAction(civling, world);
    }
  };
}

/**
 * @param {ReturnType<import('../shared/config.js').readConfig>} config
 */
export function createProvider(config) {
  if (config.AI_PROVIDER === 'local_api') {
    return new LocalApiProvider({
      baseUrl: config.LOCAL_LLM_BASE_URL,
      model: config.LOCAL_LLM_MODEL,
      apiKey: config.LOCAL_LLM_API_KEY,
      timeoutMs: config.AI_DECISION_TIMEOUT_MS,
      maxRetries: config.AI_MAX_RETRIES
    });
  }

  return deterministicProvider();
}
