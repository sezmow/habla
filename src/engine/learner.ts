// Pure state transitions for the learner. The UI store wraps these.

import type { AttemptRecord, ConversationRecord, DayActivity, LearnerState, MemoryState, MistakeRecord, PlacementResult, Profile, Settings } from "./types";
import type { Exercise } from "./exercises";
import type { SpeechEvaluation, TokenDiff, Verdict } from "./answer";
import { applyAttempt, applyExposure, DAY, isDue, isSuccess, LADDER_DAYS, newMemory } from "./memory";
import { classifyMistake } from "./mistakes";
import { xpFor, unlockedAchievements } from "./gamification";
import { dateKey } from "./progress";
import { LESSONS, LESSON_ORDER, SENTENCES, VOCAB, lessonItems, lessonPosition } from "../content";
import { hash } from "./text";

export const STATE_VERSION = 1;

export interface ExerciseResult {
  quality: number;
  verdict: Verdict;
  given: string;
  expected: string;
  diff: TokenDiff[];
  latencyMs: number;
  hinted: boolean;
  /** Active seconds spent on this exercise (capped). */
  seconds: number;
  speech?: SpeechEvaluation | null;
  selfAssessed?: boolean;
  speakingSeconds?: number;
  listeningSeconds?: number;
  /** Per-item quality for multi-item exercises (matching). */
  perItem?: Record<string, number>;
}

export const DEFAULT_SETTINGS: Settings = {
  variety: "latam",
  goalMinutes: 15,
  reminders: { enabled: false, time: "19:00" },
  audioRate: 1,
  difficulty: "adaptive",
  assistance: "adaptive",
  theme: "system",
  reducedMotion: "system",
  speakingEnabled: true,
  voiceURI: null,
  captions: true,
  aiConversation: true,
};

export function createLearner(profile: Partial<Profile>, settings: Partial<Settings>, now: number): LearnerState {
  return {
    version: STATE_VERSION,
    onboarded: false,
    demo: false,
    profile: {
      name: "",
      createdAt: now,
      priorStudy: "none",
      reason: "travel",
      selfUnderstanding: "none",
      selfSpeaking: "none",
      placement: null,
      ...profile,
    },
    settings: { ...DEFAULT_SETTINGS, ...settings },
    memory: {},
    lessons: {},
    mistakes: [],
    attempts: [],
    activity: {},
    conversations: [],
    achievements: {},
    listened: {},
    pronunciation: {},
    xp: 0,
    restDays: [],
  };
}

const isMemoryItem = (id: string) => (id.startsWith("v:") && !!VOCAB[id]) || (id.startsWith("s:") && !!SENTENCES[id]);
const kindOf = (id: string) => (id.startsWith("v:") ? "vocab" : "sentence") as MemoryState["kind"];

function ensure(state: LearnerState, id: string, now: number): MemoryState {
  return state.memory[id] ?? newMemory(id, kindOf(id), now);
}

function bumpActivity(state: LearnerState, now: number, patch: Partial<DayActivity>): Record<string, DayActivity> {
  const key = dateKey(now);
  const cur = state.activity[key] ?? { date: key, seconds: 0, xp: 0, speakingSeconds: 0, listeningSeconds: 0, reviewed: 0, learned: 0, exercises: 0, correct: 0, sessions: 0 };
  const next = { ...cur };
  for (const [k, v] of Object.entries(patch) as [keyof DayActivity, number][]) if (k !== "date") (next[k] as number) += v;
  return { ...state.activity, [key]: next };
}

function withAchievements(state: LearnerState, now: number): { state: LearnerState; unlocked: string[] } {
  const unlocked = unlockedAchievements(state, now);
  if (!unlocked.length) return { state, unlocked };
  const achievements = { ...state.achievements };
  unlocked.forEach((id) => (achievements[id] = now));
  return { state: { ...state, achievements }, unlocked };
}

export interface RecordOutcome {
  state: LearnerState;
  mistakes: MistakeRecord[];
  xp: number;
  unlocked: string[];
  learned: number;
}

