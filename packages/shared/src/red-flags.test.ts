import { describe, expect, it } from 'vitest';

import { ESCALATION_COPY, isEscalationMessage } from './escalation-copy';
import {
  RED_FLAG_CATEGORIES,
  detectRedFlag,
  normalizeForRedFlags,
  type RedFlagCategory,
  type RedFlagKind,
} from './red-flags';

/**
 * DEVELOPMENT cases for the detector — written by the implementer, kept next to
 * the code. These are NOT the frozen clinician-reviewed evaluation set.
 * Arabic and Arabizi rows need native-speaker review.
 */
type Positive = [text: string, category: RedFlagCategory];

const POSITIVES: Positive[] = [
  // --- SUICIDE_OR_SELF_HARM: explicit intent / plan ---
  ['I want to kill myself', 'SUICIDE_OR_SELF_HARM'],
  ["i'm going to end my life tonight", 'SUICIDE_OR_SELF_HARM'],
  ['I have been thinking about killing myself', 'SUICIDE_OR_SELF_HARM'],
  ['i wanna kms', 'SUICIDE_OR_SELF_HARM'],
  ['thinking of unaliving myself', 'SUICIDE_OR_SELF_HARM'],
  ['I want to kiilll myyyself', 'SUICIDE_OR_SELF_HARM'],
  ['i want to kil myself', 'SUICIDE_OR_SELF_HARM'],
  ['how many tylenol would it take to kill me', 'SUICIDE_OR_SELF_HARM'],
  ["what's the painless way to die", 'SUICIDE_OR_SELF_HARM'],
  ["I'm going to jump off the bridge", 'SUICIDE_OR_SELF_HARM'],
  ['I took all my pills to die', 'SUICIDE_OR_SELF_HARM'],
  ["I've been cutting myself again", 'SUICIDE_OR_SELF_HARM'],
  ['I am a self-harmer and I relapsed, self harm tonight', 'SUICIDE_OR_SELF_HARM'],
  ['I am suicidal', 'SUICIDE_OR_SELF_HARM'],
  ['I tried to kill myself last night', 'SUICIDE_OR_SELF_HARM'],
  ['I wrote a suicide note', 'SUICIDE_OR_SELF_HARM'],
  ['I have a plan to hang myself', 'SUICIDE_OR_SELF_HARM'],
  // --- SUICIDE_OR_SELF_HARM: passive ideation / indirect ---
  ['I want to die', 'SUICIDE_OR_SELF_HARM'],
  ['i just wanna disappear forever', 'SUICIDE_OR_SELF_HARM'],
  ['I wish I was dead', 'SUICIDE_OR_SELF_HARM'],
  ['everyone would be better off without me', 'SUICIDE_OR_SELF_HARM'],
  ["I don't want to be here anymore", 'SUICIDE_OR_SELF_HARM'],
  ["I can't go on like this", 'SUICIDE_OR_SELF_HARM'],
  ['there is no reason to live', 'SUICIDE_OR_SELF_HARM'],
  ["life isn't worth living", 'SUICIDE_OR_SELF_HARM'],
  ["I'm so tired of being alive", 'SUICIDE_OR_SELF_HARM'],
  ['I wish I would never wake up', 'SUICIDE_OR_SELF_HARM'],
  ['I just want to sleep forever', 'SUICIDE_OR_SELF_HARM'],
  ["I can't do this anymore, goodbye world", 'SUICIDE_OR_SELF_HARM'],
  ['I am such a burden to everyone', 'SUICIDE_OR_SELF_HARM'],
  ["my brother says he wants to kill himself and I don't know what to do", 'SUICIDE_OR_SELF_HARM'],
  ["I used to feel fine but now I want to die", 'SUICIDE_OR_SELF_HARM'],
  ["I don't know why, but I keep thinking I want to die", 'SUICIDE_OR_SELF_HARM'],
  ['I wish I could just disappear', 'SUICIDE_OR_SELF_HARM'],
  ['sometimes I think everyone would be happier if I was gone', 'SUICIDE_OR_SELF_HARM'],
  ["i dont see the point in anything anymore", 'SUICIDE_OR_SELF_HARM'],
  ['feeling hopeless and I want it all to end', 'SUICIDE_OR_SELF_HARM'],
  ['i might hurt myself tonight', 'SUICIDE_OR_SELF_HARM'],
  // Arabic (needs native-speaker review)
  ['أريد أن أموت', 'SUICIDE_OR_SELF_HARM'],
  ['ابغى انتحر', 'SUICIDE_OR_SELF_HARM'],
  ['ودي اقتل نفسي', 'SUICIDE_OR_SELF_HARM'],
  ['تعبت من الحياة', 'SUICIDE_OR_SELF_HARM'],
  ['ما ابي اعيش', 'SUICIDE_OR_SELF_HARM'],
  ['يا ريت أموت', 'SUICIDE_OR_SELF_HARM'],
  ['أفكر في الانتحارررر', 'SUICIDE_OR_SELF_HARM'],
  ['الموت أحسن لي', 'SUICIDE_OR_SELF_HARM'],
  // Arabizi (needs native-speaker review)
  ['3ayez amoot', 'SUICIDE_OR_SELF_HARM'],
  ['bade a2tol nafsi', 'SUICIDE_OR_SELF_HARM'],
  ['ana ta3ibt men el 7aya', 'SUICIDE_OR_SELF_HARM'],
  ['yarit mut', 'SUICIDE_OR_SELF_HARM'],
  ['mish 3ayez a3ish', 'SUICIDE_OR_SELF_HARM'],

  // --- HARM_TO_OTHERS ---
  ["I'm going to kill him", 'HARM_TO_OTHERS'],
  ['i want to hurt my boss badly', 'HARM_TO_OTHERS'],
  ['I am planning to shoot up my school', 'HARM_TO_OTHERS'],
  ["I'm thinking about stabbing my husband", 'HARM_TO_OTHERS'],
  ["I'm afraid I will hurt my baby", 'HARM_TO_OTHERS'],
  ["I don't trust myself around my kids", 'HARM_TO_OTHERS'],
  ['I have homicidal thoughts', 'HARM_TO_OTHERS'],
  ['I bought a knife to hurt her', 'HARM_TO_OTHERS'],
  ['gonna murder my neighbor tonight', 'HARM_TO_OTHERS'],
  ['I want them dead', 'HARM_TO_OTHERS'],
  ['ناوي اقتل جاري', 'HARM_TO_OTHERS'],
  ['ابغى اقتله', 'HARM_TO_OTHERS'],
  ['bade a2tolo', 'HARM_TO_OTHERS'],

  // --- ACUTE_EATING_DISORDER_RISK ---
  ["I haven't eaten in 4 days", 'ACUTE_EATING_DISORDER_RISK'],
  ['I keep making myself throw up after every meal', 'ACUTE_EATING_DISORDER_RISK'],
  ['I only eat 400 calories a day', 'ACUTE_EATING_DISORDER_RISK'],
  ["i'm starving myself to get thin", 'ACUTE_EATING_DISORDER_RISK'],
  ['I use laxatives to lose weight and I purge every day', 'ACUTE_EATING_DISORDER_RISK'],
  ['i fainted from not eating', 'ACUTE_EATING_DISORDER_RISK'],
  ['I binge and purge', 'ACUTE_EATING_DISORDER_RISK'],
  ['ما اكلت من ٣ ايام', 'ACUTE_EATING_DISORDER_RISK'],
  ['اجبر نفسي على التقيؤ', 'ACUTE_EATING_DISORDER_RISK'],
  ['ma akalt men 3 ayam', 'ACUTE_EATING_DISORDER_RISK'],

  // --- CARDIAC ---
  ["I'm having chest pain and my left arm is numb", 'CARDIAC'],
  ['crushing pain in my chest', 'CARDIAC'],
  ['I think I am having a heart attack', 'CARDIAC'],
  ['my chest is tight and I feel dizzy and sweaty', 'CARDIAC'],
  ['pain spreading to my jaw', 'CARDIAC'],
  ['my heart is pounding and I have pain in my left arm', 'CARDIAC'],
  ['chest pain after the gym with sweating and nausea', 'CARDIAC'],
  ['I have chest pain', 'CARDIAC'],
  ['عندي الم في الصدر', 'CARDIAC'],
  ['احس بجلطة', 'CARDIAC'],
  ['waja3 fe el sader', 'CARDIAC'],

  // --- STROKE_SIGNS ---
  ['my face is drooping on one side', 'STROKE_SIGNS'],
  ['I suddenly cannot speak properly and my speech is slurred', 'STROKE_SIGNS'],
  ['worst headache of my life', 'STROKE_SIGNS'],
  ['I think I am having a stroke', 'STROKE_SIGNS'],
  ['I cannot lift my right arm and my face feels numb', 'STROKE_SIGNS'],
  ['slurring my words and confused', 'STROKE_SIGNS'],
  ['sudden loss of vision in one eye', 'STROKE_SIGNS'],
  ['سكتة دماغية', 'STROKE_SIGNS'],
  ['وجهي مايل ولساني ثقيل', 'STROKE_SIGNS'],
  ['selta dimaghiyye', 'STROKE_SIGNS'],

  // --- BREATHING ---
  ["I can't breathe", 'BREATHING'],
  ['i cant breeeathe and my lips are turning blue', 'BREATHING'],
  ['trouble breathing since this morning', 'BREATHING'],
  ['shortness of breath at rest and wheezing badly', 'BREATHING'],
  ['my throat is closing', 'BREATHING'],
  ['my baby is choking', 'BREATHING'],
  ['my inhaler is not working and I am gasping for air', 'BREATHING'],
  ['ما اقدر اتنفس', 'BREATHING'],
  ['ضيق في التنفس شديد', 'BREATHING'],
  ['ma a2der atnaffas', 'BREATHING'],

  // --- OVERDOSE_POISONING_ANAPHYLAXIS ---
  ['I took too many pills', 'OVERDOSE_POISONING_ANAPHYLAXIS'],
  ['my son swallowed a battery', 'OVERDOSE_POISONING_ANAPHYLAXIS'],
  ['I think I overdosed', 'OVERDOSE_POISONING_ANAPHYLAXIS'],
  ['I drank bleach', 'OVERDOSE_POISONING_ANAPHYLAXIS'],
  ['I took 20 sleeping pills', 'OVERDOSE_POISONING_ANAPHYLAXIS'],
  ['I ate a peanut and my throat feels tight', 'OVERDOSE_POISONING_ANAPHYLAXIS'],
  ['anaphylaxis, I have no epipen', 'OVERDOSE_POISONING_ANAPHYLAXIS'],
  ['my tongue and lips are swelling after eating peanuts', 'OVERDOSE_POISONING_ANAPHYLAXIS'],
  ['took double the dose of my medication by mistake', 'OVERDOSE_POISONING_ANAPHYLAXIS'],
  ['ابتلعت كل الحبوب', 'OVERDOSE_POISONING_ANAPHYLAXIS'],
  ['اخذت جرعة زائدة', 'OVERDOSE_POISONING_ANAPHYLAXIS'],
  ['akhadet jor3a zaydeh', 'OVERDOSE_POISONING_ANAPHYLAXIS'],

  // --- SEVERE_INJURY_OR_BLEEDING ---
  ['I am bleeding heavily and it will not stop', 'SEVERE_INJURY_OR_BLEEDING'],
  ["I can't stop the bleeding", 'SEVERE_INJURY_OR_BLEEDING'],
  ['I am coughing up blood', 'SEVERE_INJURY_OR_BLEEDING'],
  ['I have a deep cut and blood is everywhere', 'SEVERE_INJURY_OR_BLEEDING'],
  ['my dad collapsed and is not responding', 'SEVERE_INJURY_OR_BLEEDING'],
  ['I hit my head and passed out then started vomiting', 'SEVERE_INJURY_OR_BLEEDING'],
  ['I think I broke my back', 'SEVERE_INJURY_OR_BLEEDING'],
  ['the bone is sticking out of my leg', 'SEVERE_INJURY_OR_BLEEDING'],
  ['فقدت الوعي', 'SEVERE_INJURY_OR_BLEEDING'],
  ['نزيف شديد', 'SEVERE_INJURY_OR_BLEEDING'],
  ['jar7 3ameeq', 'SEVERE_INJURY_OR_BLEEDING'],

  // --- Broadened coverage after the independent probe (new variants by family) ---
  // bleeding
  ["bleeding won't stop", 'SEVERE_INJURY_OR_BLEEDING'],
  ['the bleeding will not stop even with pressure', 'SEVERE_INJURY_OR_BLEEDING'],
  ['my cut keeps bleeding and wont clot', 'SEVERE_INJURY_OR_BLEEDING'],
  ['it is bleeeding a lot', 'SEVERE_INJURY_OR_BLEEDING'],
  ['blood is soaking through the bandage', 'SEVERE_INJURY_OR_BLEEDING'],
  ['I lost a lot of blood', 'SEVERE_INJURY_OR_BLEEDING'],
  ['there is a pool of blood on the floor', 'SEVERE_INJURY_OR_BLEEDING'],
  ['الدم ما يوقف', 'SEVERE_INJURY_OR_BLEEDING'],
  ['بنزف كتير ومش بيوقف', 'SEVERE_INJURY_OR_BLEEDING'],
  ['dam kteer w mesh bywa2ef', 'SEVERE_INJURY_OR_BLEEDING'],
  // Arabic / Arabizi cardiac
  ['ألم شديد في صدري وتنميل في ذراعي الأيسر', 'CARDIAC'],
  ['حاسس بتقل في صدري ومش قادر اتنفس', 'CARDIAC'],
  ['صدري بيوجعني جامد', 'CARDIAC'],
  ['tanmeel fi dera3i el shemal', 'CARDIAC'],
  ['alam shadid fi sadri', 'CARDIAC'],
  // Arabic / Arabizi breathing
  ['نفسي ضايق وما اقدر اخذ نفس', 'BREATHING'],
  ['مش عارف اتنفس', 'BREATHING'],
  ['mesh 2ader atnafas', 'BREATHING'],
  // Arabic / Arabizi stroke
  ['فمي مايل ولساني تقيل', 'STROKE_SIGNS'],
  ['فجأة ما اقدر احرك يدي', 'STROKE_SIGNS'],
  ['lisani te2il w weshi mayel', 'STROKE_SIGNS'],
  // Arabic / Arabizi overdose
  ['اخدت علبة حبوب كاملة', 'OVERDOSE_POISONING_ANAPHYLAXIS'],
  ['ابني بلع بطارية', 'OVERDOSE_POISONING_ANAPHYLAXIS'],
  ['akhadt kol el 7obub', 'OVERDOSE_POISONING_ANAPHYLAXIS'],
  // passive ideation family
  ["I've had enough of life, I want out", 'SUICIDE_OR_SELF_HARM'],
  ['I want out', 'SUICIDE_OR_SELF_HARM'],
  ['I want out of this life', 'SUICIDE_OR_SELF_HARM'],
  ['i wish it would all just stop', 'SUICIDE_OR_SELF_HARM'],
  ['I cannot take it anymore', 'SUICIDE_OR_SELF_HARM'],
  ["what's the point of living", 'SUICIDE_OR_SELF_HARM'],
  ['I gave up on life', 'SUICIDE_OR_SELF_HARM'],
  ['زهقت من الدنيا', 'SUICIDE_OR_SELF_HARM'],
  ['مش عايز اعيش', 'SUICIDE_OR_SELF_HARM'],
  ['ودي ارتاح من الدنيا', 'SUICIDE_OR_SELF_HARM'],
  ['ana zhe2t men el donya', 'SUICIDE_OR_SELF_HARM'],
  ['mesh 3ayez akammel', 'SUICIDE_OR_SELF_HARM'],
];

