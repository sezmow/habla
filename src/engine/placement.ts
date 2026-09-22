// Adaptive placement: a staircase that gets harder after correct answers and
// easier after mistakes, mixing vocabulary, grammar, listening, reading and
// production (typed) — never placing on multiple choice alone.

import type { PlacementResult } from "./types";
import { PLACEMENT, type PlacementItem, type PlacementSkill } from "../content/extras";

export interface PlacementAnswer {
  id: string;
  tier: number;
  skill: PlacementSkill;
  quality: number;
}

export interface PlacementRun {
  tier: number;
  answers: PlacementAnswer[];
  reversals: number;
  lastDirection: 0 | 1 | -1;
}

export const PLACEMENT_LENGTH = 12;

export function startPlacement(self: "none" | "some" | "good"): PlacementRun {
  return { tier: self === "good" ? 3 : self === "some" ? 2 : 1, answers: [], reversals: 0, lastDirection: 0 };
}

export function nextPlacementItem(run: PlacementRun): PlacementItem | null {
  if (isPlacementDone(run)) return null;
  const asked = new Set(run.answers.map((a) => a.id));
  const counts = new Map<PlacementSkill, number>();
  for (const a of run.answers) counts.set(a.skill, (counts.get(a.skill) ?? 0) + 1);
  for (const delta of [0, -1, 1, -2, 2]) {
    const tier = run.tier + delta;
    const pool = PLACEMENT.filter((p) => p.tier === tier && !asked.has(p.id));
    if (pool.length) return pool.sort((a, b) => (counts.get(a.skill) ?? 0) - (counts.get(b.skill) ?? 0))[0];
  }
  return null;
}

export function answerPlacement(run: PlacementRun, item: PlacementItem, quality: number): PlacementRun {
  const correct = quality >= 0.6;
  const dir: 1 | -1 = correct ? 1 : -1;
  const reversal = run.lastDirection !== 0 && run.lastDirection !== dir;
  return {
    tier: Math.max(1, Math.min(5, item.tier + dir)),
    answers: [...run.answers, { id: item.id, tier: item.tier, skill: item.skill, quality }],
    reversals: run.reversals + (reversal ? 1 : 0),
    lastDirection: dir,
  };
}

export function isPlacementDone(run: PlacementRun): boolean {
  return run.answers.length >= PLACEMENT_LENGTH || (run.answers.length >= 8 && run.reversals >= 4);
}

const START: Record<number, { lesson: string; band: string; level: number }> = {
  0: { lesson: "u1-l1", band: "a complete beginner", level: 0 },
  1: { lesson: "u1-l1", band: "Pre-A1", level: 0 },
  2: { lesson: "u2-l1", band: "early A1", level: 0 },
  3: { lesson: "u4-l1", band: "A1", level: 0 },
  4: { lesson: "u7-l1", band: "A1/A2", level: 1 },
  5: { lesson: "u9-l1", band: "A2", level: 1 },
};

export function estimatePlacement(run: PlacementRun, speakingQuality: number | null, now: number): PlacementResult {
  let tier = 0;
  for (let t = 5; t >= 1; t--) {
    const at = run.answers.filter((a) => a.tier === t);
    if (at.length < 2) continue;
    const weight = (a: PlacementAnswer) => (a.skill === "production" ? 1.5 : 1);
    const rate = at.reduce((s, a) => s + (a.quality >= 0.6 ? weight(a) : 0), 0) / at.reduce((s, a) => s + weight(a), 0);
    if (rate >= 0.6) {
      tier = t;
      break;
    }
  }
  if (!tier && run.answers.some((a) => a.tier === 1 && a.quality >= 0.6)) tier = 1;
  // Production and speaking must back up the multiple-choice result.
  const production = run.answers.filter((a) => a.skill === "production");
  const prodRate = production.length ? production.filter((a) => a.quality >= 0.6).length / production.length : 1;
  if (prodRate < 0.5 && tier >= 3) tier -= 1;
  if (speakingQuality != null && speakingQuality < 0.4 && tier >= 3) tier -= 1;

  const mean = (skill: PlacementSkill) => {
    const xs = run.answers.filter((a) => a.skill === skill);
    return xs.length ? xs.reduce((s, a) => s + a.quality, 0) / xs.length : 0;
  };
  const start = START[tier];
  return {
    at: now,
    band: start.band,
    startLessonId: start.lesson,
    levelIndex: start.level,
    scores: {
      vocabulary: mean("vocabulary"),
      grammar: mean("grammar"),
      listening: mean("listening"),
      reading: mean("reading"),
      production: mean("production"),
      speaking: speakingQuality,
    },
  };
}
