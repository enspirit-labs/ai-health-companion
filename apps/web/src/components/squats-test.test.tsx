import { fireEvent, render, screen } from '@testing-library/react';

import { requestCameraStream } from '@/lib/media/user-media';
import { SquatsTest } from './squats-test';

// The live session needs a camera and the MediaPipe pose model — neither
// exists in jsdom, so both stay pending: the session sits in its warm-up
// state, which is enough to assert what's on screen while it runs.
jest.mock('next/navigation', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/lib/use-compact-viewport', () => ({ useCompactViewport: () => false }));
jest.mock('@/lib/media/user-media', () => ({
  requestCameraStream: jest.fn(() => new Promise(() => {})),
  cameraErrorMessage: jest.fn(),
}));
jest.mock('@/lib/cv/pose-loader', () => ({
  getPoseLandmarker: jest.fn(() => new Promise(() => {})),
  getPoseConnections: jest.fn(() => new Promise(() => {})),
}));
jest.mock('@/lib/voice/use-speech-cue', () => {
  const voice = { supported: false, enable: jest.fn(), cue: jest.fn(), sayNow: jest.fn(), sayAndWait: jest.fn(), stop: jest.fn() };
  return { useSpeechCue: () => voice };
});

const mockRequestCameraStream = requestCameraStream as jest.Mock;

describe('SquatsTest', () => {
  beforeEach(() => {
    mockRequestCameraStream.mockClear();
  });

  describe('readiness prompt', () => {
    it('tells the user to stop on pain, dizziness or chest discomfort before anything starts', () => {
      render(<SquatsTest isSubmitting={false} onComplete={jest.fn()} />);

      expect(screen.getByRole('heading', { name: /before you start/i })).toBeInTheDocument();
      expect(screen.getByText(/pain, dizziness or chest discomfort/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /skip this check/i })).toBeInTheDocument();
      expect(mockRequestCameraStream).not.toHaveBeenCalled();
    });
  });

  describe('skipping', () => {
    it('ends the check without recording a result', () => {
      const onComplete = jest.fn();
      render(<SquatsTest isSubmitting={false} onComplete={onComplete} />);

      fireEvent.click(screen.getByRole('button', { name: /skip this check/i }));

      expect(screen.getByRole('status')).toHaveTextContent(/skipped/i);
      expect(screen.getByRole('status')).toHaveTextContent(/nothing has been recorded/i);
      expect(screen.getByRole('link', { name: /back to assessments/i })).toHaveAttribute('href', '/assessments');
      expect(onComplete).not.toHaveBeenCalled();
      expect(mockRequestCameraStream).not.toHaveBeenCalled();
    });
  });

  describe('during the test', () => {
    it('shows an enabled Stop button as soon as the test starts', () => {
      render(<SquatsTest isSubmitting={false} onComplete={jest.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: 'Start' }));

      expect(mockRequestCameraStream).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: /stop/i })).toBeEnabled();
    });

    it('keeps Stop enabled even while a result is submitting', () => {
      render(<SquatsTest isSubmitting onComplete={jest.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: 'Start' }));

      expect(screen.getByRole('button', { name: /stop/i })).toBeEnabled();
    });

    it('stopping abandons the set without recording a result and offers a way back', () => {
      const onComplete = jest.fn();
      render(<SquatsTest isSubmitting={false} onComplete={onComplete} />);

      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      fireEvent.click(screen.getByRole('button', { name: /stop/i }));

      expect(screen.getByRole('status')).toHaveTextContent(/test stopped/i);
      expect(screen.getByRole('status')).toHaveTextContent(/nothing has been recorded/i);
      expect(onComplete).not.toHaveBeenCalled();
      expect(screen.getByRole('link', { name: /back to assessments/i })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /start again/i }));
      expect(screen.getByRole('heading', { name: /before you start/i })).toBeInTheDocument();
    });
  });
});
