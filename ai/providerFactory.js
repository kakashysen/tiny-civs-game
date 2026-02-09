import { decideDeterministicAction } from './providers/deterministicProvider.js';
import { HybridProvider } from './providers/hybridProvider.js';
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
  const deterministic = deterministicProvider();

  if (config.AI_PROVIDER !== 'local_api') {
    return deterministic;
  }

  const localProvider = new LocalApiProvider({
    baseUrl: config.LOCAL_LLM_BASE_URL,
    model: config.LOCAL_LLM_MODEL,
    apiKey: config.LOCAL_LLM_API_KEY,
    timeoutMs: config.AI_DECISION_TIMEOUT_MS,
    maxRetries: config.AI_MAX_RETRIES
  });

  if (config.AI_ESCALATION_MODE === 'hybrid') {
    return new HybridProvider({
      localProvider,
      deterministicProvider: deterministic,
      maxCallsPerHour: config.AI_MAX_CALLS_PER_HOUR
    });
  }

  return localProvider;
}
