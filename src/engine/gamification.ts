// Gamification that rewards meaningful learning: speaking and production are
// worth far more than tapping through easy recognition questions, and missed
// days are framed as consistency, not failure.

import type { ExerciseType, LearnerState, MemoryState, Skill } from "./types";
import { DAY, masteryLevel } from "./memory";
import { dateKey, learningStats, lessonsCompleted } from "./progress";
import { UNITS } from "../content";

const SKILL_XP: Record<Skill, number> = {
  recognition: 2,
  comprehension: 3,
  listening: 5,
  recall: 5,
  production: 8,
  speaking: 12,
  pronunciation: 6,
};

export function xpFor(type: ExerciseType, skill: Skill, quality: number, m: MemoryState | undefined, variant: string): number {
  if (type === "intro" || type === "grammar") return 1;
  if (type === "dialogue") return quality >= 0.6 ? 15 : 4;
  const success = quality >= 0.6;
  let xp = SKILL_XP[skill];
  if (!success) return skill === "speaking" || skill === "production" ? 2 : 0; // effort still counts for output
  // No grinding: easy recognition on items you already know is worth nothing.
  const level = masteryLevel(m);
  if ((skill === "recognition" || skill === "comprehension") && (level === "strong" || level === "mastered")) xp = 0;
  if (m && m.recentVariants.slice(-4, -1).includes(variant)) xp = Math.floor(xp / 2);
  return Math.round(xp * (0.6 + 0.4 * quality));
}

// ─── Consistency ──────────────────────────────────────────────────────────

export interface WeekDay {
  date: string;
  label: string;
  practiced: boolean;
  rest: boolean;
  today: boolean;
  future: boolean;
}

function startOfWeek(now: number): number {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  return d.getTime() - day * DAY;
}

export function consistency(state: LearnerState, now: number) {
  const practiced = (key: string) => (state.activity[key]?.seconds ?? 0) >= 60;
  const rest = (key: string) => state.restDays.includes(key);
  const monday = startOfWeek(now);
  const today = dateKey(now);
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  const week: WeekDay[] = labels.map((label, i) => {
    const key = dateKey(monday + i * DAY + 12 * 3600_000);
    return { date: key, label, practiced: practiced(key), rest: rest(key), today: key === today, future: key > today };
  });
  // Streak: consecutive days practiced (rest days bridge a gap; today doesn't break it yet).
  let streak = 0;
  let t = now;
  if (!practiced(today)) t -= DAY;
  for (;;) {
    const key = dateKey(t);
    if (practiced(key)) streak++;
    else if (!rest(key)) break;
    t -= DAY;
    if (streak > 3650) break;
  }
  const yesterday = dateKey(now - DAY);
  const restUsedThisWeek = week.some((d) => d.rest);
  const goalSeconds = state.settings.goalMinutes * 60;
  const todaySeconds = state.activity[today]?.seconds ?? 0;
  return {
    week,
    daysThisWeek: week.filter((d) => d.practiced).length,
    streak,
    todaySeconds,
    goalSeconds,
    goalMet: todaySeconds >= goalSeconds,
    /** Missed yesterday but can protect the streak with this week's rest day. */
    canRestYesterday: !practiced(yesterday) && !rest(yesterday) && !restUsedThisWeek && practiced(dateKey(now - 2 * DAY)),
    yesterday,
  };
}

// ─── Achievements ─────────────────────────────────────────────────────────

export interface Achievement {
  id: string;
  title: string;
  description: string;
  check: (s: LearnerState, now: number) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-words", title: "First words out loud", description: "Spoke Spanish for the first time.", check: (s) => s.attempts.some((a) => a.skill === "speaking") },
  { id: "first-conversation", title: "First conversation", description: "Completed a full conversation in Spanish.", check: (s) => s.conversations.length > 0 },
  { id: "ten-sentences", title: "Sentence builder", description: "Produced 10 sentences from memory.", check: (s, n) => learningStats(s, n).sentencesProduced >= 10 },
  { id: "unit-complete", title: "Unit complete", description: "Finished every lesson in a unit.", check: (s) => UNITS.some((u) => u.lessons.length > 0 && u.lessons.every((l) => s.lessons[l]?.completedAt)) },
  { id: "five-days", title: "Consistent week", description: "Practiced on 5 days in one week.", check: (s, n) => consistency(s, n).daysThisWeek >= 5 },
  { id: "long-recall", title: "Long-term memory", description: "Recalled a word after more than 30 days.", check: (s) => Object.values(s.memory).some((m) => m.longestRecallGap >= 30) },
  { id: "fifty-retained", title: "50 words you can use", description: "Actively retained 50 words.", check: (s, n) => learningStats(s, n).wordsRetained >= 50 },
  { id: "listener", title: "Good listener", description: "Listened to 10 minutes of Spanish.", check: (s, n) => learningStats(s, n).listeningMinutes >= 10 },
  { id: "speaker", title: "Talker", description: "Spoke Spanish for 10 minutes in total.", check: (s, n) => learningStats(s, n).minutesSpoken >= 10 },
  { id: "ten-lessons", title: "Ten lessons in", description: "Completed 10 lessons.", check: (s) => lessonsCompleted(s).length >= 10 },
];

export function unlockedAchievements(state: LearnerState, now: number): string[] {
  return ACHIEVEMENTS.filter((a) => !state.achievements[a.id] && a.check(state, now)).map((a) => a.id);
}