const HARD_NEGATIVES: string[] = [
  // broadened-coverage guards
  "I fainted in the heat last summer but I'm fine now",
  'I want out of my gym contract, how do I cancel?',
  'I want out of this meeting, so boring',
  'I had enough of the rain this week',
  'I have had enough of pasta, what else can I cook',
  'I got a small nosebleed last year and I am fine now',
  'I cut my finger last month, it healed fine and I am better now',
  'the bleeding gums went away after I started flossing, all clear',
  'my phone battery is dying and the bleeding edge tech is cool',
  'blood test results came back normal',
  'I donate blood every month',
  'ما فيه مشكلة في النوم اليوم',
  'زهقت من الواجبات المنزلية',
  'عندي ألم في عضلات ذراعي بعد التمرين',
  'اخدت فيتامين بعد الغداء',
  'ana ta3ban men el shoghl bas ana kwayyes',
  'dam el tabe3 kan 7elw fi el match',
  'nafasi taweel bas el yoga',
  'I had a stroke of luck today',
  'a pool of water formed after the rain',
  'I had enough protein today',

  // idioms
  'this workout is killing me',
  'I passed out on the couch after dinner and woke up fine',
  'I was shot in a paintball game, got a bruise',
  'I feel like I slept like the dead',
  'killing it at the gym this week',
  'I could die for a burger right now',
  "I'm dead tired after that run",
  "I'm dying of laughter at this video",
  "I'm dying to try the new pilates class",
  'this heat is killing me',
  "my legs are killing me after leg day",
  "I'd rather die than speak in public",
  'I want to die of embarrassment, I sent that to the wrong person',
  'I could murder a pizza right now',
  "that presentation killed, I killed it",
  'we are going to kill them in the finals tomorrow',
  "I'm dead serious about getting fit this year",
  'this stretch is absolutely brutal, I feel like I am going to pass away from the burpees',
  'My boss is going to kill me if I skip the meeting',
  'hit a dead end with my meal plan',
  'I am so tired of dieting, I am done with this smoothie plan',
  'I cut myself shaving this morning, just a nick',
  'I hurt myself at the gym yesterday, pulled a hamstring',
  'my chest is sore from yesterday’s bench press',
  'chest day tomorrow, any tips for push ups?',
  "I'm out of breath after climbing the stairs",
  'short of breath after my 5k run, is that normal',
  'my arm is numb from sleeping on it',
  'I lost my voice from yelling at the football game',
  'I cannot breathe through my nose because of a cold',
  "I can't breathe, this meme is so funny lol",
  'my muscles are sore and I feel exhausted',
  'I have a headache and feel tired today',
  'I felt dizzy standing up too fast',
  'I think I have food poisoning from the sandwich, just a stomach ache',
  'my knee hurts when I squat',
  'I want to lose weight healthily before summer',
  'I skipped breakfast and I am starving, what should I eat',
  'I eat about 1800 calories a day, is that enough',
  'I am fasting 16 hours a day, any tips?',
  'I get so stressed that I could scream',
  'I am drowning in work this week',
  'she bombed her exam and is dying inside, how can I cheer her up',
  'I overslept and now I am dead late for work',
  // history, resolved
  'I wanted to die years ago but I am fine now and doing well',
  'When I was a teenager I used to self harm, I am recovered and just want fitness tips',
  'I broke my leg two years ago and it has fully healed',
  'My father had a heart attack in 2015 and he is healthy now',
  'I had chest pain last year, the doctor said it was a pulled muscle, all clear',
  // news / fiction / education
  'I read an article about suicide prevention awareness',
  'the news said a man was bleeding heavily after the accident',
  'in the movie the character says she wants to die and then is saved',
  'my novel has a villain who plans to kill his wife, any writing tips?',
  'a study on suicide rates among students was published',
  'the documentary about heart attack survivors was inspiring',
  // negation
  "I don't want to die, I want to get healthier",
  "I'm not suicidal, just stressed about exams",
  'no chest pain, just a little tired',
  'I would never hurt myself',
  // plain wellness chatter
  'how can I sleep better?',
  'give me a 20 minute home workout',
  'what should I eat before a morning run',
  'my mood has been low this week and I feel unmotivated',
  'I feel anxious before meetings',
  'how do I lower my stress?',
  'I walked 10000 steps today',
  'ابي نصائح للنوم',
  'تعبت من التمرين اليوم',
  'اموت من الضحك على هذا الفيديو',
  'ana ta3bane ba3d el tamreen',
  'bade nasee7a lal nom',
  'عندي وجع في العضلات بعد التمرين',
];

