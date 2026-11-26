import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { WELLNESS_DISCLAIMER, CHAT_SYSTEM_GUARDRAIL, OBSERVATION_LABEL_ALLOWLISTS } from '@aidoctor/shared';
import type { AssessmentType } from '@aidoctor/shared';

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 12;

const LIFESTYLE_QUESTIONS = [
  {
    key: 'exerciseDaysPerWeek',
    prompt: 'How many days per week do you exercise?',
    inputType: 'NUMBER' as const,
    options: null,
    order: 0,
  },
  {
    key: 'waterGlassesPerDay',
    prompt: 'How many glasses of water do you drink per day?',
    inputType: 'NUMBER' as const,
    options: null,
    order: 1,
  },
  {
    key: 'dietQuality',
    prompt: 'How would you rate the overall quality of your diet?',
    inputType: 'SINGLE_CHOICE' as const,
    options: [
      { value: 'poor', label: 'Poor' },
      { value: 'fair', label: 'Fair' },
      { value: 'good', label: 'Good' },
      { value: 'excellent', label: 'Excellent' },
    ],
    order: 2,
  },
  {
    key: 'smokes',
    prompt: 'Do you currently smoke?',
    inputType: 'BOOLEAN' as const,
    options: null,
    order: 3,
  },
  {
    key: 'alcoholFrequency',
    prompt: 'How often do you drink alcohol?',
    inputType: 'SINGLE_CHOICE' as const,
    options: [
      { value: 'never', label: 'Never' },
      { value: 'occasionally', label: 'Occasionally' },
      { value: 'weekly', label: 'Weekly' },
      { value: 'daily', label: 'Daily' },
    ],
    order: 4,
  },
  {
    key: 'sleepHoursPerNight',
    prompt: 'On average, how many hours do you sleep per night?',
    inputType: 'NUMBER' as const,
    options: null,
    order: 5,
  },
];

const MENTAL_WELLNESS_QUESTIONS = [
  {
    key: 'moodRating',
    prompt: 'On a scale of 1-5, how would you rate your overall mood this week?',
    inputType: 'SCALE' as const,
    options: null,
    order: 0,
  },
  {
    key: 'stressLevel',
    prompt: 'How would you describe your stress level recently?',
    inputType: 'SINGLE_CHOICE' as const,
    options: [
      { value: 'low', label: 'Low' },
      { value: 'moderate', label: 'Moderate' },
      { value: 'high', label: 'High' },
      { value: 'severe', label: 'Severe' },
    ],
    order: 1,
  },
  {
    key: 'sleepQuality',
    prompt: 'How would you rate your sleep quality?',
    inputType: 'SINGLE_CHOICE' as const,
    options: [
      { value: 'poor', label: 'Poor' },
      { value: 'fair', label: 'Fair' },
      { value: 'good', label: 'Good' },
      { value: 'excellent', label: 'Excellent' },
    ],
    order: 2,
  },
  {
    key: 'socialConnection',
    prompt: 'How often do you feel connected to friends or family?',
    inputType: 'SINGLE_CHOICE' as const,
    options: [
      { value: 'rarely', label: 'Rarely' },
      { value: 'sometimes', label: 'Sometimes' },
      { value: 'often', label: 'Often' },
      { value: 'always', label: 'Always' },
    ],
    order: 3,
  },
  {
    key: 'anxietyFrequency',
    prompt: 'How often do you feel anxious or on edge?',
    inputType: 'SINGLE_CHOICE' as const,
    options: [
      { value: 'never', label: 'Never' },
      { value: 'rarely', label: 'Rarely' },
      { value: 'sometimes', label: 'Sometimes' },
      { value: 'often', label: 'Often' },
    ],
    order: 4,
  },
  {
    key: 'copingConfidence',
    prompt: 'On a scale of 1-5, how confident do you feel in your ability to handle daily stress?',
    inputType: 'SCALE' as const,
    options: null,
    order: 5,
  },
];


export interface SeedPromptTemplate {
  key: string;
  assessmentType: AssessmentType | null;
  systemPrompt: string;
  /** false = create-only: re-seeding never overwrites an edited prompt. */
  overwriteOnReseed: boolean;
}

/**
 * Wraps a module's instructions in the shared guardrail and disclaimer, plus
 * the module's observation-label allowlist when it has one (labels outside it
 * are dropped server-side anyway — naming them keeps the model on-list).
 * Re-seeding overwrites the stored prompt so wording changes actually ship.
 */
