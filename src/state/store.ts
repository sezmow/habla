// Local-first learner store. Everything lives on this device (localStorage);
// the learner can export or delete it at any time from Settings.

import { useEffect, useState, useSyncExternalStore } from "react";
import type { ConversationRecord, LearnerState, PlacementResult, Profile, Settings } from "../engine/types";
import type { Exercise } from "../engine/exercises";
import {
  applyPlacement,
  completeLesson,
  createLearner,
  introduceItems,
  recordConversation,
  recordListening,
  recordPronunciation,
  recordResult,
  recordSession,
  STATE_VERSION,
  useRestDay,
  type ExerciseResult,
  type RecordOutcome,
} from "../engine/learner";

const KEY = "habla:learner:v1";

function load(): LearnerState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LearnerState;
    return parsed.version === STATE_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

let state: LearnerState | null = load();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveError: string | null = null;

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      if (state) localStorage.setItem(KEY, JSON.stringify(state));
      else localStorage.removeItem(KEY);
      saveError = null;
    } catch {
      saveError = "Your browser's storage is full, so recent progress may not be saved.";
    }
  }, 250);
}

function emit() {
  listeners.forEach((l) => l());
}

export function setLearner(next: LearnerState | null) {
  state = next;
  persist();
  emit();
}

function update(fn: (s: LearnerState) => LearnerState) {
  if (!state) return;
  setLearner(fn(state));
}

export function getLearner(): LearnerState | null {
  return state;
}

export function useLearner(): LearnerState | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** The learner, for screens that are only reachable after onboarding. */
export function useLearnerRequired(): LearnerState {
  const s = useLearner();
  if (!s) throw new Error("No learner");
  return s;
}

export function storageError(): string | null {
  return saveError;
}

/** Current time, refreshed every minute (keeps "due" counts and greetings fresh). */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export const actions = {
  create(profile: Partial<Profile>, settings: Partial<Settings>) {
    setLearner(createLearner(profile, settings, Date.now()));
  },
  finishOnboarding() {
    update((s) => ({ ...s, onboarded: true }));
  },
  async loadDemo() {
    const { simulateDemoLearner } = await import("../engine/simulate");
    setLearner(simulateDemoLearner(Date.now()));
  },
  record(ex: Exercise, result: ExerciseResult): RecordOutcome | null {
    if (!state) return null;
    const out = recordResult(state, ex, result, Date.now());
    setLearner(out.state);
    return out;
  },
  completeLesson(lessonId: string, accuracy: number) {
    update((s) => completeLesson(s, lessonId, accuracy, Date.now()));
  },
  sessionDone() {
    update((s) => recordSession(s, Date.now()));
  },
  placement(result: PlacementResult) {
    update((s) => applyPlacement(s, result, Date.now()));
  },
  conversation(rec: ConversationRecord, speakingSeconds: number, seconds: number) {
    update((s) => recordConversation(s, rec, speakingSeconds, seconds, Date.now()));
  },
  listening(pieceId: string, score: number, seconds: number) {
    update((s) => recordListening(s, pieceId, score, seconds, Date.now()));
  },
  pronunciation(moduleId: string, score: number, seconds: number) {
    update((s) => recordPronunciation(s, moduleId, score, seconds, Date.now()));
  },
  restDay(date: string) {
    update((s) => useRestDay(s, date));
  },
  introduce(ids: string[]) {
    update((s) => introduceItems(s, ids, Date.now()));
  },
  settings(patch: Partial<Settings>) {
    update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  },
  profile(patch: Partial<Profile>) {
    update((s) => ({ ...s, profile: { ...s.profile, ...patch } }));
  },
  reset() {
    setLearner(null);
  },
  exportJson(): string {
    return JSON.stringify(state, null, 2);
  },
  importJson(json: string): string | null {
    try {
      const parsed = JSON.parse(json) as LearnerState;
      if (parsed.version !== STATE_VERSION || !parsed.memory || !parsed.profile) return "That file isn't a Habla export.";
      setLearner(parsed);
      return null;
    } catch {
      return "That file couldn't be read.";
    }
  },
};
