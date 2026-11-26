import {
  Brain,
  Droplets,
  Dumbbell,
  Eye,
  Footprints,
  Hand,
  HeartHandshake,
  Mic,
  PersonStanding,
  ScanFace,
  Scissors,
  Smile,
  Sparkles,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import type { AssessmentType } from '@aidoctor/shared';

/**
 * One consistent icon per assessment type, used everywhere the type/name is
 * shown (dashboard cards, history, recommendations, reports, the assessment
 * flow itself) so the same module always reads as the same glyph across the
 * app instead of being identified by label text alone.
 */
export const ASSESSMENT_ICONS: Record<AssessmentType, LucideIcon> = {
  FACE: ScanFace,
  EYE: Eye,
  HAIR: Scissors,
  SKIN: Sparkles,
  TEETH: Smile,
  TONGUE: Droplets,
  VOICE: Mic,
  WALKING: Footprints,
  POSTURE: PersonStanding,
  HAND_COORDINATION: Hand,
  MEMORY: Brain,
  SQUATS: Dumbbell,
  MENTAL_WELLNESS: HeartHandshake,
  LIFESTYLE: Utensils,
};
