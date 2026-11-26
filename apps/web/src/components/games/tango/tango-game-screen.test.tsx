import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TangoGame } from '@aidoctor/shared';

import { TangoGameScreen } from './tango-game-screen';

const mockMutate = jest.fn();
jest.mock('@/lib/dashboard/use-dashboard', () => ({
  useLogPulseGameCompleted: () => ({ mutate: mockMutate }),
  useDashboardStreak: () => ({ data: { currentStreak: 3, completedToday: true, goalDays: 30, totalActiveDays: 12, lapsed: false } }),
}));

jest.mock('@lottiefiles/dotlottie-react', () => ({
  DotLottieReact: () => null,
}));

const SOLUTION: TangoGame['solution'] = [
  ['SUN', 'MOON', 'MOON', 'SUN'],
  ['MOON', 'SUN', 'SUN', 'MOON'],
  ['SUN', 'MOON', 'SUN', 'MOON'],
  ['MOON', 'SUN', 'MOON', 'SUN'],
];

/** Everything given except (0,0) and (0,1) — two taps from solved. */
function nearlySolvedGame(): TangoGame {
  const grid = SOLUTION.map((row) => [...row]) as TangoGame['grid'];
  grid[0][0] = 'EMPTY';
  grid[0][1] = 'EMPTY';
  return { type: 'TANGO', title: 'Quiet Balance', size: 4, grid, constraints: [], solution: SOLUTION };
}

/** A mostly-open board, so violations and hints have room to happen. */
function openGame(overrides: Partial<TangoGame> = {}): TangoGame {
  return {
    type: 'TANGO',
    title: 'Quiet Balance',
    size: 4,
    grid: [
      ['EMPTY', 'EMPTY', 'EMPTY', 'EMPTY'],
      ['EMPTY', 'EMPTY', 'EMPTY', 'EMPTY'],
      ['EMPTY', 'EMPTY', 'EMPTY', 'EMPTY'],
      ['EMPTY', 'EMPTY', 'EMPTY', 'EMPTY'],
    ],
    constraints: [],
    solution: SOLUTION,
    ...overrides,
  };
}

const cell = (r: number, c: number) => screen.getByLabelText(new RegExp(`^Row ${r}, column ${c}:`));

/** Mirrors MISTAKE_FEEDBACK_DELAY_MS in tango-game-screen.tsx (b1a8341). */
const MISTAKE_FEEDBACK_DELAY_MS = 1500;

/**
 * The live feedback (mistake banner, hint panel) is a `role="status"` region.
 * Querying through it, rather than the whole screen, keeps these assertions
 * from matching the same wording in the always-visible "How to play" rules.
 */
const feedback = (text: RegExp) =>
  screen.queryAllByRole('status').find((el) => text.test(el.textContent ?? '')) ?? null;

/** userEvent wired to fake timers, so the delayed mistake feedback can be stepped through. */
function setupWithFakeTimers() {
  jest.useFakeTimers();
  return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
}

const waitOutMistakeDelay = () => act(() => jest.advanceTimersByTime(MISTAKE_FEEDBACK_DELAY_MS));

