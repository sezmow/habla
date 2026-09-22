// Exercise generation. Given an item and the skill to train, build a concrete
// exercise — varying sentence, direction and format so the learner can't pass
// by remembering the exact question (anti-cramming).

import type { KeywordRequirement, LearnerState, MemoryState, Sentence, Skill, SpeakingPrompt, SpeakingStage, VocabItem, ExerciseType } from "./types";
import { capitalize, displayWords, fold, hash, normalize, pick, shuffle, tokenize } from "./text";
import { SENTENCES, SENTENCES_BY_VOCAB, VOCAB, LESSONS, lessonPosition, personalize, SCENARIO_MAP, TOKEN_INDEX } from "../content";
import { analyzeForm, VERBS, SER_FORMS, ESTAR_FORMS, TENER_FORMS } from "../content/verbs";

export type SegmentKind = "review" | "new" | "listening" | "speaking" | "weakness" | "conversation";

interface Base {
  key: string;
  itemId: string;
  /** Other items that get light credit (e.g. words inside a sentence). */
  itemIds: string[];
  skill: Skill;
  variant: string;
  segment: SegmentKind;
  reason?: string;
  estSeconds: number;
  retry?: "again" | "context";
  conceptId?: string;
}

export interface IntroEx extends Base { type: "intro"; vocabId?: string; sentenceId?: string }
export interface GrammarEx extends Base { type: "grammar"; conceptId: string }
export interface ChoiceEx extends Base {
  type: "choice";
  instruction: string;
  prompt: string;
  promptLang: "es" | "en";
  audio?: string;
  emoji?: string;
  options: string[];
  optionLang: "es" | "en";
  answer: number;
}
export interface MatchEx extends Base { type: "match"; pairs: { id: string; es: string; en: string }[] }
export interface ArrangeEx extends Base { type: "arrange"; prompt: string; tiles: string[]; accepted: string[]; answer: string }
export interface TranslateEx extends Base {
  type: "translate";
  direction: "en-es" | "es-en";
  prompt: string;
  accepted: string[];
  answer: string;
  starter?: string;
  audio?: string;
  spanishOnly?: boolean;
}
export interface FillEx extends Base {
  type: "fill";
  before: string;
  after: string;
  accepted: string[];
  options?: string[];
  translation: string;
  full: string;
}
export interface DictationEx extends Base { type: "dictation"; text: string; accepted: string[]; translation: string }
export interface ListenEx extends Base { type: "listen"; text: string; translation: string; options: string[]; answer: number }
export interface SpeakEx extends Base {
  type: "speak";
  stage: SpeakingStage;
  prompt: string;
  promptLang: "es" | "en";
  promptEn?: string;
  model?: string;
  starter?: string;
  accepted?: string[];
  requirements?: KeywordRequirement[];
  sample: string;
  sampleEn: string;
  scene?: string;
}
export interface ConceptEx extends Base { type: "concept"; emoji?: string; definition?: string; question: string; accepted: string[]; answer: string }
export interface OpenEx extends Base {
  type: "open" | "picture";
  prompt: string;
  promptEn: string;
  requirements: KeywordRequirement[];
  sample: string;
  sampleEn: string;
  starter?: string;
  scene?: string;
}
export interface DialogueEx extends Base {
  type: "dialogue";
  scenarioId: string;
  partner: string;
  npc: { es: string; en: string };
  intents: { requirements: KeywordRequirement[]; reply?: { es: string; en: string } }[];
  starters: string[];
}

export type Exercise = IntroEx | GrammarEx | ChoiceEx | MatchEx | ArrangeEx | TranslateEx | FillEx | DictationEx | ListenEx | SpeakEx | ConceptEx | OpenEx | DialogueEx;

export interface GenContext {
  state: LearnerState;
  now: number;
  random: () => number;
  /** Speech recognition or at least a microphone is usable and enabled. */
  speaking: boolean;
  segment: SegmentKind;
  reason?: string;
}

let keyCounter = 0;
const nextKey = (p: string) => `${p}-${++keyCounter}-${Math.floor(Math.random() * 1e6)}`;

export const EST_SECONDS: Record<ExerciseType, number> = {
  intro: 12, grammar: 30, choice: 8, match: 25, arrange: 20, translate: 25, fill: 14, dictation: 28, listen: 14, speak: 30, concept: 12, open: 60, picture: 60, dialogue: 40,
};

