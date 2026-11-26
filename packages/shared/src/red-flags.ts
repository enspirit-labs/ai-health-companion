/**
 * Deterministic red-flag detector.
 *
 * Runs on every user chat message BEFORE the model is called. It is pure
 * (string in, match-or-null out), has no I/O and no LLM, so the same text
 * always yields the same answer and it can be unit-tested exhaustively.
 *
 * Two kinds of match:
 *  - CRISIS     — needs human support (self-harm, harm to others, acute
 *                 eating-disorder behaviour).
 *  - EMERGENCY  — needs emergency services (cardiac, stroke, breathing,
 *                 overdose / poisoning / anaphylaxis, severe injury).
 *
 * RECALL VS PRECISION. This is safety-critical code: a false alarm costs the
 * user one fixed message, a miss can cost a life. Where the two conflict we
 * favour recall. Concretely that means:
 *  - First-person hyperbole that uses the literal words ("I'll kill myself if
 *    I miss this deadline", "I'm going to kill him when he gets home") DOES
 *    fire. We only suppress idioms that do not contain the literal intent
 *    phrase ("this workout is killing me", "dead tired", "dying of laughter").
 *  - Negation and "resolved history" guards only suppress when the cue is
 *    unambiguous (see NEGATION / isResolvedHistory); when in doubt, fire.
 *  - Third-party concern ("my friend says he wants to die") fires; text about
 *    a named film/news item does not (see isThirdPartyFrame).
 *
 * Arabic and Arabizi (romanised Arabic) patterns are marked
 * "needs native-speaker review" — they were written without a native-speaker
 * pass and are certain to miss dialect variants.
 */

export const RED_FLAG_CATEGORIES = [
  'SUICIDE_OR_SELF_HARM',
  'HARM_TO_OTHERS',
  'ACUTE_EATING_DISORDER_RISK',
  'CARDIAC',
  'STROKE_SIGNS',
  'BREATHING',
  'OVERDOSE_POISONING_ANAPHYLAXIS',
  'SEVERE_INJURY_OR_BLEEDING',
] as const;
export type RedFlagCategory = (typeof RED_FLAG_CATEGORIES)[number];

export const RED_FLAG_KINDS = ['CRISIS', 'EMERGENCY'] as const;
export type RedFlagKind = (typeof RED_FLAG_KINDS)[number];

export interface RedFlagMatch {
  category: RedFlagCategory;
  kind: RedFlagKind;
}

const CATEGORY_KIND: Record<RedFlagCategory, RedFlagKind> = {
  SUICIDE_OR_SELF_HARM: 'CRISIS',
  HARM_TO_OTHERS: 'CRISIS',
  ACUTE_EATING_DISORDER_RISK: 'CRISIS',
  CARDIAC: 'EMERGENCY',
  STROKE_SIGNS: 'EMERGENCY',
  BREATHING: 'EMERGENCY',
  OVERDOSE_POISONING_ANAPHYLAXIS: 'EMERGENCY',
  SEVERE_INJURY_OR_BLEEDING: 'EMERGENCY',
};

