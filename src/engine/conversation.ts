// Conversation: guided roleplay state machine, conversation scoring, and the
// learner context handed to an AI partner.

import type { ConversationScores, LearnerState, Scenario } from "./types";
import { REPAIR_INTENTS, TOKEN_INDEX, VOCAB, LESSONS, LESSON_ORDER, UNIT_MAP } from "../content";
import { checkRequirements, containsFragment, type SpeechEvaluation } from "./answer";
import { fold, tokenize } from "./text";
import { analyzeForm } from "../content/verbs";
import { activePatterns } from "./mistakes";
import { dueItems } from "./session";
import { lessonsCompleted, skillProfile } from "./progress";
import { masteryLevel } from "./memory";

// ─── Guided roleplay ──────────────────────────────────────────────────────

export interface GuidedState {
  scenarioId: string;
  turnId: string;
  goalsMet: string[];
  slots: Record<string, string>;
  misses: number;
  finished: boolean;
}

export interface GuidedReply {
  understood: boolean;
  /** Partner lines to show, in order (acknowledgement, then next question). */
  lines: { es: string; en: string }[];
  slow: boolean;
  /** Help offered after repeated misses. */
  hint: string | null;
  newGoals: string[];
  finished: boolean;
  repair?: "repeat" | "slower" | "howSay";
}

export function startGuided(s: Scenario): GuidedState {
  return { scenarioId: s.id, turnId: s.turns[0].id, goalsMet: [], slots: {}, misses: 0, finished: false };
}

const fill = (text: string, slots: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, k) => slots[k] ?? "");

export function respondGuided(s: Scenario, state: GuidedState, text: string): { state: GuidedState; reply: GuidedReply } {
  const turn = s.turns.find((t) => t.id === state.turnId)!;
  const any = (list: string[]) => list.some((f) => containsFragment(text, f));

  // Repair strategies — phrase-bank phrases work in every scenario.
  if (any(REPAIR_INTENTS.slower)) return { state, reply: { understood: true, lines: [turn.npc], slow: true, hint: null, newGoals: [], finished: false, repair: "slower" } };
  if (any(REPAIR_INTENTS.howSay)) {
    return { state, reply: { understood: true, lines: [{ es: `Puedes decir: “${turn.starters[0].replace(/…$/, "")}”.`, en: `You can say: “${turn.starters[0]}”` }], slow: true, hint: null, newGoals: [], finished: false, repair: "howSay" } };
  }

  const matched = turn.intents.find((i) => checkRequirements(text, i.requirements).ok);
  if (!matched) {
    if (any(REPAIR_INTENTS.repeat) && tokenize(text).length <= 5) {
      return { state, reply: { understood: true, lines: [turn.npc], slow: true, hint: null, newGoals: [], finished: false, repair: "repeat" } };
    }
    const misses = state.misses + 1;
    return {
      state: { ...state, misses },
      reply: { understood: false, lines: [turn.reprompt], slow: misses >= 2, hint: misses >= 2 ? `Try: ${turn.starters.join(" · ")}` : null, newGoals: [], finished: false },
    };
  }

  const slots = { ...state.slots };
  if (matched.slot) {
    const opt = matched.slot.options.find((o) => containsFragment(text, o.match));
    if (opt) slots[matched.slot.name] = opt.display;
  }
  // Credit every goal the utterance satisfies ("Hola, un café" greets and orders).
  const goals = new Set(state.goalsMet);
  const newGoals: string[] = [];
  for (const intent of turn.intents) {
    if (intent.goal && !goals.has(intent.goal) && checkRequirements(text, intent.requirements).ok) {
      goals.add(intent.goal);
      newGoals.push(intent.goal);
    }
  }
  if (!goals.has("greet") && s.goals.some((g) => g.id === "greet") && ["hola", "buenos dias", "buenas"].some((g) => containsFragment(text, g))) {
    goals.add("greet");
    newGoals.push("greet");
  }

  const lines: { es: string; en: string }[] = [];
  if (matched.reply) lines.push({ es: fill(matched.reply.es, slots), en: fill(matched.reply.en, slots) });
  const finished = matched.next === "end";
  if (!finished) {
    const next = s.turns.find((t) => t.id === matched.next)!;
    lines.push(next.npc);
  }
  return {
    state: { ...state, turnId: finished ? state.turnId : matched.next, goalsMet: [...goals], slots, misses: 0, finished },
    reply: { understood: true, lines, slow: false, hint: null, newGoals, finished },
  };
}

// ─── Scoring ──────────────────────────────────────────────────────────────

export interface LearnerTurn {
  text: string;
  understood: boolean;
  speech?: SpeechEvaluation | null;
  corrections?: number;
}

/** Vocabulary items the learner actually used. */
export function wordsUsed(texts: string[], state: LearnerState): string[] {
  const used = new Set<string>();
  for (const t of texts) {
    for (const tok of tokenize(t)) {
      for (const id of TOKEN_INDEX.get(tok) ?? []) {
        const v = VOCAB[id];
        if (v?.drill && v.pos !== "function" && (state.memory[id]?.exposureCount ?? 0) > 0 && v.keys.includes(tok)) used.add(id);
      }
    }
  }
  return [...used];
}