function assessmentPrompt(assessmentType: AssessmentType, instructions: string): SeedPromptTemplate {
  const labels = OBSERVATION_LABEL_ALLOWLISTS[assessmentType];
  const labelRule = labels
    ? `\n\nUse only these observation labels, spelled exactly as written: ${labels.join(', ')}. Leave out any observation that doesn't fit one of them.`
    : '';
  return {
    key: `assessment.${assessmentType}.system`,
    assessmentType,
    systemPrompt: `${CHAT_SYSTEM_GUARDRAIL}\n\n${instructions}${labelRule}\n\n${WELLNESS_DISCLAIMER}`,
    overwriteOnReseed: true,
  };
}

/**
 * Every AI prompt template the seed writes, fully rendered. Pure (no DB) and
 * exported so tests and tooling can compare against exactly this text.
 */
export function buildSeedPromptTemplates(): SeedPromptTemplate[] {
  return [
    {
      key: 'chat.health_coach.system',
      assessmentType: null,
      systemPrompt: `${CHAT_SYSTEM_GUARDRAIL}\n\n${WELLNESS_DISCLAIMER}`,
      overwriteOnReseed: true,
    },
    assessmentPrompt(
      'MENTAL_WELLNESS',
      'You are scoring a Mental Wellness Questionnaire from answers covering mood, stress level, sleep quality, social connection, anxiety frequency, and coping confidence. Produce a mental wellness score (0-100), 3-5 short observations tied to the specific answers given, 1-3 actionable recommendations prioritized by impact, an overall risk level, and your confidence in the assessment. Do not name any mental health condition — always recommend professional support for concerning findings such as high stress, frequent anxiety, or low mood.',
    ),

    assessmentPrompt(
      'LIFESTYLE',
      'You are scoring a Lifestyle Assessment from questionnaire answers covering exercise frequency, water intake, diet quality, smoking, alcohol use, and sleep. Produce a lifestyle wellness score (0-100), 3-5 short observations tied to the specific answers given, 1-3 actionable recommendations prioritized by impact, an overall risk level, and your confidence in the assessment.',
    ),

    assessmentPrompt(
      'FACE',
      `You are looking at a single front-facing photo for a wellness check-in Face Assessment. Describe only cosmetic and self-care observations: skin texture and tone evenness, skin redness, dark circles and puffiness under the eyes, eye openness, how rested the person looks, facial and smile symmetry, and lip dryness. Do not estimate stress, mood, hydration, pulse, or any other internal state — a single photo can't show those.

Produce a face wellness score (0-100), 4-6 short observations (each as a label/value pair, e.g. "darkCircles": "Mild"), 1-3 actionable self-care recommendations (e.g. sleep routine, sun protection, moisturising), an overall risk level, and your confidence given image quality and lighting. Do not attempt to identify the person or infer protected characteristics.`,
    ),

    assessmentPrompt(
      'EYE',
      `You are looking at an Eye Assessment for a wellness check-in. You receive up to three photos captured in sequence — labeled "center", "left", "right" — showing the user looking in each direction, plus two short checks the user already completed: contrastSensitivity (how faint a letter they could still read on screen) and dryEyeQuestionnaire (their screen-comfort habits answers: how often their eyes feel tired, scratchy or strained around screen use). Both are pre-scored client-side; treat their values as reliable inputs, not something to re-derive.

From the photos, describe only cosmetic and self-care observations: how freely the eyes move across the three directions, eye redness, dark circles, puffiness under the eyes, eye openness, and how rested the person looks. Combine this with the supplied answers to describe screen comfort and eye tiredness as everyday habits.

Produce an overall eye wellness score (0-100), 4-7 short observations (each a label/value pair, e.g. "screenComfort": "Some end-of-day tiredness"), 1-3 actionable recommendations (e.g. regular screen breaks, screen brightness and distance, sleep routine), an overall risk level, and your confidence given image quality and how many of the three photos and checks were actually provided. Do not attempt to identify the person. Do not name any eye condition or call anything abnormal; if something looks like it may need attention, say that an optometrist can help.`,
    ),

    assessmentPrompt(
      'TEETH',
      `You are looking at a single close-up photo of a smile for a wellness check-in Teeth Assessment. Describe only cosmetic and self-care observations: tooth shade, surface staining and its likely everyday sources (e.g. coffee, tea, or smoking), smile alignment, and overall smile brightness. Do not comment on the gums, on buildup, or on the health of any individual tooth.

Produce a smile wellness score (0-100), 3-5 short observations (each a label/value pair, e.g. "surfaceStaining": "Light"), 1-3 actionable self-care recommendations (e.g. brushing and flossing routine, rinsing after coffee, regular dental check-ups), an overall risk level, and your confidence given image quality and lighting. Do not attempt to identify the person. Do not name any dental condition or call anything abnormal; if something looks like it may need attention, say that a dentist can help.`,
    ),

    assessmentPrompt(
      'HAIR',
      `You are looking at a single close-up photo of a person's hair and scalp for a wellness check-in Hair Assessment. Describe only cosmetic and hair-care observations: apparent volume, shine, texture, frizz, split ends and breakage, and visible scalp flaking, oiliness, or dryness. Do not comment on the hairline or on how much hair the person has lost or is losing.

Produce a hair care score (0-100), 4-6 short observations (each a label/value pair, e.g. "scalpFlaking": "Light"), 1-3 actionable recommendations (e.g. gentler styling, conditioning, a scalp care routine), an overall risk level, and your confidence given image quality and lighting. Do not attempt to identify the person. Do not name any hair or scalp condition or call anything abnormal; if something looks like it may need attention, say that a dermatologist can help.`,
    ),

    assessmentPrompt(
      'VOICE',
      `You are analyzing a short voice recording for a wellness check-in Voice Assessment. You receive a transcript of what the person said (transcribed by speech-to-text), along with capture metadata. Assess, purely as wellness/mental-state indicators (never as a medical or speech-pathology finding): speech fluency and word-finding, sentence coherence, apparent energy level and mood tone conveyed by word choice and phrasing, signs of fatigue or stress in how the person expressed themselves, and overall clarity of communication.

Produce a voice/communication wellness score (0-100), 4-6 short observations (each a label/value pair, e.g. "fluency": "Clear and coherent"), 1-3 actionable recommendations, an overall risk level, and your confidence given transcript length and quality. Do not attempt to identify the person. Do not name any speech, neurological, or mental health condition — frame everything as a wellness check-in only, and recommend professional consultation for any concerning finding.`,
    ),

    assessmentPrompt(
      'WALKING',
      `You are looking at a short sequence of photo frames extracted from a walking video for a wellness check-in Walking Assessment. The frames are labeled in chronological order (e.g. "frame-0" through "frame-4") and show the person walking across the capture.

Describe only everyday activity and pace observations: walking pace, stride consistency and step rhythm, posture while walking (upright or leaning forward), arm swing, and how evenly the person moves from side to side.

Produce a walking activity score (0-100), 4-6 short observations (each a label/value pair, e.g. "walkingPace": "Brisk"), 1-3 actionable recommendations (e.g. a daily step goal, brisk-walking intervals, stretching before a walk), an overall risk level, and your confidence given frame quality and how many frames were provided. Do not attempt to identify the person. Keep everything to activity and pace — no medical framing; if the person may want guidance, say that a physiotherapist can help.`,
    ),

    assessmentPrompt(
      'SKIN',
      `You are looking at a single close-up photo of a person's skin for a wellness check-in Skin Assessment. Describe only cosmetic and skincare observations: texture, tone evenness, visible dryness or oiliness, redness, visible blemishes, and overall radiance.

Produce a skin care score (0-100), 4-6 short observations (each a label/value pair, e.g. "dryness": "Mild"), 1-3 actionable recommendations (e.g. moisturising, a gentle cleansing routine, sun protection), an overall risk level, and your confidence given image quality and lighting. Do not attempt to identify the person. Do not name any skin condition or call anything abnormal; if something looks like it may need attention, say that a dermatologist can help.`,
    ),

    assessmentPrompt(
      'TONGUE',
      `You are analyzing a single close-up photo of a person's tongue for a wellness check-in Tongue Assessment. Assess, purely as visual wellness indicators (never as a medical finding): tongue color, surface coating, texture, moisture level (as a hydration indicator), and any visible unevenness.

Produce a tongue/hydration wellness score (0-100), 3-4 short observations (each a label/value pair, e.g. "moisture": "Dry"), 1-3 actionable recommendations (mostly hydration and diet related), an overall risk level, and your confidence given image quality and lighting. Do not attempt to identify the person. Do not name any medical condition — frame everything as a wellness check-in only, and recommend seeing a doctor for any concerning finding.`,
    ),

    assessmentPrompt(
      'POSTURE',
      `You are looking at a Posture Assessment for a wellness check-in. You receive up to three photos captured in sequence — labeled "front", "left", and "right" — showing the person standing naturally: facing the camera directly, then turned to present their left side, then their right side.

From the front-facing photo, note whether the shoulders sit at an even height and whether the head tilts to one side. From each side-facing photo, note whether the head sits forward of the shoulders, whether the shoulders are rounded, and any slouching or leaning to one side — comparing the left and right views where both are available rather than treating them as fully independent.

Produce an overall posture habits score (0-100), 4-6 short observations (each a label/value pair, e.g. "headForwardOfShoulders": "Slightly"), 1-3 actionable recommendations (e.g. screen height, desk setup, regular stretch breaks), an overall risk level, and your confidence given image quality, framing, and how many of the three photos were actually provided. Do not attempt to identify the person. Describe everyday posture habits in plain language only — no anatomical or medical terms, and don't call anything abnormal; if the person may want guidance, say that a physiotherapist can help.`,
    ),

    assessmentPrompt(
      'HAND_COORDINATION',
      'You are analyzing the result of a Hand Coordination interactive test for a wellness check-in. You receive a client-scored result: averageReactionMs (average time to tap a target), accuracy (fraction of targets successfully tapped), and a qualitative rating. Assess fine motor coordination and reaction time purely as general wellness indicators.\n\nProduce a hand-coordination wellness score (0-100), 3-5 short observations tied to the specific result given, 1-3 actionable recommendations, an overall risk level, and your confidence in the assessment. Do not name any neurological or motor condition — recommend professional evaluation for any concerning finding.',
    ),

    assessmentPrompt(
      'MEMORY',
      'You are analyzing the result of a short-term Memory interactive test for a wellness check-in. You receive a client-scored result: longestSequence (the longest pattern the person successfully repeated) and a qualitative rating. Assess short-term/working memory purely as a general wellness indicator.\n\nProduce a memory wellness score (0-100), 3-5 short observations tied to the specific result given, 1-3 actionable recommendations, an overall risk level, and your confidence in the assessment. Do not name any cognitive or neurological condition — recommend professional evaluation for any concerning finding.',
    ),

    assessmentPrompt(
      'SQUATS',
      `You are analyzing the result of a timed Squats physical-activity test for a wellness check-in. You receive a client-scored result: repCount (full squat repetitions completed, tracked via on-device pose estimation), formScore (0-100, how consistent squat depth and tempo were rep-to-rep — lower means depth or pace varied a lot, which can indicate fatigue or fitness inexperience rather than technique itself since no camera angle or joint-flexion detail is available beyond the derived angle), durationSeconds (how long the session actually ran, up to a 60-second cap), and a qualitative rating.

Produce a fitness wellness score (0-100), 3-5 short observations tied to the specific result given (e.g. rep count relative to the session length, and what the form-consistency score suggests), 1-3 actionable recommendations (e.g. pacing, warm-up, gradual rep-count progression), an overall risk level, and your confidence in the assessment given that this is a coarse, angle-based estimate rather than a clinical movement analysis. Do not name any musculoskeletal or cardiovascular condition — recommend professional evaluation for any concerning finding (e.g. pain, very low rep count with high effort reported elsewhere).`,
    ),
    {
      key: 'dashboard.pulse_game.pinpoint.system',
      assessmentType: null,
      systemPrompt: `${CHAT_SYSTEM_GUARDRAIL}

You are generating today's Pinpoint puzzle for the "Something new to try" section of a wellness dashboard, shown only after the user has completed their Daily Pulse check-in.

Pinpoint works like this: the player is shown a list of short clue WORDS one at a time and must guess the CATEGORY that connects all of them, in as few reveals as possible.

Output rules:
- "theme" is the CATEGORY — the answer the player types. Phrase it as a short, concrete description of what the clues have in common, e.g. "Words that come before 'rain'", "Types of knot", "Board games", "Things found in a kitchen drawer". It is the puzzle's answer, NOT a mood label.
- "clues" are single words or very short terms (1-2 words each) that ALL genuinely belong to that category. No sentences, no explanations, no clues that merely describe a feeling.
- Order the clues so the most ambiguous/hardest-to-place word comes first and the most giveaway word comes last, so each reveal narrows things down.
- Every clue must be unmistakably a member of the category, and the category must be guessable from the clues alone by someone with everyday general knowledge.

Keep it lighthearted and everyday. Never use a health condition, symptom, medication, or medical topic as the category or as any clue, even when the input describes a stressful or low-mood day. Never reference the user's actual answers, mood, or wellness data in the category or clues — use the supplied tone only to pick how gentle or energetic the subject matter feels.

${WELLNESS_DISCLAIMER}`,
      // Seeded once; admins tune the puzzle prompt in production.
      overwriteOnReseed: false,
    },
  ];
}

