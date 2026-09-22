// Session generation. Each session mixes maintenance (review) and growth (new
// material), weighted toward the learner's weakest skills, and interleaves
// concepts instead of drilling one thing for a long stretch.

import type { LearnerState, MemoryState } from "./types";
import { CHALLENGES, CONCEPTS, LESSONS, LEVEL_MAP, PROMPTS, SCENARIOS, SENTENCES, UNIT_MAP, VOCAB, lessonPosition, personalize } from "../content";
import { requirement } from "../content/build";
import { DAY, isDue, masteryLevel, retrievability } from "./memory";
import { activePatterns, mistakePatterns, CATEGORY_INFO } from "./mistakes";
import { lessonsCompleted, nextLessonId, skillProfile, PROFILE_LABEL, type ProfileSkill } from "./progress";
import { buildLessonExercises } from "./lesson";
import { conceptDrill, dialogueExercise, exerciseFor, nextExerciseForItem, promptExercise, type Exercise, type GenContext, type SegmentKind, type SpeakEx } from "./exercises";
import { rng, hash } from "./text";

export type SessionKind = "daily" | "lesson" | "review" | "drill" | "speaking" | "listening";
export type ReviewFocus = "due" | "struggling" | "recent" | "speaking" | "listening";

export interface Segment {
  kind: SegmentKind;
  label: string;
  minutes: number;
  count: number;
}

export interface SessionPlan {
  id: string;
  kind: SessionKind;
  title: string;
  minutes: number;
  segments: Segment[];
  exercises: Exercise[];
  rationale: string[];
  lessonId?: string;
}

export interface BuildOptions {
  now: number;
  speaking: boolean;
  minutes?: number;
  seed?: number;
}

export const SEGMENT_LABEL: Record<SegmentKind, string> = {
  review: "Review",
  new: "New lesson",
  listening: "Listening",
  speaking: "Speaking",
  weakness: "Weak spots",
  conversation: "Conversation",
};

const isDrillable = (id: string) => (id.startsWith("v:") ? !!VOCAB[id]?.drill : !!SENTENCES[id]);

// ─── Priority ─────────────────────────────────────────────────────────────

interface PriorityContext {
  now: number;
  speakingWeak: number;
  listeningWeak: number;
  conceptWeight: Map<string, number>;
}

/**
 * sessionScore = retentionNeed + errorFrequency + speakingWeakness
 *              + listeningWeakness + timeSinceReview + lessonImportance + difficultyBalance
 */
export function priorityScore(m: MemoryState, ctx: PriorityContext): number {
  const R = retrievability(m, ctx.now);
  const retentionNeed = 1 - R;
  const total = m.correctCount + m.incorrectCount;
  const concepts = SENTENCES[m.id]?.concepts ?? [];
  const errorFrequency = m.incorrectCount / (total + 1) + Math.min(0.3, m.lapses * 0.1) + concepts.reduce((s, c) => s + (ctx.conceptWeight.get(c) ?? 0), 0) * 0.15;
  const speakingWeakness = ctx.speakingWeak * (1 - (m.scores.speaking ?? 0.3)) * 0.5;
  const listeningWeakness = ctx.listeningWeak * (1 - (m.scores.listening ?? 0.3)) * 0.5;
  const daysSince = (ctx.now - m.lastSeen) / DAY;
  const timeSinceReview = Math.min(1, Math.log(1 + daysSince) / Math.log(31));
  const v = VOCAB[m.id];
  const lessonImportance = v ? 1 - Math.min(1, v.frequency / 2500) : 0.6;
  const seenMinutesAgo = (ctx.now - m.lastSeen) / 60000;
  const difficultyBalance = (masteryLevel(m) === "mastered" ? -0.5 : 0) + (seenMinutesAgo < 5 ? -0.6 : 0) + (m.difficulty > 0.6 ? 0.15 : 0);
  const overdue = isDue(m, ctx.now) ? 1 : 0;
  return retentionNeed + errorFrequency + speakingWeakness + listeningWeakness + timeSinceReview + lessonImportance * 0.5 + difficultyBalance + overdue;
}

