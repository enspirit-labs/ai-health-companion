import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useReports } from '@/lib/reports/use-reports';
import ReportsPage from './page';

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

jest.mock('@/lib/reports/use-reports', () => ({
  useReports: jest.fn(),
}));

const mockUseReports = useReports as jest.Mock;

const FACE_REPORT = { id: 'r1', title: 'Face Assessment Report', status: 'READY', createdAt: '2026-01-01T00:00:00.000Z' };
const EYE_REPORT = { id: 'r2', title: 'Eye Assessment Report', status: 'READY', createdAt: '2026-01-02T00:00:00.000Z' };

describe('ReportsPage', () => {
  it('shows a loading state while the query is pending', () => {
    mockUseReports.mockReturnValue({ isLoading: true, isError: false, data: undefined, refetch: jest.fn() });
    render(<ReportsPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading reports…');
  });

  it('shows an error state when the query fails', () => {
    mockUseReports.mockReturnValue({ isLoading: false, isError: true, data: undefined, refetch: jest.fn() });
    render(<ReportsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load your reports.');
  });

  it('shows an empty state when there are no reports', () => {
    mockUseReports.mockReturnValue({ isLoading: false, isError: false, data: [], refetch: jest.fn() });
    render(<ReportsPage />);
    expect(screen.getByText(/no reports yet/i)).toBeInTheDocument();
  });

  it('renders the report list on success', () => {
    mockUseReports.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [{ id: 'r1', title: 'Week 1 report', status: 'READY', createdAt: '2026-01-01T00:00:00.000Z' }],
      refetch: jest.fn(),
    });
    render(<ReportsPage />);
    expect(screen.getByRole('link', { name: /week 1 report/i })).toHaveAttribute('href', '/reports/r1');
  });

  // (Important): parity with Recommendations, which has a description.
  it('shows a page description', () => {
    mockUseReports.mockReturnValue({ isLoading: false, isError: false, data: [], refetch: jest.fn() });
    render(<ReportsPage />);
    expect(screen.getByText(/wellness report/i)).toBeInTheDocument();
  });

  // (Important): Reports had no way to narrow the list by assessment type.
  it('narrows the list to the selected assessment type', async () => {
    const user = userEvent.setup();
    mockUseReports.mockReturnValue({ isLoading: false, isError: false, data: [FACE_REPORT, EYE_REPORT], refetch: jest.fn() });
    render(<ReportsPage />);

    expect(screen.getByRole('link', { name: /face assessment report/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /eye assessment report/i })).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Filter by assessment' }));
    await user.click(screen.getByRole('option', { name: 'Eye Assessment' }));

    expect(screen.queryByRole('link', { name: /face assessment report/i })).toBeNull();
    expect(screen.getByRole('link', { name: /eye assessment report/i })).toBeInTheDocument();
  });

  // (Important): no way to tell a short filtered list from an over-filtered one.
  it('shows a result count once the filter narrows the list', async () => {
    const user = userEvent.setup();
    mockUseReports.mockReturnValue({ isLoading: false, isError: false, data: [FACE_REPORT, EYE_REPORT], refetch: jest.fn() });
    render(<ReportsPage />);

    expect(screen.queryByText(/showing \d+ of \d+/i)).toBeNull();

    await user.click(screen.getByRole('combobox', { name: 'Filter by assessment' }));
    await user.click(screen.getByRole('option', { name: 'Eye Assessment' }));

    expect(screen.getByText('Showing 1 of 2')).toBeInTheDocument();
  });
});