function base(ctx: GenContext, itemId: string, skill: Skill, type: ExerciseType, variant: string, itemIds: string[] = []): Base {
  return { key: nextKey(type), itemId, itemIds, skill, variant, segment: ctx.segment, reason: ctx.reason, estSeconds: EST_SECONDS[type] };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const mem = (state: LearnerState, id: string): MemoryState | undefined => state.memory[id];
const recent = (m: MemoryState | undefined, n = 3) => new Set(m?.recentVariants.slice(-n) ?? []);

/** 0 = no help, 1 = some (starters), 2 = lots (options, hints). */
export function assistanceLevel(m: MemoryState | undefined, state: LearnerState): 0 | 1 | 2 {
  const strength = m ? Math.max(m.scores.recall ?? 0, m.scores.production ?? 0) : 0;
  let lvl = strength >= 0.7 ? 0 : strength >= 0.4 ? 1 : 2;
  if (state.settings.assistance === "more") lvl += 1;
  if (state.settings.assistance === "less") lvl -= 1;
  return Math.max(0, Math.min(2, lvl)) as 0 | 1 | 2;
}

/** English-free exercises once the learner recalls an item well. */
function readyForSpanishOnly(m: MemoryState | undefined, state: LearnerState): boolean {
  if (state.settings.assistance === "more") return false;
  return !!m && (m.scores.production ?? 0) >= 0.7 && (m.scores.recall ?? 0) >= 0.6;
}

function frontier(state: LearnerState): number {
  let max = 0;
  for (const [id, p] of Object.entries(state.lessons)) if (p.completedAt) max = Math.max(max, lessonPosition(id));
  return max;
}

/** Sentences containing a vocab item, restricted to what the learner has reached. */
export function sentencesFor(vocabId: string, state: LearnerState): Sentence[] {
  const limit = frontier(state) + 1;
  return (SENTENCES_BY_VOCAB[vocabId] ?? []).map((id) => SENTENCES[id]).filter((s) => lessonPosition(s.lessonId) <= limit);
}

function pickSentence(vocabId: string, ctx: GenContext, avoid: Set<string>, exclude?: string): Sentence | undefined {
  const all = sentencesFor(vocabId, ctx.state).filter((s) => s.id !== exclude);
  const fresh = all.filter((s) => ![...avoid].some((v) => v.endsWith(s.id)));
  const pool = fresh.length ? fresh : all;
  return pool.length ? pick(pool, ctx.random) : undefined;
}

function vocabPool(v: VocabItem, state: LearnerState): VocabItem[] {
  const limit = frontier(state) + 2;
  return Object.values(VOCAB).filter(
    (o) => o.id !== v.id && o.drill && o.pos === v.pos && fold(o.en) !== fold(v.en) && fold(o.es) !== fold(v.es) && (o.lessonId === "phrases" || lessonPosition(o.lessonId) <= limit),
  );
}

function distractors<T>(pool: T[], n: number, random: () => number, key: (t: T) => string, avoid: string[]): T[] {
  const seen = new Set(avoid.map(fold));
  const out: T[] = [];
  for (const t of shuffle(pool, random)) {
    const k = fold(key(t));
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= n) break;
  }
  return out;
}

function sentencePool(s: Sentence, state: LearnerState): Sentence[] {
  const pos = lessonPosition(s.lessonId);
  const limit = Math.max(frontier(state) + 1, pos);
  return Object.values(SENTENCES).filter((o) => o.id !== s.id && Math.abs(lessonPosition(o.lessonId) - pos) <= 6 && lessonPosition(o.lessonId) <= limit);
}

function withOptions(correct: string, wrong: string[], random: () => number) {
  const options = shuffle([correct, ...wrong], random);
  return { options, answer: options.indexOf(correct) };
}

const ARTICLE = /^(el|la|los|las|un|una)\s+/i;

function nounAnswers(es: string): string[] {
  const clean = es.replace(/[¿?¡!]/g, "").trim();
  const bare = clean.replace(ARTICLE, "");
  const g = /^(la|las|una)\s/i.test(clean) ? "f" : "m";
  const art = g === "f" ? ["la", "una"] : ["el", "un"];
  return [clean, bare, ...art.map((a) => `${a} ${bare}`), ...art.slice(1).map((a) => `es ${a} ${bare}`)];
}

function spanishAccepted(s: Sentence, name: string): string[] {
  return [s.es, ...s.alt].map((t) => personalize(t, name));
}

function englishAccepted(s: Sentence): string[] {
  return [s.en, ...s.altEn];
}

// ─── Focus words: where to put the blank ─────────────────────────────────

interface Focus {
  index: number;
  word: string;
  family: string[];
}