/** Apply the result of one exercise to the learner state. */
export function recordResult(prev: LearnerState, ex: Exercise, r: ExerciseResult, now: number): RecordOutcome {
  let state: LearnerState = { ...prev, memory: { ...prev.memory } };
  let learned = 0;

  if (ex.type === "intro") {
    const ids = [ex.itemId, ...(ex.sentenceId ? SENTENCES[ex.sentenceId].vocab : [])].filter(isMemoryItem);
    for (const id of ids) {
      const existed = !!state.memory[id]?.exposureCount;
      state.memory[id] = applyExposure(ensure(state, id, now), now);
      if (!existed && (id.startsWith("s:") || VOCAB[id]?.drill)) learned++;
    }
    state.activity = bumpActivity(state, now, { seconds: r.seconds, learned, xp: 1 });
    state.xp += 1;
    const a = withAchievements(state, now);
    return { state: a.state, mistakes: [], xp: 1, unlocked: a.unlocked, learned };
  }
  if (ex.type === "grammar") {
    state.activity = bumpActivity(state, now, { seconds: r.seconds });
    return { state, mistakes: [], xp: 0, unlocked: [], learned: 0 };
  }

  const success = isSuccess(r.quality);
  const attempts: AttemptRecord[] = [];
  const prevMem = state.memory[ex.itemId];
  const gapDays = prevMem?.lastReview ? (now - prevMem.lastReview) / DAY : 0;
  const hinted = r.hinted;

  // Primary item(s).
  const primaries = r.perItem ? Object.keys(r.perItem) : [ex.itemId];
  // Repeating a model sentence is imitation: it's evidence about pronunciation,
  // not about being able to speak. Only prompted speech counts as speaking.
  const imitation = ex.type === "speak" && ex.stage === 1;
  for (const id of primaries) {
    const q = r.perItem ? r.perItem[id] : r.quality;
    if (isMemoryItem(id)) {
      const before = ensure(state, id, now);
      const selfFactor = r.selfAssessed ? 0.8 : 1;
      state.memory[id] = applyAttempt(before, { skill: ex.skill, type: ex.type, quality: q * selfFactor, latencyMs: r.latencyMs, hinted, variant: ex.variant, now });
    }
    attempts.push({ at: now, itemId: id, skill: imitation ? "pronunciation" : ex.skill, type: ex.type, correct: isSuccess(q), quality: q, latencyMs: r.latencyMs, gapDays, hinted });
  }

  // Speech: intelligibility doubles as pronunciation evidence.
  if (r.speech?.intelligibility != null && !imitation) {
    attempts.push({ at: now, itemId: ex.itemId, skill: "pronunciation", type: ex.type, correct: r.speech.intelligibility >= 0.65, quality: r.speech.intelligibility, latencyMs: r.latencyMs, gapDays, hinted });
    if (isMemoryItem(ex.itemId)) {
      const m = state.memory[ex.itemId];
      const p = m.scores.pronunciation;
      state.memory[ex.itemId] = {
        ...m,
        scores: { ...m.scores, pronunciation: p == null ? r.speech.intelligibility * 0.8 : p + 0.35 * (r.speech.intelligibility - p) },
        attempts: { ...m.attempts, pronunciation: m.attempts.pronunciation + 1 },
      };
    }
  }

  // Secondary items (words inside a sentence): exposure, plus credit for real use.
  for (const id of ex.itemIds) {
    if (!isMemoryItem(id) || primaries.includes(id)) continue;
    const m = state.memory[id];
    if (!m?.exposureCount) continue;
    let next = { ...m, lastSeen: now, exposureCount: m.exposureCount + 1 };
    // Words inside a sentence get credit for how the sentence was handled:
    // producing the whole sentence from memory proves recall of each word;
    // understanding it proves comprehension in context (which can only lift a
    // word through the first rungs of the ladder).
    if (success && VOCAB[id]?.drill && (isDue(m, now) || m.step === 0)) {
      const produced = ["translate", "arrange", "dictation", "speak"].includes(ex.type) && ["production", "recall", "speaking", "listening"].includes(ex.skill) && !(ex.type === "translate" && ex.direction === "es-en");
      const skill = produced ? (ex.skill === "listening" ? "listening" : ex.skill === "speaking" ? "speaking" : "production") : "comprehension";
      next = applyAttempt(m, { skill, type: ex.type, quality: hinted ? 0.7 : 0.85, latencyMs: 6000, hinted, variant: "context", now });
    }
    if (success && (ex.skill === "production" || ex.skill === "speaking")) {
      const p = next.scores.production;
      next = { ...next, usedInSentence: true, scores: { ...next.scores, production: p == null ? 0.5 : p + 0.08 * (1 - p) } };
    }
    state.memory[id] = next;
  }

  // Mistakes.
  const mistakes: MistakeRecord[] = [];
  const spanishTyped = ["translate", "fill", "arrange", "dictation", "concept"].includes(ex.type) && !(ex.type === "translate" && ex.direction === "es-en");
  if (spanishTyped && r.verdict !== "correct" && r.given.trim()) {
    for (const c of classifyMistake(r.given, r.expected, r.diff)) {
      mistakes.push({ id: `${now}-${hash(r.given + c.category)}`, at: now, category: c.category, itemId: ex.itemId, prompt: promptOf(ex), expected: r.expected, given: r.given, detail: c.detail });
    }
    if (ex.type === "dictation" && r.diff.some((d) => d.status === "missing")) {
      mistakes.push({ id: `${now}-ld`, at: now, category: "listening-detail", itemId: ex.itemId, prompt: "Dictation", expected: r.expected, given: r.given, detail: `Missed: ${r.diff.filter((d) => d.status === "missing").map((d) => d.expected).join(", ")}` });
    }
  }
  if (r.speech && r.speech.intelligibility != null && r.speech.intelligibility < 0.65) {
    const words = r.speech.diff.filter((d) => d.status === "wrong" || d.status === "missing").map((d) => d.expected).slice(0, 3);
    if (words.length) mistakes.push({ id: `${now}-pr`, at: now, category: "pronunciation", itemId: ex.itemId, prompt: "Speaking", expected: r.expected, given: r.speech.transcript, detail: `Hard to hear: ${words.join(", ")}` });
  }

  const xp = xpFor(ex.type, ex.skill, r.quality, prevMem, ex.variant);
  state = {
    ...state,
    attempts: [...state.attempts, ...attempts].slice(-3000),
    mistakes: [...state.mistakes, ...mistakes].slice(-600),
    xp: state.xp + xp,
  };
  state.activity = bumpActivity(state, now, {
    seconds: r.seconds,
    xp,
    exercises: 1,
    correct: success ? 1 : 0,
    reviewed: ex.segment === "review" && success ? 1 : 0,
    speakingSeconds: r.speakingSeconds ?? 0,
    listeningSeconds: r.listeningSeconds ?? 0,
  });
  const a = withAchievements(state, now);
  return { state: a.state, mistakes, xp, unlocked: a.unlocked, learned };
}

