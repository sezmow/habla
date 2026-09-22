// Builds a lesson around Habla's learning loop:
// Learn → Understand → Recall → Produce → Speak → Use.

import type { LearnerState } from "./types";
import { LESSONS, PROMPTS, SENTENCES, VOCAB, lessonPosition } from "../content";
import {
  dialogueExercise,
  exerciseFor,
  grammarExercise,
  introExercise,
  matchExercise,
  promptExercise,
  type Exercise,
  type GenContext,
} from "./exercises";
import { isDue, retrievability } from "./memory";

export function newVocabFor(lessonId: string, state: LearnerState): string[] {
  const lesson = LESSONS[lessonId];
  return lesson.vocab.filter((id) => VOCAB[id]?.lessonId === lessonId && VOCAB[id].drill && !state.memory[id]?.exposureCount);
}

export function buildLessonExercises(lessonId: string, state: LearnerState, now: number, random: () => number, speaking: boolean): Exercise[] {
  const lesson = LESSONS[lessonId];
  const ctx: GenContext = { state, now, random, speaking, segment: "new" };
  const newVocab = newVocabFor(lessonId, state);
  const sentences = lesson.sentences;
  const learn: Exercise[] = [];
  const shownConcepts = new Set<string>();
  const covered = new Set<string>();

  // 1–2. Learn + Understand, two sentences at a time.
  for (let i = 0; i < sentences.length; i += 2) {
    const chunk = sentences.slice(i, i + 2);
    for (const sid of chunk) {
      learn.push(introExercise(sid, ctx));
      SENTENCES[sid].vocab.forEach((v) => covered.add(v));
    }
    chunk.forEach((sid, j) => learn.push(exerciseFor(sid, "comprehension", { ...ctx, random: () => ((i + j) % 2 ? 0.99 : 0.01) })));
    for (const c of lesson.concepts) {
      if (!shownConcepts.has(c) && chunk.some((sid) => SENTENCES[sid].concepts.includes(c))) {
        learn.push(grammarExercise(c, ctx));
        shownConcepts.add(c);
      }
    }
  }
  // New words that never appear in a sentence still get introduced.
  for (const v of newVocab.filter((v) => !covered.has(v))) {
    learn.push(introExercise(v, ctx), exerciseFor(v, "recognition", ctx));
  }
  for (const c of lesson.concepts) if (!shownConcepts.has(c)) learn.push(grammarExercise(c, ctx));

  // 3. Recall: match the new words, rebuild sentences, fill gaps.
  const recall: Exercise[] = [];
  const matchable = newVocab.filter((v) => VOCAB[v].en.length < 40);
  if (matchable.length >= 3) recall.push(matchExercise(matchable.slice(0, 5), ctx));
  const recallSentences = pickSpread(sentences, 4);
  recallSentences.forEach((sid, i) => recall.push(exerciseFor(sid, "recall", { ...ctx, random: () => (i % 2 ? 0.99 : 0.01) })));
  pickSpread(newVocab, 2).forEach((v) => recall.push(exerciseFor(v, "recall", ctx)));

  // 4. Produce: build sentences from English, with starters.
  const produce = pickSpread(sentences.filter((s) => !recallSentences.slice(0, 2).includes(s)), 3).map((sid) => exerciseFor(sid, "production", ctx));

  // 5–6. Speak and use.
  const prompts = lesson.speaking.map((id) => PROMPTS[id]).sort((a, b) => a.stage - b.stage);
  const speak: Exercise[] = prompts.slice(0, 3).map((p) => promptExercise(p, ctx));
  if (lesson.scenarioId) {
    const d = dialogueExercise(lesson.scenarioId, ctx);
    if (d) speak.push({ ...d, reason: "Use it: a real exchange" });
  }

  // Interleave a couple of older items so earlier lessons stay alive.
  const older = olderItems(lessonId, state, now, 2);
  const oldExercises = older.map((id) => exerciseFor(id, "recall", { ...ctx, segment: "review", reason: "From an earlier lesson" }));

  const out = [...learn];
  if (oldExercises[0]) out.push(oldExercises[0]);
  out.push(...recall);
  if (oldExercises[1]) out.push(oldExercises[1]);
  out.push(...produce, ...speak);
  return out;
}

function pickSpread<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items.slice();
  const step = items.length / n;
  return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)]);
}

function olderItems(lessonId: string, state: LearnerState, now: number, n: number): string[] {
  const pos = lessonPosition(lessonId);
  return Object.values(state.memory)
    .filter((m) => m.exposureCount > 0 && (VOCAB[m.id]?.drill || SENTENCES[m.id]) && lessonPosition((VOCAB[m.id] ?? SENTENCES[m.id]).lessonId) < pos)
    .map((m) => ({ id: m.id, p: (isDue(m, now) ? 1 : 0) + (1 - retrievability(m, now)) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, n)
    .map((x) => x.id);
}
