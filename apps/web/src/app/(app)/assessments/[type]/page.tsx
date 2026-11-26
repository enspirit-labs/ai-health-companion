"use client";

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ASSESSMENT_LABELS, type AssessmentType } from '@aidoctor/shared';
import { Construction, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { AiConsentGate } from '@/components/ai-consent-gate';
import { AiProcessingLoader } from '@/components/ai-processing-loader';
import { AssessmentQuestion, type AnswerValue } from '@/components/assessment-question';
import { AssessmentResultCard } from '@/components/assessment-result-card';
import { CompletionCard } from '@/components/completion-card';
import { ConsentGate } from '@/components/consent-gate';
import { ErrorState } from '@/components/error-state';
import { EyeAssessmentFlow } from '@/components/eye-assessment-flow';
import { FaceCapture } from '@/components/face-capture';
import { FaceMeshCapture } from '@/components/face-mesh-capture';
import { HandCoordinationTest } from '@/components/hand-coordination-test';
import { LoadingState } from '@/components/loading-state';
import { MemoryTest } from '@/components/memory-test';
import { PageHeader } from '@/components/page-header';
import { PostureAssessmentFlow } from '@/components/posture-assessment-flow';
import { QuestionFlow } from '@/components/questionnaire/question-flow';
import { SquatsTest } from '@/components/squats-test';
import { TeethCapture } from '@/components/teeth-capture';
import { VoiceCapture } from '@/components/voice-capture';
import { WalkingCapture } from '@/components/walking-capture';
import { Button } from '@/components/ui/button';
import { ClientApiError } from '@/lib/api/client-fetch';
import { useCurrentUser } from '@/lib/auth/use-auth';
import { isAiConsentRequiredError } from '@/lib/consent/ai-consent';
import { ASSESSMENT_ICONS } from '@/lib/assessments/assessment-icons';
import { assessmentTypeFromSlug } from '@/lib/assessments/type-slug';
import { getPoseLandmarker } from '@/lib/cv/pose-loader';
import {
  useAnswerAssessmentQuestion,
  useAssessmentState,
  useCompleteAssessment,
  useRecordTestResult,
  useStartAssessment,
  useUploadAssessmentMedia,
} from "@/lib/assessments/use-assessment";

// Overrides the generic single-photo capture heading for types where "Position
// your face inside the circle" doesn't quite fit. Types not listed keep the
// component's default framing.
const CAMERA_CAPTURE_PROMPTS: Partial<Record<AssessmentType, string>> = {
  TEETH: "Smile with your teeth visible, centered in the circle",
  HAIR: "Show your hair and scalp, centered in the circle",
  SKIN: "Show a clear patch of skin, centered in the circle",
  TONGUE: "Stick out your tongue, centered in the circle",
};

// Assessment types that use the FaceLandmarker mesh capture-gate (instead of
// the generic bounding-box FaceCapture) and which face regions must be
// confirmed before their capture button enables.
const FACE_MESH_REQUIRED_REGIONS: Partial<
  Record<AssessmentType, ("eyes" | "eyebrows" | "mouth" | "jaw")[]>
> = {
  FACE: ["eyes", "mouth"],
  TONGUE: ["mouth", "jaw"],
  // No specific facial feature required — a skin patch isn't one — but this
  // still routes Skin through the FaceMeshCapture premium scan UI/gating
  // rather than the plain manual FaceCapture fallback below.
  SKIN: [],
};

// Tongue needs the open-mouth state to hold noticeably longer (~1s) than the
// general ~0.5s hold — the more specific instruction wins where the two conflict.
// Face's premium scan UI ('s follow-up redesign) shows a visible
// capture countdown once the hold clears, so its own hold is tuned to a full
// 1.5s of stability before that countdown even starts.
const FACE_MESH_HOLD_MS: Partial<Record<AssessmentType, number>> = {
  FACE: 1500,
  TONGUE: 1000,
};

export default function AssessmentPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type: slug } = use(params);
  const assessmentType = assessmentTypeFromSlug(slug);

  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [notAvailable, setNotAvailable] = useState(false);
  const [isUploadingFrames, setIsUploadingFrames] = useState(false);
  // Which question the one-at-a-time flow is currently showing — separate
  // from the server's `answers` map so Back can revisit an already-answered
  // question without that being confused with "still unanswered". Null
  // until initialized from the server's own progress (see effect below).
  const [stepIndex, setStepIndex] = useState<number | null>(null);

  const start = useStartAssessment();
  const state = useAssessmentState(assessmentId);
  const answerQuestion = useAnswerAssessmentQuestion(assessmentId);
  const uploadMedia = useUploadAssessmentMedia(assessmentId);
  const recordTestResult = useRecordTestResult(assessmentId);
  const complete = useCompleteAssessment(assessmentId);
  const { data: user } = useCurrentUser();
  // Completing sends the capture to the AI provider, so it needs AI-processing
  // consent. Capture and answering never do.
  const [aiGateOpen, setAiGateOpen] = useState(false);
  // complete.isPending only flips on the next render, so two clicks (or a
  // capture component's onComplete plus a click) in the same tick would both
  // see it false and send two /complete requests. A ref flips synchronously.
  const completeInFlight = useRef(false);

  function requestComplete() {
    if (user && !user.consentAiProcessing) {
      setAiGateOpen(true);
      return;
    }
    submitComplete();
  }

  function submitComplete() {
    if (completeInFlight.current || complete.data) return;
    completeInFlight.current = true;
    complete.mutate(undefined, {
      onSettled: () => {
        completeInFlight.current = false;
      },
      onError: (error) => {
        if (isAiConsentRequiredError(error)) {
          setAiGateOpen(true);
          return;
        }
        // The server's message is written for users (e.g. the retryable 503
        // from a provider failure); anything else gets a generic line.
        toast.error(
          error instanceof ClientApiError ? error.message : 'Something went wrong. Please try again.',
        );
      },
    });
  }

  // SquatsTest's pose model (~17MB of WASM + task model) only starts
  // downloading once the user clicks past the camera consent gate that
  // wraps it below — kicking it off here instead lets that download happen
  // while the user is still reading/accepting consent. getPoseLandmarker()
  // caches its result, so this is a pure prefetch: SquatsTest's own call
  // resolves instantly from the same promise, and any failure here is
  // silently retried and surfaced for real by SquatsTest itself.
  useEffect(() => {
    if (assessmentType === "SQUATS") getPoseLandmarker().catch(() => {});
  }, [assessmentType]);

  function handleRetakeAssessment() {
    if (!assessmentType) return;
    complete.reset();
    setIsUploadingFrames(false);
    setAssessmentId(null);
    setStepIndex(null);
    start.mutate(assessmentType, {
      onSuccess: (data) => setAssessmentId(data.id),
      onError: (error) => {
        if (error instanceof ClientApiError && error.status === 404) {
          setNotAvailable(true);
        }
      },
    });
  }

  async function handleCaptureFrames(frames: Blob[]) {
    setIsUploadingFrames(true);
    try {
      for (let i = 0; i < frames.length; i += 1) {
        await uploadMedia.mutateAsync({
          blob: frames[i],
          captureLabel: `frame-${i}`,
        });
      }
    } finally {
      setIsUploadingFrames(false);
    }
  }

  useEffect(() => {
    if (!assessmentType || assessmentId) return;
    start.mutate(assessmentType, {
      onSuccess: (data) => setAssessmentId(data.id),
      onError: (error) => {
        if (error instanceof ClientApiError && error.status === 404) {
          setNotAvailable(true);
        }
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentType]);

  // Resume where the server says the user left off — the first load of a
  // questionnaire-mode assessment (fresh or reloaded mid-way) sets the step
  // to the first unanswered question exactly once; after that, Back/Continue
  // drive it locally.
  useEffect(() => {
    if (stepIndex !== null || !state.data || state.data.inputMode !== 'QUESTIONNAIRE') return;
    const { questions, nextQuestion } = state.data;
    const resumeIndex = nextQuestion ? questions.findIndex((q) => q.key === nextQuestion.key) : questions.length;
    setStepIndex(resumeIndex === -1 ? 0 : resumeIndex);
  }, [state.data, stepIndex]);

  if (!assessmentType) {
    return (
      <main id="main-content" className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <p role="alert" className="text-lg font-medium">
          Unknown assessment
        </p>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </main>
    );
  }

  if (notAvailable) {
    return (
      <main id="main-content" className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <Construction aria-hidden="true" className="size-10 text-muted-foreground" />
        <p role="status" className="text-lg font-medium">
          {ASSESSMENT_LABELS[assessmentType]} is coming soon
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          This module hasn&apos;t been built yet. Check back later, or try one
          of the assessments already available from your dashboard.
        </p>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </main>
    );
  }

  if (aiGateOpen) {
    return (
      <main id="main-content" className="flex flex-1 flex-col">
        <AiConsentGate
          onDismiss={() => setAiGateOpen(false)}
          onGranted={() => {
            setAiGateOpen(false);
            submitComplete();
          }}
        >
          {null}
        </AiConsentGate>
      </main>
    );
  }

  if (complete.isPending) {
    return (
      <main id="main-content" className="flex flex-1 flex-col">
        <AiProcessingLoader />
      </main>
    );
  }

  if (complete.data) {
    return (
      <main id="main-content" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-10">
        <AssessmentResultCard result={complete.data} />
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRetakeAssessment}>
            <RotateCcw className="size-4" /> Retake assessment
          </Button>
          <Button asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (state.isError) {
    return (
      <main id="main-content" className="flex flex-1 items-center justify-center">
        <ErrorState description="Could not load this assessment." onRetry={() => state.refetch()} />
      </main>
    );
  }

  if (!state.data) {
    return (
      <main id="main-content" className="flex flex-1 items-center justify-center">
        <LoadingState label="Loading…" variant="page" />
      </main>
    );
  }

  const header = (
    <PageHeader
      title={ASSESSMENT_LABELS[assessmentType]}
      icon={ASSESSMENT_ICONS[assessmentType]}
      backHref="/assessments"
      backLabel="Assessments"
    />
  );

  if (assessmentType === "POSTURE" && state.data.inputMode === "CAMERA_IMAGE") {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
        {header}
        <ConsentGate type="CAMERA">
          <PostureAssessmentFlow
            state={state.data}
            isUploading={uploadMedia.isPending}
            isCompleting={complete.isPending}
            onCapture={(blob, captureLabel) =>
              uploadMedia.mutate({ blob, captureLabel })
            }
            onComplete={() => requestComplete()}
          />
        </ConsentGate>
      </main>
    );
  }

  if (assessmentType === "EYE" && state.data.inputMode === "CAMERA_IMAGE") {
    return (
      <main id="main-content" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
        {header}
        <ConsentGate type="CAMERA">
          <EyeAssessmentFlow
            state={state.data}
            isUploading={uploadMedia.isPending}
            isRecording={recordTestResult.isPending}
            isCompleting={complete.isPending}
            onCapture={(blob, captureLabel) =>
              uploadMedia.mutate({ blob, captureLabel })
            }
            onRecordTestResult={(input) => recordTestResult.mutate(input)}
            onComplete={() => requestComplete()}
          />
        </ConsentGate>
      </main>
    );
  }

  if (state.data.inputMode === "MICROPHONE_AUDIO") {
    const { mediaAssets, isReadyToComplete } = state.data;

    return (
      <main id="main-content" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
        {header}
        <ConsentGate type="MICROPHONE">
          <div className="flex flex-col items-center gap-4">
            {mediaAssets.length === 0 ? (
              <VoiceCapture
                isSubmitting={uploadMedia.isPending}
                onCapture={(blob) =>
                  uploadMedia.mutate({ blob, captureLabel: "reading" })
                }
              />
            ) : (
              <CompletionCard
                title="Recording captured. Ready to see your result."
                actionLabel="Get my result"
                isActionDisabled={!isReadyToComplete}
                isActionPending={complete.isPending}
                onAction={() => requestComplete()}
              />
            )}
          </div>
        </ConsentGate>
      </main>
    );
  }

  if (state.data.inputMode === "CAMERA_VIDEO") {
    const { mediaAssets, isReadyToComplete } = state.data;

    return (
      <main id="main-content" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
        {header}
        <ConsentGate
          type="CAMERA"
          description="This assessment analyzes a short recording captured with your camera — nothing is saved unless you submit it."
        >
          <div className="flex flex-col items-center gap-4">
            {mediaAssets.length === 0 ? (
              <WalkingCapture
                isSubmitting={isUploadingFrames}
                promptText={CAMERA_CAPTURE_PROMPTS[assessmentType]}
                onCaptureFrames={handleCaptureFrames}
              />
            ) : (
              <CompletionCard
                title="Recording captured. Ready to see your result."
                actionLabel="Get my result"
                isActionDisabled={!isReadyToComplete}
                isActionPending={complete.isPending}
                onAction={() => requestComplete()}
              />
            )}
          </div>
        </ConsentGate>
      </main>
    );
  }

  if (state.data.inputMode === "INTERACTIVE_TEST") {
    const { testResults, isReadyToComplete } = state.data;
    const hasResult = Object.keys(testResults).length > 0;

    // SQUATS uses a wide split-view (camera + guidance); the other interactive
    // tests are centered and self-capped, so a wider main leaves them unchanged.
    const mainWidth = assessmentType === "SQUATS" ? "max-w-5xl" : "max-w-2xl";

    return (
      <main id="main-content" className={`mx-auto flex w-full ${mainWidth} flex-1 flex-col gap-6 px-4 py-10`}>
        {header}
        {hasResult ? (
          <CompletionCard
            title="Test complete. Ready to see your result."
            actionLabel="Get my result"
            isActionDisabled={!isReadyToComplete}
            isActionPending={complete.isPending}
            onAction={() => requestComplete()}
          />
        ) : assessmentType === 'HAND_COORDINATION' ? (
          <HandCoordinationTest
            isSubmitting={recordTestResult.isPending}
            onComplete={(value) =>
              recordTestResult.mutate({ key: "handCoordination", value })
            }
          />
        ) : assessmentType === "MEMORY" ? (
          <MemoryTest
            isSubmitting={recordTestResult.isPending}
            onComplete={(value) =>
              recordTestResult.mutate({ key: "memoryTest", value })
            }
          />
        ) : assessmentType === "SQUATS" ? (
          <ConsentGate
            type="CAMERA"
            description="This assessment tracks your movement live, entirely on your device — nothing is ever recorded or uploaded."
          >
            <SquatsTest
              isSubmitting={recordTestResult.isPending}
              onComplete={(value) =>
                recordTestResult.mutate({ key: "squats", value })
              }
            />
          </ConsentGate>
        ) : null}
      </main>
    );
  }

  if (state.data.inputMode === "CAMERA_IMAGE") {
    const { mediaAssets, isReadyToComplete } = state.data;
    const faceMeshRegions = FACE_MESH_REQUIRED_REGIONS[assessmentType];

    return (
      <main id="main-content" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
        {header}
        <ConsentGate type="CAMERA">
          <div className="flex flex-col items-center gap-4">
            {mediaAssets.length === 0 ? (
              faceMeshRegions ? (
                <FaceMeshCapture
                  isSubmitting={uploadMedia.isPending}
                  promptText={CAMERA_CAPTURE_PROMPTS[assessmentType]}
                  requiredRegions={faceMeshRegions}
                  assessmentKind={
                    assessmentType === "FACE" ? "face" : assessmentType === "SKIN" ? "skin" : "tongue"
                  }
                  holdMs={FACE_MESH_HOLD_MS[assessmentType]}
                  onCapture={(blob) =>
                    uploadMedia.mutate({ blob, captureLabel: "front" })
                  }
                />
              ) : assessmentType === "TEETH" ? (
                <TeethCapture
                  isSubmitting={uploadMedia.isPending}
                  onCapture={(blob) =>
                    uploadMedia.mutate({ blob, captureLabel: "front" })
                  }
                />
              ) : (
                <FaceCapture
                  isSubmitting={uploadMedia.isPending}
                  promptText={CAMERA_CAPTURE_PROMPTS[assessmentType]}
                  onCapture={(blob) =>
                    uploadMedia.mutate({ blob, captureLabel: "front" })
                  }
                />
              )
            ) : (
              <CompletionCard
                title="Photo captured. Ready to see your result."
                actionLabel="Get my result"
                isActionDisabled={!isReadyToComplete}
                isActionPending={complete.isPending}
                onAction={() => requestComplete()}
              />
            )}
          </div>
        </ConsentGate>
      </main>
    );
  }

  const { questions, answers, isReadyToComplete } = state.data;
  const currentIndex = stepIndex ?? 0;
  const currentQuestion = questions[currentIndex];

  // Back moves through already-answered questions locally; submitting a
  // re-visited one overwrites its answer and resumes forward from there.
  return (
    <main id="main-content" className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-xl px-4 pt-10">{header}</div>
      {currentQuestion ? (
        <QuestionFlow
          questionKey={currentQuestion.key}
          prompt={currentQuestion.prompt}
          stepNumber={currentIndex + 1}
          totalSteps={questions.length}
          onBack={currentIndex > 0 ? () => setStepIndex(currentIndex - 1) : undefined}
          center={false}
        >
          <AssessmentQuestion
            question={currentQuestion}
            value={answers[currentQuestion.key] as AnswerValue | undefined}
            isSubmitting={answerQuestion.isPending}
            onSubmit={(answer) =>
              answerQuestion.mutate(
                { questionKey: currentQuestion.key, answer },
                { onSuccess: () => setStepIndex(currentIndex + 1) },
              )
            }
          />
        </QuestionFlow>
      ) : (
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center">
          {isReadyToComplete ? (
            <CompletionCard
              title="All questions answered. Ready to see your result."
              actionLabel="Get my result"
              isActionPending={complete.isPending}
              onAction={() => requestComplete()}
            />
          ) : null}
        </div>
      )}
    </main>
  );
}