/** Grammar structures the learner produced (for “Practice: past tense”). */
export function structuresUsed(texts: string[]): string[] {
  const found = new Set<string>();
  for (const t of texts) {
    const toks = tokenize(t);
    const f = fold(t);
    if (toks.some((w) => analyzeForm(w).some((a) => a.tense === "preterite") && !["fue", "fui"].includes(w)) || /\b(fui|fue|fuimos)\b/.test(f)) found.add("past tense");
    if (/\b(voy|vas|va|vamos|van) a\b/.test(f)) found.add("going to (ir a)");
    if (/\bme gustan?\b/.test(f)) found.add("gustar");
    if (/\b(tengo|tienes|tiene) que\b/.test(f)) found.add("tener que");
    if (/\b(creo|pienso|me parece) que\b/.test(f)) found.add("giving opinions");
    if (/\b(estoy|estas|esta|estamos)\b/.test(f)) found.add("estar");
  }
  return [...found];
}

export function scoreConversation(turns: LearnerTurn[], goalsMet: number, goalsTotal: number, state: LearnerState): ConversationScores {
  const n = Math.max(1, turns.length);
  const understood = turns.filter((t) => t.understood).length / n;
  const spoken = turns.filter((t) => t.speech);
  const words = wordsUsed(turns.map((t) => t.text), state);
  const avgLen = turns.reduce((s, t) => s + tokenize(t.text).length, 0) / n;
  const corrections = turns.reduce((s, t) => s + (t.corrections ?? 0), 0);
  const wpm = spoken.map((t) => t.speech!.wpm).filter((x): x is number => x != null);
  const intel = spoken.map((t) => t.speech!.intelligibility ?? (t.speech!.checks.pronunciation === "good" ? 1 : t.speech!.checks.pronunciation === "okay" ? 0.75 : 0.5));
  return {
    comprehension: understood,
    relevance: understood,
    vocabulary: Math.min(1, words.length / Math.max(4, n * 2) + Math.min(0.3, avgLen / 30)),
    grammar: Math.max(0.2, 1 - corrections / n / 1.5),
    fluency: wpm.length ? Math.min(1, wpm.reduce((a, b) => a + b, 0) / wpm.length / 90) : null,
    pronunciation: intel.length ? intel.reduce((a, b) => a + b, 0) / intel.length : null,
    continuation: goalsTotal ? goalsMet / goalsTotal : Math.min(1, n / 6),
  };
}

// ─── AI context ───────────────────────────────────────────────────────────

/**
 * 0.1 = absolute beginner … 0.9 = advanced. Driven by curriculum progress,
 * recent conversation performance and the learner's difficulty preference.
 */
export function conversationDifficulty(state: LearnerState, now: number): number {
  const done = lessonsCompleted(state);
  const l1 = LESSON_ORDER.filter((id) => UNIT_MAP[LESSONS[id].unitId].levelId === "level1");
  const frac1 = done.filter((id) => l1.includes(id)).length / Math.max(1, l1.length);
  const frac2 = done.filter((id) => !l1.includes(id)).length / Math.max(1, LESSON_ORDER.length - l1.length);
  let d = 0.1 + 0.25 * frac1 + 0.25 * frac2;
  const recent = state.conversations.slice(-3);
  if (recent.length) {
    const avg = recent.reduce((s, c) => s + (c.scores.comprehension + c.scores.continuation) / 2, 0) / recent.length;
    if (avg > 0.85) d += 0.05;
    if (avg < 0.5) d -= 0.05;
  }
  const prof = skillProfile(state, now);
  if ((prof.listening.value ?? 0.6) < 0.5) d -= 0.03;
  if (state.settings.difficulty === "gentle") d -= 0.05;
  if (state.settings.difficulty === "challenging") d += 0.07;
  return Math.round(Math.max(0.1, Math.min(0.9, d)) * 100) / 100;
}

export interface AiLearnerContext {
  name: string;
  variety: string;
  level: string;
  difficulty: number;
  knownWords: string[];
  reviewWords: string[];
  recentMistakes: string[];
  grammarLearned: string[];
  topicsPracticed: string[];
  translationSupport: boolean;
}

export function buildAiContext(state: LearnerState, now: number): AiLearnerContext {
  const known = Object.values(state.memory)
    .filter((m) => m.kind === "vocab" && VOCAB[m.id]?.drill && m.exposureCount > 0)
    .sort((a, b) => (b.scores.recall ?? 0) - (a.scores.recall ?? 0));
  const done = lessonsCompleted(state);
  const concepts = [...new Set(done.flatMap((id) => LESSONS[id].concepts))];
  const variety: Record<string, string> = { latam: "neutral Latin American Spanish", mx: "Mexican Spanish", es: "Spain Spanish", rioplatense: "Rioplatense (Argentina/Uruguay) Spanish" };
  const d = conversationDifficulty(state, now);
  return {
    name: state.profile.name,
    variety: variety[state.settings.variety],
    level: d < 0.2 ? "absolute beginner" : d < 0.3 ? "beginner (A1)" : d < 0.4 ? "advanced beginner (A1–A2)" : d < 0.5 ? "early conversational (A2)" : "intermediate",
    difficulty: d,
    knownWords: known.slice(0, 250).map((m) => VOCAB[m.id].es),
    reviewWords: dueItems(state, now).filter((id) => id.startsWith("v:")).slice(0, 10).map((id) => VOCAB[id].es),
    recentMistakes: activePatterns(state.mistakes, now).slice(0, 4).map((p) => p.info.focus),
    grammarLearned: concepts,
    topicsPracticed: [...new Set(done.map((id) => LESSONS[id].title))].slice(-10),
    translationSupport: d < 0.35 || state.settings.assistance === "more",
  };
}

export function knownWordShare(state: LearnerState, text: string): number {
  const toks = tokenize(text);
  if (!toks.length) return 1;
  const known = toks.filter((t) => (TOKEN_INDEX.get(t) ?? []).some((id) => (state.memory[id]?.exposureCount ?? 0) > 0 || masteryLevel(state.memory[id]) !== "new"));
  return known.length / toks.length;
}