function sameFamilyForms(word: string): string[] {
  const w = word.toLowerCase();
  const info = analyzeForm(w);
  if (SER_FORMS.has(w) || ESTAR_FORMS.has(w) || TENER_FORMS.has(w)) {
    const person = info[0]?.person ?? 2;
    return [VERBS.ser.present[person], VERBS.estar.present[person], VERBS.tener.present[person], VERBS.ser.present[2], VERBS.estar.present[2]];
  }
  if (info.length) {
    const { lemma, tense, person } = info[0];
    const c = VERBS[lemma];
    const other = (person + 2) % 6;
    const alt = tense === "preterite" ? c.present[person] : c.preterite[person];
    return [c[tense][person], c[tense][other], alt, c[tense][0]];
  }
  const pairs: Record<string, string[]> = {
    el: ["la", "los"], la: ["el", "las"], un: ["una", "unos"], una: ["un", "unas"], mi: ["mis", "tu"], mis: ["mi", "tus"], tu: ["tus", "mi"],
    gusta: ["gustan", "gusto"], gustan: ["gusta", "gusto"], al: ["a el", "del"], del: ["de el", "al"], hay: ["está", "es"], a: ["de", "en"],
    me: ["te", "se"], te: ["me", "se"], por: ["para"], para: ["por"], más: ["menos", "muy"], que: ["de", "como"], qué: ["dónde", "quién"],
    dónde: ["qué", "cuándo"], mucha: ["mucho", "muy"], mucho: ["mucha", "muy"],
  };
  if (pairs[w]) return [w, ...pairs[w]];
  if (/[oa]s?$/.test(w) && w.length > 3) return [w, w.replace(/o(s?)$/, "a$1").replace(/a(s?)$/, (m, s) => (w.endsWith("o" + s) ? m : "o" + s))];
  return [w];
}

const CONCEPT_TARGETS: Record<string, (w: string) => boolean> = {
  "ser-estar": (w) => SER_FORMS.has(w) || ESTAR_FORMS.has(w),
  "ser-identity": (w) => SER_FORMS.has(w),
  "estar-states": (w) => ESTAR_FORMS.has(w),
  "tener-expressions": (w) => TENER_FORMS.has(w),
  gustar: (w) => w === "gusta" || w === "gustan",
  preterite: (w) => analyzeForm(w).some((f) => f.tense === "preterite"),
  "present-regular": (w) => analyzeForm(w).some((f) => f.tense === "present" && !["ser", "estar", "ir", "tener"].includes(f.lemma)),
  "stem-changing": (w) => /^(quier|pued|cuest|almuerz|prefier|piens|jueg|acuest)/.test(w),
  "ir-a": (w) => w === "a",
  "al-del": (w) => w === "al" || w === "del",
  "hay-esta": (w) => w === "hay" || w === "está",
  reflexive: (w) => w === "me" || w === "te",
  possessives: (w) => ["mi", "mis", "tu", "tus"].includes(w),
  gender: (w) => ["la", "el", "una", "un", "mucha"].includes(w) || /(ica|ico|ita|ito|oja|ojo|ueña|ueño|ía|ío)$/.test(w),
  "telling-time": (w) => ["es", "son", "las", "la"].includes(w),
  "por-para": (w) => w === "por" || w === "para",
  comparisons: (w) => ["más", "mejor", "peor", "que"].includes(w),
  opinions: (w) => w === "que" || w === "parece",
  questions: (w) => ["qué", "dónde", "quién", "cómo", "hablas"].includes(w),
  "tener-que": (w) => w === "que" || TENER_FORMS.has(w),
};

function findFocus(s: Sentence, conceptId: string | undefined, vocabId: string | undefined): Focus | null {
  const words = displayWords(s.es);
  const clean = words.map((w) => normalize(w));
  if (conceptId && CONCEPT_TARGETS[conceptId]) {
    const test = CONCEPT_TARGETS[conceptId];
    let idx = clean.findIndex((w, i) => test(w) && (conceptId !== "ir-a" || /^(voy|vas|va|vamos|van)$/.test(clean[i - 1] ?? "")));
    if (idx >= 0) return { index: idx, word: clean[idx], family: sameFamilyForms(clean[idx]) };
  }
  if (vocabId) {
    const v = VOCAB[vocabId];
    const keys = v.keys.filter((k) => !k.includes(" "));
    const idx = clean.findIndex((w) => keys.includes(w));
    if (idx >= 0) return { index: idx, word: clean[idx], family: sameFamilyForms(clean[idx]) };
  }
  // Fall back to the longest content word.
  let best = -1;
  clean.forEach((w, i) => {
    if (w.length > 3 && (best < 0 || w.length > clean[best].length)) best = i;
  });
  return best >= 0 ? { index: best, word: clean[best], family: sameFamilyForms(clean[best]) } : null;
}

// ─── Builders ─────────────────────────────────────────────────────────────