function priorityContext(state: LearnerState, now: number): PriorityContext {
  const p = skillProfile(state, now);
  const avg = avgProfile(p);
  const gap = (s: ProfileSkill) => (p[s].value == null ? 0.1 : Math.max(0, avg - p[s].value!));
  const conceptWeight = new Map<string, number>();
  for (const pat of activePatterns(state.mistakes, now)) if (pat.info.concept) conceptWeight.set(pat.info.concept, Math.min(2, pat.weight / 3));
  return { now, speakingWeak: gap("speaking") * 3, listeningWeak: gap("listening") * 3, conceptWeight };
}

function avgProfile(p: ReturnType<typeof skillProfile>): number {
  const vals = (["speaking", "listening", "vocabulary", "grammar"] as ProfileSkill[]).map((s) => p[s].value).filter((v): v is number => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0.6;
}

export function dueItems(state: LearnerState, now: number): string[] {
  const ctx = priorityContext(state, now);
  return Object.values(state.memory)
    .filter((m) => isDrillable(m.id) && isDue(m, now))
    .map((m) => ({ id: m.id, p: priorityScore(m, ctx) }))
    .sort((a, b) => b.p - a.p)
    .map((x) => x.id);
}

export function reviewCandidates(state: LearnerState, now: number, focus: ReviewFocus): string[] {
  const all = Object.values(state.memory).filter((m) => isDrillable(m.id) && m.exposureCount > 0);
  const ctx = priorityContext(state, now);
  const byPriority = (list: MemoryState[]) => list.map((m) => ({ id: m.id, p: priorityScore(m, ctx) })).sort((a, b) => b.p - a.p).map((x) => x.id);
  switch (focus) {
    case "due":
      return dueItems(state, now);
    case "struggling":
      return byPriority(all.filter((m) => m.lapses >= 1 || (m.correctCount + m.incorrectCount >= 3 && m.incorrectCount / (m.correctCount + m.incorrectCount) > 0.3)));
    case "recent":
      return byPriority(all.filter((m) => now - m.introducedAt < 3 * DAY));
    case "speaking":
      return byPriority(all.filter((m) => (m.scores.speaking ?? 0) < 0.65 && (m.scores.recall ?? m.scores.recognition ?? 0) >= 0.4));
    case "listening":
      return byPriority(all.filter((m) => (m.scores.listening ?? 0) < 0.65));
  }
}

// ─── Builders ─────────────────────────────────────────────────────────────

function genCtx(state: LearnerState, opts: BuildOptions, segment: SegmentKind, random: () => number, reason?: string): GenContext {
  return { state, now: opts.now, random, speaking: opts.speaking, segment, reason };
}

const secondsOf = (list: Exercise[]) => list.reduce((s, e) => s + e.estSeconds, 0);

function fillFromItems(ids: string[], seconds: number, make: (id: string) => Exercise | null): Exercise[] {
  const out: Exercise[] = [];
  for (const id of ids) {
    if (secondsOf(out) >= seconds) break;
    const ex = make(id);
    if (ex) out.push(ex);
  }
  return out;
}

/** Items known well enough to practice listening or speaking with. */
function knownSentences(state: LearnerState): MemoryState[] {
  return Object.values(state.memory).filter((m) => m.kind === "sentence" && SENTENCES[m.id] && m.exposureCount > 0);
}

export function dailyChallenge(state: LearnerState, now: number) {
  const done = new Set(lessonsCompleted(state));
  const unlocked = CHALLENGES.filter((c) => done.has(c.minLesson));
  const list = unlocked.length ? unlocked : CHALLENGES.slice(0, 1);
  const day = Math.floor(now / DAY);
  return list[(day + hash(state.profile.name)) % list.length];
}

function challengeExercise(state: LearnerState, now: number, ctx: GenContext): Exercise {
  const c = dailyChallenge(state, now);
  const name = state.profile.name;
  const base = { key: `challenge-${now}`, itemId: `challenge:${c.prompt}`, itemIds: [], variant: `challenge:${c.prompt}`, segment: ctx.segment, reason: "Today's speaking challenge", estSeconds: 60 };
  if (!ctx.speaking) {
    return { ...base, skill: "production", type: "open", prompt: c.prompt, promptEn: c.promptEn, requirements: c.requirements.map(requirement), sample: personalize(c.sample, name), sampleEn: "", starter: c.starter };
  }
  const ex: SpeakEx = { ...base, skill: "speaking", type: "speak", stage: c.stage, prompt: c.prompt, promptLang: "es", promptEn: c.promptEn, starter: c.starter, requirements: c.requirements.map(requirement), sample: personalize(c.sample, name), sampleEn: "" };
  return ex;
}

function weaknessExercises(state: LearnerState, opts: BuildOptions, seconds: number, random: () => number): { exercises: Exercise[]; focus: string[] } {
  const pats = activePatterns(state.mistakes, opts.now).filter((p) => p.info.concept && CONCEPTS[p.info.concept]);
  const exercises: Exercise[] = [];
  const focus: string[] = [];
  const frontier = Math.max(0, ...lessonsCompleted(state).map(lessonPosition)) + 1;
  for (const p of pats) {
    const concept = CONCEPTS[p.info.concept!];
    const drills = concept.drills.filter((sid) => lessonPosition(SENTENCES[sid].lessonId) <= frontier);
    if (!drills.length) continue;
    focus.push(p.info.focus);
    const ctx = genCtx(state, opts, "weakness", random, `${p.info.lead} ${p.info.focus}`);
    const start = Math.floor(random() * drills.length);
    for (let i = 0; i < Math.min(4, drills.length); i++) {
      const ex = conceptDrill(concept.id, drills[(start + i) % drills.length], ctx, i);
      if (ex) exercises.push(ex);
    }
    if (secondsOf(exercises) >= seconds) break;
  }
  return { exercises, focus };
}

function unlockedScenarios(state: LearnerState) {
  const done = new Set(lessonsCompleted(state));
  return SCENARIOS.filter((s) => !s.requiresLesson || done.has(s.requiresLesson));
}

/** Interleave segments: lesson steps stay in order, other practice is woven between them. */
function interleave(lesson: Exercise[], others: Exercise[][], tail: Exercise[]): Exercise[] {
  const queues = others.map((q) => q.slice());
  const out: Exercise[] = [];
  // Warm up with a couple of retrieval items before anything new.
  for (let i = 0; i < 2; i++) {
    const q = queues.find((x) => x.length);
    if (q) out.push(q.shift()!);
  }
  let qi = 0;
  let li = 0;
  while (li < lesson.length || queues.some((q) => q.length)) {
    for (let k = 0; k < 3 && li < lesson.length; k++) out.push(lesson[li++]);
    for (let tries = 0; tries < queues.length; tries++) {
      const q = queues[qi++ % queues.length];
      if (q.length) {
        out.push(q.shift()!);
        break;
      }
    }
  }
  out.push(...tail);
  // Avoid the same item twice in a row.
  for (let i = 1; i < out.length - 1; i++) {
    if (out[i].itemId === out[i - 1].itemId && out[i].type !== "intro" && out[i - 1].type !== "intro") [out[i], out[i + 1]] = [out[i + 1], out[i]];
  }
  return out;
}

export function buildDailySession(state: LearnerState, opts: BuildOptions): SessionPlan {
  const now = opts.now;
  const random = rng(opts.seed ?? now);
  const goal = opts.minutes ?? state.settings.goalMinutes;
  const profile = skillProfile(state, now);
  const avg = avgProfile(profile);
  const due = dueItems(state, now);
  const patterns = activePatterns(state.mistakes, now);
  const nextId = nextLessonId(state);
  const nextLesson = nextId ? LESSONS[nextId] : null;
  const lessonAvailable = !!nextLesson && LEVEL_MAP[UNIT_MAP[nextLesson.unitId].levelId].available;
  const known = knownSentences(state);
  const done = lessonsCompleted(state).length;
  const rationale: string[] = [];

  const gap = (s: ProfileSkill) => (profile[s].value == null ? (done >= 2 ? 0.12 : 0) : Math.max(0, avg - profile[s].value!));
  const w: Record<SegmentKind, number> = { review: 2, new: 4, listening: 3, speaking: 3, weakness: 2, conversation: 1 };
  w.review *= due.length ? Math.min(2.2, Math.max(0.4, due.length / 10)) : known.length ? 0.4 : 0;
  if ((profile.retention.value ?? 1) < 0.8) w.review *= 1.25;
  w.speaking *= 1 + 2.5 * gap("speaking");
  w.listening *= known.length >= 3 ? 1 + 2.5 * gap("listening") : 0;
  w.weakness *= patterns.length ? 1 + 0.25 * Math.min(3, patterns.length) : 0;
  // A large backlog means new material wouldn't stick: catch up first.
  const catchUp = due.length > 90;
  w.new *= lessonAvailable && !catchUp ? 1 : 0;
  w.conversation *= done >= 3 ? 1 : 0;
  if (!opts.speaking) w.speaking *= 0.6;

  // The next lesson is included whole; the rest of the time is shared by weight.
  const lessonExercises = w.new > 0 && nextId ? buildLessonExercises(nextId, state, now, random, opts.speaking) : [];
  const lessonMinutes = secondsOf(lessonExercises) / 60;
  const otherKinds: SegmentKind[] = ["review", "listening", "speaking", "weakness", "conversation"];
  const otherWeight = otherKinds.reduce((s, k) => s + w[k], 0);
  const remaining = Math.max(lessonExercises.length ? Math.min(goal * 0.5, 4) : goal, goal - lessonMinutes);
  const minutesFor = (k: SegmentKind) => (otherWeight ? (w[k] / otherWeight) * remaining : 0);

  const reviewCtx = genCtx(state, opts, "review", random, "Due for review");
  let review = fillFromItems(due, minutesFor("review") * 60, (id) => nextExerciseForItem(id, reviewCtx));
  if (secondsOf(review) < minutesFor("review") * 60 * 0.6) {
    // Maintenance: items not yet due but fading.
    const maint = Object.values(state.memory)
      .filter((m) => isDrillable(m.id) && !due.includes(m.id) && m.exposureCount > 0 && now - m.lastSeen > DAY / 2)
      .sort((a, b) => retrievability(a, now) - retrievability(b, now))
      .map((m) => m.id);
    review = review.concat(fillFromItems(maint, minutesFor("review") * 60 - secondsOf(review), (id) => nextExerciseForItem(id, { ...reviewCtx, reason: "Keeping it fresh" })));
  }

  const listenCtx = genCtx(state, opts, "listening", random, gap("listening") > 0.05 ? "Listening is a weak spot" : "Train your ear");
  const listenItems = known.slice().sort((a, b) => (a.scores.listening ?? 0) - (b.scores.listening ?? 0) || random() - 0.5).map((m) => m.id);
  const listening = fillFromItems(listenItems, minutesFor("listening") * 60, (id) => exerciseFor(id, "listening", listenCtx));

  const speakCtx = genCtx(state, opts, "speaking", random, gap("speaking") > 0.05 ? "Speaking is a weak spot" : "Say it out loud");
  const speakItems = known.slice().sort((a, b) => (a.scores.speaking ?? 0) - (b.scores.speaking ?? 0) || random() - 0.5).map((m) => m.id);
  const speakSeconds = minutesFor("speaking") * 60;
  let speaking: Exercise[] = [];
  if (speakSeconds >= 90 && done >= 1) speaking.push(challengeExercise(state, now, speakCtx));
  speaking = speaking.concat(fillFromItems(speakItems, speakSeconds - secondsOf(speaking), (id) => (opts.speaking ? exerciseFor(id, "speaking", speakCtx) : exerciseFor(id, "production", speakCtx))));

  const weak = w.weakness > 0 ? weaknessExercises(state, opts, minutesFor("weakness") * 60, random) : { exercises: [], focus: [] };

  const tail: Exercise[] = [];
  if (w.conversation > 0) {
    const scen = unlockedScenarios(state);
    if (scen.length) {
      const d = dialogueExercise(scen[Math.floor(random() * scen.length)].id, genCtx(state, opts, "conversation", random, "Put it to use"));
      if (d) tail.push(d);
    }
  }

  // Rationale — why this session looks the way it does.
  const weakest = (["speaking", "listening", "vocabulary", "grammar"] as ProfileSkill[]).filter((s) => gap(s) > 0.06).sort((a, b) => gap(b) - gap(a))[0];
  if (weakest) rationale.push(`${PROFILE_LABEL[weakest]} is your weakest skill right now, so this session leans on it.`);
  if (due.length) rationale.push(`${due.length} ${due.length === 1 ? "item is" : "items are"} close to being forgotten.`);
  if (weak.focus.length) rationale.push(`You've been making the same mistake with ${weak.focus[0]} — there's targeted practice built in.`);
  if (nextLesson && lessonExercises.length) rationale.push(`New material: ${nextLesson.title}.`);
  if (catchUp && lessonAvailable) rationale.push("No new lesson today — reviewing now makes what you've learned stick.");

  const segments: Segment[] = (
    [
      ["review", review],
      ["new", lessonExercises],
      ["listening", listening],
      ["speaking", speaking],
      ["weakness", weak.exercises],
      ["conversation", tail],
    ] as [SegmentKind, Exercise[]][]
  )
    .filter(([, list]) => list.length)
    .map(([kind, list]) => ({ kind, label: SEGMENT_LABEL[kind], minutes: Math.max(1, Math.round(secondsOf(list) / 60)), count: list.length }));

  const exercises = interleave(lessonExercises, [review, weak.exercises, listening, speaking].filter((q) => q.length), tail);
  return {
    id: `daily-${now}`,
    kind: "daily",
    title: `${Math.max(1, Math.round(secondsOf(exercises) / 60))}-minute Spanish session`,
    minutes: Math.max(1, Math.round(secondsOf(exercises) / 60)),
    segments,
    exercises,
    rationale,
    lessonId: lessonExercises.length ? nextId ?? undefined : undefined,
  };
}

export function buildLessonSession(state: LearnerState, lessonId: string, opts: BuildOptions): SessionPlan {
  const random = rng(opts.seed ?? opts.now);
  const lesson = LESSONS[lessonId];
  const exercises = buildLessonExercises(lessonId, state, opts.now, random, opts.speaking);
  const minutes = Math.max(1, Math.round(secondsOf(exercises) / 60));
  return {
    id: `lesson-${lessonId}-${opts.now}`,
    kind: "lesson",
    title: lesson.title,
    minutes,
    segments: [{ kind: "new", label: lesson.titleEs, minutes, count: exercises.length }],
    exercises,
    rationale: [lesson.goal],
    lessonId,
  };
}

export const REVIEW_TITLES: Record<ReviewFocus, string> = {
  due: "Due now",
  struggling: "Struggling",
  recent: "Recently learned",
  speaking: "Speaking review",
  listening: "Listening review",
};

export function buildReviewSession(state: LearnerState, focus: ReviewFocus, opts: BuildOptions, max = 15): SessionPlan {
  const random = rng(opts.seed ?? opts.now);
  const ids = reviewCandidates(state, opts.now, focus).slice(0, max);
  const reason = { due: "Due for review", struggling: "You've found this one tricky", recent: "Learned recently", speaking: "Say it out loud", listening: "Train your ear" }[focus];
  const segment: SegmentKind = focus === "speaking" ? "speaking" : focus === "listening" ? "listening" : "review";
  const ctx = genCtx(state, opts, segment, random, reason);
  const exercises = ids.map((id) =>
    focus === "speaking" ? exerciseFor(id, opts.speaking ? "speaking" : "production", ctx) : focus === "listening" ? exerciseFor(id, "listening", ctx) : nextExerciseForItem(id, ctx),
  );
  const minutes = Math.max(1, Math.round(secondsOf(exercises) / 60));
  return { id: `review-${focus}-${opts.now}`, kind: "review", title: REVIEW_TITLES[focus], minutes, segments: [{ kind: segment, label: REVIEW_TITLES[focus], minutes, count: exercises.length }], exercises, rationale: [] };
}

export function buildDrillSession(state: LearnerState, key: string, opts: BuildOptions): SessionPlan {
  const random = rng(opts.seed ?? opts.now);
  const pattern = mistakePatterns(state.mistakes, opts.now).find((p) => p.category === key);
  const conceptId = pattern?.info.concept ?? (CONCEPTS[key] ? key : null);
  const concept = conceptId ? CONCEPTS[conceptId] : null;
  const exercises: Exercise[] = [];
  const title = pattern ? `Practice: ${pattern.info.focus}` : concept ? `Practice: ${concept.title}` : "Targeted practice";
  if (concept) {
    const ctx = genCtx(state, opts, "weakness", random, pattern ? `${pattern.info.lead} ${pattern.info.focus}` : concept.title);
    exercises.push({ key: `grammar-${concept.id}-${opts.now}`, itemId: `c:${concept.id}`, itemIds: [], skill: "comprehension", variant: "grammar", segment: "weakness", estSeconds: 30, type: "grammar", conceptId: concept.id });
    concept.drills.forEach((sid, i) => {
      const ex = conceptDrill(concept.id, sid, ctx, i);
      if (ex) exercises.push(ex);
    });
  } else if (pattern) {
    const ctx = genCtx(state, opts, "weakness", random, "From your mistakes");
    const ids = [...new Set(pattern.examples.map((e) => e.itemId).filter((x): x is string => !!x && isDrillable(x)))];
    ids.forEach((id) => exercises.push(nextExerciseForItem(id, ctx, "production")));
  }
  const minutes = Math.max(1, Math.round(secondsOf(exercises) / 60));
  return { id: `drill-${key}-${opts.now}`, kind: "drill", title, minutes, segments: [{ kind: "weakness", label: "Targeted practice", minutes, count: exercises.length }], exercises, rationale: pattern ? [CATEGORY_INFO[pattern.category].tip] : [] };
}

/** A short speaking-only session (e.g. “Try a 3-minute speaking session”). */
export function buildSpeakingSession(state: LearnerState, opts: BuildOptions): SessionPlan {
  const random = rng(opts.seed ?? opts.now);
  const ctx = genCtx(state, opts, "speaking", random, "Say it out loud");
  const known = knownSentences(state).sort((a, b) => (a.scores.speaking ?? 0) - (b.scores.speaking ?? 0));
  const exercises: Exercise[] = [challengeExercise(state, opts.now, ctx)];
  known.slice(0, 5).forEach((m) => exercises.push(exerciseFor(m.id, opts.speaking ? "speaking" : "production", ctx)));
  const minutes = Math.max(1, Math.round(secondsOf(exercises) / 60));
  return { id: `speak-${opts.now}`, kind: "speaking", title: "Speaking session", minutes, segments: [{ kind: "speaking", label: "Speaking", minutes, count: exercises.length }], exercises, rationale: [] };
}

export const STAGE_INFO: Record<number, { title: string; description: string; example: string }> = {
  1: { title: "Repeat", description: "Hear a sentence and say it back.", example: "Hola, me llamo Carlos." },
  2: { title: "Complete", description: "Finish a sentence with your own words.", example: "Me llamo _____." },
  3: { title: "Answer", description: "Answer a simple question.", example: "¿Cómo te llamas?" },
  4: { title: "Answer without a model", description: "Say it with no example to copy.", example: "¿Qué hiciste hoy?" },
  5: { title: "Describe", description: "Describe a picture in Spanish.", example: "Describe esta imagen." },
  6: { title: "Roleplay", description: "Handle a real situation, turn by turn.", example: "Buenas tardes. ¿Qué desea?" },
  7: { title: "Free conversation", description: "An open conversation at your level.", example: "¿Qué hiciste este fin de semana?" },
};

/** Practice one speaking stage using prompts from lessons the learner has reached. */
export function buildStageSession(state: LearnerState, stage: number, opts: BuildOptions): SessionPlan {
  const random = rng(opts.seed ?? opts.now);
  const done = new Set(lessonsCompleted(state));
  const nextId = nextLessonId(state);
  const pool = Object.values(PROMPTS).filter((p) => p.stage === stage && p.lessonId && (done.has(p.lessonId) || p.lessonId === nextId));
  const fallback = Object.values(PROMPTS).filter((p) => p.stage === stage).sort((a, b) => lessonPosition(a.lessonId!) - lessonPosition(b.lessonId!));
  const chosen = (pool.length ? pool : fallback.slice(0, 3)).sort(() => random() - 0.5).slice(0, 6);
  const ctx = genCtx(state, opts, "speaking", random, STAGE_INFO[stage].title);
  const exercises = chosen.map((p) => promptExercise(p, ctx));
  const minutes = Math.max(1, Math.round(secondsOf(exercises) / 60));
  return { id: `stage-${stage}-${opts.now}`, kind: "speaking", title: `Speaking: ${STAGE_INFO[stage].title}`, minutes, segments: [{ kind: "speaking", label: STAGE_INFO[stage].title, minutes, count: exercises.length }], exercises, rationale: [] };
}

/** The highest speaking stage the learner is ready for. */
export function speakingStage(state: LearnerState): number {
  const done = lessonsCompleted(state).length;
  const speaking = state.attempts.filter((a) => a.skill === "speaking").slice(-30);
  const avg = speaking.length ? speaking.reduce((s, a) => s + a.quality, 0) / speaking.length : 0;
  if (done === 0) return 1;
  if (done < 2) return 2;
  if (done < 4) return 3;
  if (done < 8 || avg < 0.55) return 4;
  if (done < 12) return 5;
  return avg >= 0.65 ? 7 : 6;
}

/**
 * The very first session: greetings, then "Me llamo…", "Soy de…" and
 * "¿Cómo te llamas?" — ending with the learner saying all of it out loud.
 */
export function buildFirstSession(state: LearnerState, opts: BuildOptions): SessionPlan {
  const random = rng(opts.seed ?? opts.now);
  const ctx = genCtx(state, opts, "new", random);
  const greetings = buildLessonExercises("u1-l1", state, opts.now, random, opts.speaking).filter((e) => e.type !== "speak" || e.variant.endsWith("u1-l1:1"));
  const intro = ["s:u1-l2:1", "s:u1-l2:2", "s:u1-l3:1"];
  const extra: Exercise[] = [];
  for (const sid of intro) {
    if (!SENTENCES[sid]) continue;
    extra.push({ ...exerciseFor(sid, "comprehension", ctx), reason: "Introduce yourself" });
  }
  const introCards = intro.filter((sid) => SENTENCES[sid]).map((sid) => ({ key: `first-intro-${sid}`, itemId: sid, itemIds: [], skill: "recognition" as const, variant: "intro", segment: "new" as const, estSeconds: 12, type: "intro" as const, sentenceId: sid }));
  const speak = ["p:u1-l2:2", "p:u1-l3:2", "p:u1-l2:3"].filter((p) => PROMPTS[p]).map((p) => ({ ...promptExercise(PROMPTS[p], ctx), reason: "Your first real Spanish" }));
  const exercises: Exercise[] = [...greetings, introCards[0], extra[0], introCards[1], extra[1], introCards[2], extra[2], ...speak].filter(Boolean) as Exercise[];
  const minutes = Math.max(1, Math.round(secondsOf(exercises) / 60));
  return { id: `first-${opts.now}`, kind: "lesson", title: "Hello, Spanish", minutes, segments: [{ kind: "new", label: "Your first session", minutes, count: exercises.length }], exercises, rationale: [], lessonId: "u1-l1" };
}
