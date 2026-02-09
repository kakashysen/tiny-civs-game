import { DEFAULT_CONFIG } from './constants.js';

function intEnv(name, fallback) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolEnv(name, fallback) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  return value.toLowerCase() === 'true';
}

export function readConfig() {
  return {
    SIM_TICK_MS: intEnv('SIM_TICK_MS', DEFAULT_CONFIG.SIM_TICK_MS),
    SIM_SNAPSHOT_EVERY_TICKS: intEnv(
      'SIM_SNAPSHOT_EVERY_TICKS',
      DEFAULT_CONFIG.SIM_SNAPSHOT_EVERY_TICKS
    ),
    SIM_MAX_CIVLINGS: intEnv('SIM_MAX_CIVLINGS', DEFAULT_CONFIG.SIM_MAX_CIVLINGS),
    SIM_AUTO_RESTART: boolEnv('SIM_AUTO_RESTART', true),
    SIM_RESTART_DELAY_MS: intEnv('SIM_RESTART_DELAY_MS', 2000),
    AI_PROVIDER: process.env.AI_PROVIDER ?? 'deterministic',
    LOCAL_LLM_BASE_URL: process.env.LOCAL_LLM_BASE_URL ?? 'http://localhost:11434/v1',
    LOCAL_LLM_MODEL: process.env.LOCAL_LLM_MODEL ?? 'qwen2.5:3b',
    LOCAL_LLM_API_KEY: process.env.LOCAL_LLM_API_KEY ?? '',
    AI_DECISION_TIMEOUT_MS: intEnv('AI_DECISION_TIMEOUT_MS', 4000),
    AI_MAX_RETRIES: intEnv('AI_MAX_RETRIES', 1)
  };
}
