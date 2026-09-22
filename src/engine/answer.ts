// Answer checking. Aligns the learner's words with the closest accepted answer
// so feedback can say exactly what was missing, wrong, or just missing an accent.

import type { KeywordRequirement } from "./types";
import { fold, levenshtein, normalize, tokenize } from "./text";
import { FORM_INDEX } from "../content/verbs";
import { TOKEN_INDEX } from "../content";

export type TokenStatus = "ok" | "accent" | "typo" | "wrong" | "missing" | "extra";

export interface TokenDiff {
  word: string;
  status: TokenStatus;
  expected?: string;
}

export type Verdict = "correct" | "almost" | "incorrect";

export interface CheckResult {
  verdict: Verdict;
  /** 0–1; ≥ 0.6 counts as success for scheduling. */
  quality: number;
  /** The accepted answer the input was compared against. */
  matched: string;
  diff: TokenDiff[];
  notes: string[];
}

const SUBJECTS = new Set(["yo", "tú", "él", "ella", "usted", "nosotros", "nosotras", "ellos", "ellas", "ustedes"]);

/** Accept dropped (or added) subject pronouns: "Yo tengo hambre" ≡ "Tengo hambre". */
function expandSpanish(accepted: string[]): string[] {
  const out = new Set<string>();
  for (const a of accepted) {
    out.add(a);
    const toks = tokenize(a);
    if (toks.length > 1 && SUBJECTS.has(toks[0])) out.add(toks.slice(1).join(" "));
  }
  return [...out];
}

interface Aligned {
  cost: number;
  diff: TokenDiff[];
}

/** A different real word is a real error (como vs. comí), never a typo. */
function isRealWord(w: string): boolean {
  return FORM_INDEX.has(w) || TOKEN_INDEX.has(w);
}

function tokenCost(a: string, b: string): { cost: number; status: TokenStatus } {
  if (a === b) return { cost: 0, status: "ok" };
  const fa = fold(a);
  const fb = fold(b);
  if (fa === fb) return { cost: 0.15, status: "accent" };
  if (isRealWord(a) && isRealWord(b)) return { cost: 1, status: "wrong" };
  const d = levenshtein(fa, fb);
  if ((fb.length >= 4 && d === 1) || (fb.length >= 8 && d === 2)) return { cost: 0.4, status: "typo" };
  return { cost: 1, status: "wrong" };
}

/** Needleman–Wunsch alignment over tokens. `given` is the learner, `expected` the answer. */
export function align(given: string[], expected: string[]): Aligned {
  const n = given.length;
  const m = expected.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) dp[i][0] = i;
  for (let j = 1; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = Math.min(dp[i - 1][j - 1] + tokenCost(given[i - 1], expected[j - 1]).cost, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
    }
  }
  const diff: TokenDiff[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const tc = tokenCost(given[i - 1], expected[j - 1]);
      if (Math.abs(dp[i][j] - (dp[i - 1][j - 1] + tc.cost)) < 1e-9) {
        diff.unshift({ word: given[i - 1], status: tc.status, expected: expected[j - 1] });
        i--;
        j--;
        continue;
      }
    }
    if (j > 0 && (i === 0 || Math.abs(dp[i][j] - (dp[i][j - 1] + 1)) < 1e-9)) {
      diff.unshift({ word: expected[j - 1], status: "missing", expected: expected[j - 1] });
      j--;
    } else {
      diff.unshift({ word: given[i - 1], status: "extra" });
      i--;
    }
  }
  return { cost: dp[n][m], diff };
}

function verdictFrom(diff: TokenDiff[], cost: number, len: number): { verdict: Verdict; quality: number } {
  const hard = diff.filter((d) => d.status === "wrong" || d.status === "missing" || d.status === "extra").length;
  if (hard === 0) {
    const typos = diff.filter((d) => d.status === "typo").length;
    const accents = diff.filter((d) => d.status === "accent").length;
    if (!typos && !accents) return { verdict: "correct", quality: 1 };
    return { verdict: "almost", quality: typos ? 0.8 : 0.88 };
  }
  return { verdict: "incorrect", quality: Math.max(0, 1 - cost / Math.max(1, len)) * 0.5 };
}

function bestAlignment(givenToks: string[], candidates: string[], tokenizeFn: (s: string) => string[]) {
  let best: { cand: string; al: Aligned; len: number } | null = null;
  for (const cand of candidates) {
    const toks = tokenizeFn(cand);
    const al = align(givenToks, toks);
    const score = al.cost / Math.max(1, toks.length);
    if (!best || score < best.al.cost / Math.max(1, best.len)) best = { cand, al, len: toks.length };
  }
  return best!;
}

