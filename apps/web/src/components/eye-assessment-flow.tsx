'use client';

import type { AssessmentState, RecordTestResultInput } from '@aidoctor/shared';

import { CompletionCard } from '@/components/completion-card';
import { ContrastSensitivityTest } from '@/components/eye-tests/contrast-sensitivity-test';
import { ScreenComfortQuestionnaire } from '@/components/eye-tests/screen-comfort-questionnaire';
import { FaceMeshCapture, type HeadDirection } from '@/components/face-mesh-capture';

const DIRECTIONS: Array<{ key: HeadDirection; prompt: string }> = [
  { key: 'center', prompt: 'Look straight ahead at the camera' },
  { key: 'left', prompt: 'Turn your head slightly to look left' },
  { key: 'right', prompt: 'Turn your head slightly to look right' },
];

// `dryEyeQuestionnaire` is the stored result key for the screen-comfort
// habits questionnaire — kept as-is so existing results stay readable.
const TEST_KEYS = ['contrastSensitivity', 'dryEyeQuestionnaire'] as const;

interface Props {
  state: AssessmentState;
  isUploading: boolean;
  isRecording: boolean;
  isCompleting: boolean;
  onCapture: (blob: Blob, captureLabel: string) => void;
  onRecordTestResult: (input: RecordTestResultInput) => void;
  onComplete: () => void;
}

export function EyeAssessmentFlow({
  state,
  isUploading,
  isRecording,
  isCompleting,
  onCapture,
  onRecordTestResult,
  onComplete,
}: Props) {
  const { mediaAssets, testResults, isReadyToComplete } = state;

  const nextDirection = DIRECTIONS.find((d) => !mediaAssets.some((m) => m.captureLabel === d.key));
  if (nextDirection) {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-xs text-muted-foreground">
          Photo {mediaAssets.length + 1} of {DIRECTIONS.length}
        </p>
        <FaceMeshCapture
          key={nextDirection.key}
          isSubmitting={isUploading}
          promptText={nextDirection.prompt}
          requiredRegions={['eyes']}
          assessmentKind="eye"
          // Every step needs its own pose check — straight-ahead is
          // validated for symmetry, the four turned shots are validated
          // against their specific expected head direction.
          requiredHeadDirection={nextDirection.key}
          onCapture={(blob) => onCapture(blob, nextDirection.key)}
        />
      </div>
    );
  }

  const nextTestKey = TEST_KEYS.find((key) => !(key in testResults));
  if (nextTestKey === 'contrastSensitivity') {
    return (
      <ContrastSensitivityTest
        isSubmitting={isRecording}
        onComplete={(label) => onRecordTestResult({ key: 'contrastSensitivity', value: label })}
      />
    );
  }
  if (nextTestKey === 'dryEyeQuestionnaire') {
    return (
      <ScreenComfortQuestionnaire
        isSubmitting={isRecording}
        onComplete={(result) => onRecordTestResult({ key: 'dryEyeQuestionnaire', value: result })}
      />
    );
  }

  return (
    <CompletionCard
      title="All photos and checks complete. Ready to see your result."
      actionLabel="Get my result"
      isActionDisabled={!isReadyToComplete}
      isActionPending={isCompleting}
      onAction={onComplete}
    />
  );
}