function promptOf(ex: Exercise): string {
  switch (ex.type) {
    case "translate":
    case "arrange":
    case "choice":
    case "speak":
      return ex.prompt;
    case "fill":
      return ex.translation;
    case "dictation":
      return "Dictation";
    case "concept":
      return ex.definition ?? ex.question;
    default:
      return "";
  }
}

export function completeLesson(prev: LearnerState, lessonId: string, accuracy: number, now: number): LearnerState {
  const cur = prev.lessons[lessonId];
  const memory = { ...prev.memory };
  // Every item in the lesson now has a memory state, even if it was only seen in context.
  for (const id of lessonItems(lessonId)) if (!memory[id]) memory[id] = applyExposure(newMemory(id, kindOf(id), now), now);
  const state = {
    ...prev,
    memory,
    lessons: { ...prev.lessons, [lessonId]: { completedAt: cur?.completedAt ?? now, attempts: (cur?.attempts ?? 0) + 1, bestAccuracy: Math.max(cur?.bestAccuracy ?? 0, accuracy) } },
  };
  return withAchievements(state, now).state;
}

export function recordSession(prev: LearnerState, now: number): LearnerState {
  return { ...prev, activity: bumpActivity(prev, now, { sessions: 1 }) };
}

/**
 * Placement: earlier lessons are marked as tested out. Their items start as
 * "familiar but unverified" and are scheduled for review over the next days,
 * so the placement is confirmed by real recall, not assumed.
 */
