// The memory model: every word and sentence has its own state.
//
// Scheduling follows a spacing ladder (10 min → 1 d → 3 d → 7 d → 14 d → 30 d →
// 60 d …) scaled per item by how hard it is for this learner, how fast they
// answered, whether they needed a hint, and how demanding the exercise was.
// Recognition-only successes cannot push an item far up the ladder — only
// recall, production, listening and speaking can.
//
// Forgetting is modeled with a power curve R(t) = (1 + t / 9S)^-1, where S
// (stability) is the interval at which predicted recall falls to 90%.

import type { ExerciseType, ItemKind, MemoryState, Skill } from "./types";
import { SKILLS } from "./types";

export const MINUTE = 60_000;
export const DAY = 86_400_000;
export const LADDER_DAYS = [10 / 1440, 1, 3, 7, 14, 30, 60, 120, 240, 365];

/** How strongly a successful attempt in each skill proves the item is known. */
export const SKILL_WEIGHT: Record<Skill, number> = {
  recognition: 0.45,
  comprehension: 0.6,
  listening: 0.8,
  recall: 0.9,
  production: 1,
  speaking: 1,
  pronunciation: 0.6,
};

/** Typical answer time (ms) per exercise type, used to judge fluency of recall. */
export const EXPECTED_LATENCY: Partial<Record<ExerciseType, number>> = {
  choice: 4500,
  match: 12000,
  listen: 6000,
  arrange: 10000,
  fill: 7000,
  translate: 13000,
  dictation: 14000,
  concept: 7000,
  speak: 9000,
  open: 25000,
  picture: 25000,
  dialogue: 15000,
};

const emptyScores = () => Object.fromEntries(SKILLS.map((s) => [s, null])) as Record<Skill, number | null>;
const emptyCounts = () => Object.fromEntries(SKILLS.map((s) => [s, 0])) as Record<Skill, number>;

export function newMemory(id: string, kind: ItemKind, now: number): MemoryState {
  return {
    id,
    kind,
    introducedAt: now,
    exposureCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    recallSuccesses: 0,
    lastSeen: now,
    lastCorrect: null,
    lastReview: 0,
    nextReview: now + 10 * MINUTE,
    stability: LADDER_DAYS[0],
    difficulty: 0.4,
    step: 0,
    lapses: 0,
    scores: emptyScores(),
    attempts: emptyCounts(),
    avgLatencyMs: null,
    confidence: 0,
    longestRecallGap: 0,
    usedInSentence: false,
    recentVariants: [],
    lastSkill: null,
  };
}

/** Predicted probability of recall right now. */
export function retrievability(m: MemoryState, now: number): number {
  if (!m.lastReview) return m.exposureCount > 0 ? 0.5 : 0;
  const t = Math.max(0, (now - m.lastReview) / DAY);
  return 1 / (1 + t / (9 * Math.max(m.stability, 1 / 1440)));
}

