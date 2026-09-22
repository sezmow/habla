// Text-to-speech via the browser's Speech Synthesis API.
// Voices depend on the device; we choose the best match for the learner's
// Spanish variety and use different voices for different speakers.

import type { Variety } from "../engine/types";

const LANG_PREFS: Record<Variety, string[]> = {
  latam: ["es-US", "es-MX", "es-419", "es-CO", "es-AR", "es-ES", "es"],
  mx: ["es-MX", "es-US", "es-419", "es-ES", "es"],
  es: ["es-ES", "es", "es-US", "es-MX"],
  rioplatense: ["es-AR", "es-UY", "es-419", "es-US", "es-MX", "es"],
};

export const RATE = { slow: 0.7, normal: 0.95, fast: 1.15 };

export function ttsAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

let cached: SpeechSynthesisVoice[] = [];

export function spanishVoices(): SpeechSynthesisVoice[] {
  if (!ttsAvailable()) return [];
  const all = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("es"));
  if (all.length) cached = all;
  return cached;
}

export function voicesReady(): Promise<SpeechSynthesisVoice[]> {
  if (!ttsAvailable()) return Promise.resolve([]);
  const now = spanishVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(spanishVoices());
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}

function rank(v: SpeechSynthesisVoice, variety: Variety): number {
  const prefs = LANG_PREFS[variety];
  const i = prefs.findIndex((p) => v.lang.toLowerCase() === p.toLowerCase() || v.lang.toLowerCase().startsWith(p.toLowerCase() + "-"));
  const langScore = i === -1 ? 50 : i * 5;
  // Prefer higher-quality voices where the platform labels them.
  const quality = /premium|enhanced|natural|neural|google/i.test(v.name) ? -3 : 0;
  return langScore + quality + (v.localService ? 0 : 1);
}

export function pickVoice(variety: Variety, preferredURI: string | null, speaker = 0): SpeechSynthesisVoice | null {
  const voices = spanishVoices();
  if (!voices.length) return null;
  const sorted = voices.slice().sort((a, b) => rank(a, variety) - rank(b, variety));
  const preferred = preferredURI ? voices.find((v) => v.voiceURI === preferredURI) : null;
  const primary = preferred ?? sorted[0];
  if (speaker === 0) return primary;
  // A second speaker gets a different voice from the same region when possible.
  const others = sorted.filter((v) => v.voiceURI !== primary.voiceURI);
  const sameLang = others.filter((v) => v.lang === primary.lang);
  return (sameLang[speaker - 1] ?? others[speaker - 1] ?? primary) || null;
}

export interface SpeakOptions {
  rate?: number;
  variety: Variety;
  voiceURI: string | null;
  speaker?: number;
  onBoundary?: (charIndex: number, charLength: number) => void;
}

let current: SpeechSynthesisUtterance | null = null;

/** Speak text; resolves with how long it took (used for listening time). */
export function speak(text: string, opts: SpeakOptions): Promise<number> {
  if (!ttsAvailable() || !text.trim()) return Promise.resolve(0);
  const synth = window.speechSynthesis;
  synth.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(opts.variety, opts.voiceURI, opts.speaker ?? 0);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else u.lang = LANG_PREFS[opts.variety][0];
    u.rate = opts.rate ?? 0.95;
    const start = performance.now();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (current === u) current = null;
      resolve(performance.now() - start);
    };
    u.onend = finish;
    u.onerror = finish;
    if (opts.onBoundary) u.onboundary = (e) => opts.onBoundary!(e.charIndex, e.charLength ?? 0);
    current = u;
    synth.speak(u);
    // Safety net: some engines never fire onend.
    setTimeout(finish, Math.max(4000, text.length * 180 / (u.rate || 1)));
  });
}

export function stopSpeaking(): void {
  if (ttsAvailable()) window.speechSynthesis.cancel();
  current = null;
}

/** Speak a word syllable by syllable: "pe · rro". */
export function speakSyllables(syllables: string, opts: SpeakOptions): Promise<number> {
  const text = syllables.split("·").join(" … ");
  return speak(text, { ...opts, rate: 0.6 });
}
