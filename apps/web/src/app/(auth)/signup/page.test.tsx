import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useSignup } from '@/lib/auth/use-auth';
import SignupPage from './page';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/auth/use-auth', () => ({ useSignup: jest.fn() }));

const mockUseSignup = useSignup as jest.Mock;

// Radix Checkbox measures its control with ResizeObserver, which jsdom lacks.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
beforeAll(() => {
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
});

async function fillRequiredFields() {
  await userEvent.type(screen.getByLabelText('Full name'), 'Jane Doe');
  await userEvent.type(screen.getByLabelText('Email'), 'jane@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'Passw0rd1');
  await userEvent.type(screen.getByLabelText('Confirm password'), 'Passw0rd1');
}

describe('SignupPage', () => {
  let mutateAsync: jest.Mock;

  beforeEach(() => {
    mutateAsync = jest.fn().mockResolvedValue({});
    mockUseSignup.mockReturnValue({ mutateAsync });
  });

  it('shows the AI-processing checkbox unchecked by default, naming the recipient', () => {
    render(<SignupPage />);
    const box = screen.getByRole('checkbox', { name: /sent to anthropic \(usa\)/i });
    expect(box).not.toBeChecked();
  });

  it('links terms and privacy policy to their pages in a new tab', () => {
    render(<SignupPage />);
    expect(screen.getByRole('link', { name: 'terms' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'terms' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'privacy policy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'privacy policy' })).toHaveAttribute('target', '_blank');
  });

  it('requires accepting the terms before submitting', async () => {
    render(<SignupPage />);
    await fillRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/must accept the terms/i)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('requires the 18+ declaration before submitting', async () => {
    render(<SignupPage />);
    expect(screen.getByRole('checkbox', { name: /i am 18 or older/i })).not.toBeChecked();
    await fillRequiredFields();
    await userEvent.click(screen.getByRole('checkbox', { name: /i accept the terms/i }));
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/18 or older/i);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('allows signing up without AI-processing consent and sends consentAiProcessing: false', async () => {
    render(<SignupPage />);
    await fillRequiredFields();
    await userEvent.click(screen.getByRole('checkbox', { name: /i am 18 or older/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /i accept the terms/i }));
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ consentAiProcessing: false, confirmedAdult: true }),
    );
  });

  it('sends consentAiProcessing: true only when the user ticks the box', async () => {
    render(<SignupPage />);
    await fillRequiredFields();
    await userEvent.click(screen.getByRole('checkbox', { name: /sent to anthropic/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /i am 18 or older/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /i accept the terms/i }));
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ consentAiProcessing: true }));
  });
});
