// Builds the demo profile by running a simulated learner through the real
// engine for three weeks: lessons, reviews, typical mistakes, and speaking
// that lags behind reading. Everything shown in the demo is an actual output
// of the scheduler and analytics — nothing is hand-set.

import type { ConversationRecord, LearnerState, Skill } from "./types";
import { DAY, retrievability } from "./memory";
import { checkSpanish, evaluateSpeech, type TokenDiff } from "./answer";
import { completeLesson, createLearner, recordConversation, recordListening, recordPronunciation, recordResult, recordSession, type ExerciseResult } from "./learner";
import { buildLessonExercises } from "./lesson";
import { nextExerciseForItem, exerciseFor, type Exercise, type GenContext } from "./exercises";
import { dueItems } from "./session";
import { nextLessonId } from "./progress";
import { scoreConversation } from "./conversation";
import { rng, stripAccents } from "./text";
import { SENTENCES, SCENARIO_MAP } from "../content";

const BASE_P: Record<Skill, number> = {
  recognition: 0.93,
  comprehension: 0.88,
  recall: 0.8,
  production: 0.7,
  listening: 0.72,
  speaking: 0.46,
  pronunciation: 0.6,
};

function corrupt(expected: string, random: () => number): string {
  const rules: [RegExp, string][] = [
    [/\bTengo (mucha )?(hambre|sed)\b/i, "Estoy $1$2"],
    [/\bEstoy\b/, "Soy"],
    [/\bestá\b/, "es"],
    [/\b(Mi|mi) hermana es\b/, "$1 hermana está"],
    [/\bsoy\b/i, "es"],
    [/\b(voy|vas|vamos) a\b/i, "$1"],
    [/\bla (camisa|casa|chica)\b/i, "el $1"],
    [/\bcomí\b/, "como"],
    [/\bfui\b/, "voy"],
  ];
  const applicable = rules.filter(([re]) => re.test(expected));
  if (applicable.length && random() < 0.8) {
    const [re, rep] = applicable[Math.floor(random() * applicable.length)];
    return expected.replace(re, rep);
  }
  const words = expected.split(" ");
  if (words.length > 2) words.splice(1 + Math.floor(random() * (words.length - 1)), 1);
  return words.join(" ");
}

function simulateAnswer(ex: Exercise, state: LearnerState, t: number, random: () => number, weakness: number): ExerciseResult {
  const secs = Math.max(4, ex.estSeconds * (0.7 + random() * 0.6));
  const base: ExerciseResult = { quality: 1, verdict: "correct", given: "", expected: "", diff: [], latencyMs: secs * 700, hinted: false, seconds: secs };
  if (ex.type === "intro" || ex.type === "grammar") return base;
  const m = state.memory[ex.itemId];
  const R = m ? retrievability(m, t) : 0.75;
  const concepts = SENTENCES[ex.itemId]?.concepts ?? [];
  let p = BASE_P[ex.skill] * (0.62 + 0.38 * R) + 0.1 * (m?.scores[ex.skill] ?? 0);
  if (concepts.includes("ser-estar") && ex.skill !== "recognition") p *= 0.72;
  if (concepts.includes("tener-expressions") && ex.skill === "production") p *= 0.85;
  p *= weakness;
  const ok = random() < p;

  switch (ex.type) {
    case "choice":
    case "listen": {
      const given = ok ? ex.options[ex.answer] : ex.options[(ex.answer + 1) % ex.options.length];
      return { ...base, quality: ok ? 1 : 0, verdict: ok ? "correct" : "incorrect", given, expected: ex.options[ex.answer], listeningSeconds: ex.type === "listen" ? 5 : 0 };
    }
    case "match": {
      const perItem: Record<string, number> = {};
      ex.pairs.forEach((pair, i) => (perItem[pair.id] = ok || i > 0 ? 1 : 0.4));
      return { ...base, quality: ok ? 1 : 0.8, perItem };
    }
    case "translate":
    case "fill":
    case "arrange":
    case "dictation":
    case "concept": {
      const accepted = ex.accepted;
      const expected = ex.type === "fill" ? ex.accepted[0] : accepted[0];
      if (ex.type === "translate" && ex.direction === "es-en") {
        return { ...base, quality: ok ? 1 : 0.3, verdict: ok ? "correct" : "incorrect", given: ok ? expected : "", expected };
      }
      let given = expected;
      if (!ok) given = ex.type === "fill" ? (ex.options?.find((o) => o !== expected) ?? "") : corrupt(expected, random);
      else if (random() < 0.15) given = stripAccents(expected);
      const c = checkSpanish(given, ex.type === "fill" && !ok ? [expected] : accepted);
      const target = ex.type === "fill" && !ok ? ex.full : expected;
      const diff: TokenDiff[] = ex.type === "fill" && !ok ? checkSpanish(ex.full.replace(expected, given), [ex.full]).diff : c.diff;
      return { ...base, quality: c.quality, verdict: c.verdict, given: ex.type === "fill" && !ok ? ex.full.replace(expected, given) : given, expected: target, diff, listeningSeconds: ex.type === "dictation" ? 8 : 0 };
    }
    case "speak": {
      const target = ex.accepted?.[0] ?? ex.sample;
      const said = ok ? target : ex.requirements?.length ? "" : corrupt(corrupt(target, random), random);
      const dur = 2500 + random() * 3000;
      const speech = evaluateSpeech({ transcripts: [{ text: said, confidence: 0.8 }], accepted: ex.accepted, requirements: ex.requirements, durationMs: dur, firstSpeechMs: 700 + random() * 3000, stage: ex.stage });
      return { ...base, quality: speech.quality, verdict: speech.passed ? "correct" : "incorrect", given: said, expected: target, diff: speech.diff, speech, speakingSeconds: dur / 1000 };
    }
    case "open":
    case "picture":
      return { ...base, quality: ok ? 0.85 : 0.4, verdict: ok ? "correct" : "incorrect", given: ok ? ex.sample : "", expected: ex.sample };
    case "dialogue":
      return { ...base, quality: ok ? 0.9 : 0.45, verdict: ok ? "correct" : "incorrect", given: ex.starters[0], expected: ex.starters[0], speakingSeconds: 6 };
  }
}

