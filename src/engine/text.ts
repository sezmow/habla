// Text normalization and tokenization shared by answer checking, vocabulary
// matching and comprehension coverage.

const PUNCT = /[¿¡?!.,;:"“”«»()\[\]…—–\-]/g;

/** Lowercase, trim punctuation and collapse whitespace. Keeps accents. */
export function normalize(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(PUNCT, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove diacritics (á→a, ñ→n, ü→u). */
export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");
}

export function fold(text: string): string {
  return stripAccents(normalize(text));
}

export function tokenize(text: string): string[] {
  const n = normalize(text);
  return n ? n.split(" ") : [];
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Does `haystack` contain the token sequence `needle` contiguously? */
export function containsSequence(haystack: string[], needle: string[]): number {
  if (!needle.length || needle.length > haystack.length) return -1;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/** Stable short hash for ids and deterministic choices. */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function slug(text: string): string {
  return fold(text).replace(/[^a-z0-9 ]/g, "").trim().replace(/\s+/g, "-");
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pick<T>(items: T[], random: () => number = Math.random): T {
  return items[Math.floor(random() * items.length)];
}

/** Split a Spanish sentence into display tokens, keeping punctuation attached for rendering. */
export function displayWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
