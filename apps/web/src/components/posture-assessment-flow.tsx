'use client';

import type { AssessmentState } from '@aidoctor/shared';

import { CompletionCard } from '@/components/completion-card';
import { PostureCapture, type PostureCaptureOrientation } from '@/components/posture-capture';

// Mirrors eye-assessment-flow.tsx's DIRECTIONS pattern — one entry per
// capture step, driving both the on-screen prompt and which mediaAsset
// captureLabel marks that step done.
const STEPS: Array<{ key: PostureCaptureOrientation; prompt: string }> = [
  { key: 'front', prompt: 'Stand facing the camera, arms relaxed at your sides' },
  { key: 'left', prompt: 'Turn to your left side, keep your posture natural' },
  { key: 'right', prompt: 'Turn to your right side, keep your posture natural' },
];

interface Props {
  state: AssessmentState;
  isUploading: boolean;
  isCompleting: boolean;
  onCapture: (blob: Blob, captureLabel: string) => void;
  onComplete: () => void;
}

export function PostureAssessmentFlow({ state, isUploading, isCompleting, onCapture, onComplete }: Props) {
  const { mediaAssets, isReadyToComplete } = state;

  const nextStep = STEPS.find((step) => !mediaAssets.some((m) => m.captureLabel === step.key));
  if (nextStep) {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-xs text-muted-foreground">
          Photo {mediaAssets.length + 1} of {STEPS.length}
        </p>
        <PostureCapture
          key={nextStep.key}
          isSubmitting={isUploading}
          promptText={nextStep.prompt}
          orientation={nextStep.key}
          onCapture={(blob) => onCapture(blob, nextStep.key)}
        />
      </div>
    );
  }

  return (
    <CompletionCard
      title="All photos captured. Ready to see your result."
      actionLabel="Get my result"
      isActionDisabled={!isReadyToComplete}
      isActionPending={isCompleting}
      onAction={onComplete}
    />
  );
}