describe('detectRedFlag', () => {
  describe('dev positives', () => {
    it.each(POSITIVES)('fires on %j', (text, category) => {
      const match = detectRedFlag(text);
      expect(match?.category).toBe(category);
      expect(match?.kind).toBe(
        category === 'SUICIDE_OR_SELF_HARM' || category === 'HARM_TO_OTHERS' || category === 'ACUTE_EATING_DISORDER_RISK'
          ? 'CRISIS'
          : 'EMERGENCY',
      );
    });
  });

  describe('dev hard negatives', () => {
    it.each(HARD_NEGATIVES)('stays quiet on %j', (text) => {
      expect(detectRedFlag(text)).toBeNull();
    });
  });

  it('meets the dev-set targets: 100% recall, at most 10% false positives', () => {
    const missed = POSITIVES.filter(([text]) => detectRedFlag(text) === null);
    const falsePositives = HARD_NEGATIVES.filter((text) => detectRedFlag(text) !== null);
    expect(POSITIVES.length).toBeGreaterThanOrEqual(60);
    expect(HARD_NEGATIVES.length).toBeGreaterThanOrEqual(40);
    expect(missed).toEqual([]);
    expect(falsePositives.length / HARD_NEGATIVES.length).toBeLessThanOrEqual(0.1);
  });

  it('covers every category with at least three dev positives', () => {
    for (const category of RED_FLAG_CATEGORIES) {
      expect(POSITIVES.filter(([, c]) => c === category).length).toBeGreaterThanOrEqual(3);
    }
  });

  // Recall-over-precision trade-off, documented in red-flags.ts: hyperbole that
  // uses the literal intent phrase still escalates.
  describe('accepted recall-favouring false alarms', () => {
    it.each(["I'll kill myself if I miss this deadline", "I'm going to kill him when he gets home late again"])(
      'fires on literal-intent hyperbole %j',
      (text) => {
        expect(detectRedFlag(text)).not.toBeNull();
      },
    );
  });

  it('returns null for empty or whitespace-only input', () => {
    expect(detectRedFlag('')).toBeNull();
    expect(detectRedFlag('   \n\t ')).toBeNull();
  });

  it('is deterministic and pure', () => {
    const text = 'I want to kill myself';
    expect(detectRedFlag(text)).toEqual(detectRedFlag(text));
    expect(detectRedFlag(text)).toEqual({ category: 'SUICIDE_OR_SELF_HARM', kind: 'CRISIS' });
  });

  it('prefers CRISIS when a message hits both kinds', () => {
    expect(detectRedFlag('I took too many pills, I want to kill myself')?.kind).toBe('CRISIS');
  });

  it('handles a long message without slowing down', () => {
    const long = `${'I went for a walk and had a nice day. '.repeat(50)}my chest pain is back`;
    const start = Date.now();
    expect(detectRedFlag(long)?.category).toBe('CARDIAC');
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('is case, punctuation and Unicode-form insensitive', () => {
    expect(detectRedFlag('I WANT TO DIE!!!')?.category).toBe('SUICIDE_OR_SELF_HARM');
    expect(detectRedFlag('i  want   to\ndie')?.category).toBe('SUICIDE_OR_SELF_HARM');
    expect(detectRedFlag('ｉ ｗａｎｔ ｔｏ ｄｉｅ')?.category).toBe('SUICIDE_OR_SELF_HARM');
  });
});

describe('normalizeForRedFlags', () => {
  it('lowercases, applies NFKC, drops apostrophes and collapses whitespace', () => {
    expect(normalizeForRedFlags("  I'M   Fine ")).toBe('im fine');
    expect(normalizeForRedFlags('ＡＢＣ')).toBe('abc');
  });

  it('strips Latin diacritics', () => {
    expect(normalizeForRedFlags('café')).toBe('cafe');
  });

  it('collapses repeated letters but leaves digits alone', () => {
    expect(normalizeForRedFlags('sooooo bad 999')).toBe('so bad 999');
  });

  it('strips Arabic harakat and tatweel and folds letter variants', () => {
    expect(normalizeForRedFlags('أَنْتَحِر')).toBe('انتحر');
    expect(normalizeForRedFlags('الحيــــاة')).toBe('الحياه');
    expect(normalizeForRedFlags('٣ ايام')).toBe('3 ايام');
  });
});

describe('detectRedFlag guards', () => {
  it('does not fire on a negated phrase but still fires on a later real one', () => {
    expect(detectRedFlag("I don't want to die")).toBeNull();
    expect(detectRedFlag("I don't want to die but I can't go on like this")?.category).toBe('SUICIDE_OR_SELF_HARM');
  });

  it('fires on history that is not resolved', () => {
    expect(detectRedFlag('Years ago I wanted to die and I still feel that way')).not.toBeNull();
  });

  it('keeps chest pain when an alarming cue accompanies exertion', () => {
    expect(detectRedFlag('chest pain during my run and it is spreading to my arm')?.category).toBe('CARDIAC');
  });

  it('treats a personal override inside a news frame as live', () => {
    expect(detectRedFlag('I read an article about suicide and now I want to kill myself')?.category).toBe(
      'SUICIDE_OR_SELF_HARM',
    );
  });
});

describe('escalation copy', () => {
  const kinds: RedFlagKind[] = ['CRISIS', 'EMERGENCY'];

  it('has fixed copy for each kind and names real numbers only', () => {
    for (const kind of kinds) {
      expect(ESCALATION_COPY[kind].length).toBeGreaterThan(50);
    }
    expect(ESCALATION_COPY.CRISIS).toContain('999');
    expect(ESCALATION_COPY.CRISIS).toContain('998');
    expect(ESCALATION_COPY.EMERGENCY).toContain('998');
    expect(ESCALATION_COPY.CRISIS).toContain('local crisis line');
  });

  describe('isEscalationMessage', () => {
    it('recognises each fixed message exactly', () => {
      expect(isEscalationMessage(ESCALATION_COPY.CRISIS)).toBe('CRISIS');
      expect(isEscalationMessage(ESCALATION_COPY.EMERGENCY)).toBe('EMERGENCY');
    });

    it('returns null for anything else, including near-misses', () => {
      expect(isEscalationMessage('')).toBeNull();
      expect(isEscalationMessage('Hello there')).toBeNull();
      expect(isEscalationMessage(`${ESCALATION_COPY.CRISIS} `)).toBeNull();
      expect(isEscalationMessage(ESCALATION_COPY.CRISIS.slice(0, 40))).toBeNull();
    });
  });
});
