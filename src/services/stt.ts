// Speech-to-text via the Web Speech API (Chrome, Edge, Safari).
// Note for privacy copy: in Chrome, recognition audio is processed by the
// browser vendor's speech service, not by Habla.

import type { Variety } from "../engine/types";

type RecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; length: number; [i: number]: { transcript: string; confidence: number } }>;
}

const LANG: Record<Variety, string> = { latam: "es-US", mx: "es-MX", es: "es-ES", rioplatense: "es-AR" };

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function sttAvailable(): boolean {
  return !!ctor();
}

export interface Transcript {
  text: string;
  confidence: number;
}

export interface RecognitionHandlers {
  variety: Variety;
  onInterim: (text: string) => void;
  onSpeechStart: () => void;
  onDone: (alternatives: Transcript[]) => void;
  onError: (error: string) => void;
}

export interface RecognitionSession {
  stop(): void;
  abort(): void;
}

/**
 * Continuous recognition so a pause mid-sentence doesn't cut the learner off.
 * Final chunks are joined; alternatives come from the recognizer's n-best list.
 */
export function startRecognition(h: RecognitionHandlers): RecognitionSession | null {
  const C = ctor();
  if (!C) return null;
  const rec = new C();
  rec.lang = LANG[h.variety];
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 3;
  const finals: { alts: Transcript[] }[] = [];
  let interim = "";
  let ended = false;
  let errored = false;

  rec.onspeechstart = () => h.onSpeechStart();
  rec.onresult = (e) => {
    interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        const alts: Transcript[] = [];
        for (let j = 0; j < r.length; j++) alts.push({ text: r[j].transcript.trim(), confidence: r[j].confidence || 0.7 });
        finals.push({ alts });
      } else interim += r[0].transcript;
    }
    h.onInterim([...finals.map((f) => f.alts[0].text), interim].join(" ").trim());
  };
  rec.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") return;
    errored = true;
    h.onError(e.error);
  };
  rec.onend = () => {
    if (ended) return;
    ended = true;
    if (errored) return;
    if (!finals.length && interim) finals.push({ alts: [{ text: interim.trim(), confidence: 0.5 }] });
    const primary = finals.map((f) => f.alts[0].text).join(" ").trim();
    const conf = finals.length ? finals.reduce((s, f) => s + f.alts[0].confidence, 0) / finals.length : 0;
    const out: Transcript[] = primary ? [{ text: primary, confidence: conf }] : [];
    // Alternatives: swap in the n-best options of the last chunk.
    const last = finals[finals.length - 1];
    if (last) {
      for (const alt of last.alts.slice(1)) {
        out.push({ text: [...finals.slice(0, -1).map((f) => f.alts[0].text), alt.text].join(" ").trim(), confidence: alt.confidence });
      }
    }
    h.onDone(out);
  };
  try {
    rec.start();
  } catch {
    return null;
  }
  return { stop: () => rec.stop(), abort: () => rec.abort() };
}

export function describeSttError(error: string): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is blocked. You can allow it in your browser's site settings.";
    case "audio-capture":
      return "No microphone was found.";
    case "network":
      return "Speech recognition needs an internet connection in this browser.";
    default:
      return "Speech recognition stopped unexpectedly. Try again.";
  }
}
