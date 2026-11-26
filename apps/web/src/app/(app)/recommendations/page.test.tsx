import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useDashboardRecommendations } from '@/lib/dashboard/use-dashboard';
import { useGoals } from '@/lib/goals/use-goals';
import RecommendationsPage from './page';

// Radix's popper-based positioning (SelectContent's default position="popper")
// calls ResizeObserver, which jsdom doesn't implement.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  // Radix Select needs these for its open/scroll-into-view behavior; jsdom implements neither.
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

jest.mock('@/lib/dashboard/use-dashboard', () => ({
  useDashboardRecommendations: jest.fn(),
}));

jest.mock('@/lib/goals/use-goals', () => ({ useGoals: jest.fn() }));

const mockUseDashboardRecommendations = useDashboardRecommendations as jest.Mock;
const mockUseGoals = useGoals as jest.Mock;

beforeEach(() => {
  mockUseGoals.mockReturnValue({ data: { goals: [] } });
});

const FACE_HIGH = { title: 'See a doctor', detail: 'Details', priority: 'HIGH', sourceAssessment: 'FACE' };
const EYE_LOW = { title: 'Blink more', detail: 'Details', priority: 'LOW', sourceAssessment: 'EYE' };

describe('RecommendationsPage', () => {
  it('shows a loading state while the query is pending', () => {
    mockUseDashboardRecommendations.mockReturnValue({ isLoading: true, isError: false, data: undefined, refetch: jest.fn() });
    render(<RecommendationsPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading recommendations…');
  });

  it('shows an error state when the query fails', () => {
    mockUseDashboardRecommendations.mockReturnValue({ isLoading: false, isError: true, data: undefined, refetch: jest.fn() });
    render(<RecommendationsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load your recommendations.');
  });

  it('shows an empty state when there are no recommendations', () => {
    mockUseDashboardRecommendations.mockReturnValue({ isLoading: false, isError: false, data: [], refetch: jest.fn() });
    render(<RecommendationsPage />);
    expect(screen.getByText(/complete an assessment/i)).toBeInTheDocument();
  });

  it('renders the recommendations feed on success', () => {
    mockUseDashboardRecommendations.mockReturnValue({ isLoading: false, isError: false, data: [FACE_HIGH], refetch: jest.fn() });
    render(<RecommendationsPage />);
    expect(screen.getByText('See a doctor')).toBeInTheDocument();
  });

  // (Important): no way to tell a short filtered list from an over-filtered one.
  it('shows a result count once a filter narrows the list', async () => {
    const user = userEvent.setup();
    mockUseDashboardRecommendations.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [FACE_HIGH, EYE_LOW],
      refetch: jest.fn(),
    });
    render(<RecommendationsPage />);

    expect(screen.queryByText(/showing \d+ of \d+/i)).toBeNull();

    await user.click(screen.getByRole('combobox', { name: 'Filter by priority' }));
    await user.click(screen.getByRole('option', { name: 'Low priority' }));

    expect(screen.getByText('Showing 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Blink more')).toBeInTheDocument();
    expect(screen.queryByText('See a doctor')).toBeNull();
  });

  // recommendations are ranked and filtered by the user's goals.
  describe('with personal goals', () => {
    const SQUATS_LOW = { title: 'Squat gently', detail: 'Details', priority: 'LOW', sourceAssessment: 'SQUATS' };

    beforeEach(() => {
      mockUseGoals.mockReturnValue({ data: { goals: ['MOVEMENT'] } });
      mockUseDashboardRecommendations.mockReturnValue({
        isLoading: false,
        isError: false,
        data: [FACE_HIGH, SQUATS_LOW],
        refetch: jest.fn(),
      });
    });

    it('lists goal-related guidance first', () => {
      render(<RecommendationsPage />);
      const items = screen.getAllByRole('listitem');
      expect(items[0]).toHaveTextContent('Squat gently');
      expect(items[1]).toHaveTextContent('See a doctor');
    });

    it('hides unrelated guidance when "Only guidance for my goals" is ticked', async () => {
      render(<RecommendationsPage />);
      await userEvent.click(screen.getByRole('checkbox', { name: /only guidance for my goals/i }));
      expect(screen.queryByText('See a doctor')).toBeNull();
      expect(screen.getByText('Squat gently')).toBeInTheDocument();
    });
  });
});