export function checkSpanish(input: string, accepted: string[]): CheckResult {
  const raw = tokenize(input);
  if (!raw.length) return { verdict: "incorrect", quality: 0, matched: accepted[0], diff: [], notes: [] };
  const candidates = expandSpanish(accepted);
  // An added subject pronoun ("Yo tengo hambre") is as correct as leaving it out.
  let best = bestAlignment(raw, candidates, tokenize);
  if (raw.length > 1 && SUBJECTS.has(raw[0])) {
    const dropped = bestAlignment(raw.slice(1), candidates, tokenize);
    if (dropped.al.cost < best.al.cost) best = dropped;
  }
  const { verdict, quality } = verdictFrom(best.al.diff, best.al.cost, best.len);
  const notes: string[] = [];
  for (const d of best.al.diff) {
    if (d.status === "accent") notes.push(`Watch the accent: ${d.expected}`);
    else if (d.status === "typo") notes.push(`Check the spelling: ${d.expected}`);
  }
  // Show the original accepted text (with punctuation) that best matched.
  const matched = accepted.find((a) => fold(a) === fold(best.cand)) ?? accepted.find((a) => fold(best.cand).endsWith(fold(a))) ?? best.cand;
  return { verdict, quality, matched, diff: best.al.diff, notes: [...new Set(notes)].slice(0, 3) };
}

// ─── English ──────────────────────────────────────────────────────────────

