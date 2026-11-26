import { Activity, Brain, Camera, Mic, Utensils, type LucideIcon } from 'lucide-react';
import type { AssessmentModuleId } from '@aidoctor/shared';

/**
 * Deliberately distinct from ASSESSMENT_ICONS (per-type) so a module header
 * and the cards beneath it don't repeat the same glyph.
 */
export const ASSESSMENT_MODULE_ICONS: Record<AssessmentModuleId, LucideIcon> = {
  VISUAL: Camera,
  PHYSICAL_MOVEMENT: Activity,
  VOCAL: Mic,
  MENTAL_COGNITIVE: Brain,
  LIFESTYLE: Utensils,
};