export function introExercise(itemId: string, ctx: GenContext): IntroEx {
  const isVocab = itemId.startsWith("v:");
  return { ...base(ctx, itemId, "recognition", "intro", "intro"), type: "intro", vocabId: isVocab ? itemId : undefined, sentenceId: isVocab ? undefined : itemId };
}

export function grammarExercise(conceptId: string, ctx: GenContext): GrammarEx {
  return { ...base(ctx, `c:${conceptId}`, "comprehension", "grammar", "grammar"), type: "grammar", conceptId };
}

function vocabChoice(v: VocabItem, dir: "es-en" | "en-es", ctx: GenContext): ChoiceEx {
  const pool = vocabPool(v, ctx.state);
  if (dir === "es-en") {
    const wrong = distractors(pool, 3, ctx.random, (o) => o.en, [v.en]).map((o) => o.en);
    return {
      ...base(ctx, v.id, "recognition", "choice", "choice:es-en"),
      type: "choice",
      instruction: "What does this mean?",
      prompt: v.es,
      promptLang: "es",
      audio: v.es,
      optionLang: "en",
      ...withOptions(v.en, wrong, ctx.random),
    };
  }
  const wrong = distractors(pool, 3, ctx.random, (o) => o.es, [v.es]).map((o) => o.es);
  return {
    ...base(ctx, v.id, "recall", "choice", "choice:en-es"),
    type: "choice",
    instruction: "How do you say this in Spanish?",
    prompt: v.en,
    promptLang: "en",
    optionLang: "es",
    ...withOptions(v.es, wrong, ctx.random),
  };
}

function sentenceChoice(s: Sentence, ctx: GenContext, skill: Skill): ChoiceEx {
  const wrong = distractors(sentencePool(s, ctx.state), 3, ctx.random, (o) => o.en, [s.en]).map((o) => o.en);
  const name = ctx.state.profile.name;
  return {
    ...base(ctx, s.id, skill, "choice", `choice:${s.id}`, s.vocab),
    type: "choice",
    instruction: "What does this mean?",
    prompt: personalize(s.es, name),
    promptLang: "es",
    audio: personalize(s.es, name),
    optionLang: "en",
    ...withOptions(s.en, wrong, ctx.random),
  };
}

function listenExercise(s: Sentence, itemId: string, ctx: GenContext): ListenEx {
  const wrong = distractors(sentencePool(s, ctx.state), 3, ctx.random, (o) => o.en, [s.en]).map((o) => o.en);
  const { options, answer } = withOptions(s.en, wrong, ctx.random);
  return { ...base(ctx, itemId, itemId === s.id ? "comprehension" : "listening", "listen", `listen:${s.id}`, s.vocab), type: "listen", text: personalize(s.es, ctx.state.profile.name), translation: s.en, options, answer };
}

export function dictationExercise(s: Sentence, itemId: string, ctx: GenContext): DictationEx {
  const name = ctx.state.profile.name;
  return { ...base(ctx, itemId, "listening", "dictation", `dictation:${s.id}`, s.vocab), type: "dictation", text: personalize(s.es, name), accepted: [personalize(s.es, name)], translation: s.en };
}

