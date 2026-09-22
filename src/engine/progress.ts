// Progress analytics: a skill profile rather than one arbitrary number.

import type { AttemptRecord, DayActivity, LearnerState, Skill } from "./types";
import { LESSONS, LESSON_ORDER, LEVELS, UNITS, VOCAB, SENTENCES, PHRASE_BANK } from "../content";
import { DAY, isRetained, masteryLevel, retrievability } from "./memory";

export type ProfileSkill = "speaking" | "listening" | "vocabulary" | "grammar" | "pronunciation" | "conversation" | "retention";
export const PROFILE_SKILLS: ProfileSkill[] = ["speaking", "listening", "vocabulary", "grammar", "pronunciation", "conversation", "retention"];
export const PROFILE_LABEL: Record<ProfileSkill, string> = {
  speaking: "Speaking",
  listening: "Listening",
  vocabulary: "Vocabulary",
  grammar: "Grammar",
  pronunciation: "Pronunciation",
  conversation: "Conversation",
  retention: "Retention",
};

export interface SkillValue {
  value: number | null;
  samples: number;
}

function weightedMean(records: AttemptRecord[], now: number, halfLifeDays = 14): SkillValue {
  const recent = records.slice(-150);
  if (!recent.length) return { value: null, samples: 0 };
  let sum = 0;
  let w = 0;
  for (const r of recent) {
    const weight = Math.pow(0.5, (now - r.at) / DAY / halfLifeDays);
    sum += r.quality * weight;
    w += weight;
  }
  return { value: recent.length >= 3 && w > 0 ? sum / w : null, samples: recent.length };
}

export function skillProfile(state: LearnerState, now: number): Record<ProfileSkill, SkillValue> {
  const a = state.attempts;
  const vocab = Object.values(state.memory).filter((m) => m.kind === "vocab" && m.exposureCount > 0 && VOCAB[m.id]?.drill);
  let vSum = 0;
  let vN = 0;
  for (const m of vocab) {
    const active = Math.max(m.scores.recall ?? 0, m.scores.production ?? 0);
    const passive = (m.scores.recognition ?? 0) * 0.6;
    vSum += Math.max(active, passive) * Math.sqrt(retrievability(m, now));
    vN++;
  }
  const listeningAttempts = a.filter((r) => r.type === "listen" || r.type === "dictation" || (r.skill === "listening" && r.type === "choice"));
  const pieceScores = Object.values(state.listened);
  const listening = weightedMean(listeningAttempts, now);
  if (pieceScores.length) {
    const pieceAvg = pieceScores.reduce((s, x) => s + x, 0) / pieceScores.length;
    listening.value = listening.value == null ? (pieceScores.length >= 2 ? pieceAvg : null) : listening.value * 0.8 + pieceAvg * 0.2;
    listening.samples += pieceScores.length;
  }
  const conv = state.conversations.slice(-6);
  const convValue = conv.length
    ? conv.reduce((s, c) => s + (c.scores.comprehension + c.scores.relevance + c.scores.vocabulary + c.scores.grammar + c.scores.continuation) / 5, 0) / conv.length
    : null;
  const reviews = a.filter((r) => r.gapDays >= 1 && now - r.at < 45 * DAY && r.type !== "intro");
  const reviewed = Object.values(state.memory).filter((m) => m.lastReview > 0);
  const retention: SkillValue =
    reviews.length >= 5
      ? { value: reviews.filter((r) => r.correct).length / reviews.length, samples: reviews.length }
      : reviewed.length >= 5
        ? { value: reviewed.reduce((s, m) => s + retrievability(m, now), 0) / reviewed.length, samples: reviewed.length }
        : { value: null, samples: reviewed.length };

  return {
    speaking: weightedMean(a.filter((r) => r.skill === "speaking"), now),
    listening,
    vocabulary: { value: vN >= 5 ? vSum / vN : null, samples: vN },
    grammar: weightedMean(a.filter((r) => r.itemId.startsWith("s:") && (r.skill === "production" || r.skill === "recall")), now),
    pronunciation: weightedMean(a.filter((r) => r.skill === "pronunciation"), now),
    conversation: { value: convValue, samples: conv.length },
    retention,
  };
}

/** The weakest skills relative to the learner's own average. */
export function weaknesses(profile: Record<ProfileSkill, SkillValue>): { skill: ProfileSkill; gap: number }[] {
  const known = PROFILE_SKILLS.filter((s) => profile[s].value != null);
  if (!known.length) return [];
  const avg = known.reduce((s, k) => s + profile[k].value!, 0) / known.length;
  return known.map((skill) => ({ skill, gap: avg - profile[skill].value! })).filter((w) => w.gap > 0.04).sort((a, b) => b.gap - a.gap);
}

/** Average skill scores across all items: "I recognize it" vs. "I can use it". */
export function dimensionAverages(state: LearnerState): { skill: Skill; label: string; value: number | null; n: number }[] {
  const dims: [Skill, string][] = [["recognition", "Recognition"], ["recall", "Recall"], ["production", "Production"], ["listening", "Listening"], ["speaking", "Speaking"]];
  const items = Object.values(state.memory).filter((m) => m.exposureCount > 0);
  return dims.map(([skill, label]) => {
    const vals = items.map((m) => (skill === "recognition" ? m.scores.recognition ?? m.scores.comprehension : m.scores[skill])).filter((v): v is number => v != null);
    return { skill, label, value: vals.length >= 3 ? vals.reduce((a, b) => a + b, 0) / vals.length : null, n: vals.length };
  });
}

