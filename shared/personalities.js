import { ACTIONS } from './constants.js';

const ARCHETYPES = Object.freeze([
  {
    archetype: 'Steward',
    wayToAct: 'methodical',
    goals: ['Keep the tribe fed', 'Maintain reliable shelter'],
    actionBiases: {
      [ACTIONS.PLAY]: 0.9,
      [ACTIONS.LEARN]: 1.05,
      [ACTIONS.GATHER_FOOD]: 1.35,
      [ACTIONS.GATHER_WOOD]: 1.1,
      [ACTIONS.BUILD_SHELTER]: 1.2,
      [ACTIONS.CARE]: 1.25,
      [ACTIONS.REST]: 0.9,
      [ACTIONS.EXPLORE]: 0.7,
      [ACTIONS.REPRODUCE]: 1.0
    }
  },
  {
    archetype: 'Trailblazer',
    wayToAct: 'bold',
    goals: ['Discover useful terrain', 'Push growth opportunities'],
    actionBiases: {
      [ACTIONS.PLAY]: 1.05,
      [ACTIONS.LEARN]: 1.15,
      [ACTIONS.GATHER_FOOD]: 0.9,
      [ACTIONS.GATHER_WOOD]: 0.9,
      [ACTIONS.BUILD_SHELTER]: 0.8,
      [ACTIONS.CARE]: 0.8,
      [ACTIONS.REST]: 0.7,
      [ACTIONS.EXPLORE]: 1.45,
      [ACTIONS.REPRODUCE]: 1.1
    }
  },
  {
    archetype: 'Builder',
    wayToAct: 'deliberate',
    goals: ['Expand shelter capacity', 'Stockpile wood for projects'],
    actionBiases: {
      [ACTIONS.PLAY]: 0.8,
      [ACTIONS.LEARN]: 1.3,
      [ACTIONS.GATHER_FOOD]: 0.95,
      [ACTIONS.GATHER_WOOD]: 1.35,
      [ACTIONS.BUILD_SHELTER]: 1.45,
      [ACTIONS.CARE]: 0.9,
      [ACTIONS.REST]: 0.85,
      [ACTIONS.EXPLORE]: 0.75,
      [ACTIONS.REPRODUCE]: 0.95
    }
  },
  {
    archetype: 'Caretaker',
    wayToAct: 'protective',
    goals: ['Keep everyone healthy', 'Create stable family growth'],
    actionBiases: {
      [ACTIONS.PLAY]: 1.2,
      [ACTIONS.LEARN]: 1.2,
      [ACTIONS.GATHER_FOOD]: 1.25,
      [ACTIONS.GATHER_WOOD]: 0.9,
      [ACTIONS.BUILD_SHELTER]: 1.1,
      [ACTIONS.CARE]: 1.45,
      [ACTIONS.REST]: 1.0,
      [ACTIONS.EXPLORE]: 0.65,
      [ACTIONS.REPRODUCE]: 1.25
    }
  },
  {
    archetype: 'Opportunist',
    wayToAct: 'adaptive',
    goals: ['Exploit momentum quickly', 'Balance risk and reward'],
    actionBiases: {
      [ACTIONS.PLAY]: 1.1,
      [ACTIONS.LEARN]: 1.25,
      [ACTIONS.GATHER_FOOD]: 1.0,
      [ACTIONS.GATHER_WOOD]: 1.0,
      [ACTIONS.BUILD_SHELTER]: 1.0,
      [ACTIONS.CARE]: 1.0,
      [ACTIONS.REST]: 0.85,
      [ACTIONS.EXPLORE]: 1.2,
      [ACTIONS.REPRODUCE]: 1.1
    }
  },
  {
    archetype: 'Sage',
    wayToAct: 'patient',
    goals: ['Avoid avoidable losses', 'Sustain long-term reserves'],
    actionBiases: {
      [ACTIONS.PLAY]: 0.75,
      [ACTIONS.LEARN]: 1.4,
      [ACTIONS.GATHER_FOOD]: 1.2,
      [ACTIONS.GATHER_WOOD]: 1.0,
      [ACTIONS.BUILD_SHELTER]: 1.15,
      [ACTIONS.CARE]: 1.2,
      [ACTIONS.REST]: 1.05,
      [ACTIONS.EXPLORE]: 0.7,
      [ACTIONS.REPRODUCE]: 0.9
    }
  }
]);

/**
 * Returns a random entry from a list.
 * @template T
 * @param {T[]} list
 * @returns {T}
 */
function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Builds a random personality profile for a civling.
 * @returns {import('./types.js').CivlingPersonality}
 */
export function createRandomPersonality() {
  const base = pickRandom(ARCHETYPES);
  const [goalA, goalB] = base.goals;
  const goals = Math.random() < 0.5 ? [goalA, goalB] : [goalB, goalA];
  return {
    archetype: base.archetype,
    wayToAct: base.wayToAct,
    goals,
    actionBiases: { ...base.actionBiases }
  };
}

/**
 * Chooses the highest-bias action among candidates for this civling.
 * @param {import('./types.js').Civling} civling
 * @param {string[]} candidates
 * @param {string} fallback
 * @returns {string}
 */
export function pickPersonalityAction(civling, candidates, fallback) {
  const biases = civling.personality?.actionBiases ?? {};
  let bestAction = fallback;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const action of candidates) {
    const score = biases[action] ?? 1;
    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
    }
  }
  return bestAction;
}
