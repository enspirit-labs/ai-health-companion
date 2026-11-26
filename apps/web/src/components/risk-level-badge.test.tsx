import { render, screen } from '@testing-library/react';

import { RiskLevelBadge } from './risk-level-badge';

describe('RiskLevelBadge', () => {
  it.each([
    ['LOW', 'On track'],
    ['MODERATE', 'On track'],
    ['ELEVATED', 'Worth a look'],
    ['HIGH', 'Talk to someone'],
  ] as const)('shows %s as the wellness signal "%s"', (riskLevel, label) => {
    render(<RiskLevelBadge riskLevel={riskLevel} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it.each(['LOW', 'MODERATE', 'ELEVATED', 'HIGH'] as const)('never uses risk wording or critical styling for %s', (riskLevel) => {
    const { container } = render(<RiskLevelBadge riskLevel={riskLevel} />);
    expect(container).not.toHaveTextContent(/risk|high|elevated|moderate|low|critical|abnormal/i);
    expect(container.innerHTML).not.toMatch(/critical/);
  });
});
