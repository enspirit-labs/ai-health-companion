import { render, screen } from '@testing-library/react';
import type { AssessmentResult, RiskLevel } from '@aidoctor/shared';

import { useReport } from '@/lib/reports/use-reports';
import { AssessmentResultCard } from './assessment-result-card';

jest.mock('@/lib/reports/use-reports', () => ({ useReport: jest.fn() }));

const mockUseReport = useReport as jest.Mock;

function result(riskLevel: RiskLevel): AssessmentResult {
  return {
    assessmentId: '00000000-0000-4000-8000-000000000001',
    type: 'SKIN',
    completedAt: '2026-10-20T10:00:00.000Z',
    score: riskLevel === 'HIGH' ? 30 : 85,
    observations: [],
    recommendations: [],
    riskLevel,
    confidence: 80,
    disclaimer: 'Not medical advice.',
  };
}

describe('AssessmentResultCard', () => {
  beforeEach(() => {
    mockUseReport.mockReturnValue({ data: undefined });
  });

  it.each(['LOW', 'MODERATE', 'ELEVATED', 'HIGH'] as const)(
    'states that a %s result is a wellness estimate, not a health check',
    (riskLevel) => {
      render(<AssessmentResultCard result={result(riskLevel)} />);
      expect(screen.getByText('This result is a wellness estimate, not a health check.')).toBeInTheDocument();
    },
  );

  it('shows fixed signposting for the top band', () => {
    render(<AssessmentResultCard result={result('HIGH')} />);

    expect(screen.getByText('Talk to someone')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(
      'If something here worries you, talking to a healthcare professional may help.',
    );
  });

  it.each(['LOW', 'MODERATE', 'ELEVATED'] as const)('shows no signposting for a %s result', (riskLevel) => {
    render(<AssessmentResultCard result={result(riskLevel)} />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('keeps the signposting free of diagnoses, "abnormal" and thresholds', () => {
    render(<AssessmentResultCard result={result('HIGH')} />);
    const note = screen.getByRole('note');
    expect(note).not.toHaveTextContent(/abnormal|disease|condition|risk|\d/i);
  });

  describe('support card', () => {
    const withSupport = (): AssessmentResult => ({ ...result('LOW'), type: 'MENTAL_WELLNESS', supportCard: true });

    it('shows the support card with human options and emergency numbers', () => {
      render(<AssessmentResultCard result={withSupport()} />);
      const card = screen.getByRole('status');
      expect(card).toHaveTextContent(/trust/i);
      expect(card).toHaveTextContent(/GP/);
      expect(card).toHaveTextContent(/crisis line/i);
      expect(card).toHaveTextContent('999');
      expect(card).toHaveTextContent('998');
    });

    it('suppresses the wellness-signal badge and score emphasis', () => {
      render(<AssessmentResultCard result={withSupport()} />);
      expect(screen.queryByText('On track')).toBeNull();
      expect(screen.queryByText('85')).toBeNull();
      expect(screen.queryByText(/confidence/i)).toBeNull();
    });

    it('names no condition, severity or risk language', () => {
      render(<AssessmentResultCard result={withSupport()} />);
      expect(screen.getByRole('status').textContent).not.toMatch(
        /risk|severe|severity|diagnos|depress|anxiety|disorder|disease|abnormal/i,
      );
    });

    it('does not render the card or hide the badge when supportCard is absent', () => {
      render(<AssessmentResultCard result={{ ...result('LOW'), type: 'MENTAL_WELLNESS' }} />);
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.getByText('85')).toBeInTheDocument();
    });
  });
});