const CONTRACTIONS: [RegExp, string][] = [
  [/\bi'm\b/g, "i am"], [/\byou're\b/g, "you are"], [/\bwe're\b/g, "we are"], [/\bthey're\b/g, "they are"],
  [/\b(he|she|it|that|what|there|who|where|how)'s\b/g, "$1 is"], [/\bcan't\b/g, "cannot"], [/\bcan not\b/g, "cannot"],
  [/\bwon't\b/g, "will not"], [/\b(\w+)n't\b/g, "$1 not"], [/\b(i|you|we|they|he|she|it)'ll\b/g, "$1 will"],
  [/\b(i|you|we|they)'ve\b/g, "$1 have"], [/\b(i|you|we|they|he|she)'d\b/g, "$1 would"], [/\blet's\b/g, "let us"],
  [/\bok\b/g, "okay"], [/\bmom\b/g, "mother"], [/\bdad\b/g, "father"],
];
const FILLER = new Set(["a", "an", "the", "some", "just", "really", "so"]);

function englishTokens(text: string): string[] {
  let t = normalize(text);
  for (const [re, rep] of CONTRACTIONS) t = t.replace(re, rep);
  return t.split(" ").filter((w) => w && !FILLER.has(w));
}

export function checkEnglish(input: string, accepted: string[]): CheckResult {
  const given = englishTokens(input);
  if (!given.length) return { verdict: "incorrect", quality: 0, matched: accepted[0], diff: [], notes: [] };
  const best = bestAlignment(given, accepted, englishTokens);
  let { verdict, quality } = verdictFrom(best.al.diff, best.al.cost, best.len);
  // Meaning-level leniency: one small word off in a longer sentence still shows understanding.
  const hard = best.al.diff.filter((d) => d.status === "wrong" || d.status === "missing" || d.status === "extra").length;
  if (verdict === "incorrect" && best.len >= 4 && hard === 1) {
    verdict = "almost";
    quality = 0.75;
  }
  if (verdict === "almost" && hard === 0) quality = Math.max(quality, 0.9);
  return { verdict, quality, matched: accepted.find((a) => a === best.cand) ?? best.cand, diff: best.al.diff, notes: verdict === "almost" ? ["Close — here's a more natural way to say it."] : [] };
}

// ─── Open responses ───────────────────────────────────────────────────────

export interface RequirementResult {
  met: string[];
  missing: string[];
  ok: boolean;
}

export function containsFragment(text: string, fragment: string): boolean {
  const toks = fold(text).split(/\s+/).filter(Boolean);
  const frag = fold(fragment).split(/\s+/).filter(Boolean);
  if (!frag.length) return false;
  for (let i = 0; i <= toks.length - frag.length; i++) {
    if (frag.every((f, j) => toks[i + j] === f)) return true;
  }
  return false;
}

export function checkRequirements(text: string, reqs: KeywordRequirement[]): RequirementResult {
  const met: string[] = [];
  const missing: string[] = [];
  for (const r of reqs) (r.anyOf.some((f) => containsFragment(text, f)) ? met : missing).push(r.label);
  return { met, missing, ok: missing.length === 0 };
}

// ─── Speech ───────────────────────────────────────────────────────────────

export interface SpeechInput {
  /** Recognizer alternatives, best first. */
  transcripts: { text: string; confidence: number }[];
  /** Exact target (repeat / translate-aloud); omit for open-ended prompts. */
  accepted?: string[];
  requirements?: KeywordRequirement[];
  durationMs: number;
  /** Time from pressing record to the first recognized speech. */
  firstSpeechMs: number | null;
  stage: number;
}

export interface FeedbackLine {
  tone: "good" | "tip";
  text: string;
}

export interface SpeechEvaluation {
  transcript: string;
  diff: TokenDiff[];
  /** Share of target words the recognizer understood. */
  intelligibility: number | null;
  requirements: RequirementResult | null;
  wpm: number | null;
  hesitationMs: number | null;
  checks: { vocabulary: boolean; grammar: boolean; pronunciation: "good" | "okay" | "work" };
  feedback: FeedbackLine[];
  quality: number;
  passed: boolean;
}

/**
 * Evaluates what the speech recognizer heard. Pronunciation is judged by
 * intelligibility — whether each target word was understood — not by accent.
 */
export function evaluateSpeech(input: SpeechInput): SpeechEvaluation {
  // Pick the alternative closest to the target (recognizers often rank a
  // near-homophone first).
  let transcript = input.transcripts[0]?.text ?? "";
  let confidence = input.transcripts[0]?.confidence ?? 0;
  let check: CheckResult | null = null;
  if (input.accepted?.length) {
    for (const alt of input.transcripts) {
      const c = checkSpanish(alt.text, input.accepted);
      if (!check || c.quality > check.quality) {
        check = c;
        transcript = alt.text;
        confidence = alt.confidence;
      }
    }
  }
  const words = tokenize(transcript);
  const wpm = input.durationMs > 1500 && words.length ? Math.round((words.length / input.durationMs) * 60000) : null;
  const reqResult = input.requirements?.length ? checkRequirements(transcript, input.requirements) : null;
  const feedback: FeedbackLine[] = [];

  let intelligibility: number | null = null;
  let diff: TokenDiff[] = [];
  let vocabulary = true;
  let grammar = true;
  if (check) {
    diff = check.diff;
    const target = diff.filter((d) => d.status !== "extra");
    const understood = target.filter((d) => d.status === "ok" || d.status === "accent" || d.status === "typo").length;
    intelligibility = target.length ? understood / target.length : 0;
    vocabulary = diff.filter((d) => d.status === "wrong").length <= Math.floor(target.length / 4);
    grammar = check.verdict !== "incorrect" || intelligibility >= 0.8;
  }
  if (reqResult) {
    vocabulary = vocabulary && reqResult.ok;
    grammar = grammar && reqResult.met.length > 0;
  }

  const pron: "good" | "okay" | "work" =
    intelligibility == null ? (confidence >= 0.75 ? "good" : confidence >= 0.5 ? "okay" : "work") : intelligibility >= 0.9 ? "good" : intelligibility >= 0.65 ? "okay" : "work";

  // Coaching feedback: lead with what went well, then at most two tips.
  if (check && intelligibility != null) {
    const run = longestOkRun(diff);
    if (intelligibility === 1) feedback.push({ tone: "good", text: "Every word came through clearly." });
    else if (run.length >= 2) feedback.push({ tone: "good", text: `You said “${run.join(" ")}” clearly.` });
    const trouble = diff.filter((d) => d.status === "wrong" || d.status === "missing").slice(0, input.stage <= 2 ? 1 : 2);
    for (const t of trouble) {
      feedback.push({ tone: "tip", text: t.status === "missing" ? `“${t.expected}” didn't come through — try saying it again.` : `Try the pronunciation of “${t.expected}” again.` });
    }
  }
  if (reqResult) {
    if (reqResult.ok) feedback.unshift({ tone: "good", text: "Good job. Your sentence had what it needed." });
    else feedback.push({ tone: "tip", text: `Try to include: ${reqResult.missing.join(", ")}.` });
  }
  if (wpm != null && wpm < 45 && words.length >= 3 && feedback.length < 4) feedback.push({ tone: "tip", text: "Good — now try linking the words together a little faster." });
  if (input.firstSpeechMs != null && input.firstSpeechMs > 4000 && input.stage >= 3 && feedback.length < 4) feedback.push({ tone: "tip", text: "Try starting a little sooner — a quick “A ver…” buys you time." });

  let quality: number;
  if (check && intelligibility != null) quality = check.verdict === "correct" ? 1 : check.verdict === "almost" ? 0.9 : Math.max(0.2, intelligibility * 0.75);
  else if (reqResult) quality = reqResult.ok ? 0.9 : reqResult.met.length ? 0.55 : 0.2;
  else quality = words.length ? 0.7 : 0;
  if (!words.length) quality = 0;

  return {
    transcript,
    diff,
    intelligibility,
    requirements: reqResult,
    wpm,
    hesitationMs: input.firstSpeechMs,
    checks: { vocabulary, grammar, pronunciation: pron },
    feedback: feedback.slice(0, 4),
    quality,
    passed: quality >= 0.6,
  };
}

function longestOkRun(diff: TokenDiff[]): string[] {
  let best: string[] = [];
  let cur: string[] = [];
  for (const d of diff) {
    if (d.status === "ok" || d.status === "accent") {
      cur.push(d.expected ?? d.word);
      if (cur.length > best.length) best = [...cur];
    } else if (d.status !== "extra") cur = [];
  }
  return best;
}
