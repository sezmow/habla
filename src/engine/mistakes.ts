// Classifies errors into learnable patterns and aggregates them over time so the
// session builder can intervene when the same mistake keeps happening.

import type { MistakeCategory, MistakeRecord } from "./types";
import type { TokenDiff } from "./answer";
import { fold, tokenize } from "./text";
import { analyzeForm, ESTAR_FORMS, SER_FORMS, TENER_FORMS } from "../content/verbs";
import { DAY } from "./memory";

export interface Classification {
  category: MistakeCategory;
  detail: string;
}

const ARTICLE_PAIRS: [string, string][] = [["el", "la"], ["un", "una"], ["los", "las"], ["este", "esta"], ["mucho", "mucha"]];
const TENER_NOUNS = ["hambre", "sed", "años", "frío", "calor", "miedo", "sueño", "prisa"];
const IR_A = /\b(voy|vas|va|vamos|van) a\b/;

function genderSwap(a: string, b: string): boolean {
  const fa = fold(a);
  const fb = fold(b);
  if (ARTICLE_PAIRS.some(([x, y]) => (fa === x && fb === y) || (fa === y && fb === x))) return true;
  if (fa.length < 3 || fa.length !== fb.length) return false;
  const stemA = fa.replace(/(o|a|os|as)$/, "");
  const stemB = fb.replace(/(o|a|os|as)$/, "");
  return stemA === stemB && fa !== fb && /[oa]s?$/.test(fa) && /[oa]s?$/.test(fb);
}

/** Returns the most specific explanations for why `given` differs from `expected`. */
export function classifyMistake(given: string, expected: string, diff: TokenDiff[]): Classification[] {
  const out: Classification[] = [];
  const add = (category: MistakeCategory, detail: string) => {
    if (!out.some((o) => o.category === category)) out.push({ category, detail });
  };
  const expToks = tokenize(expected);
  const givToks = tokenize(given);

  // Same words, different order.
  if (expToks.length > 1 && givToks.length === expToks.length && fold(givToks.slice().sort().join(" ")) === fold(expToks.slice().sort().join(" ")) && fold(given) !== fold(expected)) {
    add("word-order", `Word order: ${expected}`);
  }

  for (const d of diff) {
    if (d.status === "wrong" && d.expected) {
      const g = d.word.toLowerCase();
      const e = d.expected.toLowerCase();
      if (TENER_FORMS.has(e) && (ESTAR_FORMS.has(g) || SER_FORMS.has(g)) && expToks.some((t) => TENER_NOUNS.includes(t))) {
        add("tener-expressions", `“${g}” → “${e}”: hunger, thirst and age use tener`);
      } else if ((SER_FORMS.has(e) && ESTAR_FORMS.has(g)) || (ESTAR_FORMS.has(e) && SER_FORMS.has(g))) {
        add("ser-estar", `“${g}” → “${e}”`);
      } else if (SER_FORMS.has(e) && SER_FORMS.has(g)) {
        add("ser-forms", `“${g}” → “${e}”`);
      } else if ((fold(g) === "por" && fold(e) === "para") || (fold(g) === "para" && fold(e) === "por")) {
        add("por-para", `“${g}” → “${e}”`);
      } else if (fold(g).startsWith("gust") && fold(e).startsWith("gust")) {
        add("gustar", `“${g}” → “${e}”`);
      } else if (genderSwap(g, e)) {
        add("gender-agreement", `“${g}” → “${e}”`);
      } else {
        const ga = analyzeForm(g);
        const ea = analyzeForm(e);
        const shared = ea.find((x) => ga.some((y) => y.lemma === x.lemma));
        if (shared) {
          const gTense = ga.find((y) => y.lemma === shared.lemma)!.tense;
          if (shared.tense === "preterite" && gTense !== "preterite") add("preterite", `“${g}” → “${e}” (past tense)`);
          else add("verb-forms", `“${g}” → “${e}”`);
        } else if (ea.some((x) => x.tense === "preterite")) {
          add("preterite", `“${g}” → “${e}”`);
        } else {
          add("vocabulary", `“${g}” → “${e}”`);
        }
      }
    }
    if (d.status === "missing" && d.expected) {
      if (d.expected === "a" && IR_A.test(fold(expected))) add("ir-a", "Missing “a” in voy a + verb");
      else if (["gusta", "gustan"].includes(d.expected)) add("gustar", `Missing “${d.expected}”`);
      else if (TENER_FORMS.has(d.expected)) add("tener-expressions", `Missing “${d.expected}”`);
      else add("missing-words", `Missing “${d.expected}”`);
    }
    if (d.status === "extra" && fold(d.word) === "yo" && givToks.includes("gusto")) add("gustar", "Use “me gusta,” not “yo gusto”");
  }
  if (!out.length && diff.some((d) => d.status === "accent")) {
    const words = diff.filter((d) => d.status === "accent").map((d) => d.expected);
    add("accents", `Accent: ${words.join(", ")}`);
  }
  return out.slice(0, 2);
}