async function upsertPromptTemplates() {
  for (const template of buildSeedPromptTemplates()) {
    await prisma.aiPromptTemplate.upsert({
      where: { key: template.key },
      update: template.overwriteOnReseed ? { systemPrompt: template.systemPrompt } : {},
      create: {
        key: template.key,
        assessmentType: template.assessmentType,
        version: 1,
        isActive: true,
        systemPrompt: template.systemPrompt,
      },
    });
  }
}

/**
 * Admin credentials come only from the environment — there is no built-in
 * default in any environment, so a missing pair skips the admin rather than
 * creating a well-known login.
 */
async function seedAdminUser() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.log(
      process.env.NODE_ENV === 'production'
        ? 'Refusing to seed an admin user in production: SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are not both set.'
        : 'Skipping admin user: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to seed one.',
    );
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      fullName: 'Admin User',
      role: 'ADMIN',
      authProvider: 'EMAIL',
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });
}

async function main() {
  await upsertPromptTemplates();

  const wellnessScoreArticleBody =
    'Wellness scores summarize AI observations from your check-ins into a 0-100 scale. They are self-check indicators, not medical findings. ' +
    WELLNESS_DISCLAIMER;
  await prisma.knowledgeBaseArticle.upsert({
    where: { slug: 'what-is-a-wellness-score' },
    update: { body: wellnessScoreArticleBody },
    create: {
      slug: 'what-is-a-wellness-score',
      title: 'What is a wellness score?',
      body: wellnessScoreArticleBody,
      tags: ['onboarding', 'scoring'],
      published: true,
    },
  });

  const lifestyleDefinition = await prisma.questionnaireDefinition.upsert({
    where: { key: 'lifestyle.v1' },
    update: { isActive: true },
    create: {
      key: 'lifestyle.v1',
      title: 'Lifestyle Assessment',
      assessmentType: 'LIFESTYLE',
      isActive: true,
    },
  });

  for (const question of LIFESTYLE_QUESTIONS) {
    await prisma.questionnaireQuestion.upsert({
      where: {
        questionnaireDefinitionId_key: {
          questionnaireDefinitionId: lifestyleDefinition.id,
          key: question.key,
        },
      },
      update: {
        prompt: question.prompt,
        inputType: question.inputType,
        options: question.options ?? undefined,
        order: question.order,
      },
      create: {
        questionnaireDefinitionId: lifestyleDefinition.id,
        key: question.key,
        prompt: question.prompt,
        inputType: question.inputType,
        options: question.options ?? undefined,
        order: question.order,
        isRequired: true,
      },
    });
  }

  const mentalWellnessDefinition = await prisma.questionnaireDefinition.upsert({
    where: { key: 'mental_wellness.v1' },
    update: { isActive: true },
    create: {
      key: 'mental_wellness.v1',
      title: 'Mental Wellness Questionnaire',
      assessmentType: 'MENTAL_WELLNESS',
      isActive: true,
    },
  });

  for (const question of MENTAL_WELLNESS_QUESTIONS) {
    await prisma.questionnaireQuestion.upsert({
      where: {
        questionnaireDefinitionId_key: {
          questionnaireDefinitionId: mentalWellnessDefinition.id,
          key: question.key,
        },
      },
      update: {
        prompt: question.prompt,
        inputType: question.inputType,
        options: question.options ?? undefined,
        order: question.order,
      },
      create: {
        questionnaireDefinitionId: mentalWellnessDefinition.id,
        key: question.key,
        prompt: question.prompt,
        inputType: question.inputType,
        options: question.options ?? undefined,
        order: question.order,
        isRequired: true,
      },
    });
  }

  await seedAdminUser();

  // Both default to disabled (fail closed) — flip via the admin panel or a
  // direct DB update once each epic is ready to roll out. A missing row
  // would already read as disabled (see FeatureFlagsService), but seeding
  // them explicitly means the admin panel's flag list has something to show
  // and toggle from day one, rather than appearing empty.
  for (const key of ['daily_pulse', 'slack_reminders', 'daily_pulse_games']) {
    await prisma.featureFlag.upsert({
      where: { key },
      update: {},
      create: { key, enabled: false },
    });
  }

  // eslint-disable-next-line no-console
  console.log('Seed complete.');
}

// Only touch the DB when run directly (prisma db seed / ts-node), not when
// imported for buildSeedPromptTemplates().
if (require.main === module) {
  main()
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