export function applyPlacement(prev: LearnerState, result: PlacementResult, now: number): LearnerState {
  const startPos = lessonPosition(result.startLessonId);
  const lessons = { ...prev.lessons };
  const memory = { ...prev.memory };
  LESSON_ORDER.slice(0, Math.max(0, startPos)).forEach((id, i) => {
    lessons[id] = { completedAt: now, attempts: 0, bestAccuracy: 0, testedOut: true };
    for (const item of lessonItems(id)) {
      const m = newMemory(item, kindOf(item), now - DAY);
      const spread = ((hash(item) % 1000) / 1000) * 3 + i * 0.05;
      memory[item] = {
        ...m,
        exposureCount: 1,
        step: 2,
        stability: LADDER_DAYS[1],
        lastReview: now - DAY,
        nextReview: now + spread * DAY,
        scores: { ...m.scores, recognition: 0.6, comprehension: 0.55, recall: 0.35 },
        attempts: { ...m.attempts, recognition: 1 },
      };
    }
  });
  return { ...prev, lessons, memory, profile: { ...prev.profile, placement: result } };
}

export function recordConversation(prev: LearnerState, rec: ConversationRecord, speakingSeconds: number, seconds: number, now: number): LearnerState {
  const state: LearnerState = {
    ...prev,
    conversations: [...prev.conversations, rec].slice(-200),
    xp: prev.xp + rec.turns * 10,
    activity: bumpActivity(prev, now, { speakingSeconds, seconds, xp: rec.turns * 10, sessions: 1 }),
  };
  return withAchievements(state, now).state;
}

export function recordListening(prev: LearnerState, pieceId: string, score: number, seconds: number, now: number): LearnerState {
  const state: LearnerState = {
    ...prev,
    listened: { ...prev.listened, [pieceId]: Math.max(prev.listened[pieceId] ?? 0, score) },
    xp: prev.xp + Math.round(score * 20),
    activity: bumpActivity(prev, now, { listeningSeconds: seconds, seconds, xp: Math.round(score * 20) }),
  };
  return withAchievements(state, now).state;
}

export function recordPronunciation(prev: LearnerState, moduleId: string, score: number, seconds: number, now: number): LearnerState {
  const cur = prev.pronunciation[moduleId];
  const attempt: AttemptRecord = { at: now, itemId: `pron:${moduleId}`, skill: "pronunciation", type: "speak", correct: score >= 0.65, quality: score, latencyMs: 0, gapDays: 0, hinted: false };
  return {
    ...prev,
    pronunciation: { ...prev.pronunciation, [moduleId]: { attempts: (cur?.attempts ?? 0) + 1, best: Math.max(cur?.best ?? 0, score), lastAt: now } },
    attempts: [...prev.attempts, attempt].slice(-3000),
    activity: bumpActivity(prev, now, { speakingSeconds: seconds, seconds, xp: 6 }),
    xp: prev.xp + 6,
  };
}

export function useRestDay(prev: LearnerState, date: string): LearnerState {
  return prev.restDays.includes(date) ? prev : { ...prev, restDays: [...prev.restDays, date].slice(-60) };
}

/** Start learning phrase-bank items directly. */
export function introduceItems(prev: LearnerState, ids: string[], now: number): LearnerState {
  const memory = { ...prev.memory };
  for (const id of ids) if (isMemoryItem(id) && !memory[id]?.exposureCount) memory[id] = applyExposure(ensure(prev, id, now), now);
  return { ...prev, memory };
}

export function lessonTitle(id: string): string {
  return LESSONS[id]?.title ?? id;
}
