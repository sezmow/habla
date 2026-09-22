// Authoring helpers: a compact lesson DSL that expands into typed content,
// automatic syllabification, and automatic vocabulary ↔ sentence linking.

import type { Gender, KeywordRequirement, Lesson, PartOfSpeech, Sentence, SpeakingPrompt, SpeakingStage, VocabItem } from "../engine/types";
import { normalize, slug, tokenize } from "../engine/text";
import { allForms, VERBS } from "./verbs";

// ─── Syllabification ─────────────────────────────────────────────────────

const STRONG = "aeoáéó";
const ACCENTED_WEAK = "íú";
const VOWELS = "aeiouáéíóúü";
const CLUSTERS = new Set(["pr", "br", "tr", "dr", "cr", "gr", "fr", "pl", "bl", "cl", "gl", "fl", "kr", "kl"]);

function units(word: string): string[] {
  const out: string[] = [];
  const w = word.toLowerCase();
  for (let i = 0; i < w.length; i++) {
    const two = w.slice(i, i + 2);
    if (two === "ch" || two === "ll" || two === "rr") {
      out.push(two);
      i++;
    } else if ((two === "qu" || two === "gu") && "eiéí".includes(w[i + 2] ?? "")) {
      out.push(two);
      i++;
    } else out.push(w[i]);
  }
  return out;
}

const isV = (u: string) => u.length === 1 && VOWELS.includes(u);
const isHiatus = (a: string, b: string) =>
  (STRONG.includes(a) && STRONG.includes(b)) || ACCENTED_WEAK.includes(a) || ACCENTED_WEAK.includes(b);

function syllabifyWord(word: string): string {
  const u = units(word);
  const nuclei: { start: number; end: number }[] = [];
  let i = 0;
  while (i < u.length) {
    if (!isV(u[i])) {
      i++;
      continue;
    }
    const start = i++;
    while (i < u.length && isV(u[i]) && !isHiatus(u[i - 1], u[i])) i++;
    nuclei.push({ start, end: i });
  }
  if (nuclei.length <= 1) return word;
  const breaks: number[] = [];
  for (let k = 1; k < nuclei.length; k++) {
    const cs = nuclei[k - 1].end;
    const n = nuclei[k].start - cs;
    let b: number;
    if (n <= 1) b = cs;
    else if (n === 2) b = CLUSTERS.has(u[cs] + u[cs + 1]) ? cs : cs + 1;
    else if (n === 3) b = CLUSTERS.has(u[cs + 1] + u[cs + 2]) ? cs + 1 : cs + 2;
    else b = cs + 2;
    breaks.push(b);
  }
  // Map unit indices back to character offsets in the original word.
  const offsets: number[] = [];
  let pos = 0;
  for (const unit of u) {
    offsets.push(pos);
    pos += unit.length;
  }
  const parts: string[] = [];
  let from = 0;
  for (const b of breaks) {
    parts.push(word.slice(from, offsets[b]));
    from = offsets[b];
  }
  parts.push(word.slice(from));
  return parts.join("·");
}

export function syllabify(text: string): string {
  return text
    .split(/\s+/)
    .map((w) => {
      const m = w.match(/^([¿¡"(]*)(.*?)([?!.,;:")]*)$/);
      if (!m || !m[2]) return w;
      return m[1] + syllabifyWord(m[2]) + m[3];
    })
    .join(" ");
}

// ─── Keys: which surface forms count as an occurrence ─────────────────────

const ARTICLES = new Set(["el", "la", "los", "las", "un", "una"]);

function pluralize(word: string): string[] {
  if (/[aeiouáéó]$/.test(word)) return [word + "s"];
  if (word.endsWith("z")) return [word.slice(0, -1) + "ces"];
  if (/ón$/.test(word)) return [word.replace(/ón$/, "ones")];
  return [word + "es"];
}

function deriveKeys(es: string, pos: PartOfSpeech, lemma?: string): string[] {
  const toks = tokenize(es);
  if (pos === "verb") {
    const inf = lemma ?? toks[toks.length - 1];
    if (VERBS[inf]) return allForms(inf);
    return [normalize(es)];
  }
  if (pos === "noun") {
    const body = ARTICLES.has(toks[0]) && toks.length > 1 ? toks.slice(1) : toks;
    const head = body.join(" ");
    if (body.length === 1) return [head, ...pluralize(head)];
    return [head];
  }
  if (pos === "adjective" && toks.length === 1) {
    const w = toks[0];
    if (w.endsWith("o")) {
      const s = w.slice(0, -1);
      return [w, s + "a", s + "os", s + "as"];
    }
    if (/(ón|or)$/.test(w)) return [w, w.replace(/ón$/, "ona") + (w.endsWith("ón") ? "" : "a"), ...pluralize(w)];
    return [w, ...pluralize(w)];
  }
  return [normalize(es)];
}

// ─── Lesson DSL ──────────────────────────────────────────────────────────

