/** Palette for the Face Assessment's premium AI-scan UI (face-mesh-capture.tsx,
 * assessmentKind 'face' only, plus its face-assessment/* subcomponents).
 * Deliberately NOT the app's brand terracotta tokens (globals.css) — this is a
 * full-bleed, always-dark camera overlay meant to read like a cinematic
 * biometric-scan surface (reference: dribbble.com/shots/24134335-Face-Scan),
 * same reasoning CameraStage already applies to its own black/white chrome
 * regardless of the app's light/dark theme.
 *
 * One warm accent throughout — no per-state traffic-light hues. Pass/fail is
 * conveyed by the guidance toast's copy and by glow intensity/motion, not by
 * switching to red or green. */
export const FACE_SCAN_COLORS = {
  amber: '#E8B074',
  amberBright: '#F6D9AE',
  text: '#FFFFFF',
  textSecondary: '#D9CFC2',
} as const;

export type FaceScanState = 'waiting' | 'scanning' | 'success' | 'error';

/** Ambient glow-halo color per state — all in the same warm family; only
 * `error` leans slightly toward a dimmed warm red, and only briefly (paired
 * with a subtle shake), so it still reads as one cohesive palette rather
 * than a red/green traffic light. */
export const FACE_SCAN_GLOW: Record<FaceScanState, string> = {
  waiting: 'rgba(217, 207, 194, 0.25)',
  scanning: 'rgba(232, 176, 116, 0.4)',
  success: 'rgba(246, 217, 174, 0.65)',
  error: 'rgba(214, 132, 96, 0.45)',
};

/** Per-check state shown in the bottom icon-badge row — distinct from
 * `FaceScanState` (the ambient halo's own state), since a single check (e.g.
 * "Good Lighting") can be failing while the halo overall still reads
 * "scanning" rather than "error" (that reads error only once there's an
 * active reject reason to show). */
export type ChipState = 'waiting' | 'checking' | 'passed' | 'failed';

/** Derives a check's 4-state value from the pieces every check already has:
 * whether the system is ready to evaluate anything at all, whether a face is
 * currently in frame, and the smoothed pass/fail verdict for this specific
 * check once there is one. */
export function deriveChipState(systemReady: boolean, hasFace: boolean, passed: boolean): ChipState {
  if (!systemReady) return 'waiting';
  if (!hasFace) return 'checking';
  return passed ? 'passed' : 'failed';
}
