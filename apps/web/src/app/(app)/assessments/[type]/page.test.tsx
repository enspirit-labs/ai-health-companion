import { act, render, screen } from '@testing-library/react';

import { ClientApiError } from '@/lib/api/client-fetch';
import {
  useAnswerAssessmentQuestion,
  useAssessmentState,
  useCompleteAssessment,
  useRecordTestResult,
  useStartAssessment,
  useUploadAssessmentMedia,
} from '@/lib/assessments/use-assessment';
import { useCurrentUser } from '@/lib/auth/use-auth';
import { toast } from 'sonner';

import AssessmentPage from './page';

jest.mock('sonner', () => ({ toast: { error: jest.fn() } }));
jest.mock('@/lib/auth/use-auth', () => ({ useCurrentUser: jest.fn() }));
jest.mock('@/lib/consent/use-consent', () => ({
  useUpdateConsent: () => ({ isPending: false, isError: false, mutate: jest.fn() }),
}));
jest.mock('@/lib/assessments/use-assessment', () => ({
  useStartAssessment: jest.fn(),
  useAssessmentState: jest.fn(),
  useAnswerAssessmentQuestion: jest.fn(),
  useUploadAssessmentMedia: jest.fn(),
  useRecordTestResult: jest.fn(),
  useCompleteAssessment: jest.fn(),
}));

const mockUseStartAssessment = useStartAssessment as jest.Mock;
const mockUseAssessmentState = useAssessmentState as jest.Mock;
const mockUseAnswerAssessmentQuestion = useAnswerAssessmentQuestion as jest.Mock;
const mockUseUploadAssessmentMedia = useUploadAssessmentMedia as jest.Mock;
const mockUseRecordTestResult = useRecordTestResult as jest.Mock;
const mockUseCompleteAssessment = useCompleteAssessment as jest.Mock;

// `use(params)` always suspends on its first encounter with a given promise,
// even an already-settled one — the retry render (once the promise's `.then`
// microtask fires) has to happen inside an awaited `act()`, or RTL's `render`
// call returns mid-suspense with an empty tree.
async function renderPage(slug: string) {
  const params = Promise.resolve({ type: slug });
  let view: ReturnType<typeof render>;
  await act(async () => {
    view = render(<AssessmentPage params={params} />);
  });
  return view!;
}