/** The kind (CRISIS or EMERGENCY) a category escalates as. Single source of truth for rules and the classifier. */
export function kindForRedFlagCategory(category: RedFlagCategory): RedFlagKind {
  return CATEGORY_KIND[category];
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/** Folds Arabic letter variants so patterns can be written in plain spelling. */
function foldArabicLetters(s: string): string {
  return s
    .replace(/ى/g, 'ي') // alef maqsura -> ya
    .replace(/ة/g, 'ه') // ta marbuta -> ha
    .replace(/[ک]/g, 'ك') // Persian kaf -> kaf
    .replace(/[ی]/g, 'ي') // Persian ya -> ya
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Strips diacritics/harakat (all combining marks) and tatweel, folds Arabic letters. */
function foldLetters(s: string): string {
  const stripped = s.normalize('NFD').replace(/\p{M}/gu, '').replace(/ـ/g, '');
  // Collapse any run of the same letter to one ("sooo", "kill", "bleeeding").
  // Patterns go through the same fold (see rx), so "kill" matches "kil", "kiilll".
  return foldArabicLetters(stripped).replace(/(\p{L})\1+/gu, '$1');
}

/**
 * Lowercase, NFKC, strip diacritics/tatweel/harakat, drop apostrophes, turn
 * other punctuation into spaces, collapse repeated letters and whitespace.
 * Exported so tests (and any future consumer) can see exactly what is matched.
 */
export function normalizeForRedFlags(text: string): string {
  const s = text.normalize('NFKC').toLowerCase().replace(/['’‘`´ʼ]/g, '');
  return foldLetters(s)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compiles a pattern written in natural spelling against normalised text: the
 * letter runs in the source go through the same fold as the input (escapes like
 * `\b` are left alone). Spaces are literal single spaces because input
 * whitespace is already collapsed.
 */
function rx(source: string): RegExp {
  const folded = source.replace(/\\.|\p{L}+/gu, (token) => (token.startsWith('\\') ? token : foldLetters(token)));
  return new RegExp(folded, 'gu');
}

// A "word" in normalised text (works for Latin and Arabic alike).
const W = '[^ ]+';

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

type Guard = 'none' | 'exertion' | 'laughter' | 'congestion' | 'breath' | 'sports';

interface Rule {
  category: RedFlagCategory;
  re: RegExp;
  guard: Guard;
}

function rules(category: RedFlagCategory, guard: Guard, sources: string[]): Rule[] {
  return sources.map((source) => ({ category, re: rx(source), guard }));
}

// Pieces shared by several patterns.
const SELF = '(?:myself|my life|my own life|my self)';
const SELF_ACT =
  '(?:kill|hurt|harm|cut|unalive|end|off|hang|drown|shoot|stab|poison|burn|overdose|suffocate|electrocute|starve)(?:ing)?';
const INTENT =
  '(?:want|wanna|going|gonna|about|plan\\w*|think\\w*|tempted|feel\\w* like|urge\\w*|need|ready|decided|will|ill|might|may|should|have to|how to|ways? to|trying|tried|attempt\\w*|thought of|thoughts of|cant stop thinking)';
const HARM_TARGET =
  '(?:him|her|them|my (?:wife|husband|ex|boss|dad|father|mom|mother|brother|sister|son|daughter|kid|kids|child|children|baby|neighbou?rs?|roommate|coworkers?|teacher|partner|girlfriend|boyfriend|parents|family|stepdad|stepmom|mother in law|father in law|landlord|friends?|classmates?)|(?:some|any|every)(?:one|body)|people|those people|these people|that (?:guy|girl|man|woman|person)|the (?:kids|man|woman|guy|girl|neighbou?rs))';

// --- CRISIS: suicide / self-harm (English) ---------------------------------
const SUICIDE_EN = rules('SUICIDE_OR_SELF_HARM', 'none', [
  // explicit intent / plan / method toward oneself
  `${INTENT}(?: to| about| of)?(?: ${W}){0,2} ${SELF_ACT} ${SELF}`,
  '\\bkill myself\\b',
  '\\bkill my ?self\\b',
  '\\bend myself\\b',
  '\\bunaliv\\w*',
  '\\bkms\\b',
  '\\bsewer ?slide\\b',
  `(?:keep|kept|started|been|am|im) (?:cutting|burning|harming) ${SELF}`,
  '\\bself ?harm\\w*',
  '\\b(?:slit|slash) my wrists?\\b',
  '\\bcut my wrists?\\b',
  '\\bcut my (?:arms?|thighs?|legs?|skin) (?:again|on purpose|open|deliberately)',
  '\\bhurt(?:ing)? myself (?:on purpose|deliberately|intentionally|again and again)',
  `(?:want|going|gonna|thinking|about|plan\\w*|tempted|feel like)(?: to| about| of)?(?: ${W}){0,2} jump(?:ing)? (?:off|from|in front of) (?:a |the )?(?:bridge|building|roof|balcony|cliff|train|tower)`,
  `how many (?:pills|tablets|paracetamol|tylenol|aspirin|ibuprofen|sleeping pills|meds)(?: ${W}){0,4} (?:kill|die|overdose|lethal|fatal)`,
  '(?:painless|easy|easiest|quickest|fastest|best|least painful) (?:way|ways|method) to (?:die|kill myself|end it|commit suicide)',
  '\\bways to die\\b',
  '\\bhow to die\\b',
  `(?:took|swallowed|taking|taken|take) (?:${W} ){0,5}(?:pills|tablets|meds|medication)(?: ${W}){0,4} (?:to die|to end it|to kill myself|on purpose|to sleep forever|to not wake up)`,
  // passive ideation
  `(?:want(?:ed)? to|wanna|wana|wish(?:ed)? to|hope to) (?:just )?(?:die|be dead|disappear forever|disappear for good|stop existing|stop living|not exist|not be here|not be alive|not wake up|never wake up|sleep forever)(?! (?:of|from) (?:embarrassment|laughter|laughing|shame|cringe|boredom|cuteness|happiness|joy|heat))`,
  '\\bwish (?:i|that i) (?:was|were|could|would|had) (?:just )?(?:dead(?! (?:tired|serious|slow|wrong|end|set|on|cold|ahead))|die\\b|not (?:be )?(?:here|alive|born)|never (?:been )?born|never wake|not exist|disappear forever|disappear for good)',
  '\\bbetter off (?:dead|without me)',
  '\\bwish (?:i|that i) could (?:just )?(?:disappear|vanish|not exist)\\b',
  '\\bwould be (?:happier|better off) if i (?:was|were) (?:gone|dead|not here)',
  '\\b(?:dont|do not|cant) see (?:the )?point (?:in|of) (?:anything|living|life|going on|continuing)',
  '\\bwant (?:it all|everything|it) to (?:end|stop|be over)\\b',
  '\\bnot (?:be )?alive anymore',
  '\\bburden to (?:everyone|everybody|my family|them|others|all)',
  '\\b(?:such|just) a burden\\b',
  '\\bno reason to (?:live|go on|keep going|be alive|exist)',
  '\\bnothing to live for',
  '\\bno point (?:in )?(?:living|going on|life|anymore|being alive|continuing)',
  '\\blife (?:is|isnt|is not|aint) worth (?:living|it)',
  '\\bnot worth living',
  '\\bdont want to (?:live|be alive|exist|wake up|go on|do this anymore|keep going|continue)',
  '\\bdont want to be here(?: anymore| any more|$)',
  '\\b(?:cant|cannot|can not) (?:go on|keep going|keep living|live like this|live anymore)(?: anymore| like this|$)',
  '\\b(?:cant|cannot|can not) (?:do this|take this|take it|take any more) anymore',
  '\\b(?:tired|sick) of (?:living|being alive|life)\\b',
  '\\bdone with (?:life|living)\\b',
  '\\b(?:ready|time) to die\\b',
  '\\bend it all\\b',
  '\\bending it all\\b',
  '\\bwont (?:be|live) (?:around|here|alive) (?:much )?(?:longer|anymore|after|tomorrow)',
  '\\bgoodbye (?:cruel )?world\\b',
  '\\bsaying goodbye (?:to everyone|forever)',
  '\\b(?:suicide|goodbye|farewell) (?:note|letter)\\b',
  '\\bgiving away (?:all )?my (?:things|stuff|belongings|possessions)',
  '\\bput my affairs in order\\b',
  '\\bsuicidal\\b',
  `(?:commit|committing|attempt\\w*|plan\\w*|think\\w*|thought\\w*|consider\\w*|contemplat\\w*)(?: of| about| to)?(?: commit(?:ting)?)? suicide\\b`,
  '\\bsuicide (?:plan|pact|hotline)\\b',
  '\\bmy suicide\\b',
  // a third party the user is worried about (recall: still escalate)
  `\\bmy (?:friend|brother|sister|son|daughter|mom|mother|dad|father|husband|wife|partner|boyfriend|girlfriend|roommate|classmate|coworker) (?:says|said|told me|texted me|wants|wanted|is going|is planning|plans|tried|attempted|threatened)(?: ${W}){0,3} (?:to die|to kill (?:himself|herself|themselves)|to end (?:his|her|their) life|suicide|to hurt (?:himself|herself|themselves))`,
]);

// --- CRISIS: suicide / self-harm (Arabic) — needs native-speaker review -----
const SUICIDE_AR = rules('SUICIDE_OR_SELF_HARM', 'none', [
  // want to die / kill myself
  `(?:ابي|ابغي|اريد|بدي|عايز|عايزه|عاوز|عاوزه|ودي|نفسي|ابغا|حابب|حاب|مبسوط) (?:ان )?(?:انتحر|اموت(?! (?:من|ضحك))|اقتل نفسي|اقتل حالي|اخلص علي نفسي|اخلص نفسي|انهي حياتي|اذي نفسي|ايذاء نفسي|اجرح نفسي|اشنق نفسي|اذبح نفسي)`,
  '(?:بنتحر|رح انتحر|راح انتحر|سانتحر|ناوي انتحر|ناويه انتحر|اقتل نفسي|اقتل حالي|اشنق نفسي|اذبح نفسي)',
  '(?:افكر|بفكر|افكاري|تفكير) (?:في |ب)?(?:ال)?انتحار',
  'افكار انتحاريه',
  // passive ideation
  '(?:ما|مو|مش|لا) (?:ابي|ابغي|ابغا|اريد|عاد ابي|عاد ابغي|عاد اريد|عندي رغبه ان) (?:اعيش|عيش|اكمل حياتي|استمر)',
  '(?:ما|مو) (?:عندي|فيه|في) (?:سبب|شي) (?:اعيش|للعيش|للحياه)',
  '(?:تعبت|زهقت|مليت|كرهت) (?:من )?(?:ال)?حياه',
  '(?:الموت|اموت) (?:احسن|افضل)(?: لي)?',
  '(?:يا ريت|ياريت|يا ليتني|ياليتني|ليتني|يا ليت) (?:اموت|مت|متت|مت قبل)',
  '(?:اتمني|اتمنا|نفسي) (?:ان )?(?:الموت|اموت)(?! (?:من|ضحك))',
  '(?:احسن|افضل) (?:لو|ان) (?:اموت|مت|اختفي)',
  'ما اقدر (?:اكمل|استمر|اتحمل) (?:اكثر|بعد)',
  '(?:حياتي|الحياه) (?:ما لها|ما فيها|بلا) (?:معني|قيمه)',
]);

// --- CRISIS: suicide / self-harm (Arabizi) — needs native-speaker review ----
const SUICIDE_ARABIZI = rules('SUICIDE_OR_SELF_HARM', 'none', [
  '(?:bade|badi|bdi|abgha|abgi|abi|ab[ey]|3ayez|3ayz|3ayza|3awz|nefsi|nifsi|baddi|bedy) (?:an |ann?i )?(?:amoot|amout|amut|moot|a2tol nafsi|aqtol nafsi|a?ntaher|a?nte7ar|ante7er|anta7er|akhalles? 7ayati)(?! (?:min|men|mn|dahk|7ar|jo3|ta3ab))',
  '(?:ante7ar|inte7ar|anta7ar|ente7ar)\\b',
  '\\b(?:a2tol|aqtol|a2tel|a5ale?s) (?:nafsi|nafse|7ali|hali)',
  '(?:mish|msh|mesh|ma|mo|mu) (?:3ayez|3ayz|3ayza|3awz|badi|bade|bdi|abi|abgha|abghi|ba2a|ba3d|3ad)(?: ba?d| ba3d| 3ad| ba2a)? (?:a3ish|a3eesh|3eesh|a3eesh|a3ish|aeesh|a3eish|a3ish)',
  '(?:ta3ibt|ta3bt|ta3abt|zhe2t|zi7e2t|zahe2t) (?:men|min|mn) (?:el ?)?(?:7aya|7ayat|7ayah|hayat)',
  '(?:el ?)?(?:mot|moot|mout|mawt) a7san',
  '(?:yarit|yaret|ya ?reet|yaleet|ya ?leet)(?:ni)? (?:mut|mot|moot|mout|mit)',
  '(?:fakker|bfakker|bfakkir|afakker) (?:b|bel ?|fi |fe )?(?:el ?)?(?:ente7ar|inte7ar|anta7ar|ante7ar)',
]);

// --- CRISIS: harm to others (English) --------------------------------------
const HARM_OTHERS_EN = rules('HARM_TO_OTHERS', 'sports', [
  `(?:going to|gonna|want to|wanna|plan(?:ning)? to|will|ill|about to|ready to|need to|have to|decided to|thinking (?:about|of)|thoughts of|urge to|feel like)(?: ${W}){0,2} (?:kill|murder|shoot|stab|strangle|poison|choke|beat up|beat|hurt|harm|attack|slit)(?:ing)? ${HARM_TARGET}`,
]);
const HARM_OTHERS_EN_HARD = rules('HARM_TO_OTHERS', 'none', [
  '\\bhomicidal\\b',
  '\\b(?:shoot|bomb|blow|burn) up (?:the |my |our )?(?:school|office|mall|workplace|class|church|mosque|train|station|house)',
  '\\bbring (?:a )?(?:gun|knife|weapon) to (?:school|work|the office|class)',
  `(?:got|have|bought|buying|grabbed) (?:a )?(?:gun|knife|weapon)(?: ${W}){0,6} (?:to )?(?:kill|shoot|hurt|stab|use on)`,
  '(?:thoughts|fantasies|urges|visions) (?:of|about)? ?(?:hurting|killing|stabbing|shooting|harming) (?:others|someone|people|him|her|them|my \\w+)',
  '\\bdont trust myself (?:around|with) (?:my |the |a )?(?:baby|newborn|kids?|child|children|toddler|wife|husband|partner)',
  '(?:might|may|afraid (?:i will|im going to)|scared (?:i will|ill)|worried (?:i will|ill)) (?:hurt|harm|kill|shake|smother|drop|hit) (?:my |the |a )?(?:baby|newborn|child|kid|toddler|son|daughter)',
  '\\bfeel like (?:hurting|hitting|shaking|smothering) my (?:baby|child|kid|toddler|newborn)',
  '\\bwant (?:him|her|them) (?:dead|gone forever)',
]);

// --- CRISIS: harm to others (Arabic / Arabizi) — needs native-speaker review
const HARM_OTHERS_AR = rules('HARM_TO_OTHERS', 'none', [
  '(?:ابي|ابغي|اريد|بدي|ناوي|راح|رح|سوف|ساقتل|بقتل) (?:ان )?(?:اقتل|اذبح|اطعن|اضرب|اذي|اؤذي|اخنق|ا?حرق)(?:ه|ها|هم| ?(?:زوجتي|زوجي|ابي|امي|اخي|اختي|جاري|مديري|ابني|بنتي|الناس))',
  'ناوي (?:اقتل|اذبح|اطعن)',
  'افكار (?:ب)?(?:قتل|ايذاء) (?:الاخرين|الناس|شخص)',
]);
const HARM_OTHERS_ARABIZI = rules('HARM_TO_OTHERS', 'none', [
  '(?:bade|badi|bdi|abgha|abgi|abi|3ayez|3ayz|nawi|nwi|ra7|rah|ha) (?:an |ann?i )?(?:a2tol|aqtol|a2tel|adbah|a?tan3on|aqtelo|a2telo|a2tlo|aqtlo|a2tolo)\\w*',
]);

// --- CRISIS: acute eating-disorder risk ------------------------------------
const ED_EN = rules('ACUTE_EATING_DISORDER_RISK', 'none', [
  `(?:havent|have not|not|never|didnt|did not|hasnt) (?:eaten|eat|had (?:a )?(?:meal|food|anything to eat)) (?:in|for|since) (?:[2-9]|\\d\\d+|two|three|four|five|six|seven|several|a few|many|a couple of|over a|more than a) ?(?:days?|weeks?)`,
  '\\bstarv(?:e|ing) myself',
  '\\bpurg(?:e|ing) (?:myself|after every meal|after eating|every day|daily|again)',
  '\\bi (?:purge|purged|keep purging|have been purging|am purging)\\b',
  '(?:make|making|made|force|forcing|forced) myself (?:throw up|vomit|puke|be sick|gag)',
  '(?:throw|throwing|threw|puke|puking|vomit|vomiting) up (?:on purpose|after every meal|after (?:i )?eat(?:ing)?|everything i eat|my (?:food|meals?|dinner|lunch))',
  '(?:laxatives?|diuretics?|diet pills|water pills) to (?:lose weight|purge|get thin|stay thin)',
  '(?:binge|bingeing|binging) and (?:purge|purging|throw up|vomit)',
  '\\beat nothing (?:for|in) (?:[2-9]|\\d\\d+|two|three|four|five|several|a few) days',
  '\\b(?:less than|under|only|just)(?: eat(?:ing)?| have| consume)? (?:[1-5]\\d\\d|\\d\\d) (?:calories|cals?|kcal)(?: a| per| each| every)? day',
  `(?:fainted|passed out|dizzy|collapsed)(?: ${W}){0,3} (?:because|from|after|due to) (?:not eating|starving|skipping meals|purging|fasting)`,
  '\\b(?:stopped|quit|refuse to|dont|wont) eat(?:ing)?(?: anything)?(?: at all| for (?:days|\\d+ days|a week))',
  '\\bi (?:have|think i have|might have) (?:anorexia|bulimia|an eating disorder)',
]);
const ED_AR = rules('ACUTE_EATING_DISORDER_RISK', 'none', [
  '(?:ما اكلت|ما اكل|لم اكل) (?:من|منذ|لمده) (?:\\d+|يومين|ثلاث\\w*|اربع\\w*|خمس\\w*|اسبوع)',
  'اجبر نفسي (?:علي )?(?:التقيؤ|الاستفراغ|اتقيا|استفرغ|التقيو)',
  '(?:اجوع|اجويع) (?:نفسي|حالي)',
]);
const ED_ARABIZI = rules('ACUTE_EATING_DISORDER_RISK', 'none', [
  'ma akalt (?:men|min|mn|menz|mundh) (?:\\d+|yomein|yomen|talat|arba3|5amis)',
  '(?:bagbar|bagber|bejbar|bjbr|bgbr) nafsi (?:3al|3ala|ala) ?(?:ta2ayo?|tqayo?|estefra[gh]|tarmi|tqaya)',
  '(?:bejawe3|bjawe3|bgou3|bjou3|bjawi3) nafsi',
]);

// --- EMERGENCY: cardiac -----------------------------------------------------
const CARDIAC_EN = rules('CARDIAC', 'exertion', [
  '\\bchest pain',
  '\\bpain in my chest',
  '\\bmy chest (?:is )?(?:tight|hurts|hurting|pressure|crushing|on fire)',
  '\\bchest (?:feels )?(?:tight|crushing|heavy)',
  '\\btightness in (?:my )?chest',
  '\\bpressure (?:on|in) (?:my )?chest',
  '\\bheart attack\\b',
  '\\bpain (?:spreading|radiating|going|shooting) (?:to|down|into) (?:my )?(?:left )?(?:arm|jaw|shoulder)',
  '\\bleft arm (?:pain|numb|hurts)',
  '\\bpain in my (?:left )?(?:arm|jaw)\\b',
  '\\bcrushing pain',
  `\\bheart (?:is )?(?:racing|pounding|skipping)(?: ${W}){0,3} (?:faint|dizzy|short of breath|sweating)`,
  '\\bcardiac arrest\\b',
]);
const CARDIAC_AR = rules('CARDIAC', 'exertion', [
  '(?:الم|وجع|الام) (?:في |ب)(?:ال)?(?:صدر|قلب)',
  '(?:صدري|قلبي) (?:يوجعني|يؤلمني|يوجع|يالمني|يألمني|يعورني|ضاغط)',
  '(?:جلطه|نوبه قلبيه|سكته قلبيه|ذبحه صدريه)',
  '(?:احس|حاس|اشعر) (?:ب)?(?:جلطه|ضغط (?:في |علي )?(?:ال)?صدر)',
]);
const CARDIAC_ARABIZI = rules('CARDIAC', 'exertion', [
  '(?:waja3|waj3a|waga3|alam|2alam) (?:fe|fi|fil?|bel ?) ?(?:el ?)?(?:sader|sadr|2alb|alb)',
  '(?:sadri|sadry|2albi|albi|alby) (?:yoja3ni|bywaje3ni|yw ?aj3ni|bywaja3ni|yewja3ni|byo?waje3ni|byi?2lemni|wa2ef|wa2if|ydghat)',
  '(?:jal?ta|jalta|galta|nawba (?:2albiyye?|albiyya|qalbiya|2albiya))',
]);

// --- EMERGENCY: stroke signs ------------------------------------------------
const STROKE_EN = rules('STROKE_SIGNS', 'exertion', [
  '\\bface (?:is )?droop\\w*',
  '\\b(?:one side|half) of my (?:face|body) (?:is )?(?:numb|drooping|weak|paralyzed|paralysed)',
  '\\b(?:sudden(?:ly)?|all of a sudden) (?:cant|cannot|can not|unable to) (?:move|feel|lift|speak|see|talk)',
  '\\bslurr?(?:ed|ing) (?:my )?(?:speech|words)',
  '\\bcant (?:speak|talk) (?:properly|right|normally|clearly)',
  '\\b(?:cant|cannot) (?:move|feel|lift) my (?:left |right )?(?:arm|leg|hand|face|side)\\b',
  '\\bworst headache of my life',
  '\\bsudden (?:severe )?(?:loss of vision|vision loss|blindness)',
  '\\b(?:having|might be having|think i have|think im having|think she is having|think he is having) a stroke',
  '\\bstroke symptoms\\b',
  `\\b(?:arm|leg|face|hand) (?:suddenly )?(?:went|goes|is) numb(?: ${W}){0,4} one side`,
]);
const STROKE_AR = rules('STROKE_SIGNS', 'exertion', [
  '(?:جلطه|سكته) (?:دماغيه|في الدماغ)',
  '(?:انحراف|ميلان) (?:في )?(?:ال)?(?:وجه|فم)',
  '(?:وجهي|فمي) (?:مايل|معوج|مائل)',
  '(?:ثقل|ثقيل) (?:في )?(?:ال)?لسان',
  '(?:لساني) (?:ثقيل|مو ماشي|ما ينطق|ما يتحرك)',
  'ما اقدر (?:احرك|اتكلم|ارفع)(?: ?(?:يدي|رجلي|ذراعي|جانب))?',
  '(?:شلل|خدر) (?:في )?(?:نصف|جانب|الجانب)',
  '(?:نص|نصف) جسمي (?:مخدر|ميت|مشلول)',
]);
const STROKE_ARABIZI = rules('STROKE_SIGNS', 'exertion', [
  '(?:selta|sakta|sakte|salta|saktah) (?:dimaghiyye?|demaghia|demagheya|dmaghia|dimaghia)',
  '(?:weshi|wishi|wejhi|wi?ghi) (?:mayel|ma3waj|ma?2lub|ma2loub)',
  '(?:lisani|lsani|lesani) (?:te2il|thaqil|tqil|ma byo?5rog|ma byu5rug)',
  'ma a2der a(?:7arrek|7arik|ta7arak|tkallam)',
  '\\bshalal\\b',
]);

// --- EMERGENCY: breathing ---------------------------------------------------
const BREATHING_EN: Rule[] = [
  ...rules('BREATHING', 'breath', ['\\b(?:cant|cannot|can not|unable to|couldnt) breathe\\b']),
  ...rules('BREATHING', 'none', [
    '\\b(?:trouble|difficulty|struggling|struggle|hard) (?:to )?breathing',
    '\\b(?:hard|difficult|harder) to breathe\\b',
    '\\bstruggling to breathe\\b',
    '\\bgasping for (?:air|breath)',
    '\\b(?:throat|airway) (?:is )?(?:closing|swelling|tight)',
    '\\bchoking on (?:a |some |my )?(?:food|piece|bone|candy|water|something|vomit)',
    '\\b(?:he|she|baby|my \\w+|someone|person) (?:is |was |has |just )?(?:choking|not breathing|stopped breathing)',
    '\\bwheezing (?:badly|so (?:bad|much)|and cant)',
    '\\blips (?:are |is )?(?:turning |going |turned )?blue',
    '\\binhaler (?:is )?(?:not|isnt|doesnt|wont|isnt) (?:work|helping|help)',
    `\\basthma attack\\b(?: ${W}){0,6} (?:no inhaler|not working|wont work|cant breathe)`,
  ]),
  ...rules('BREATHING', 'exertion', [
    '\\bshort(?:ness)? of breath\\b',
    '\\bout of breath (?:at rest|sitting|lying)',
    '\\bcant catch my breath\\b',
  ]),
];
// "cant breathe through my nose" is congestion, not an airway problem.
const BREATHING_AR = rules('BREATHING', 'congestion', [
  '(?:ما اقدر|مو قادر|مش قادر|لا استطيع|ما قدر|ما عاد اقدر) (?:ا)?(?:ت)?(?:ال)?(?:تنفس|اتنفس|اخذ نفس|اتنفس)',
  '(?:ضيق|صعوبه) (?:في )?(?:ال)?تنفس',
  '(?:انفاسي|نفسي) (?:تقطعت|مقطوعه|مقطوع|منقطع|وقف|واقف)',
  '(?:اختنق|اختناق|مختنق|بختنق)',
]);
const BREATHING_ARABIZI = rules('BREATHING', 'congestion', [
  '(?:ma|mesh|mish|msh|mo) ?(?:3?arf|ader|2ader|a2der|ader) (?:a?tnaffas|a?tnafas|a?tanaffas|a?tnaf[ae]s|atnafes)',
  '(?:ma a2der|ma ader|msh 2ader|msh ader|mesh ader|mish ader) (?:at?naffas|atnafas|atanafas|atnafes|a?tnaf[ae]s)',
  '(?:da?y?2|dee?q|dayo?2|di2) (?:fe|fi|fil?|el|bel) ?(?:el ?)?(?:tanaffos|tanaffus|nafas|nafs)',
  '(?:nafasi|nfsi|nafsi) (?:maqto3|ma2to3|mawe2of|maktou3|2at3a?)',
]);

// --- EMERGENCY: overdose / poisoning / anaphylaxis --------------------------
const OVERDOSE_EN = rules('OVERDOSE_POISONING_ANAPHYLAXIS', 'none', [
  `(?:took|taken|swallowed|drank|ate|downed) (?:too many|an? (?:whole )?(?:bottle|handful|pack(?:et)?|box|strip) of|all (?:my|the|of (?:my|the)))(?: ${W}){0,3} (?:pills|tablets|medication|meds|painkillers|paracetamol|tylenol|ibuprofen|capsules|aspirin|medicine|insulin)`,
  '\\b(?:i|he|she|my \\w+|someone) (?:just )?(?:overdosed|od ?d|odd?ed)\\b',
  '\\boverdos(?:e|ed|ing) (?:on|myself)',
  '\\btook (?:double|triple|\\d+ times) (?:the|my) (?:dose|dosage)',
  `\\btook (?:[1-9]\\d|\\d\\d\\d+|twenty|thirty|forty|fifty|dozens?) (?:${W} )?(?:pills|tablets|capsules)`,
  '\\b(?:swallowed|drank|ingested|ate) (?:some |a |the )?(?:bleach|antifreeze|detergent|rat poison|poison|pesticide|cleaning (?:fluid|product|liquid)|petrol|gasoline|kerosene|battery|chemical)',
  `\\b(?:my )?(?:child|kid|baby|toddler|son|daughter) (?:swallowed|drank|ate|ingested)(?: ${W}){0,3} (?:pills?|medicine|bleach|battery|detergent|poison|chemical|cleaner|magnet)`,
  '\\bcarbon monoxide\\b',
  '\\banaphyla\\w*',
  '\\b(?:throat|tongue|lips) (?:is |are |feels? |feel )?(?:swelling|swollen|closing|tightening|tight)',
  '\\bswelling (?:of|in) (?:my )?(?:throat|tongue|lips)',
  '\\bepipen\\b',
  `\\ballergic reaction(?: ${W}){0,6} (?:cant breathe|throat|tongue|hives all over|epipen)`,
]);
const OVERDOSE_AR = rules('OVERDOSE_POISONING_ANAPHYLAXIS', 'none', [
  '(?:ابتلعت|بلعت|اخذت|شربت) (?:كل )?(?:ال)?(?:حبوب|دواء|ادويه|سم|منظف|كلور|مبيض)(?: كثير| كبيره)?',
  '(?:اخذت|اخد) (?:جرعه|كميه) (?:زايده|كبيره)',
  'جرعه زايده',
  'تسمم (?:بال)?(?:دواء|حبوب|غاز|سم)',
  'تورم (?:في )?(?:ال)?(?:حلق|لسان|شفايف|شفه)',
  'صدمه تحسسيه',
]);
const OVERDOSE_ARABIZI = rules('OVERDOSE_POISONING_ANAPHYLAXIS', 'none', [
  '(?:ablalt|balalt|ablaet|abla3t|bla3t) (?:kol |kil |el )?(?:7obub|hboub|7bub|el ?7boub|dawa)',
  '(?:akhadet|akhdt|a5adt|a5ad[et]|5adet) (?:jor3a|jur3a|jor3e|jr3a) (?:zaydeh|zeyada|za2ida|zayda|zyada|kbira|kebire)',
  '(?:sherib?t|shrbt|sharabt|shribt) (?:clorox|mbayyed|sam|kloor|mnadef)',
]);

// --- EMERGENCY: severe injury / bleeding ------------------------------------
const INJURY_EN = rules('SEVERE_INJURY_OR_BLEEDING', 'none', [
  '\\bbleeding (?:heavily|badly|a lot|profusely|out)',
  '\\b(?:wont|cant) stop (?:the )?bleeding',
  '\\bwont stop bleeding',
  '\\bblood (?:is )?(?:everywhere|gushing|pouring|spurting)',
  '\\b(?:coughing|vomiting|throwing|puking|spitting) (?:up )?blood',
  '\\b(?:deep|large|huge|gaping) (?:cut|wound|gash|laceration)',
  '\\b(?:broke|broken|fractured) (?:my )?(?:neck|back|spine|skull|femur|hip)',
  '\\bbone (?:is )?(?:sticking|poking|protruding) out',
  '\\b(?:severed|cut off|amputated) (?:my |a |his |her )?(?:finger|thumb|hand|arm|leg|toe)',
  `\\bhit (?:my |his |her )?head(?: ${W}){0,5} (?:unconscious|passed out|lost consciousness|vomiting|confused|blacked out)`,
  '\\b(?:was|got|been|he was|she was) (?:stabbed|shot)\\b(?! (?:in |at )?(?:a |the )?(?:paintball|airsoft|nerf|goal|basket|photo|video|film))',
  '\\bhit by a (?:car|truck|bus)',
  `\\bin a (?:bad |serious )?(?:car )?(?:accident|crash)(?: ${W}){0,3} (?:bleeding|hurt|injured|cant move)`,
  '\\b(?:he|she|my \\w+|someone|person|baby) (?:is |has |just |was )?(?:passed out|collapsed|unconscious|unresponsive|not responding|fell and (?:wont|isnt|is not) wak\\w*)',
  '\\bi (?:just |suddenly )?(?:fainted|passed out|collapsed|blacked out)\\b(?! (?:on|in) (?:the |my )?(?:couch|sofa|bed))',
]);
const INJURY_AR = rules('SEVERE_INJURY_OR_BLEEDING', 'none', [
  '(?:انزف|ينزف|ننزف|بنزف)(?: (?:كثير|بشده|بقوه))?',
  'نزيف (?:شديد|حاد)',
  '(?:دم كثير|ما يوقف النزيف|نزيف ما يوقف|الدم ما يوقف|الدم ما يتوقف)',
  'كسر (?:في )?(?:ال)?(?:رقبه|ظهر|جمجمه|عمود)',
  'جرح (?:عميق|كبير|غائر)',
  '(?:فقدت|فقد) (?:ال)?وعي',
  '(?:اغمي علي|مغمي عليه|مغمي عليها|اغمي عليه)',
  '(?:طعنه|طعنوه|طعنوني|اطلاق نار|اصابوني بالرصاص)',
  `حادث (?:شديد|خطير|سياره)(?: ${W}){0,3} (?:انزف|نزيف|مصاب|ما اقدر احرك)`,
]);
const INJURY_ARABIZI = rules('SEVERE_INJURY_OR_BLEEDING', 'none', [
  '(?:da?m|dam) (?:kteer|ktir|katheer|kter|ktiir) ?(?:w|wa)? ?(?:ma ybatel|ma bawa2ef|ma byo?2af|ma byo?w2af)',
  '(?:nazeef|nazif|nazef|nazeef) (?:sha?deed|shdeed|kbeer|kteer)',
  '(?:bnazef|byenzef|bynzef|ra7 ynzef|3am (?:bnazef|bynzef))',
  '(?:jar7|jor7|jarh) (?:3amee?2|3ameeq|3ami2|kbeer)',
  '(?:[a3]ghma|ighma2|eghma2|aghma|3ghma) 3al(?:ayy?|ey|eih?)',
]);

// --- Broadened coverage after the independent probe -------------
// Added by pattern family, not per phrase. Arabic / Arabizi rows (including the
// Egyptian and Gulf phrasing) need native-speaker review.

const SUICIDE_EXTRA = rules('SUICIDE_OR_SELF_HARM', 'none', [
  // "had enough of life", "want out", "wish it would all stop"
  '\\b(?:had|have|ive had) (?:enough|it) (?:of|with) (?:life|living|everything|this life)',
  '\\bwant out(?! of (?!(?:this )?(?:life|it all|everything|here|living)))',
  '\\bwish (?:it|everything|all of it|this) (?:would|could) (?:all )?(?:just )?(?:end|stop|be over)',
  '\\bwish i (?:wasnt|were not|was not|werent) (?:alive|here|born)',
  '\\blife (?:has|holds) no (?:meaning|point|purpose)',
  '\\b(?:give|gave|giving) up on (?:life|living)',
  '\\b(?:what is|whats|what s) the point of (?:living|going on|anything|life)',
  '\\b(?:cant|cannot) (?:take|handle|stand|bear) (?:it|this|life|living|being alive) (?:any more|anymore)',
  '\\b(?:cant|cannot) (?:face|do) (?:another day|life|this life)',
  '\\bdont want to (?:see|face) (?:another day|tomorrow)',
  '\\bno (?:way|hope) out\\b',
  '\\bwont be (?:a|your) problem (?:much )?longer',
  // Arabic (needs native-speaker review): Gulf / Egyptian / Levantine
  '(?:ما|مش|مو|لا) (?:عايز|عايزه|عاوز|عاوزه|ابي|ابغي|ودي|ابغا|بدي) (?:اعيش|اكمل|اكمل حياتي|ابقي عايش|ابقي حي)',
  '(?:زهقت|تعبت|مليت|كرهت|طفشت) (?:من )?(?:ال)?(?:دنيا|حياتي|عيشتي|عيشه)',
  '(?:خلاص )?(?:تعبت|زهقت|مليت) (?:من )?كل (?:شي|حاجه|شيء)',
  '(?:ابي|ودي|عايز|عاوز|بدي|نفسي) (?:ان )?(?:ارتاح|اختفي|اغيب) (?:من )?(?:ال)?(?:دنيا|حياه|كل شي)(?: (?:للابد|نهائيا))?',
  '(?:ما|مش) (?:اصحي|اصحا|اقوم|ارجع) (?:تاني|مره ثانيه|بكره|ابدا)',
  '(?:اتمني|نفسي|ودي|ابي|عايز) (?:ما|مش) (?:اصحي|اصحا)',
  '(?:الكل|الناس|اهلي) (?:احسن|افضل|ارتاح|يرتاح|ترتاح) (?:بدوني|لو مت|من غيري)',
  'اريح الناس مني',
  '(?:حاسس|حاسه|احس|شايف) (?:اني|ان) (?:عبء|حمل) (?:علي|عند) (?:الكل|اهلي|الناس)',
  // Arabizi
  '(?:mesh|mish|msh|ma|mu) (?:3ayez|3ayz|3ayza|3ayeza|3awz|badi|bade|bdi|abgha|abi|abghi) ?(?:a3ish|a3eesh|a3eish|a3ysh|3eesh|akammel|akamel|abka)',
  '(?:zhe2t|zehe2t|zahe2t|za7e2t|zi7e2t|ta3ibt|ta3bt|mlilt|mleit) (?:men|min|mn) (?:el|l)? ?(?:7aya|7ayat|7ayah|dunya|donya|dnya|3eesha)',
  '(?:3ayez|3ayz|3ayza|bade|badi|bdi|abi|abgha|nefsi) (?:aroo7|aro7|a5alas|akhalas|arta7|arteh|akhtafi|a5tefi|akhtefi) (?:men|min|mn)? ?(?:el|l)? ?(?:dunya|donya|7aya|7ayat)?',
  '(?:ma|mesh|mish|msh) (?:a7eb|aheb|3ayez|badi|bade|abi) (?:as7a|as7o|asha|a2oom) (?:tani|tane|bokra|mara tanya)',
]);

const CARDIAC_EXTRA = rules('CARDIAC', 'exertion', [
  // "pain / pressure / tightness (adjective) in my chest or heart"
  '(?:الم|وجع|الام|ضغط|ثقل|ثقيل|حرقه|حرقان|طعنه|انقباض|عصر)(?: [^ ]+){0,2} (?:في|ب|علي|على) ?(?:ال)?(?:صدر|قلب)[^ ]*',
  '(?:تنميل|خدر|تنمل|تخدير|الم|وجع|نمنمه)(?: [^ ]+){0,2} (?:في |ب)?(?:ال)?(?:ذراع|يد|كتف|ايد)[^ ]* (?:ال)?(?:ايسر|يسري|شمال|يسار)',
  '(?:تنميل|خدر|الم|وجع)(?: [^ ]+){0,2} (?:في |ب)?(?:ال)?(?:فك|رقبه)[^ ]*',
  '(?:صدري|قلبي) (?:بيوجعني|بيوجع|واجعني|بيألمني|بيعورني|مولمني|بيضغط|مضغوط|تقيل|ثقيل|واقف|بيدق جامد)',
  '(?:حاسس|حاسه|احس|حاس) (?:ب)?(?:تقل|ثقل|ضغط|حرقان|وجع)(?: [^ ]+){0,2} (?:في|علي|على) ?(?:ال)?(?:صدر|قلب)[^ ]*',
  // Arabizi
  '(?:waja3|waga3|wag3a|alam|2alam|dagt|daght|pressure|ta2al|ta2l|ta2el)(?: [^ ]+){0,2} (?:fe|fi|fil?|3ala|3al|bel?)(?: el)? ?(?:sader|sadr|sadri|2alb|alb|albi|2albi)',
  '(?:tanmeel|tanmil|timneel|tanmeal|khadar|5adar|tnemmol|waja3|waga3)(?: [^ ]+){0,2} (?:fe |fi |bel? )?(?:dera3|dra3|dr3|yad|eed|ayd|ide|eid)[a-z]*(?: el)? ?(?:shemal|smal|ayser|yasar|yassar|shmal)',
]);

const STROKE_EXTRA = rules('STROKE_SIGNS', 'exertion', [
  // "face / mouth crooked", "tongue heavy", "speech unclear", one-sided weakness, sudden inability
  '(?:وجهي|فمي|وشي|شفتي) (?:مايل|مائل|اتعوج|معوج|ملتوي|التوي|نازل|مدلي|مفرود)',
  '(?:لساني|كلامي) (?:تقيل|ثقيل|مش واضح|ما هو واضح|متلعثم|اتلغبط|متلغبط|ما بيتحرك|ما يتحرك)',
  '(?:ضعف|شلل|تنميل|خدر|تخدر)(?: [^ ]+){0,2} (?:في )?(?:جانب|نصف|شق|نص)(?: [^ ]+){0,2} (?:ايسر|ايمن|جسم|وجه|جسمي|وجهي)',
  '(?:يدي|رجلي|ذراعي|ايدي) (?:ضعيفه|مشلوله|ميته|مخدره|تخدرت|خدرت|ما تتحرك|مش بتتحرك)(?: [^ ]+){0,2}',
  'فجاه (?:ما|مش|لا) (?:اقدر|قادر|قدرت|استطيع|عارف) (?:اتكلم|احرك|ارفع|اشوف|امشي)',
  '(?:ما|مش) (?:اقدر|قادر) (?:احرك|ارفع) (?:يدي|رجلي|ذراعي|ايدي)',
  // Arabizi
  '(?:weshi|wishi|wi?ghi|wishshi|wejhi) (?:mayel|ma3waj|ma3wag|ite3waj|it3awag|it3awwag|ma2loub)',
  '(?:lisani|lsani|lesani|kalami|kalmi) (?:te2il|tqil|ta2il|thaqil|mesh wad7|mesh wadeh|mish wad7|ma beyet7arrak)',
  '(?:edi|ide|eedi|rejli|ridjli|rijli) (?:da3ifa|d3ifa|mashlula|mayyta|mkhaddara|khaddarit|5addarit)',
  'fajaa?? (?:ma|mesh|mish) (?:a2der|2ader|ader) (?:atkallam|a7arrek|arfa3|ashoof)',
]);

const BREATHING_EXTRA = rules('BREATHING', 'congestion', [
  '(?:ضيق|صعوبه|ضعف) (?:في |ب)?(?:ال)?(?:نفس|تنفس|انفاس)',
  '(?:نفسي|نفس|انفاسي) (?:ضايق|بيضيق|ضاق|بيروح|راح|ينقطع|بينقطع|بيقطع|مقطوع|مقطوعه|مو راضي يطلع|ما يطلع)',
  '(?:مش|ما|مو) (?:عارف|قادر|قادره|اقدر|مقدر|قدرت|مقدرش) (?:اتنفس|اخد نفسي|اخذ نفسي|اخد نفس|اخذ نفس|اتنفس كويس)',
  '(?:حاسس|حاسه|احس) (?:اني|اني) (?:مخنوق|بختنق|هموت من|هختنق)',
  '(?:مخنوق|مخنوقه) (?:ومش|و ما|ومو) (?:قادر|اقدر|عارف)',
  // Arabizi
  '(?:mesh|mish|msh|ma|mo|mu) ?(?:2ader|a2der|ader|2adir|2adr|3arif|3aref|a3ref|a3raf) ?a?t?n?a?f+as',
  '(?:mesh|mish|msh|ma|mo|mu) ?(?:2ader|a2der|ader|2adir|3arif|3aref) ?(?:akhod|a5od|akhod?|a5ed) ?(?:nafasi|nafs)',
  '(?:nafasi|nafsi|nfsi|nafasy) (?:bi?ye?dee?2|bi?ydee?2|da2|dayye?2|bi?yo?2ta3|ma?2to3|maqtou3|ma byo?5rog|ma byo?tla3|byet2ata3)',
  '(?:ma|mesh|mish) (?:3ed|3ad|a3ed|ba2a) ?(?:2ader|a2der|ader) ?a?t?nafas',
]);

const OVERDOSE_EXTRA = rules('OVERDOSE_POISONING_ANAPHYLAXIS', 'none', [
  '(?:اخدت|اخذت|بلعت|ابتلعت|شربت|اكلت|اخذنا|خدت)(?: [^ ]+){0,2} (?:علبه|علبة|شريط|كل|كثير|كتير|كميه كبيره|زياده|جرعه كبيره)(?: [^ ]+){0,2} (?:حبوب|اقراص|حبايه|حبه|دوا|دواء|ادويه|مسكن|مسكنات|منوم|منومات|بنادول|باراسيتامول)',
  '(?:جرعه) (?:زياده|زايده|مفرطه|كبيره|زيادة)',
  '(?:تسمم|سمم|مسمم|مسممه)(?: [^ ]+){0,2} (?:دوا|دواء|حبوب|غاز|كلور|مبيض|سم|اكل فاسد شديد)',
  '(?:ولدي|بنتي|ابني|طفلي|طفلتي|بنتي|اخوي|اختي) (?:بلع|بلعت|شرب|شربت|اكل|اكلت|ابتلع|ابتلعت) (?:بطاريه|دوا|دواء|حبوب|كلور|منظف|مبيض|سم|مغناطيس|عمله)',
  '(?:انتفخ|ورم|متورم|بيتورم|تورم|منتفخ)(?: [^ ]+){0,2} (?:حلقي|لساني|شفايفي|وجهي|وشي)',
  // Arabizi
  '(?:akhadt|akhdt|5adet|khdt|5ade?t|a5adt|akhadet|akalt|ablalt|balalt|bala3t|balla3t|shribt)(?: [^ ]+){0,2} (?:kol|kteer|ktir|3elbet|3elbe|shari[tT]|3elba)(?: [^ ]+){0,2} (?:7obub|7boub|hboub|adwiya|dawa|dwa|panadol|moskenat|monawem|monawwem|aqras|a2ras)',
  '(?:jor3a|jur3a|jor3e|jr3a) (?:zeyada|zyada|za2ida|zayda|zaide|kbira|kebire)',
]);

const INJURY_EXTRA = rules('SEVERE_INJURY_OR_BLEEDING', 'none', [
  // "bleeding won't stop / a lot / everywhere", "soaking through", "deep cut that won't clot"
  '\\bbleed(?:ing)? (?:wont|will not|doesnt|does not|just wont|never|cant be) (?:stop|clot|stopped)',
  '\\bbleed(?:ing)? (?:a lot|heavily|badly|profusely|nonstop|non stop|constantly|everywhere|through|like crazy|like a tap)',
  `\\b(?:blood|bleeding|cut|wound|gash|nose)(?: ${W}){0,4} (?:wont|will not|doesnt|does not|not) (?:stop|clot|stopping|stop bleeding)`,
  '\\bsoak(?:ed|ing) through (?:my |the |a )?(?:bandage|towel|shirt|pad|dressing|clothes|cloth|gauze)',
  '\\b(?:lost|losing) (?:a lot of|so much|too much) blood',
  '\\bpool of blood\\b',
  '\\bhaemorrhag\\w*|\\bhemorrhag\\w*',
  '\\b(?:gushing|spurting|pouring) blood',
  // Arabic (needs native-speaker review)
  '(?:دم|نزيف|الدم|جرحي|الجرح)(?: [^ ]+){0,3} (?:ما|مش|لا|مو) (?:يوقف|بيوقف|يتوقف|وقف|بيقف|يقف|بيتوقف|يخثر)',
  '(?:بنزف|ينزف|انزف|نازف|نزفت|بينزف)(?: [^ ]+){0,2} (?:كتير|كثير|بقوه|بشده|جامد|بغزاره)',
  '(?:دم كتير|دم كثير|نزيف قوي|نزيف جامد|نزيف غزير)',
  '(?:الدم|دم) (?:مالي|مغرق|في كل مكان|كل مكان)',
  // Arabizi
  '(?:dam|damm|el ?dam|nazeef|nazif|nazf)(?: [^ ]+){0,3} (?:mesh|mish|ma|msh) (?:bywa2?ef|byoo?2af|byw2af|beyo?2af|yo?2af|ybatel|byebatel|bywa2ef|byo2af)',
  '(?:bnazef|bnazzef|benzef|byenzef|bynzef) (?:kteer|ktir|katheer|awi|awy|ketir|bi ?2oowe|bi2owwe)',
  '(?:dam|damm) (?:kteer|ktir|katheer|ketir)',
]);

const CRISIS_RULES: Rule[] = [
  ...SUICIDE_EXTRA,
  ...SUICIDE_EN,
  ...SUICIDE_AR,
  ...SUICIDE_ARABIZI,
  ...HARM_OTHERS_EN,
  ...HARM_OTHERS_EN_HARD,
  ...HARM_OTHERS_AR,
  ...HARM_OTHERS_ARABIZI,
  ...ED_EN,
  ...ED_AR,
  ...ED_ARABIZI,
];

const EMERGENCY_RULES: Rule[] = [
  ...CARDIAC_EXTRA,
  ...STROKE_EXTRA,
  ...BREATHING_EXTRA,
  ...OVERDOSE_EXTRA,
  ...INJURY_EXTRA,
  ...CARDIAC_EN,
  ...CARDIAC_AR,
  ...CARDIAC_ARABIZI,
  ...STROKE_EN,
  ...STROKE_AR,
  ...STROKE_ARABIZI,
  ...BREATHING_EN,
  ...BREATHING_AR,
  ...BREATHING_ARABIZI,
  ...OVERDOSE_EN,
  ...OVERDOSE_AR,
  ...OVERDOSE_ARABIZI,
  ...INJURY_EN,
  ...INJURY_AR,
  ...INJURY_ARABIZI,
];

// CRISIS rules first: if a message hits both, human support is the right
// first response and the CRISIS copy already tells the user to call an
// emergency number.
const ALL_RULES: Rule[] = [...CRISIS_RULES, ...EMERGENCY_RULES];

// ---------------------------------------------------------------------------
// Guards (only ever make the detector quieter — each one is deliberately narrow)
// ---------------------------------------------------------------------------

/** A negator shortly before the matched phrase: "i dont want to die", "no chest pain". */
const NEGATION = rx(
  `(?:^| )(?:dont|do not|didnt|never|not|no|nor|without|wont|wouldnt|aint|isnt|arent|am not|no longer|denies|deny|لا|ما|مو|مش|لن)(?: ${W}){0,2} $`,
);

function isNegated(text: string, matchIndex: number): boolean {
  NEGATION.lastIndex = 0;
  return NEGATION.test(text.slice(0, matchIndex));
}

/** The user is talking about a film, article, story... not themselves. */
const THIRD_PARTY_FRAME = rx(
  '\\b(?:news|article|headline|reported|reports say|movie|film|novel|fiction|character|episode|tv series|documentary|lyrics|screenplay|script|podcast|according to|police said|rates|statistics|awareness|prevention|study|research|plot)\\b',
);
/** ...unless they also say it applies to them right now. */
const PERSONAL_OVERRIDE = rx(
  '(?:\\bi feel (?:the same|like that|this way)|\\brelate\\b|\\bsame here\\b|\\bme too\\b|\\breminded me\\b|\\bmakes? me want|\\bmade me want|(?:^|\\b(?:now|and|but|since|so|because)) (?:i|im|ive)(?: [^ ]+){0,3} (?:feel|want|think|am|keep|cant|wish|have|having|might))',
);

/** Past event told as history, and no sign it is current. */
const PAST_MARKER = rx(
  '\\b(?:(?:(?:\\d+|a|one|two|three|several|few|many) )?(?:years?|months?|decades?) ago|last (?:year|decade|summer|winter|spring|autumn|fall|month)|long ago|a while ago|years back|when i was (?:a )?(?:kid|child|teen\\w*|young|little|in (?:high )?school|\\d+)|as a (?:kid|child|teen\\w*)|in (?:19|20)\\d\\d|back (?:then|in)|used to|in the past|childhood)\\b',
);
const RESOLUTION_MARKER = rx(
  '\\b(?:(?:now )?(?:im|i am) (?:fine|ok|okay|better|good|well|recovered|healthy|safe)(?: now)?|recovered|recovery|got (?:better|help)|survived|no longer|not anymore|anymore|healed|resolved|all clear)\\b',
);
const PRESENT_MARKER = rx(
  '\\b(?:right now|tonight|today|currently|at the moment|these days|still|again|lately|this (?:morning|evening|afternoon|week)|just now|rn|(?:but|and|until|since|so) now|now i (?:want|feel|think|cant|am|wish))\\b',
);

function isResolvedHistory(text: string): boolean {
  PAST_MARKER.lastIndex = 0;
  if (!PAST_MARKER.test(text)) return false;
  RESOLUTION_MARKER.lastIndex = 0;
  PRESENT_MARKER.lastIndex = 0;
  const resolved = RESOLUTION_MARKER.test(text);
  const present = PRESENT_MARKER.test(text);
  // Past + explicitly resolved, or past with nothing suggesting it is ongoing.
  return resolved ? !present || /(?:^| )now (?:im|i am) (?:fine|ok|okay|better|good|well)/u.test(text) : !present;
}

function isThirdPartyFrame(text: string): boolean {
  THIRD_PARTY_FRAME.lastIndex = 0;
  if (!THIRD_PARTY_FRAME.test(text)) return false;
  PERSONAL_OVERRIDE.lastIndex = 0;
  return !PERSONAL_OVERRIDE.test(text);
}

/** Muscle soreness / exertion context, unless a genuinely alarming cue is also present. */
const EXERTION_CONTEXT = rx(
  '\\b(?:sore|soreness|doms|muscle|muscles|pulled|strained|bench|push ?ups?|pull ?ups?|chest day|chest workout|gym|lifting|workout|work out|working out|run|running|ran|jog|jogging|sprint|sprints|stairs|climbed|climbing|hiking|hike|cardio|hiit|squats?|deadlifts?|training|exercise|exercising|swim|swimming)\\b',
);
const ALARM_CUE = rx(
  '\\b(?:left arm|jaw|sweat\\w*|nause\\w*|dizz\\w*|faint\\w*|crushing|radiat\\w*|pressure|squeez\\w*|spreading|at rest|sudden\\w*|face|speech|slur\\w*|one side|vision|cant breathe|cant speak|numb\\w*|weak\\w*|blue|wheez\\w*|cold sweat|worse|severe|worst)\\b',
);
function isExertionOnly(text: string): boolean {
  EXERTION_CONTEXT.lastIndex = 0;
  if (!EXERTION_CONTEXT.test(text)) return false;
  ALARM_CUE.lastIndex = 0;
  return !ALARM_CUE.test(text);
}

const LAUGHTER = rx('\\b(?:laugh\\w*|lol|lmao|haha\\w*|funny|hilarious|giggl\\w*|cracking up)\\b');
const CONGESTION = rx(
  '(?:\\b(?:through|with|from) (?:my )?(?:nose|nostrils?)\\b|\\bnose\\b|\\bstuffy\\b|\\bcongest\\w*|\\bblocked\\b|\\bcold\\b|\\ballergies\\b|\\bhay ?fever\\b|\\bmask\\b|انف|زكام)',
);
const SPORTS = rx(
  '\\b(?:game|match|final|finals|tournament|league|team|playoffs?|opponents?|scrimmage|race|debate|exam|exams|presentation|interview|workout|gym|tonight)\\b',
);
const WEAPON_OR_REAL = rx('\\b(?:gun|knife|weapon|bullet|poison|blade|bomb|literally|for real|seriously|murder|blood)\\b');

function guardSuppresses(guard: Guard, text: string): boolean {
  switch (guard) {
    case 'none':
      return false;
    case 'exertion':
      return isExertionOnly(text);
    case 'laughter':
      LAUGHTER.lastIndex = 0;
      return LAUGHTER.test(text);
    case 'congestion':
      CONGESTION.lastIndex = 0;
      return CONGESTION.test(text);
    case 'breath':
      return guardSuppresses('laughter', text) || guardSuppresses('congestion', text);
    case 'sports':
      SPORTS.lastIndex = 0;
      WEAPON_OR_REAL.lastIndex = 0;
      return SPORTS.test(text) && !WEAPON_OR_REAL.test(text);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the first red flag found in `text`, or null. Pure and deterministic.
 * Patterns are evaluated against the normalised text (see normalizeForRedFlags).
 */
export function detectRedFlag(text: string): RedFlagMatch | null {
  const normalized = normalizeForRedFlags(text);
  if (normalized.length === 0) return null;

  if (isResolvedHistory(normalized) || isThirdPartyFrame(normalized)) return null;

  for (const rule of ALL_RULES) {
    rule.re.lastIndex = 0;
    for (const found of normalized.matchAll(rule.re)) {
      if (isNegated(normalized, found.index ?? 0)) continue;
      if (guardSuppresses(rule.guard, normalized)) continue;
      return { category: rule.category, kind: CATEGORY_KIND[rule.category] };
    }
  }
  return null;
}
