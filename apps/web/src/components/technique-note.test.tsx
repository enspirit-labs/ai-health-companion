import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TECHNIQUES, TechniqueNote, type TechniqueFeature } from './technique-note';

const FEATURES = Object.keys(TECHNIQUES) as TechniqueFeature[];

describe('TechniqueNote', () => {
  it('is collapsed until the user asks "Why this?"', () => {
    render(<TechniqueNote feature="streak" />);
    const toggle = screen.getByRole('button', { name: /why this/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it.each(FEATURES)('names the %s technique (BCT Taxonomy) and its limits when opened', async (feature) => {
    const user = userEvent.setup();
    render(<TechniqueNote feature={feature} />);
    await user.click(screen.getByRole('button', { name: /why this/i }));
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(/BCT \d+\.\d+/);
    expect(note).toHaveTextContent(/limits:/i);
    expect(screen.getByRole('button', { name: /why this/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes again on a second click', async () => {
    const user = userEvent.setup();
    render(<TechniqueNote feature="coach" />);
    const toggle = screen.getByRole('button', { name: /why this/i });
    await user.click(toggle);
    await user.click(toggle);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('says the coach is an AI and not medical advice', async () => {
    const user = userEvent.setup();
    render(<TechniqueNote feature="coach" />);
    await user.click(screen.getByRole('button', { name: /why this/i }));
    expect(screen.getByRole('note')).toHaveTextContent(/AI.*not medical advice/i);
  });
});