describe('AssessmentPage', () => {
  beforeEach(() => {
    (useCurrentUser as jest.Mock).mockReturnValue({ data: { consentAiProcessing: true } });
    mockUseAnswerAssessmentQuestion.mockReturnValue({ isPending: false, mutate: jest.fn() });
    mockUseUploadAssessmentMedia.mockReturnValue({ isPending: false, mutate: jest.fn() });
    mockUseRecordTestResult.mockReturnValue({ isPending: false, mutate: jest.fn() });
    mockUseCompleteAssessment.mockReturnValue({ isPending: false, data: undefined, mutate: jest.fn(), reset: jest.fn() });
  });

  it('shows an alert for an unrecognized assessment slug', async () => {
    mockUseStartAssessment.mockReturnValue({ mutate: jest.fn() });
    mockUseAssessmentState.mockReturnValue({ data: undefined, isError: false, refetch: jest.fn() });
    await renderPage('not-a-real-type');
    expect(screen.getByRole('alert')).toHaveTextContent('Unknown assessment');
  });

  it('shows the coming-soon status when the backend has not built this module yet', async () => {
    mockUseStartAssessment.mockReturnValue({
      mutate: (_type: string, opts: { onError: (e: unknown) => void }) =>
        opts.onError(new ClientApiError(404, 'Not found')),
    });
    mockUseAssessmentState.mockReturnValue({ data: undefined, isError: false, refetch: jest.fn() });
    await renderPage('lifestyle');
    expect(screen.getByRole('status')).toHaveTextContent(/coming soon/i);
  });

  it('shows a loading state before the assessment state has loaded', async () => {
    mockUseStartAssessment.mockReturnValue({
      mutate: (_type: string, opts: { onSuccess: (data: { id: string }) => void }) => opts.onSuccess({ id: 'a1' }),
    });
    mockUseAssessmentState.mockReturnValue({ data: undefined, isError: false, refetch: jest.fn() });
    await renderPage('lifestyle');
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });

  it('shows an error state when the assessment state fails to load', async () => {
    mockUseStartAssessment.mockReturnValue({
      mutate: (_type: string, opts: { onSuccess: (data: { id: string }) => void }) => opts.onSuccess({ id: 'a1' }),
    });
    mockUseAssessmentState.mockReturnValue({ data: undefined, isError: true, refetch: jest.fn() });
    await renderPage('lifestyle');
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load this assessment.');
  });

  it('renders the next question with a progress bar once loaded', async () => {
    mockUseStartAssessment.mockReturnValue({
      mutate: (_type: string, opts: { onSuccess: (data: { id: string }) => void }) => opts.onSuccess({ id: 'a1' }),
    });
    mockUseAssessmentState.mockReturnValue({
      isError: false,
      refetch: jest.fn(),
      data: {
        inputMode: 'QUESTIONNAIRE',
        questions: [
          { key: 'q1', prompt: 'How many hours do you sleep?', options: null, order: 0, isRequired: true },
          { key: 'q2', prompt: 'How often do you exercise?', options: null, order: 1, isRequired: true },
        ],
        answers: {},
        nextQuestion: { key: 'q1', prompt: 'How many hours do you sleep?', options: null, order: 0, isRequired: true },
        mediaAssets: [],
        testResults: {},
        isReadyToComplete: false,
      },
    });
    await renderPage('lifestyle');
    expect(screen.getByText('How many hours do you sleep?')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAccessibleName(/question 1 of 2/i);
  });

  describe('AI-processing consent at completion', () => {
    const readyState = {
      isError: false,
      refetch: jest.fn(),
      data: {
        inputMode: 'QUESTIONNAIRE',
        questions: [{ key: 'q1', prompt: 'How many hours do you sleep?', options: null, order: 0, isRequired: true }],
        answers: { q1: 7 },
        nextQuestion: null,
        mediaAssets: [],
        testResults: {},
        isReadyToComplete: true,
      },
    };
    const startOk = {
      mutate: (_type: string, opts: { onSuccess: (data: { id: string }) => void }) => opts.onSuccess({ id: 'a1' }),
    };

    it('shows the consent gate instead of completing when AI analysis is not allowed, then "Not now" returns', async () => {
      const mutate = jest.fn();
      mockUseCompleteAssessment.mockReturnValue({ isPending: false, data: undefined, mutate, reset: jest.fn() });
      (useCurrentUser as jest.Mock).mockReturnValue({ data: { consentAiProcessing: false } });
      mockUseStartAssessment.mockReturnValue(startOk);
      mockUseAssessmentState.mockReturnValue(readyState);
      await renderPage('lifestyle');

      await act(async () => {
        screen.getByRole('button', { name: /get my result/i }).click();
      });
      expect(mutate).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /allow ai analysis/i })).toBeInTheDocument();

      await act(async () => {
        screen.getByRole('button', { name: /not now/i }).click();
      });
      expect(screen.getByRole('button', { name: /get my result/i })).toBeInTheDocument();
    });

    it('completes straight away when AI analysis is already allowed', async () => {
      const mutate = jest.fn();
      mockUseCompleteAssessment.mockReturnValue({ isPending: false, data: undefined, mutate, reset: jest.fn() });
      mockUseStartAssessment.mockReturnValue(startOk);
      mockUseAssessmentState.mockReturnValue(readyState);
      await renderPage('lifestyle');

      await act(async () => {
        screen.getByRole('button', { name: /get my result/i }).click();
      });
      expect(mutate).toHaveBeenCalled();
    });

    it('shows the server message as a toast when completing fails for another reason', async () => {
      (toast.error as jest.Mock).mockClear();
      const message = "Your result couldn't be generated just now. Nothing you entered was lost, so please try again in a moment.";
      const mutate = jest.fn((_v: undefined, opts: { onError: (e: unknown) => void }) =>
        opts.onError(new ClientApiError(503, message)),
      );
      mockUseCompleteAssessment.mockReturnValue({ isPending: false, data: undefined, mutate, reset: jest.fn() });
      mockUseStartAssessment.mockReturnValue(startOk);
      mockUseAssessmentState.mockReturnValue(readyState);
      await renderPage('lifestyle');

      await act(async () => {
        screen.getByRole('button', { name: /get my result/i }).click();
      });
      expect(toast.error).toHaveBeenCalledWith(message);
      expect(screen.queryByRole('button', { name: /allow ai analysis/i })).toBeNull();
    });

    it('sends a single /complete when "Get my result" is clicked twice in a row', async () => {
      // Never settles, like a real request still in its ~10s of AI analysis.
      const mutate = jest.fn();
      mockUseCompleteAssessment.mockReturnValue({ isPending: false, data: undefined, mutate, reset: jest.fn() });
      mockUseStartAssessment.mockReturnValue(startOk);
      mockUseAssessmentState.mockReturnValue(readyState);
      await renderPage('lifestyle');

      await act(async () => {
        const button = screen.getByRole('button', { name: /get my result/i });
        button.click();
        button.click();
      });
      expect(mutate).toHaveBeenCalledTimes(1);
    });

    it('allows another attempt once a failed completion has settled', async () => {
      const mutate = jest.fn((_v: undefined, opts: { onError: (e: unknown) => void; onSettled: () => void }) => {
        opts.onError(new ClientApiError(503, 'Try again in a moment.'));
        opts.onSettled();
      });
      mockUseCompleteAssessment.mockReturnValue({ isPending: false, data: undefined, mutate, reset: jest.fn() });
      mockUseStartAssessment.mockReturnValue(startOk);
      mockUseAssessmentState.mockReturnValue(readyState);
      await renderPage('lifestyle');

      await act(async () => {
        screen.getByRole('button', { name: /get my result/i }).click();
      });
      await act(async () => {
        screen.getByRole('button', { name: /get my result/i }).click();
      });
      expect(mutate).toHaveBeenCalledTimes(2);
    });

    it('never shows a raw error when the server refuses with the consent code', async () => {
      const mutate = jest.fn((_v: undefined, opts: { onError: (e: unknown) => void }) =>
        opts.onError(new ClientApiError(403, 'AI analysis consent is required', undefined, 'CONSENT_REQUIRED_AI_PROCESSING')),
      );
      mockUseCompleteAssessment.mockReturnValue({ isPending: false, data: undefined, mutate, reset: jest.fn() });
      mockUseStartAssessment.mockReturnValue(startOk);
      mockUseAssessmentState.mockReturnValue(readyState);
      // Client state is stale (says consented). The hook refreshes the user on this error, which
      // makes the gate show its prompt; the page itself must not surface the raw message.
      await renderPage('lifestyle');
      await act(async () => {
        screen.getByRole('button', { name: /get my result/i }).click();
      });
      expect(mutate).toHaveBeenCalled();
      expect(screen.queryByText(/consent is required/i)).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
