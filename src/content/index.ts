// Assembles the curriculum and exposes lookups used by the engine and UI.

import type { Concept, Lesson, Level, Scenario, Sentence, SpeakingPrompt, Unit, VocabItem } from "../engine/types";
import { fold, normalize, tokenize } from "../engine/text";
import { buildUnit, linkVocabulary, syllabify, vocabId, type Built, type UnitDef } from "./build";
import { CONCEPT_DEFS } from "./concepts";
import { LEVEL1 } from "./level1";
import { LEVEL2 } from "./level2";
import { LEVEL3_ROADMAP, LEVEL4_ROADMAP, PHRASES, type PhraseDef } from "./extras";
import { SCENARIOS } from "./scenarios";

export { LISTENING } from "./listening";
export { PRONUNCIATION } from "./pronunciation";
export { SCENARIOS, REPAIR_INTENTS } from "./scenarios";
export { PLACEMENT, PLACEMENT_SPEAKING, CHALLENGES } from "./extras";

const LEVEL_DEFS: { title: string; cefr: string; description: string; units: UnitDef[]; available: boolean }[] = [
  { title: "Foundations", cefr: "A1", description: "Greetings, people, food, daily life, getting around and shopping.", units: LEVEL1, available: true },
  { title: "Everyday Spanish", cefr: "A2", description: "The past, plans, opinions, descriptions, work, school, hobbies and travel.", units: LEVEL2, available: true },
  { title: "Conversational Spanish", cefr: "B1", description: "Storytelling, explaining problems, uncertainty and natural conversation.", units: LEVEL3_ROADMAP, available: false },
  { title: "Intermediate Fluency", cefr: "B2", description: "Longer conversations, authentic audio, nuance and complex grammar.", units: LEVEL4_ROADMAP, available: false },
];

const built: Built = { vocab: [], sentences: [], lessons: [], prompts: [] };
export const LEVELS: Level[] = [];
export const UNITS: Unit[] = [];

let unitCounter = 0;
LEVEL_DEFS.forEach((ld, li) => {
  const levelId = `level${li + 1}`;
  const unitIds: string[] = [];
  ld.units.forEach((ud, ui) => {
    const unitId = `u${++unitCounter}`;
    const lessons = buildUnit(unitId, ud, built);
    UNITS.push({ id: unitId, levelId, index: ui, title: ud.title, description: ud.description, canDo: ud.canDo, lessons });
    unitIds.push(unitId);
  });
  LEVELS.push({ id: levelId, index: li, title: ld.title, cefr: ld.cefr, description: ld.description, units: unitIds, available: ld.available });
});

// Phrase bank items are vocabulary with their own pseudo-lesson.
export interface PhraseEntry extends PhraseDef {
  id: string;
}
export const PHRASE_BANK: PhraseEntry[] = PHRASES.map((p) => {
  const id = vocabId(p.es);
  if (!built.vocab.some((v) => v.id === id)) {
    built.vocab.push({
      id,
      es: p.es,
      en: p.en,
      pos: "phrase",
      syllables: syllabify(p.es.replace(/_+/g, "…")),
      difficulty: 2,
      frequency: 300,
      lessonId: "phrases",
      keys: [normalize(p.es.replace(/_+|…/g, " "))].filter(Boolean),
      region: p.region,
      drill: true,
    });
  }
  return { ...p, id };
});

linkVocabulary(built.vocab, built.sentences);

export const VOCAB: Record<string, VocabItem> = Object.fromEntries(built.vocab.map((v) => [v.id, v]));
export const SENTENCES: Record<string, Sentence> = Object.fromEntries(built.sentences.map((s) => [s.id, s]));
export const LESSONS: Record<string, Lesson> = Object.fromEntries(built.lessons.map((l) => [l.id, l]));
export const PROMPTS: Record<string, SpeakingPrompt> = Object.fromEntries(built.prompts.map((p) => [p.id, p]));
export const LESSON_ORDER: string[] = built.lessons.map((l) => l.id);
export const UNIT_MAP: Record<string, Unit> = Object.fromEntries(UNITS.map((u) => [u.id, u]));
export const LEVEL_MAP: Record<string, Level> = Object.fromEntries(LEVELS.map((l) => [l.id, l]));
export const SCENARIO_MAP: Record<string, Scenario> = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

const sentenceByText = new Map(built.sentences.map((s) => [fold(s.es), s.id]));
export const CONCEPTS: Record<string, Concept> = Object.fromEntries(
  CONCEPT_DEFS.map(({ drillText, ...c }) => {
    const drills = drillText.map((t) => sentenceByText.get(fold(t))).filter((x): x is string => !!x);
    const lesson = built.lessons.find((l) => l.concepts.includes(c.id));
    return [c.id, { ...c, drills, lessonId: lesson?.id }];
  }),
);

/** vocab id → sentences that contain it, in curriculum order. */
export const SENTENCES_BY_VOCAB: Record<string, string[]> = {};
for (const s of built.sentences) for (const v of s.vocab) (SENTENCES_BY_VOCAB[v] ??= []).push(s.id);

/** Single token → vocab ids that can produce it (for coverage and "words you used"). */
export const TOKEN_INDEX: Map<string, string[]> = new Map();
for (const v of built.vocab) {
  for (const key of v.keys) {
    for (const tok of key.split(" ")) {
      const list = TOKEN_INDEX.get(tok) ?? [];
      if (!list.includes(v.id)) list.push(v.id);
      TOKEN_INDEX.set(tok, list);
    }
  }
}

export function lessonPosition(id: string): number {
  return LESSON_ORDER.indexOf(id);
}

export function unitOf(lessonId: string): Unit | undefined {
  const l = LESSONS[lessonId];
  return l ? UNIT_MAP[l.unitId] : undefined;
}

export function levelOf(lessonId: string): Level | undefined {
  const u = unitOf(lessonId);
  return u ? LEVEL_MAP[u.levelId] : undefined;
}

/** Items (vocab + sentences) a lesson teaches, in teaching order. */
export function lessonItems(lessonId: string): string[] {
  const l = LESSONS[lessonId];
  if (!l) return [];
  return [...l.vocab.filter((id) => VOCAB[id]?.lessonId === lessonId), ...l.sentences];
}

export function personalize(text: string, name: string): string {
  return text.replace(/\{name\}/g, name || "Alex");
}

export function isProperNoun(token: string, original: string): boolean {
  return /^[A-ZÁÉÍÓÚÑ]/.test(original) && !!token;
}

export function tokensOf(text: string): string[] {
  return tokenize(text);
}

export const CONTENT_STATS = {
  vocab: built.vocab.filter((v) => v.drill).length,
  sentences: built.sentences.length,
  lessons: built.lessons.length,
  prompts: built.prompts.length,
};

export const CONCEPT_IDS_USED: string[] = [
  ...new Set([...built.lessons.flatMap((l) => l.concepts), ...built.sentences.flatMap((s) => s.concepts)]),
];