describe('TangoGameScreen', () => {
  beforeEach(() => {
    mockMutate.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('has no Check answer button — validation is live instead', () => {
    render(<TangoGameScreen game={openGame()} difficulty="STANDARD" />);
    expect(screen.queryByRole('button', { name: /check answer/i })).not.toBeInTheDocument();
  });

  it('cycles a cell sun -> moon -> empty on repeated taps', async () => {
    const user = userEvent.setup();
    render(<TangoGameScreen game={openGame()} difficulty="STANDARD" />);

    await user.click(cell(1, 1));
    expect(screen.getByLabelText('Row 1, column 1: sun')).toBeInTheDocument();

    await user.click(cell(1, 1));
    expect(screen.getByLabelText('Row 1, column 1: moon')).toBeInTheDocument();

    await user.click(cell(1, 1));
    expect(screen.getByLabelText('Row 1, column 1: empty')).toBeInTheDocument();
  });

  it('locks given cells against editing', async () => {
    const user = userEvent.setup();
    render(<TangoGameScreen game={nearlySolvedGame()} difficulty="STANDARD" />);

    const given = screen.getByLabelText('Row 1, column 3: moon, locked');
    expect(given).toBeDisabled();
    await user.click(given);
    expect(screen.getByLabelText('Row 1, column 3: moon, locked')).toBeInTheDocument();
  });

  // Mistake feedback is deliberately held back ~1.5s after the breaking move
  // (b1a8341), so a quick self-correction never flashes an error.
  it('surfaces a violation once three in a row have stood for the feedback delay', async () => {
    const user = setupWithFakeTimers();
    render(<TangoGameScreen game={openGame()} difficulty="STANDARD" />);

    await user.click(cell(1, 1));
    await user.click(cell(1, 2));
    waitOutMistakeDelay();
    expect(feedback(/only 2 suns or moons/i)).toBeNull();

    await user.click(cell(1, 3));
    expect(feedback(/only 2 suns or moons/i)).toBeNull();
    expect(cell(1, 1)).not.toHaveAttribute('aria-invalid', 'true');

    waitOutMistakeDelay();

    expect(feedback(/only 2 suns or moons/i)).toBeInTheDocument();
    expect(cell(1, 1)).toHaveAttribute('aria-invalid', 'true');
  });

  it('never flags a mistake that is corrected before the feedback delay elapses', async () => {
    const user = setupWithFakeTimers();
    render(<TangoGameScreen game={openGame()} difficulty="STANDARD" />);

    await user.click(cell(1, 1));
    await user.click(cell(1, 2));
    await user.click(cell(1, 3));
    await user.click(screen.getByRole('button', { name: /undo/i }));

    waitOutMistakeDelay();

    expect(feedback(/only 2 suns or moons/i)).toBeNull();
    expect(cell(1, 1)).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('clears the violation once the mistake is undone', async () => {
    const user = setupWithFakeTimers();
    render(<TangoGameScreen game={openGame()} difficulty="STANDARD" />);

    await user.click(cell(1, 1));
    await user.click(cell(1, 2));
    await user.click(cell(1, 3));
    waitOutMistakeDelay();
    expect(feedback(/only 2 suns or moons/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /undo/i }));

    expect(feedback(/only 2 suns or moons/i)).toBeNull();
  });

  it('reports a balance breach with its own message', async () => {
    const user = setupWithFakeTimers();
    render(<TangoGameScreen game={openGame()} difficulty="STANDARD" />);

    // Row 1 gets 3 suns as S S _ S — over the 2-per-row quota, but with no run
    // of three, so the adjacency rule can't be what fires.
    await user.click(cell(1, 1));
    await user.click(cell(1, 2));
    await user.click(cell(1, 4));
    waitOutMistakeDelay();

    expect(feedback(/same number of suns and moons/i)).toBeInTheDocument();
    expect(feedback(/only 2 suns or moons/i)).toBeNull();
  });

  it('flags a broken × constraint', async () => {
    const user = setupWithFakeTimers();
    const game = openGame({ constraints: [{ a: [0, 0], b: [0, 1], type: 'OPPOSITE' }] });
    render(<TangoGameScreen game={game} difficulty="STANDARD" />);

    await user.click(cell(1, 1));
    await user.click(cell(1, 2));
    waitOutMistakeDelay();

    expect(feedback(/must be opposite types/i)).toBeInTheDocument();
  });

  describe('hint', () => {
    it('explains its reasoning rather than silently filling a cell', async () => {
      const user = userEvent.setup();
      const game = openGame({ constraints: [{ a: [0, 0], b: [0, 1], type: 'EQUAL' }] });
      render(<TangoGameScreen game={game} difficulty="STANDARD" />);

      await user.click(cell(1, 1)); // place a sun so the = clue can be reasoned from
      await user.click(screen.getByRole('button', { name: /hint/i }));

      expect(feedback(/joined by =/i)).toBeInTheDocument();
      // Reasoning only — the board is untouched until the player opts in.
      expect(screen.getByLabelText('Row 1, column 2: empty')).toBeInTheDocument();
    });

    it('applies the hinted move when asked, and it is the correct one', async () => {
      const user = userEvent.setup();
      const game = openGame({ constraints: [{ a: [0, 0], b: [0, 1], type: 'EQUAL' }] });
      render(<TangoGameScreen game={game} difficulty="STANDARD" />);

      await user.click(cell(1, 1));
      await user.click(screen.getByRole('button', { name: /hint/i }));
      await user.click(screen.getByRole('button', { name: /place it for me/i }));

      expect(screen.getByLabelText('Row 1, column 2: sun')).toBeInTheDocument();
    });

    it('retires a standing hint when the board changes under it', async () => {
      const user = userEvent.setup();
      const game = openGame({ constraints: [{ a: [0, 0], b: [0, 1], type: 'EQUAL' }] });
      render(<TangoGameScreen game={game} difficulty="STANDARD" />);

      await user.click(cell(1, 1));
      await user.click(screen.getByRole('button', { name: /hint/i }));
      expect(feedback(/joined by =/i)).toBeInTheDocument();

      await user.click(cell(4, 4));
      expect(feedback(/joined by =/i)).toBeNull();
    });
  });

  it('resets the board back to the original givens', async () => {
    const user = userEvent.setup();
    render(<TangoGameScreen game={openGame()} difficulty="STANDARD" />);

    await user.click(cell(1, 1));
    expect(screen.getByLabelText('Row 1, column 1: sun')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /reset/i }));

    expect(screen.getByLabelText('Row 1, column 1: empty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled();
  });

  it('detects the solve itself and reports the completion with metrics', async () => {
    const user = userEvent.setup();
    render(<TangoGameScreen game={nearlySolvedGame()} difficulty="STANDARD" />);

    await user.click(cell(1, 1)); // -> SUN, matching the solution
    await user.click(cell(1, 2)); // -> SUN
    await user.click(cell(1, 2)); // -> MOON, completing the grid

    expect(await screen.findByText(/grid complete/i)).toBeInTheDocument();
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ gameType: 'TANGO', hintsUsed: 0 }),
    );
  });

  it('ties the win back to the streak, the reason to return tomorrow', async () => {
    const user = userEvent.setup();
    render(<TangoGameScreen game={nearlySolvedGame()} difficulty="STANDARD" />);

    await user.click(cell(1, 1));
    await user.click(cell(1, 2));
    await user.click(cell(1, 2));

    expect(await screen.findByText(/3 days in a row/i)).toBeInTheDocument();
    expect(screen.getByText(/keep it alive/i)).toBeInTheDocument();
  });

  // Expanded by default since b1a8341: the rules are reference material a
  // first-time player wants beside the board, not something to go looking for.
  it('shows the how-to-play rules by default and lets the player collapse them', async () => {
    const user = userEvent.setup();
    render(<TangoGameScreen game={openGame()} difficulty="STANDARD" />);

    const toggle = screen.getByRole('button', { name: /how to play/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const rules = screen.getByRole('list');
    expect(within(rules).getByText(/exactly one solution/i)).toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
