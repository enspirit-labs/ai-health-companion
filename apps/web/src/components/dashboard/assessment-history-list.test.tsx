import { render, screen } from '@testing-library/react';
import type { AssessmentHistoryItem } from '@aidoctor/shared';

import { AssessmentHistoryList } from './assessment-history-list';

/** A completed FULL Mental Wellness row — the longest label in ASSESSMENT_LABELS. */
const historyItem = (
  overrides: Partial<AssessmentHistoryItem> & Pick<AssessmentHistoryItem, 'id'>,
): AssessmentHistoryItem => ({
  type: 'MENTAL_WELLNESS',
  status: 'COMPLETED',
  score: 62,
  riskLevel: 'LOW',
  completedAt: '2026-01-04T00:00:00.000Z',
  mode: 'FULL',
  ...overrides,
});

describe('AssessmentHistoryList', () => {
  it('shows empty copy when there are no items', () => {
    render(<AssessmentHistoryList items={[]} />);
    expect(screen.getByText(/no completed assessments yet/i)).toBeInTheDocument();
  });

  it('labels a FULL Mental Wellness completion by its normal name, linking to its own retake page', () => {
    render(
      <AssessmentHistoryList
        items={[
          {
            id: 'a1',
            type: 'MENTAL_WELLNESS',
            status: 'COMPLETED',
            score: 80,
            riskLevel: 'LOW',
            completedAt: '2026-01-01T00:00:00.000Z',
            mode: 'FULL',
          },
        ]}
      />,
    );
    expect(screen.getByText('Mental Wellness Questionnaire')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /retake/i })).toHaveAttribute('href', '/assessments/mental-wellness');
  });

  it('labels a PULSE completion as a Daily Pulse check-in, linking to the Daily Pulse page instead', () => {
    render(
      <AssessmentHistoryList
        items={[
          {
            id: 'a2',
            type: 'MENTAL_WELLNESS',
            status: 'COMPLETED',
            score: 75,
            riskLevel: 'LOW',
            completedAt: '2026-01-02T00:00:00.000Z',
            mode: 'PULSE',
          },
        ]}
      />,
    );
    expect(screen.getByText('Daily Pulse check-in')).toBeInTheDocument();
    expect(screen.queryByText('Mental Wellness Questionnaire')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /retake/i })).toHaveAttribute('href', '/assessments/daily-pulse');
  });

  it('treats a missing mode as FULL — no existing history fixture needs updating', () => {
    render(
      <AssessmentHistoryList
        items={[
          { id: 'a3', type: 'FACE', status: 'COMPLETED', score: 90, riskLevel: 'LOW', completedAt: '2026-01-03T00:00:00.000Z' },
        ]}
      />,
    );
    expect(screen.getByText('Face Assessment')).toBeInTheDocument();
  });

  // the score+badge+Retake cluster dropped to a second line for the
  // longer labels ("Lifestyle Assessment", "Mental Wellness Questionnaire") but
  // not the short ones ("Squats Test"), which looked broken in the dashboard card.
  //
  // jsdom performs no layout, so neither the wrap nor the truncation is observable
  // at runtime here. These cover the two things that *are* observable — the
  // responsive contract that decides when the row may wrap, and the label's hover
  // fallback for text it ellipsizes — plus the containment the ticket cares about.
  describe('row layout', () => {
    it('wraps by default but is pinned to a single line from the sm breakpoint up', () => {
      // The breakpoint is the whole fix, so it is asserted directly: dropping
      // `flex-wrap` outright would reopen the mobile horizontal-overflow bug
      // cfae463 fixed (the score/badge/Retake cluster is shrink-0, so it cannot
      // fit beside the label in the ~256px available at 320px), while leaving off
      // `sm:flex-nowrap` would leave unfixed on the dashboard.
      render(<AssessmentHistoryList items={[historyItem({ id: 'r1' })]} />);

      const row = screen.getByText('Mental Wellness Questionnaire').closest('li')!;
      expect(row).toHaveClass('flex-wrap', 'sm:flex-nowrap');
    });

    it('exposes the full label on hover, since a compressed row ellipsizes it', () => {
      render(<AssessmentHistoryList items={[historyItem({ id: 'r2' })]} />);

      expect(screen.getByText('Mental Wellness Questionnaire')).toHaveAttribute(
        'title',
        'Mental Wellness Questionnaire',
      );
    });

    // The ticket suspected the longer badge wording of triggering the wrap, so
    // exercise the longest wellness-signal label ("Talk to someone") explicitly.
    it('keeps score, risk badge and retake in the same row as the label for a longer badge label', () => {
      render(
        <AssessmentHistoryList
          items={[historyItem({ id: 'r3', type: 'LIFESTYLE', score: 31, riskLevel: 'HIGH' })]}
        />,
      );

      const row = screen.getByText('Lifestyle Assessment').closest('li')!;
      expect(row).toContainElement(screen.getByText('31/100'));
      expect(row).toContainElement(screen.getByText('Talk to someone'));
      expect(row).toContainElement(screen.getByRole('link', { name: /retake/i }));
    });
  });
});
