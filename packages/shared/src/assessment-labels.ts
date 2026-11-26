import type { AssessmentType } from './assessment-types';

export const ASSESSMENT_LABELS: Record<AssessmentType, string> = {
  FACE: 'Face Assessment',
  EYE: 'Eye Assessment',
  HAIR: 'Hair Assessment',
  SKIN: 'Skin Assessment',
  TEETH: 'Teeth Assessment',
  TONGUE: 'Tongue Assessment',
  VOICE: 'Voice Assessment',
  WALKING: 'Walking Assessment',
  POSTURE: 'Posture Assessment',
  HAND_COORDINATION: 'Hand Coordination',
  MEMORY: 'Memory Test',
  SQUATS: 'Squats Test',
  MENTAL_WELLNESS: 'Mental Wellness Questionnaire',
  LIFESTYLE: 'Lifestyle Assessment',
};

export const ASSESSMENT_DESCRIPTIONS: Record<AssessmentType, string> = {
  FACE: 'Skin texture, under-eye appearance and how rested you look.',
  EYE: 'Eye movement, redness, under-eye appearance and screen-comfort habits.',
  HAIR: 'Shine, texture, breakage and scalp care from multi-angle photos.',
  SKIN: 'Tone evenness, texture, dryness and skincare habits.',
  TEETH: 'Tooth shade, surface staining and smile alignment from guided photos.',
  TONGUE: 'Colour, coating and moisture.',
  VOICE: 'Speaking pace, clarity and the energy in your voice.',
  WALKING: 'Walking pace, stride rhythm and posture from a walking video.',
  POSTURE: 'Head and shoulder position habits from front and side photos.',
  HAND_COORDINATION: 'Reaction speed, timing consistency and tap accuracy.',
  MEMORY: 'Pattern recall, number recall and attention tests.',
  SQUATS: 'Rep count, depth and tempo consistency from a timed squats test.',
  MENTAL_WELLNESS: 'Mood, stress, burnout, sleep and focus questionnaire.',
  LIFESTYLE: 'Exercise, hydration, diet and sleep habits questionnaire.',
};