export interface VOpts {
  g?: Gender;
  emoji?: string;
  def?: string;
  freq?: number;
  diff?: 1 | 2 | 3 | 4 | 5;
  keys?: string[];
  alt?: string[];
  region?: string;
  related?: string[];
  drill?: boolean;
  lemma?: string;
  syl?: string;
}
export type VDef = [es: string, en: string, pos: PartOfSpeech, opts?: VOpts];

export interface SOpts {
  alt?: string[];
  altEn?: string[];
  starter?: string;
  note?: string;
  c?: string[];
}
export type SDef = [es: string, en: string, opts?: SOpts];

/** [stage, prompt (es), prompt (en), sample (es), sample (en), requirements "a|b" per label, extras] */
export type PDef = [
  stage: SpeakingStage,
  prompt: string,
  promptEn: string,
  sample: string,
  sampleEn: string,
  requirements: string[],
  extras?: { model?: string; starter?: string; scene?: string },
];

export interface LessonDef {
  title: string;
  titleEs: string;
  goal: string;
  kind?: "core" | "scenario";
  scenario?: string;
  minutes?: number;
  vocab: VDef[];
  sentences: SDef[];
  concepts?: string[];
  speaking?: PDef[];
}

export interface UnitDef {
  title: string;
  description: string;
  canDo: string[];
  lessons: LessonDef[];
}

export interface Built {
  vocab: VocabItem[];
  sentences: Sentence[];
  lessons: Lesson[];
  prompts: SpeakingPrompt[];
}

export function vocabId(es: string): string {
  return "v:" + slug(es);
}

export function requirement(spec: string): KeywordRequirement {
  const anyOf = spec.split("|").map((s) => normalize(s));
  return { anyOf, label: spec.split("|")[0] };
}

export function buildUnit(unitId: string, def: UnitDef, out: Built): string[] {
  return def.lessons.map((ld, li) => {
    const lessonId = `${unitId}-l${li + 1}`;
    const vocabIds: string[] = [];
    for (const [es, en, pos, o = {}] of ld.vocab) {
      let id = vocabId(es);
      const existing = out.vocab.find((v) => v.id === id);
      if (existing && existing.es === es) {
        vocabIds.push(id);
        continue;
      }
      // Words that differ only by an accent (el / él, tu / tú) keep the accent in their id.
      if (existing) id = "v:" + normalize(es).replace(/[^\p{L}\p{N} ]/gu, "").trim().replace(/\s+/g, "-");
      vocabIds.push(id);
      const lemma = pos === "verb" ? o.lemma ?? tokenize(es).pop() : undefined;
      out.vocab.push({
        id,
        es,
        en,
        altEn: o.alt,
        pos,
        gender: o.g,
        syllables: o.syl ?? syllabify(es),
        defEs: o.def,
        emoji: o.emoji,
        related: o.related,
        difficulty: o.diff ?? (pos === "function" ? 1 : 2),
        frequency: o.freq ?? 800,
        lessonId,
        keys: o.keys ?? deriveKeys(es, pos, lemma),
        region: o.region,
        drill: o.drill ?? pos !== "function",
        lemma,
      });
    }
    const sentenceIds = ld.sentences.map(([es, en, o = {}], si) => {
      const id = `s:${lessonId}:${si + 1}`;
      out.sentences.push({
        id,
        es,
        en,
        alt: o.alt ?? [],
        altEn: o.altEn ?? [],
        vocab: [],
        concepts: o.c ?? [],
        lessonId,
        starter: o.starter,
        note: o.note,
      });
      return id;
    });
    const promptIds = (ld.speaking ?? []).map(([stage, prompt, promptEn, sample, sampleEn, reqs, extras = {}], pi) => {
      const id = `p:${lessonId}:${pi + 1}`;
      out.prompts.push({
        id,
        stage,
        prompt,
        promptEn,
        sample,
        sampleEn,
        requirements: reqs.map(requirement),
        model: extras.model,
        starter: extras.starter,
        scene: extras.scene,
        lessonId,
      });
      return id;
    });
    out.lessons.push({
      id: lessonId,
      unitId,
      index: li,
      title: ld.title,
      titleEs: ld.titleEs,
      goal: ld.goal,
      kind: ld.kind ?? "core",
      vocab: vocabIds,
      sentences: sentenceIds,
      concepts: ld.concepts ?? [],
      speaking: promptIds,
      scenarioId: ld.scenario,
      minutes: ld.minutes ?? 6,
    });
    return lessonId;
  });
}

/** Link every sentence to the vocabulary items it contains (longest keys first). */
export function linkVocabulary(vocab: VocabItem[], sentences: Sentence[]): void {
  const entries = vocab.flatMap((v) => v.keys.map((k) => ({ v, toks: k.split(" ") })));
  entries.sort((a, b) => b.toks.length - a.toks.length);
  for (const s of sentences) {
    const toks = tokenize(s.es);
    const found = new Set<string>();
    for (const { v, toks: kt } of entries) {
      for (let i = 0; i <= toks.length - kt.length; i++) {
        if (kt.every((t, j) => toks[i + j] === t)) {
          found.add(v.id);
          break;
        }
      }
    }
    s.vocab = [...found];
  }
}
