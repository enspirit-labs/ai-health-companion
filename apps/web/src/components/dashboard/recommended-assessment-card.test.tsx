import { render, screen } from '@testing-library/react';

import { useRecommendedAssessment } from '@/lib/dashboard/use-dashboard';
import { useFeatureFlags } from '@/lib/feature-flags/use-feature-flags';
import { RecommendedAssessmentCard } from './recommended-assessment-card';

jest.mock('@/lib/dashboard/use-dashboard', () => ({
  useRecommendedAssessment: jest.fn(),
  useLogPulseGameCompleted: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/lib/feature-flags/use-feature-flags', () => ({ useFeatureFlags: jest.fn() }));

const mockUseRecommendedAssessment = useRecommendedAssessment as jest.Mock;
const mockUseFeatureFlags = useFeatureFlags as jest.Mock;

describe('RecommendedAssessmentCard', () => {
  beforeEach(() => {
    mockUseFeatureFlags.mockReturnValue({
      data: { dailyPulse: true, slackReminders: false, assessmentVoice: false, assessmentTongue: false },
    });
  });

  it.each([
    ['VOICE', /voice/i],
    ['TONGUE', /tongue/i],
  ])('never links to %s while its flag is off', (type, label) => {
    mockUseRecommendedAssessment.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { kind: 'ASSESSMENT', type },
      refetch: jest.fn(),
    });
    render(<RecommendedAssessmentCard />);
    expect(screen.queryByRole('link', { name: /try it/i })).not.toBeInTheDocument();
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  });

  it('shows a loading state while the query is pending', () => {
    mockUseRecommendedAssessment.mockReturnValue({ isLoading: true, isError: false, data: undefined, refetch: jest.fn() });
    render(<RecommendedAssessmentCard />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state on failure', () => {
    mockUseRecommendedAssessment.mockReturnValue({ isLoading: false, isError: true, data: undefined, refetch: jest.fn() });
    render(<RecommendedAssessmentCard />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders the recommended type with a link to its assessment page', () => {
    mockUseRecommendedAssessment.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { kind: 'ASSESSMENT', type: 'SKIN' },
      refetch: jest.fn(),
    });
    render(<RecommendedAssessmentCard />);
    expect(screen.getByText('Skin Assessment')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /try it/i })).toHaveAttribute('href', '/assessments/skin');
  });

  it('never renders MENTAL_WELLNESS — it is served by Daily Pulse itself', () => {
    mockUseRecommendedAssessment.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { kind: 'ASSESSMENT', type: 'LIFESTYLE' },
      refetch: jest.fn(),
    });
    render(<RecommendedAssessmentCard />);
    expect(screen.queryByText(/mental wellness/i)).not.toBeInTheDocument();
  });

  describe('once today\'s Daily Pulse is complete', () => {
    const pinpointGame = { type: 'PINPOINT' as const, theme: 'Types of tea', clues: ['Oolong', 'Green'] };

    function mockGame(overrides: Record<string, unknown> = {}) {
      mockUseRecommendedAssessment.mockReturnValue({
        isLoading: false,
        isError: false,
        data: {
          kind: 'GAME',
          game: pinpointGame,
          blurb: 'A short word puzzle to wind down with.',
          difficulty: 'STANDARD',
          solvedToday: false,
          ...overrides,
        },
        refetch: jest.fn(),
      });
    }

    it('teases the game with its blurb and a link to the dedicated screen', () => {
      mockGame();
      render(<RecommendedAssessmentCard />);

      expect(screen.getByText('Pinpoint')).toBeInTheDocument();
      expect(screen.getByText('A short word puzzle to wind down with.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /play game/i })).toHaveAttribute('href', '/games/pinpoint');
    });

    it('never renders the playable puzzle inline — that lives on its own screen now', () => {
      mockGame();
      render(<RecommendedAssessmentCard />);

      // A clue word would mean the board itself leaked back onto the dashboard.
      expect(screen.queryByText('Oolong')).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('shows a solved badge and a replay affordance once today\'s game is done', () => {
      mockGame({ solvedToday: true });
      render(<RecommendedAssessmentCard />);

      expect(screen.getByText('Solved')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /play again/i })).toBeInTheDocument();
    });

    it('surfaces the difficulty so the player knows what they are in for', () => {
      mockGame({ difficulty: 'EASY' });
      render(<RecommendedAssessmentCard />);

      expect(screen.getByText('Gentle')).toBeInTheDocument();
    });

    it('links to the Tango screen for a Tango day', () => {
      mockGame({
        game: {
          type: 'TANGO',
          title: 'Quiet Balance',
          size: 4,
          grid: [],
          constraints: [],
          solution: [],
        },
      });
      render(<RecommendedAssessmentCard />);

      expect(screen.getByText('Tango')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /play game/i })).toHaveAttribute('href', '/games/tango');
    });
  });
});
