import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PinpointGame } from '@aidoctor/shared';

import { PinpointGameScreen } from './pinpoint-game-screen';

const mockMutate = jest.fn();
jest.mock('@/lib/dashboard/use-dashboard', () => ({
  useLogPulseGameCompleted: () => ({ mutate: mockMutate }),
  useDashboardStreak: () => ({ data: { currentStreak: 5, completedToday: true, goalDays: 30, totalActiveDays: 12, lapsed: false } }),
}));

jest.mock('@lottiefiles/dotlottie-react', () => ({
  DotLottieReact: () => null,
}));

const GAME: PinpointGame = {
  type: 'PINPOINT',
  theme: 'Types of tea',
  clues: ['Rooibos', 'Oolong', 'Earl Grey', 'Chamomile', 'Green'],
};

const guessBox = () => screen.getByLabelText('Guess the category');
const submit = () => screen.getByRole('button', { name: /^guess$/i });

async function guess(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(guessBox(), text);
  await user.click(submit());
}

describe('PinpointGameScreen', () => {
  beforeEach(() => {
    mockMutate.mockClear();
  });

  it('starts with only the first clue revealed', () => {
    render(<PinpointGameScreen game={GAME} difficulty="STANDARD" />);

    expect(screen.getByText('Rooibos')).toBeInTheDocument();
    expect(screen.queryByText('Oolong')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 5 clues revealed')).toBeInTheDocument();
  });

  it('labels the unrevealed rows so the player can see how many are left', () => {
    render(<PinpointGameScreen game={GAME} difficulty="STANDARD" />);
    expect(screen.getByText('Clue 5')).toBeInTheDocument();
  });

  it('reveals the next clue on a wrong guess and strikes the guess through', async () => {
    const user = userEvent.setup();
    render(<PinpointGameScreen game={GAME} difficulty="STANDARD" />);

    await guess(user, 'kinds of coffee');

    expect(screen.getByText('Oolong')).toBeInTheDocument();
    expect(screen.getByText('2 of 5 clues revealed')).toBeInTheDocument();
    expect(screen.getByText('kinds of coffee').tagName).toBe('S');
  });

  it('shows how close a wrong guess was, so a miss still teaches something', async () => {
    const user = userEvent.setup();
    render(<PinpointGameScreen game={GAME} difficulty="STANDARD" />);

    await guess(user, 'kinds of coffee');

    expect(screen.getByText(/% match/)).toBeInTheDocument();
  });

  it('accepts the exact category', async () => {
    const user = userEvent.setup();
    render(<PinpointGameScreen game={GAME} difficulty="STANDARD" />);

    await guess(user, 'Types of tea');

    expect(await screen.findByText(/you pinpointed it/i)).toBeInTheDocument();
  });

  it('accepts a close paraphrase rather than demanding the exact wording', async () => {
    const user = userEvent.setup();
    render(<PinpointGameScreen game={GAME} difficulty="STANDARD" />);

    await guess(user, 'tea');

    expect(await screen.findByText(/you pinpointed it/i)).toBeInTheDocument();
  });

  it('reveals every clue and the answer once solved', async () => {
    const user = userEvent.setup();
    render(<PinpointGameScreen game={GAME} difficulty="STANDARD" />);

    await guess(user, 'tea');

    expect(screen.getByText('Green')).toBeInTheDocument();
    expect(screen.getByText('Types of tea')).toBeInTheDocument();
  });

  it('reports the completion with the guess count', async () => {
    const user = userEvent.setup();
    render(<PinpointGameScreen game={GAME} difficulty="STANDARD" />);

    await guess(user, 'kinds of coffee');
    await guess(user, 'tea');

    expect(await screen.findByText(/you pinpointed it/i)).toBeInTheDocument();
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ gameType: 'PINPOINT', guessesUsed: 2 }),
    );
  });

  it('ends the round when the last clue is out and the guess still misses', async () => {
    const user = userEvent.setup();
    render(<PinpointGameScreen game={GAME} difficulty="STANDARD" />);

    for (let i = 0; i < 5; i++) {
      await guess(user, `wrong answer ${i}`);
    }

    expect(screen.getByText(/out of guesses/i)).toBeInTheDocument();
    expect(screen.getByText(/today's category was "Types of tea"/i)).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('ignores an empty guess', async () => {
    const user = userEvent.setup();
    render(<PinpointGameScreen game={GAME} difficulty="STANDARD" />);

    expect(submit()).toBeDisabled();
    expect(screen.getByText('1 of 5 clues revealed')).toBeInTheDocument();
  });

  describe('hint', () => {
    it('first reveals only the length and the opening word, not the answer', async () => {
      const user = userEvent.setup();
      render(<PinpointGameScreen game={GAME} difficulty="STANDARD" />);

      await user.click(screen.getByRole('button', { name: /hint/i }));

      const hint = screen.getByText(/3 words/i).textContent ?? '';
      // "Types" masked to its initial plus four spaced blanks.
      expect(hint).toMatch(/T(\s*·){4}/);
      expect(screen.queryByText('Types of tea')).not.toBeInTheDocument();
      // Spelling out every initial of a phrase would effectively be the answer,
      // so the later words must stay hidden entirely at this tier.
      expect(hint).not.toMatch(/O(\s*·)/);
    });

    it('escalates to a free clue reveal that does not cost a guess', async () => {
      const user = userEvent.setup();
      render(<PinpointGameScreen game={GAME} difficulty="STANDARD" />);

      await user.click(screen.getByRole('button', { name: /hint/i }));
      await user.click(screen.getByRole('button', { name: /hint/i }));

      expect(screen.getByText('Oolong')).toBeInTheDocument();
      expect(screen.getByText(/free of charge/i)).toBeInTheDocument();
      expect(screen.getByText('2 of 5 clues revealed')).toBeInTheDocument();
    });

    it('counts hints toward the completion report', async () => {
      const user = userEvent.setup();
      render(<PinpointGameScreen game={GAME} difficulty="STANDARD" />);

      await user.click(screen.getByRole('button', { name: /hint/i }));
      await guess(user, 'tea');

      expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({ hintsUsed: 1 }));
    });
  });
});
