import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PilotMetricsDto } from '@aidoctor/shared';

import { AdminPilotMetrics } from './admin-pilot-metrics';

const metrics: PilotMetricsDto = {
  generatedAt: '2026-11-01T00:00:00.000Z',
  cohortStart: null,
  cohortSize: 12,
  activeUsersLast7Days: 7,
  retention: [
    { day: 1, eligibleUsers: 10, retainedUsers: 6, rate: 0.6 },
    { day: 7, eligibleUsers: 4, retainedUsers: 1, rate: 0.25 },
    { day: 14, eligibleUsers: 0, retainedUsers: 0, rate: null },
  ],
  checkIns: { total: 30, activeDays: 20, perActiveDay: 1.5 },
  lapseRecovery: { lapsedUsers: 4, recoveredUsers: 3, rate: 0.75 },
  weeklyActions: {
    totalCompletions: 12,
    usersWithActiveGoals: 8,
    lastWeek: { weekStart: '2026-10-26', completions: 5, usersCompleting: 4, completionRate: 0.5 },
  },
  streakDistribution: [
    { bucket: 'LAPSED', users: 2 },
    { bucket: '3-6', users: 3 },
  ],
  goalChoices: [{ goal: 'SLEEP', users: 5 }],
  safetyEvents: { total: 1 },
};

describe('AdminPilotMetrics', () => {
  it('shows each metric group as a captioned table', () => {
    render(<AdminPilotMetrics metrics={metrics} />);

    expect(screen.getByRole('table', { name: 'Retention' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Check-ins and recovery' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Weekly actions' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Streaks and goals' })).toBeInTheDocument();
  });

  it('shows retention and lapse recovery as percentages with counts', () => {
    render(<AdminPilotMetrics metrics={metrics} />);

    const retention = screen.getByRole('table', { name: 'Retention' });
    expect(retention).toHaveTextContent('Day 1');
    expect(retention).toHaveTextContent('60%');
    expect(retention).toHaveTextContent('6 of 10');
    expect(screen.getByRole('row', { name: /lapse recovery/i })).toHaveTextContent('75%');
  });

  it('says "No data yet" instead of 0% when nobody is eligible', () => {
    render(<AdminPilotMetrics metrics={metrics} />);

    expect(screen.getByRole('row', { name: /day 14/i })).toHaveTextContent('No data yet');
  });

  it('offers an export button and downloads a CSV from the aggregates', async () => {
    const createObjectURL = jest.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL, revokeObjectURL: jest.fn() });
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<AdminPilotMetrics metrics={metrics} />);
    await userEvent.click(screen.getByRole('button', { name: /export csv/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });
});
