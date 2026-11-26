export type PulseEnergy = 'LOW' | 'MED' | 'HIGH';
export type PulseDifficulty = 'EASY' | 'STANDARD';

export interface PulseVibe {
  energy: PulseEnergy;
  calm: boolean;
  connection: 'LOW' | 'HIGH';
  difficulty: PulseDifficulty;
  /** Post-hackathon input (see DAILY_PULSE_QUESTION_KEYS) — always empty until the `dayTags` question exists. */
  dayTags: string[];
}

export interface PulseAnswers {
  moodRating: number;
  stressLevel: 'low' | 'moderate' | 'high' | 'severe';
  sleepQuality: 'poor' | 'fair' | 'good' | 'excellent';
  socialConnection: 'rarely' | 'sometimes' | 'often' | 'always';
  anxietyFrequency: 'never' | 'rarely' | 'sometimes' | 'often';
  dayTags?: string[];
}

const HIGH_STRESS = new Set(['high', 'severe']);
const FREQUENT_ANXIETY = new Set(['sometimes', 'often']);
const STRONG_CONNECTION = new Set(['often', 'always']);

/**
 * Buckets the 5 Daily Pulse answers into a small descriptor used to theme
 * and difficulty-scale the "Something new to try" game — not raw enum
 * values, so prompts/branching stay stable regardless of exactly which
 * option was picked. `dayTags` is passed through verbatim for later use
 * (see DAILY_PULSE_QUESTION_KEYS) but doesn't affect any bucket here yet.
 */
export function computeVibe(answers: PulseAnswers): PulseVibe {
  const highStress = HIGH_STRESS.has(answers.stressLevel);
  const frequentAnxiety = FREQUENT_ANXIETY.has(answers.anxietyFrequency);
  const poorSleep = answers.sleepQuality === 'poor';

  const calm = !highStress && !frequentAnxiety;

  const energy: PulseEnergy =
    answers.moodRating <= 2 || poorSleep ? 'LOW' : answers.moodRating >= 4 && !highStress ? 'HIGH' : 'MED';

  const connection: PulseVibe['connection'] = STRONG_CONNECTION.has(answers.socialConnection) ? 'HIGH' : 'LOW';

  const difficulty: PulseDifficulty = !calm || frequentAnxiety ? 'EASY' : 'STANDARD';

  return { energy, calm, connection, difficulty, dayTags: answers.dayTags ?? [] };
}