// ─── Aggregation ──────────────────────────────────────────────────────────

export interface CategoryInfo {
  lead: string;
  focus: string;
  concept: string | null;
  tip: string;
}

export const CATEGORY_INFO: Record<MistakeCategory, CategoryInfo> = {
  "ser-estar": { lead: "You frequently confuse", focus: "ser / estar", concept: "ser-estar", tip: "Estoy for states and places; soy for who you are." },
  "ser-forms": { lead: "You mix up forms of", focus: "ser (soy, eres, es, somos, son)", concept: "ser-identity", tip: "Yo soy, tú eres, él es — never “yo es.”" },
  "tener-expressions": { lead: "You often reach for estar instead of", focus: "tener (tengo hambre, tengo 20 años)", concept: "tener-expressions", tip: "You have hunger, thirst and years: tengo hambre." },
  "gender-agreement": { lead: "You sometimes miss", focus: "masculine / feminine agreement", concept: "gender", tip: "Match the article and adjective to the noun: la camisa roja." },
  "por-para": { lead: "You often mix up", focus: "por / para", concept: "por-para", tip: "Para for purpose and recipients; por for through, per, because." },
  preterite: { lead: "You struggle with", focus: "past-tense endings", concept: "preterite", tip: "Yo: -é for -ar verbs, -í for -er/-ir. Ir → fui." },
  "verb-forms": { lead: "You struggle with", focus: "verb endings", concept: "present-regular", tip: "The ending tells who: hablo, hablas, habla." },
  gustar: { lead: "You sometimes mix up", focus: "gustar (me gusta / me gustan)", concept: "gustar", tip: "Me gusta + one thing, me gustan + several." },
  "ir-a": { lead: "You often drop", focus: "the “a” in voy a + verb", concept: "ir-a", tip: "Voy a comer — the a is required." },
  accents: { lead: "You often leave off", focus: "accents and ñ", concept: "accents", tip: "Accents can change meaning: tú vs. tu." },
  "word-order": { lead: "You sometimes swap", focus: "word order", concept: "word-order", tip: "Adjectives usually go after the noun." },
  "missing-words": { lead: "You frequently omit", focus: "small words (a, de, el, que…)", concept: "al-del", tip: "Small words carry grammar — read the sentence back to yourself." },
  vocabulary: { lead: "You sometimes mix up", focus: "specific words", concept: null, tip: "Those words will come back in review in new sentences." },
  "listening-detail": { lead: "You miss details in", focus: "fast speech", concept: null, tip: "Replay slowly, then at normal speed." },
  pronunciation: { lead: "Some sounds need work:", focus: "pronunciation", concept: null, tip: "Try the pronunciation drills in Practice." },
};

export interface MistakePattern {
  category: MistakeCategory;
  total: number;
  recent: number;
  /** Recency-weighted count used to rank patterns. */
  weight: number;
  lastAt: number;
  examples: MistakeRecord[];
  trend: "rising" | "steady" | "improving";
  info: CategoryInfo;
}

export function mistakePatterns(mistakes: MistakeRecord[], now: number): MistakePattern[] {
  const byCat = new Map<MistakeCategory, MistakeRecord[]>();
  for (const m of mistakes) (byCat.get(m.category) ?? byCat.set(m.category, []).get(m.category)!).push(m);
  const out: MistakePattern[] = [];
  for (const [category, list] of byCat) {
    list.sort((a, b) => b.at - a.at);
    const ageDays = (m: MistakeRecord) => (now - m.at) / DAY;
    const weight = list.reduce((sum, m) => sum + Math.pow(0.5, ageDays(m) / 7), 0);
    const recent = list.filter((m) => ageDays(m) <= 7).length;
    const prior = list.filter((m) => ageDays(m) > 7 && ageDays(m) <= 14).length;
    out.push({
      category,
      total: list.length,
      recent,
      weight,
      lastAt: list[0].at,
      examples: list.slice(0, 3),
      trend: recent > prior + 1 ? "rising" : recent < prior ? "improving" : "steady",
      info: CATEGORY_INFO[category],
    });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

/** Patterns strong enough that sessions should add targeted practice. */
export function activePatterns(mistakes: MistakeRecord[], now: number): MistakePattern[] {
  return mistakePatterns(mistakes, now).filter((p) => p.weight >= 1.5 && p.category !== "vocabulary");
}
