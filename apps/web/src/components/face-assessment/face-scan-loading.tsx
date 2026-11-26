import { ScanFace } from 'lucide-react';

/** Full-bleed loading state while the camera stream and/or the MediaPipe
 * FaceLandmarker model are still starting — shown in place of the scan guide
 * until both `cameraReady` and `faceReady` are true. */
export function FaceScanLoading({ cameraReady }: { cameraReady: boolean }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative flex size-20 items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-amber-200/40 [animation:pulseRing_1.8s_ease-out_infinite]" />
        <div className="absolute inset-0 rounded-full border-2 border-amber-200/40 [animation:pulseRing_1.8s_ease-out_infinite_0.9s]" />
        <ScanFace className="size-9 text-amber-200" aria-hidden="true" />
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-white">Initializing AI Vision…</p>
        <p className="mt-1 text-sm text-white/60">{cameraReady ? 'Loading face tracking…' : 'Scanning camera…'}</p>
      </div>
    </div>
  );
}