export function lessonsCompleted(state: LearnerState): string[] {
  return LESSON_ORDER.filter((id) => state.lessons[id]?.completedAt);
}

export function nextLessonId(state: LearnerState): string | null {
  return LESSON_ORDER.find((id) => !state.lessons[id]?.completedAt) ?? null;
}

export function unitProgress(state: LearnerState, unitId: string): { done: number; total: number } {
  const unit = UNITS.find((u) => u.id === unitId)!;
  return { done: unit.lessons.filter((l) => state.lessons[l]?.completedAt).length, total: unit.lessons.length };
}

// ─── CEFR (approximate) ────────────────────────────────────────────────────

export interface CefrEstimate {
  band: string;
  statement: string;
  canDo: string[];
  next: string[];
  progressToNext: number;
}

export function cefrEstimate(state: LearnerState, now: number): CefrEstimate {
  const profile = skillProfile(state, now);
  const core = (["vocabulary", "grammar", "listening", "speaking"] as ProfileSkill[]).map((s) => profile[s].value).filter((v): v is number => v != null);
  const skill = core.length ? core.reduce((a, b) => a + b, 0) / core.length : 0.5;
  const factor = Math.min(1, skill / 0.65);
  const levelFrac = (i: number) => {
    const ids = LEVELS[i].units.flatMap((u) => UNITS.find((x) => x.id === u)!.lessons);
    return ids.length ? ids.filter((id) => state.lessons[id]?.completedAt).length / ids.length : 0;
  };
  const e1 = levelFrac(0) * factor;
  const e2 = levelFrac(1) * factor;
  let band: string;
  let progressToNext: number;
  if (e1 < 0.15) [band, progressToNext] = ["Pre-A1", e1 / 0.15];
  else if (e1 < 0.5) [band, progressToNext] = ["early A1", (e1 - 0.15) / 0.35];
  else if (e1 < 0.9) [band, progressToNext] = ["A1", (e1 - 0.5) / 0.4];
  else if (e2 < 0.4) [band, progressToNext] = ["A1–A2", e2 / 0.4];
  else if (e2 < 0.85) [band, progressToNext] = ["early A2", (e2 - 0.4) / 0.45];
  else [band, progressToNext] = ["A2", 1];

  const canDo: string[] = [];
  const next: string[] = [];
  for (const u of UNITS) {
    if (!u.lessons.length) continue;
    const { done, total } = unitProgress(state, u.id);
    if (done / total >= 0.75) canDo.push(...u.canDo);
    else if (!next.length) next.push(...u.canDo);
  }
  return {
    band,
    statement: band === "Pre-A1" ? "You're building your first Spanish. Every lesson adds real phrases you can use." : `Your current performance is consistent with approximately ${band}-level tasks.`,
    canDo: [...new Set(canDo)].slice(-8),
    next: next.slice(0, 4),
    progressToNext: Math.max(0, Math.min(1, progressToNext)),
  };
}

// ─── Stats ────────────────────────────────────────────────────────────────

export function learningStats(state: LearnerState, now: number) {
  const mems = Object.values(state.memory).filter((m) => m.exposureCount > 0);
  const vocab = mems.filter((m) => m.kind === "vocab" && VOCAB[m.id]?.drill);
  const days = Object.values(state.activity);
  const sum = (f: (d: DayActivity) => number) => days.reduce((s, d) => s + f(d), 0);
  const phraseIds = new Set(PHRASE_BANK.map((p) => p.id));
  return {
    wordsLearned: vocab.length,
    wordsRetained: vocab.filter((m) => isRetained(m, now)).length,
    sentencesMastered: mems.filter((m) => m.kind === "sentence" && SENTENCES[m.id] && ["strong", "mastered"].includes(masteryLevel(m))).length,
    sentencesProduced: mems.filter((m) => m.kind === "sentence" && (m.scores.production ?? 0) >= 0.6).length,
    phrasesAutomatic: mems.filter((m) => phraseIds.has(m.id) && ["strong", "mastered"].includes(masteryLevel(m))).length,
    minutesSpoken: Math.round(sum((d) => d.speakingSeconds) / 60),
    listeningMinutes: Math.round(sum((d) => d.listeningSeconds) / 60),
    totalMinutes: Math.round(sum((d) => d.seconds) / 60),
    conversations: state.conversations.length,
    daysPracticed: days.filter((d) => d.seconds >= 60).length,
    lessonsCompleted: lessonsCompleted(state).length,
    lessonsTotal: Object.keys(LESSONS).length,
  };
}

/** Measured retention: success on reviews after roughly 1, 7 and 30 days. */
export function retentionMetrics(state: LearnerState) {
  const bucket = (lo: number, hi: number) => {
    const rs = state.attempts.filter((r) => r.gapDays >= lo && r.gapDays < hi && r.skill !== "recognition");
    return { rate: rs.length >= 3 ? rs.filter((r) => r.correct).length / rs.length : null, n: rs.length };
  };
  return { day1: bucket(0.5, 3), day7: bucket(5, 12), day30: bucket(21, 60) };
}

export function activitySeries(state: LearnerState, now: number, days = 14): DayActivity[] {
  const out: DayActivity[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = dateKey(now - i * DAY);
    out.push(state.activity[date] ?? { date, seconds: 0, xp: 0, speakingSeconds: 0, listeningSeconds: 0, reviewed: 0, learned: 0, exercises: 0, correct: 0, sessions: 0 });
  }
  return out;
}

export function dateKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