export function averageScore(m: MemoryState, skills: Skill[] = SKILLS): number | null {
  const vals = skills.map((s) => m.scores[s]).filter((v): v is number => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** A single 0–1 "how well do you know this right now" number for display. */
export function memoryStrength(m: MemoryState, now: number): number {
  const avg = averageScore(m) ?? 0;
  return retrievability(m, now) * (0.4 + 0.6 * avg);
}

export function isDue(m: MemoryState, now: number): boolean {
  return m.exposureCount > 0 && m.nextReview <= now;
}

export interface AttemptInput {
  skill: Skill;
  type: ExerciseType;
  /** 0–1. ≥ 0.6 counts as a successful retrieval. */
  quality: number;
  latencyMs: number;
  hinted: boolean;
  variant: string;
  now: number;
}

export function isSuccess(quality: number): boolean {
  return quality >= 0.6;
}

/** Apply an introduction (seeing an item for the first time — not a retrieval). */
export function applyExposure(m: MemoryState, now: number, variant = "intro"): MemoryState {
  return {
    ...m,
    exposureCount: m.exposureCount + 1,
    lastSeen: now,
    nextReview: m.lastReview ? m.nextReview : now + 10 * MINUTE,
    recentVariants: [...m.recentVariants, variant].slice(-6),
  };
}

export function applyAttempt(prev: MemoryState, a: AttemptInput): MemoryState {
  const m: MemoryState = { ...prev, scores: { ...prev.scores }, attempts: { ...prev.attempts } };
  const correct = isSuccess(a.quality);
  const now = a.now;

  m.exposureCount += 1;
  m.lastSeen = now;
  m.recentVariants = [...m.recentVariants, a.variant].slice(-6);
  m.lastSkill = a.skill;
  if (correct) {
    m.correctCount += 1;
    m.lastCorrect = now;
  } else m.incorrectCount += 1;

  // Latency (successful answers only — wrong answers aren't "slow recall").
  if (correct && a.latencyMs > 0) {
    m.avgLatencyMs = m.avgLatencyMs == null ? a.latencyMs : m.avgLatencyMs * 0.7 + a.latencyMs * 0.3;
  }

  // Per-skill score: exponential moving average. A first success is capped at
  // 0.8 so one lucky answer never looks like mastery.
  const before = prev.scores[a.skill];
  const outcome = correct ? a.quality * (a.hinted ? 0.7 : 1) : a.quality * 0.3;
  m.scores[a.skill] = before == null ? outcome * 0.8 : before + 0.35 * (outcome - before);
  m.attempts[a.skill] += 1;

  const expected = EXPECTED_LATENCY[a.type] ?? 8000;
  const latencyFactor = !correct ? 1 : a.latencyMs < expected * 0.6 ? 1.15 : a.latencyMs > expected * 1.8 ? 0.85 : 1;

  const gapDays = prev.lastReview ? (now - prev.lastReview) / DAY : 0;
  const R = retrievability(prev, now);
  const weight = SKILL_WEIGHT[a.skill];
  const intervalMs = Math.max(0, prev.nextReview - prev.lastReview);
  // An item counts as reviewed "on time" once 75% of its interval has elapsed.
  // Within a session, a later recall or production success (a few minutes after
  // the first) completes the 10-minute learning step.
  const learningStep = prev.step === 1 && weight >= 0.75 && now - prev.lastReview >= 2 * MINUTE;
  const due = prev.step === 0 || !prev.lastReview || now >= prev.lastReview + intervalMs * 0.75 || learningStep;

  if (correct) {
    if (weight >= 0.75) {
      m.recallSuccesses += 1;
      if (gapDays >= 1) m.longestRecallGap = Math.max(m.longestRecallGap, gapDays);
    }
    if (due) {
      // Recognition alone can only move an item through the first rungs.
      // step = successful spaced retrievals so far; step n waits LADDER_DAYS[n - 1].
      if (weight >= 0.75 || prev.step < 3) m.step = Math.min(LADDER_DAYS.length, prev.step + 1);
      const ease = 1.35 - prev.difficulty * 0.7;
      const hint = a.hinted ? 0.6 : 1;
      const desirable = R < 0.85 ? 1 + (0.85 - R) : 1;
      const skillFactor = 0.6 + 0.4 * weight;
      const base = LADDER_DAYS[Math.max(0, m.step - 1)];
      const days = m.step <= 1 ? LADDER_DAYS[0] : Math.max(base * ease * latencyFactor * hint * desirable * skillFactor, 5 / 1440);
      m.stability = days;
      m.nextReview = now + days * DAY;
      m.lastReview = now;
    }
    m.difficulty = Math.max(0, prev.difficulty - 0.04 * a.quality);
    if ((a.skill === "production" || a.skill === "speaking") && ["translate", "speak", "open", "picture", "dialogue"].includes(a.type)) {
      m.usedInSentence = true;
    }
  } else {
    if (prev.step >= 2) m.lapses += 1;
    m.difficulty = Math.min(1, prev.difficulty + 0.12);
    m.step = Math.max(0, prev.step - 2);
    m.stability = Math.max(LADDER_DAYS[Math.max(0, m.step - 1)] * 0.5, LADDER_DAYS[0]);
    m.nextReview = now + 10 * MINUTE;
    m.lastReview = now;
  }

  const confTarget = correct ? (latencyFactor > 1 ? 1 : latencyFactor < 1 ? 0.7 : 0.85) * (a.hinted ? 0.7 : 1) : 0;
  m.confidence = prev.confidence + 0.3 * (confTarget - prev.confidence);
  return m;
}

// ─── Mastery ──────────────────────────────────────────────────────────────

export type MasteryLevel = "new" | "learning" | "familiar" | "strong" | "mastered";
export const MASTERY_ORDER: MasteryLevel[] = ["new", "learning", "familiar", "strong", "mastered"];

export interface Evidence {
  label: string;
  met: boolean;
}

const s = (m: MemoryState, k: Skill) => m.scores[k] ?? 0;

/** Mastery needs evidence across skills and time — not five right answers in a row. */
export function masteryEvidence(m: MemoryState): Evidence[] {
  return [
    { label: "Recalled 5+ times without options", met: m.recallSuccesses >= 5 },
    { label: "Produced it from memory", met: s(m, "production") >= 0.75 },
    { label: "Understood it by ear", met: s(m, "listening") >= 0.7 },
    { label: "Said it out loud", met: s(m, "speaking") >= 0.65 },
    { label: "Used it in a sentence", met: m.usedInSentence },
    { label: "Remembered after 3+ weeks", met: m.longestRecallGap >= 21 },
  ];
}

export function masteryLevel(m: MemoryState | undefined): MasteryLevel {
  if (!m || m.exposureCount === 0) return "new";
  const ev = masteryEvidence(m);
  if (ev.every((e) => e.met)) return "mastered";
  const recall = Math.max(s(m, "recall"), s(m, "production"));
  if (m.step >= 5 && s(m, "production") >= 0.7 && m.recallSuccesses >= 4 && (m.scores.listening == null || s(m, "listening") >= 0.6)) return "strong";
  if (m.step >= 3 && recall >= 0.5) return "familiar";
  return "learning";
}

export const MASTERY_LABEL: Record<MasteryLevel, string> = {
  new: "New",
  learning: "Learning",
  familiar: "Familiar",
  strong: "Strong",
  mastered: "Mastered",
};

/** Is this item still being actively retained (not just seen once)? */
export function isRetained(m: MemoryState, now: number): boolean {
  return m.recallSuccesses >= 2 && retrievability(m, now) >= 0.8 && Math.max(s(m, "recall"), s(m, "production")) >= 0.55;
}