export function simulateDemoLearner(now: number): LearnerState {
  const random = rng(20240921);
  const days = 32;
  const start = now - days * DAY;
  let state = createLearner({ name: "Jacob", priorStudy: "some", reason: "travel", selfUnderstanding: "some", selfSpeaking: "none", createdAt: start }, { goalMinutes: 15 }, start);
  state = { ...state, onboarded: true, demo: true };
  const skip = new Set([5, 11, 12, 19, 24, 29]);
  const targetLessons = 14; // next up: Unit 4, lesson 3

  const run = (ex: Exercise, t: number, weakness = 1) => {
    const r = simulateAnswer(ex, state, t, random, weakness);
    state = recordResult(state, ex, r, t).state;
    return t + r.seconds * 1000;
  };

  for (let d = days; d >= 1; d--) {
    if (skip.has(d)) continue;
    const dayStart = new Date(now - d * DAY);
    dayStart.setHours(18, 30 + Math.floor(random() * 90), 0, 0);
    let t = dayStart.getTime();
    const ctx = (segment: GenContext["segment"]): GenContext => ({ state, now: t, random, speaking: true, segment });

    // Follow the app's plan: review first; skip new material when the backlog is large.
    const backlog = dueItems(state, t).length;
    const reviewBudget = d <= 3 ? 120 : backlog > 45 ? 45 : 30;
    for (const id of dueItems(state, t).slice(0, reviewBudget)) t = run(nextExerciseForItem(id, ctx("review")), t);

    const completed = Object.values(state.lessons).filter((l) => l.completedAt).length;
    const needed = targetLessons - completed;
    let daysLeft = 0;
    for (let x = d; x >= 1; x--) if (!skip.has(x)) daysLeft++;
    const lessonsToday = needed <= 0 ? 0 : needed >= daysLeft ? Math.min(2, needed - daysLeft + 1) : dueItems(state, t).length > 45 ? 0 : random() < 0.8 ? 1 : 0;
    for (let k = 0; k < lessonsToday; k++) {
      const id = nextLessonId(state);
      if (!id) break;
      let correct = 0;
      const list = buildLessonExercises(id, state, t, random, true);
      for (const ex of list) {
        const before = state.attempts.length;
        t = run(ex, t);
        if (state.attempts.length > before && state.attempts[state.attempts.length - 1].correct) correct++;
      }
      state = completeLesson(state, id, correct / Math.max(1, list.length), t);
    }
    // A little listening and speaking practice on some days.
    if (d % 3 === 0) {
      const known = Object.values(state.memory).filter((m) => m.kind === "sentence" && m.exposureCount > 0);
      for (const m of known.slice(0, 3)) t = run(exerciseFor(m.id, "listening", ctx("listening")), t);
      for (const m of known.slice(3, 5)) t = run(exerciseFor(m.id, "speaking", ctx("speaking")), t, 0.9);
    }
    state = recordSession(state, t);

    if (d === 18) state = recordListening(state, "me-presento", 1, 70, t);
    if (d === 8) state = recordListening(state, "la-familia-de-lucia", 0.67, 95, t);
    if (d === 6) state = recordPronunciation(state, "r-rr", 0.55, 90, t);
    if (d === 14 || d === 3) state = recordConversation(state, demoConversation(d === 14 ? "meeting" : "cafe", t, state), 150, 240, t);
  }
  // Function words from completed lessons count as seen.
  for (const [id, p] of Object.entries(state.lessons)) if (p.completedAt) state = completeLesson(state, id, p.bestAccuracy, p.completedAt);
  return state;
}

function demoConversation(scenarioId: string, t: number, state: LearnerState): ConversationRecord {
  const sc = SCENARIO_MAP[scenarioId];
  const texts = sc.turns.slice(0, 4).map((turn) => turn.starters[0].replace(/…/g, ""));
  const turns = texts.map((text, i) => ({ text, understood: i !== 1, speech: null, corrections: i === 2 ? 1 : 0 }));
  const goalsMet = sc.goals.length - 1;
  return {
    id: `conv-${t}`,
    at: t,
    scenarioId,
    title: sc.title,
    turns: turns.length,
    goalsMet,
    goalsTotal: sc.goals.length,
    wordsUsed: [],
    practiced: [],
    scores: scoreConversation(turns, goalsMet, sc.goals.length, state),
    mode: "guided",
  };
}
