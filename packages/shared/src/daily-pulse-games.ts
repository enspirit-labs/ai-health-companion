import { z } from 'zod';

export const TANGO_SYMBOLS = ['SUN', 'MOON'] as const;
export type TangoSymbol = (typeof TANGO_SYMBOLS)[number];

export const TangoConstraintTypeSchema = z.enum(['EQUAL', 'OPPOSITE']);
export type TangoConstraintType = z.infer<typeof TangoConstraintTypeSchema>;

/** A `=` or `x` clue between two adjacent cells, given by row/col coordinates. */
export const TangoConstraintSchema = z.object({
  a: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  b: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  type: TangoConstraintTypeSchema,
});
export type TangoConstraint = z.infer<typeof TangoConstraintSchema>;

const TangoCellSchema = z.enum([...TANGO_SYMBOLS, 'EMPTY']);

export const TangoGameSchema = z.object({
  type: z.literal('TANGO'),
  title: z.string().min(1),
  size: z.union([z.literal(4), z.literal(6)]),
  /** The puzzle as served to the player — `EMPTY` cells are the ones to solve. */
  grid: z.array(z.array(TangoCellSchema)),
  constraints: z.array(TangoConstraintSchema),
  /** Fully filled solution grid, used for client-side validation of a completed attempt. */
  solution: z.array(z.array(z.enum(TANGO_SYMBOLS))),
});
export type TangoGame = z.infer<typeof TangoGameSchema>;

/** The part of a Pinpoint puzzle the AiProvider is responsible for generating —
 * no `type` discriminant, since that's added by the caller assembling the full PulseGame. */
export const PinpointContentSchema = z.object({
  /**
   * The category the clue words share, phrased as the answer the player types
   * (e.g. "Words that come before price"). Not a mood label — it's the thing
   * being guessed.
   */
  theme: z.string().min(1),
  /**
   * Short clue *words or terms* (not sentences) that all belong to `theme`,
   * ordered hardest/most ambiguous first so each reveal narrows it down.
   */
  clues: z.array(z.string().min(1)).min(3).max(5),
});
export type PinpointContent = z.infer<typeof PinpointContentSchema>;

export const PinpointGameSchema = PinpointContentSchema.extend({ type: z.literal('PINPOINT') });
export type PinpointGame = z.infer<typeof PinpointGameSchema>;

export const PulseGameSchema = z.discriminatedUnion('type', [TangoGameSchema, PinpointGameSchema]);
export type PulseGame = z.infer<typeof PulseGameSchema>;

export const PULSE_GAME_TYPES = ['TANGO', 'PINPOINT'] as const;
export type PulseGameType = (typeof PULSE_GAME_TYPES)[number];

/** Body for reporting that the user solved today's game — feeds the
 * engagement analytics. The metrics are optional so
 * an older client (or a caller that only knows the game type) still validates. */
export const PulseGameCompletedSchema = z.object({
  gameType: z.enum(PULSE_GAME_TYPES),
  /** Wall-clock time on the puzzle, for the "solved in" readout and avg-time analytics. */
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
  /** How much help was needed — the clearest signal of whether difficulty is tuned right. */
  hintsUsed: z.number().int().min(0).max(100).optional(),
  /** Pinpoint only: how many guesses it took ("Solved in 4"). */
  guessesUsed: z.number().int().min(0).max(100).optional(),
});
export type PulseGameCompletedInput = z.infer<typeof PulseGameCompletedSchema>;
