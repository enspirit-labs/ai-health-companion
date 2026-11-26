import { render, screen, within } from '@testing-library/react';
import HomePage from './page';

// Expected copy is the "After" column of the content table. The
// ticket keeps "wellness" in descriptive copy, including the CTA label.
describe('HomePage', () => {
  describe('hero section copy', () => {
    it('h1 reads "AI Health" plain with "Companion" in the gradient italic span', () => {
      render(<HomePage />);
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toHaveTextContent(/^AI Health Companion$/);
      expect(within(h1).getByText('Companion')).toHaveClass('text-gradient-enspirit', 'italic');
    });

    it('CTA primary button links to /signup with the retained wellness label', () => {
      render(<HomePage />);
      const ctaLink = screen.getByRole('link', { name: 'Start your wellness assessment' });
      expect(ctaLink).toHaveAttribute('href', '/signup');
    });

    it('hero badge reflects individual framing, not corporate framing', () => {
      render(<HomePage />);
      expect(
        screen.getByText(/Personal wellness assessment, powered by AI/i),
      ).toBeInTheDocument();
    });

    it('no old corporate copy remains in the rendered hero', () => {
      render(<HomePage />);
      expect(screen.queryByText(/AI Doc for/i)).toBeNull();
      expect(screen.queryByText(/Corporates/i)).toBeNull();
      expect(screen.queryByText(/for teams/i)).toBeNull();
    });

    it('says AI analysis needs consent, and lists no switched-off assessment', () => {
      render(<HomePage />);
      const hero = screen.getByText(/Guided wellness assessments/);
      expect(hero).toHaveTextContent(/AI analysis only with your consent/);
      expect(hero).not.toHaveTextContent(/entirely in your browser/i);
      expect(hero).not.toHaveTextContent(/voice/i);
    });
  });
});
