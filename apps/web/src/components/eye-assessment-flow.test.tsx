import type { AssessmentState } from '@aidoctor/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EyeAssessmentFlow } from './eye-assessment-flow';

// The camera step needs MediaPipe and a real video stream; every test here
// starts after all five photos are captured, so a stub is enough.
jest.mock('@/components/face-mesh-capture', () => ({
  FaceMeshCapture: () => <div>camera</div>,
}));

const ALL_PHOTOS = ['center', 'left', 'right', 'up', 'down'].map((captureLabel, i) => ({
  id: `m${i}`,
  kind: 'IMAGE' as const,
  captureLabel,
}));

function state(testResults: Record<string, unknown>): AssessmentState {
  return {
    id: 'eye-1',
    type: 'EYE',
    status: 'IN_PROGRESS',
    inputMode: 'CAMERA_IMAGE',
    questions: [],
    answers: {},
    nextQuestion: null,
    mediaAssets: ALL_PHOTOS,
    testResults,
    isReadyToComplete: true,
  };
}

function renderFlow(testResults: Record<string, unknown>, onRecordTestResult = jest.fn()) {
  render(
    <EyeAssessmentFlow
      state={state(testResults)}
      isUploading={false}
      isRecording={false}
      isCompleting={false}
      onCapture={jest.fn()}
      onRecordTestResult={onRecordTestResult}
      onComplete={jest.fn()}
    />,
  );
  return { onRecordTestResult };
}

describe('EyeAssessmentFlow', () => {
  it('goes straight from the photos to the contrast check, with no acuity or colour-vision test', () => {
    renderFlow({});

    expect(screen.getByText('Contrast sensitivity check')).toBeInTheDocument();
    expect(screen.queryByText(/acuity|colou?r/i)).not.toBeInTheDocument();
  });

  it('shows the screen-comfort habits questionnaire after the contrast check', () => {
    renderFlow({ contrastSensitivity: 'Excellent' });

    expect(screen.getByText('Screen-comfort habits')).toBeInTheDocument();
    expect(screen.queryByText(/dry eye/i)).not.toBeInTheDocument();
  });

  it('records the screen-comfort answers under the existing result key', async () => {
    const user = userEvent.setup();
    const { onRecordTestResult } = renderFlow({ contrastSensitivity: 'Excellent' });

    // Each question animates in only after the previous one has exited, so
    // wait for its own heading before answering.
    const prompts = [/scratchy/i, /sting/i, /bright screens/i, /tired after screen use/i, /focusing on your screen/i];
    for (const [i, prompt] of prompts.entries()) {
      await screen.findByRole('heading', { name: prompt });
      await user.click(screen.getByRole('button', { name: 'Never' }));
      await user.click(screen.getByRole('button', { name: i < prompts.length - 1 ? 'Continue' : 'Done' }));
    }

    expect(onRecordTestResult).toHaveBeenCalledWith({
      key: 'dryEyeQuestionnaire',
      value: { score: 0, severity: 'Comfortable' },
    });
  });

  it('offers the result once the contrast check and questionnaire are both recorded', () => {
    renderFlow({ contrastSensitivity: 'Excellent', dryEyeQuestionnaire: { score: 0, severity: 'Comfortable' } });

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get my result' })).toBeEnabled();
  });
});