function fillExercise(s: Sentence, itemId: string, ctx: GenContext, assist: number, conceptId?: string): FillEx | null {
  const focus = findFocus(s, conceptId, itemId.startsWith("v:") ? itemId : undefined);
  if (!focus) return null;
  const words = displayWords(personalize(s.es, ctx.state.profile.name));
  const raw = words[focus.index];
  const lead = raw.match(/^[¿¡"]*/)?.[0] ?? "";
  const trail = raw.match(/[?!.,;:"]*$/)?.[0] ?? "";
  const answer = raw.slice(lead.length, raw.length - trail.length);
  const before = [...words.slice(0, focus.index), lead].join(" ").trim();
  const after = [trail, ...words.slice(focus.index + 1)].join(" ").trim();
  let options: string[] | undefined;
  if (assist >= 1) {
    const fam = [...new Set(focus.family.map((f) => f.toLowerCase()))].filter((f) => fold(f) !== fold(answer));
    const extra = fam.length < 2 ? distractors(Object.values(VOCAB).filter((v) => v.drill && !v.es.includes(" ")), 3 - fam.length, ctx.random, (v) => v.es, [answer]).map((v) => v.es) : [];
    const wrong = [...fam, ...extra].slice(0, 3);
    options = shuffle([answer.toLowerCase() === answer ? answer : answer, ...wrong.map((w) => (focus.index === 0 ? capitalize(w) : w))], ctx.random);
  }
  return {
    ...base(ctx, itemId, "recall", "fill", `fill:${s.id}:${focus.index}`, s.vocab),
    type: "fill",
    before,
    after,
    accepted: [answer],
    options,
    translation: s.en,
    full: personalize(s.es, ctx.state.profile.name),
    conceptId,
  };
}

function arrangeExercise(s: Sentence, itemId: string, ctx: GenContext, assist: number): ArrangeEx {
  const name = ctx.state.profile.name;
  const text = personalize(s.es, name);
  const words = displayWords(text).map((w) => w.replace(/[¿?¡!.,;:"]/g, "")).filter(Boolean);
  const tiles = words.map((w, i) => (i === 0 && !isProper(w) ? w.toLowerCase() : w));
  const extra: string[] = [];
  if (assist <= 1) {
    const fam = tiles.flatMap((t) => sameFamilyForms(t.toLowerCase()).slice(1, 2)).filter((f) => !tiles.map((t) => t.toLowerCase()).includes(f));
    extra.push(...shuffle(fam, ctx.random).slice(0, assist === 0 ? 2 : 1));
  }
  return {
    ...base(ctx, itemId, "recall", "arrange", `arrange:${s.id}`, s.vocab),
    type: "arrange",
    prompt: s.en,
    tiles: shuffle([...tiles, ...extra], ctx.random),
    accepted: spanishAccepted(s, name),
    answer: text,
  };
}

/** Capitalized words the curriculum doesn't teach as vocabulary are names (Ana, Chicago). */
function isProper(w: string) {
  return /^[A-ZÁÉÍÓÚÑ]/.test(w) && !TOKEN_INDEX.has(normalize(w));
}

function translateExercise(s: Sentence, itemId: string, dir: "en-es" | "es-en", ctx: GenContext, assist: number, skill: Skill = "production"): TranslateEx {
  const name = ctx.state.profile.name;
  if (dir === "en-es") {
    return {
      ...base(ctx, itemId, skill, "translate", `translate:en-es:${s.id}`, s.vocab),
      type: "translate",
      direction: "en-es",
      prompt: s.en,
      accepted: spanishAccepted(s, name),
      answer: personalize(s.es, name),
      starter: assist >= 1 ? s.starter ?? starterFrom(s.es) : undefined,
    };
  }
  return {
    ...base(ctx, itemId, "comprehension", "translate", `translate:es-en:${s.id}`, s.vocab),
    type: "translate",
    direction: "es-en",
    prompt: personalize(s.es, name),
    audio: personalize(s.es, name),
    accepted: englishAccepted(s),
    answer: s.en,
  };
}

function starterFrom(es: string): string {
  const w = displayWords(es);
  return w.length > 3 ? `${w.slice(0, Math.ceil(w.length / 3)).join(" ")}…` : `${w[0]}…`;
}

function speakRepeat(text: string, en: string, itemId: string, ctx: GenContext, itemIds: string[] = [], skill: Skill = "speaking"): SpeakEx {
  return {
    ...base(ctx, itemId, skill, "speak", `speak:repeat:${itemId}`, itemIds),
    type: "speak",
    stage: 1,
    prompt: text,
    promptLang: "es",
    promptEn: en,
    model: text,
    accepted: [text],
    sample: text,
    sampleEn: en,
  };
}

function speakTranslate(s: Sentence, itemId: string, ctx: GenContext, assist: number): SpeakEx {
  const name = ctx.state.profile.name;
  return {
    ...base(ctx, itemId, "speaking", "speak", `speak:say:${s.id}`, s.vocab),
    type: "speak",
    stage: 4,
    prompt: `Say it in Spanish: “${s.en}”`,
    promptLang: "en",
    accepted: spanishAccepted(s, name),
    starter: assist >= 1 ? s.starter ?? starterFrom(s.es) : undefined,
    sample: personalize(s.es, name),
    sampleEn: s.en,
  };
}

export function promptExercise(p: SpeakingPrompt, ctx: GenContext): SpeakEx | OpenEx {
  const name = ctx.state.profile.name;
  const itemId = p.id;
  const lesson = p.lessonId ? LESSONS[p.lessonId] : undefined;
  const itemIds = lesson ? lesson.vocab.filter((v) => VOCAB[v]?.drill) : [];
  if (!ctx.speaking) {
    return {
      ...base(ctx, itemId, "production", p.scene ? "picture" : "open", `open:${p.id}`, itemIds),
      type: p.scene ? "picture" : "open",
      prompt: personalize(p.prompt, name),
      promptEn: p.promptEn,
      requirements: p.requirements,
      sample: personalize(p.sample, name),
      sampleEn: p.sampleEn,
      starter: p.starter,
      scene: p.scene,
    };
  }
  const promptIsEnglish = !/[¿¡áéíóúñ]/i.test(p.prompt) && /^(say|ask|order|tell|introduce)/i.test(p.prompt);
  return {
    ...base(ctx, itemId, "speaking", "speak", `speak:${p.id}`, itemIds),
    type: "speak",
    stage: p.stage,
    prompt: personalize(p.prompt, name),
    promptLang: promptIsEnglish ? "en" : "es",
    promptEn: p.promptEn || undefined,
    model: p.model ? personalize(p.model, name) : undefined,
    starter: p.starter,
    accepted: p.stage === 1 && p.model ? [personalize(p.model, name)] : undefined,
    requirements: p.stage === 1 ? undefined : p.requirements,
    sample: personalize(p.sample, name),
    sampleEn: p.sampleEn,
    scene: p.scene,
  };
}

function conceptExercise(v: VocabItem, ctx: GenContext): ConceptEx | null {
  if (v.emoji && v.pos === "noun") {
    return {
      ...base(ctx, v.id, "production", "concept", `concept:emoji:${v.id}`),
      type: "concept",
      emoji: v.emoji,
      question: "¿Qué es esto?",
      accepted: nounAnswers(v.es),
      answer: capitalize(/^(la|las|una)\s/i.test(v.es) ? `una ${v.es.replace(ARTICLE, "")}` : `un ${v.es.replace(ARTICLE, "")}`),
    };
  }
  if (v.defEs) {
    return {
      ...base(ctx, v.id, "production", "concept", `concept:def:${v.id}`),
      type: "concept",
      emoji: v.emoji,
      definition: v.defEs,
      question: "¿Qué palabra es?",
      accepted: v.pos === "noun" ? nounAnswers(v.es) : [v.es, ...v.keys],
      answer: v.es,
    };
  }
  return null;
}

export function matchExercise(ids: string[], ctx: GenContext): MatchEx {
  const pairs = ids.map((id) => ({ id, es: VOCAB[id].es, en: VOCAB[id].en }));
  return { ...base(ctx, ids[0], "recognition", "match", `match:${ids.join(",")}`, ids.slice(1)), type: "match", pairs };
}

export function dialogueExercise(scenarioId: string, ctx: GenContext): DialogueEx | null {
  const sc = SCENARIO_MAP[scenarioId];
  if (!sc) return null;
  const turn = sc.turns[0];
  return {
    ...base(ctx, `sc:${sc.id}`, "speaking", "dialogue", `dialogue:${sc.id}`, sc.vocab.filter((v) => VOCAB[v])),
    type: "dialogue",
    scenarioId: sc.id,
    partner: sc.partner,
    npc: turn.npc,
    intents: turn.intents.map((i) => ({ requirements: i.requirements, reply: i.reply })),
    starters: turn.starters,
  };
}

// ─── Skill selection ──────────────────────────────────────────────────────

const sc = (m: MemoryState | undefined, k: Skill) => m?.scores[k] ?? null;

/** Walk the learner from recognition → recall → production → listening → speaking. */
export function chooseSkill(itemId: string, ctx: GenContext): Skill {
  const m = mem(ctx.state, itemId);
  const isSentence = itemId.startsWith("s:");
  const rec = sc(m, isSentence ? "comprehension" : "recognition");
  if (rec == null || rec < 0.6) return isSentence ? "comprehension" : "recognition";
  const recall = Math.max(sc(m, "recall") ?? 0, sc(m, "production") ?? 0);
  if (recall < 0.5) return "recall";
  const options: Skill[] = ["production", "listening"];
  if (ctx.speaking) options.push("speaking");
  if (isSentence) options.push("recall");
  const scored = options.map((s) => ({ s, v: (sc(m, s) ?? 0.3) + (m?.lastSkill === s ? 0.25 : 0) + ctx.random() * 0.1 }));
  scored.sort((a, b) => a.v - b.v);
  return scored[0].s;
}

/** Build an exercise for an item and skill, avoiding recently used variants. */
export function exerciseFor(itemId: string, skill: Skill, ctx: GenContext): Exercise {
  const m = mem(ctx.state, itemId);
  const avoid = recent(m);
  const assist = assistanceLevel(m, ctx.state);
  const spanishOnly = readyForSpanishOnly(m, ctx.state);

  if (itemId.startsWith("v:")) {
    const v = VOCAB[itemId];
    const s = pickSentence(itemId, ctx, avoid);
    const candidates: (() => Exercise | null)[] = [];
    switch (skill) {
      case "recognition":
        candidates.push(() => vocabChoice(v, "es-en", ctx));
        if (s) candidates.push(() => ({ ...sentenceChoice(s, ctx, "recognition"), itemId, itemIds: s.vocab.filter((x) => x !== itemId), variant: `choice:ctx:${s.id}` }));
        break;
      case "comprehension":
        if (s) candidates.push(() => ({ ...sentenceChoice(s, ctx, "comprehension"), itemId, itemIds: s.vocab.filter((x) => x !== itemId) }));
        candidates.push(() => vocabChoice(v, "es-en", ctx));
        break;
      case "recall":
        if (assist >= 2) candidates.push(() => vocabChoice(v, "en-es", ctx));
        if (s) candidates.push(() => fillExercise(s, itemId, ctx, assist));
        if (spanishOnly || assist === 0) candidates.push(() => conceptExercise(v, ctx));
        candidates.push(() => vocabChoice(v, "en-es", ctx));
        break;
      case "production":
        if (spanishOnly) candidates.push(() => conceptExercise(v, ctx));
        if (s) candidates.push(() => translateExercise(s, itemId, "en-es", ctx, assist));
        candidates.push(() => conceptExercise(v, ctx));
        if (s) candidates.push(() => fillExercise(s, itemId, ctx, 0));
        candidates.push(() => vocabChoice(v, "en-es", ctx));
        break;
      case "listening":
        if (s && (sc(m, "listening") ?? 0) >= 0.5) candidates.push(() => dictationExercise(s, itemId, ctx));
        if (s) candidates.push(() => listenExercise(s, itemId, ctx));
        candidates.push(() => ({ ...vocabChoice(v, "es-en", ctx), skill: "listening" as Skill, prompt: "", instruction: "What did you hear?", variant: "choice:audio" }));
        break;
      case "speaking":
      case "pronunciation":
        if (s && (sc(m, "speaking") ?? 0) >= 0.5) candidates.push(() => speakTranslate(s, itemId, ctx, assist));
        if (s) candidates.push(() => speakRepeat(personalize(s.es, ctx.state.profile.name), s.en, itemId, ctx, s.vocab));
        candidates.push(() => speakRepeat(v.es, v.en, itemId, ctx, [], skill));
        break;
    }
    return firstFresh(candidates, avoid) ?? vocabChoice(v, "es-en", ctx);
  }

  // Sentences
  const s = SENTENCES[itemId];
  const candidates: (() => Exercise | null)[] = [];
  switch (skill) {
    case "recognition":
    case "comprehension":
      if (assist <= 1) candidates.push(() => translateExercise(s, itemId, "es-en", ctx, assist));
      candidates.push(() => sentenceChoice(s, ctx, skill));
      candidates.push(() => ({ ...listenExercise(s, itemId, ctx), skill }));
      break;
    case "recall":
      candidates.push(() => arrangeExercise(s, itemId, ctx, assist));
      candidates.push(() => fillExercise(s, itemId, ctx, assist));
      break;
    case "production":
      candidates.push(() => translateExercise(s, itemId, "en-es", ctx, assist));
      if (assist >= 1) candidates.push(() => arrangeExercise(s, itemId, ctx, assist));
      break;
    case "listening":
      if ((sc(m, "listening") ?? 0) >= 0.4 || assist === 0) candidates.push(() => dictationExercise(s, itemId, ctx));
      candidates.push(() => ({ ...listenExercise(s, itemId, ctx), skill: "listening" as Skill }));
      candidates.push(() => dictationExercise(s, itemId, ctx));
      break;
    case "speaking":
    case "pronunciation":
      if ((sc(m, "speaking") ?? 0) >= 0.5) candidates.push(() => speakTranslate(s, itemId, ctx, assist));
      candidates.push(() => speakRepeat(personalize(s.es, ctx.state.profile.name), s.en, itemId, ctx, s.vocab));
      break;
  }
  return firstFresh(candidates, avoid) ?? sentenceChoice(s, ctx, "comprehension");
}

function firstFresh(candidates: (() => Exercise | null)[], avoid: Set<string>): Exercise | null {
  let fallback: Exercise | null = null;
  for (const make of candidates) {
    const ex = make();
    if (!ex) continue;
    if (!avoid.has(ex.variant)) return ex;
    fallback ??= ex;
  }
  return fallback;
}

/** The next exercise for an item: picks the skill, then the format. */
export function nextExerciseForItem(itemId: string, ctx: GenContext, skill?: Skill): Exercise {
  return exerciseFor(itemId, skill ?? chooseSkill(itemId, ctx), ctx);
}

/** Targeted practice for a grammar concept — a different sentence and format each time. */
export function conceptDrill(conceptId: string, sentenceId: string, ctx: GenContext, variantIndex: number): Exercise | null {
  const s = SENTENCES[sentenceId];
  if (!s) return null;
  const m = mem(ctx.state, sentenceId);
  const assist = Math.min(assistanceLevel(m, ctx.state), variantIndex === 0 ? 2 : 1);
  const kind = variantIndex % 3;
  const ex =
    kind === 0
      ? fillExercise(s, sentenceId, ctx, Math.max(1, assist), conceptId)
      : kind === 1
        ? translateExercise(s, sentenceId, "en-es", ctx, assist)
        : ctx.speaking
          ? speakTranslate(s, sentenceId, ctx, assist)
          : arrangeExercise(s, sentenceId, ctx, assist);
  return ex ? { ...ex, conceptId, skill: ex.type === "fill" ? "recall" : ex.skill } : null;
}

// ─── Smart review after a mistake ─────────────────────────────────────────

/**
 * After a wrong answer: recall it again shortly (different format), then test
 * it later in a different context (a sibling sentence sharing the key word).
 */
export function followUps(ex: Exercise, ctx: GenContext): { again: Exercise | null; context: Exercise | null } {
  if (ex.type === "intro" || ex.type === "grammar" || ex.type === "dialogue" || ex.type === "open" || ex.type === "picture") return { again: null, context: null };
  const id = ex.itemId;
  if (!SENTENCES[id] && !VOCAB[id]) return { again: null, context: null };
  let again: Exercise | null = null;
  if (SENTENCES[id]) {
    const s = SENTENCES[id];
    if (ex.type === "translate" && ex.direction === "en-es") again = arrangeExercise(s, id, ctx, 1);
    else if (ex.type === "arrange") again = fillExercise(s, id, ctx, 1, ex.conceptId) ?? arrangeExercise(s, id, ctx, 2);
    else if (ex.type === "fill") again = translateExercise(s, id, "en-es", ctx, 1);
    else if (ex.type === "dictation") again = { ...dictationExercise(s, id, ctx) };
    else if (ex.type === "speak") again = speakRepeat(personalize(s.es, ctx.state.profile.name), s.en, id, ctx, s.vocab);
    else again = arrangeExercise(s, id, ctx, 2);
  } else {
    const v = VOCAB[id];
    if (ex.type === "choice") {
      const s = pickSentence(id, ctx, new Set());
      again = s ? fillExercise(s, id, ctx, 2) : vocabChoice(v, "en-es", ctx);
    } else if (ex.type === "speak") again = speakRepeat(v.es, v.en, id, ctx);
    else again = vocabChoice(v, "en-es", ctx);
  }
  // Different context: a sentence that shares a key word but isn't this one.
  let context: Exercise | null = null;
  const keyVocab = SENTENCES[id] ? SENTENCES[id].vocab.filter((v) => VOCAB[v]?.drill).sort((a, b) => (VOCAB[b].difficulty - VOCAB[a].difficulty) || (hash(a) % 7) - (hash(b) % 7)) : [id];
  for (const vid of keyVocab) {
    const sib = pickSentence(vid, ctx, new Set(), SENTENCES[id] ? id : undefined);
    if (sib && sib.id !== id) {
      context = translateExercise(sib, SENTENCES[id] ? sib.id : vid, "en-es", ctx, 1);
      break;
    }
  }
  const mark = (e: Exercise | null, retry: "again" | "context") => (e ? ({ ...e, retry, segment: ex.segment, reason: retry === "again" ? "Recall it again" : "Same idea, new sentence" } as Exercise) : null);
  return { again: mark(again, "again"), context: mark(context, "context") };
}

/** Accepted answers for any typed exercise. */
export function acceptedFor(ex: Exercise): string[] {
  switch (ex.type) {
    case "translate":
    case "fill":
    case "dictation":
    case "concept":
    case "arrange":
      return ex.accepted;
    case "speak":
      return ex.accepted ?? [];
    default:
      return [];
  }
}

export function exerciseLabel(ex: Exercise): string {
  switch (ex.type) {
    case "intro": return "New";
    case "grammar": return "Pattern";
    case "choice": return ex.promptLang === "en" ? "Recall" : "Meaning";
    case "match": return "Match";
    case "arrange": return "Build the sentence";
    case "translate": return ex.direction === "en-es" ? "Say it in Spanish" : "Understand";
    case "fill": return "Fill the gap";
    case "dictation": return "Dictation";
    case "listen": return "Listening";
    case "speak": return ex.stage === 1 ? "Repeat" : "Speak";
    case "concept": return "Think in Spanish";
    case "open": return "Write";
    case "picture": return "Describe";
    case "dialogue": return "Quick conversation";
  }
}

export function vocabTokensInText(text: string): string[] {
  return tokenize(text);
}
