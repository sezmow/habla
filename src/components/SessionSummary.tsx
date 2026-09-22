import { useMemo } from "react";
import { Clock, RotateCcw, Sparkles, Mic, Headphones, Award, CalendarClock, Lightbulb } from "lucide-react";
import type { Exercise } from "../engine/exercises";
import type { MistakeRecord } from "../engine/types";
import type { Verdict } from "../engine/answer";
import type { SessionPlan } from "../engine/session";
import { CATEGORY_INFO } from "../engine/mistakes";
import { ACHIEVEMENTS } from "../engine/gamification";
import { DAY } from "../engine/memory";
import { CONCEPTS, LESSONS, SENTENCES } from "../content";
import { getLearner } from "../state/store";
import { LogoMark } from "./Logo";

export interface SessionResult {
  ex: Exercise;
  quality: number;
  verdict: Verdict;
  mistakes: MistakeRecord[];
  xp: number;
  learned: number;
  unlocked: string[];
  seconds: number;
  speakingSeconds: number;
  listeningSeconds: number;
}

function whenLabel(ms: number, now: number): string {
  const days = (ms - now) / DAY;
  if (days < 0.5) return "Later today";
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (new Date(ms).toDateString() === tomorrow.toDateString() || days < 1.5) return "Tomorrow";
  return `In ${Math.round(days)} days`;
}

function fmtDuration(sec: number): string {
  if (sec < 60) return `${Math.max(1, Math.round(sec))} sec`;
  return `${Math.round(sec / 60)} min`;
}

export function SessionSummary({ plan, results, onDone }: { plan: SessionPlan; results: SessionResult[]; onDone: () => void }) {
  const now = Date.now();
  const s = useMemo(() => {
    const total = results.reduce((a, r) => a + r.seconds, 0);
    const speaking = results.reduce((a, r) => a + r.speakingSeconds, 0);
    const listening = results.reduce((a, r) => a + r.listeningSeconds, 0);
    const graded = results.filter((r) => r.ex.type !== "intro" && r.ex.type !== "grammar");
    const reviewed = new Set(graded.filter((r) => r.ex.segment === "review" || r.ex.segment === "weakness").map((r) => r.ex.itemId)).size;
    const learnedWords = results.reduce((a, r) => a + r.learned, 0);
    const learnedPhrases = results.filter((r) => r.ex.type === "intro" && r.ex.sentenceId).length;
    const xp = results.reduce((a, r) => a + r.xp, 0);
    const correct = graded.filter((r) => r.quality >= 0.6).length;
    const mistakes = results.flatMap((r) => r.mistakes).filter((m) => m.category !== "accents" && m.category !== "vocabulary");
    const counts = new Map<string, number>();
    mistakes.forEach((m) => counts.set(m.category, (counts.get(m.category) ?? 0) + 1));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as MistakeRecord["category"] | undefined;
    const unlocked = [...new Set(results.flatMap((r) => r.unlocked))];
    // Next review: the soonest scheduled item touched in this session (after today).
    const learner = getLearner();
    const ids = new Set(graded.map((r) => r.ex.itemId));
    const next = learner
      ? Object.values(learner.memory)
          .filter((m) => ids.has(m.id) && m.nextReview > now + 60 * 60_000)
          .map((m) => m.nextReview)
          .sort((a, b) => a - b)[0]
      : undefined;
    // One thing to remember: the pattern they struggled with, or the lesson's key idea.
    let remember: string | null = null;
    if (top) remember = CATEGORY_INFO[top].concept && CONCEPTS[CATEGORY_INFO[top].concept!] ? CONCEPTS[CATEGORY_INFO[top].concept!].remember : CATEGORY_INFO[top].tip;
    else if (plan.lessonId && LESSONS[plan.lessonId].concepts[0]) remember = CONCEPTS[LESSONS[plan.lessonId].concepts[0]].remember;
    else {
      const withNote = graded.map((r) => SENTENCES[r.ex.itemId]?.note).find(Boolean);
      remember = withNote ?? null;
    }
    return { total, speaking, listening, reviewed, learnedWords, learnedPhrases, xp, correct, graded: graded.length, top, unlocked, next, remember };
  }, [results, plan, now]);

  const title = s.graded && s.correct / s.graded >= 0.85 ? "Nice work." : s.speaking > 30 ? "Good speaking today." : "Session complete.";
  const rows = [
    { icon: <Clock size={18} />, label: "You practiced for", value: fmtDuration(s.total) },
    s.reviewed > 0 && { icon: <RotateCcw size={18} />, label: "You reviewed", value: `${s.reviewed} ${s.reviewed === 1 ? "item" : "items"}` },
    (s.learnedWords > 0 || s.learnedPhrases > 0) && { icon: <Sparkles size={18} />, label: "You learned", value: [s.learnedWords && `${s.learnedWords} words`, s.learnedPhrases && `${s.learnedPhrases} phrases`].filter(Boolean).join(" · ") },
    s.speaking > 0 && { icon: <Mic size={18} />, label: "You spoke", value: fmtDuration(s.speaking), accent: true },
    s.listening > 0 && { icon: <Headphones size={18} />, label: "You listened", value: fmtDuration(s.listening) },
  ].filter(Boolean) as { icon: React.ReactNode; label: string; value: string; accent?: boolean }[];

  return (
    <div className="session" style={{ gridTemplateRows: "1fr" }}>
      <main className="session-body" style={{ justifyContent: "center", maxWidth: 560 }}>
        <div className="stack enter" style={{ "--gap": "22px" } as React.CSSProperties}>
          <div className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
            <LogoMark size={40} />
            <h1>{title}</h1>
            {plan.lessonId && <p className="muted">You finished “{LESSONS[plan.lessonId].title}.” {LESSONS[plan.lessonId].goal}</p>}
          </div>

          <div className="card" style={{ padding: 6 }}>
            <div className="list padded">
              {rows.map((r) => (
                <div key={r.label} className="list-row" style={{ padding: "12px 14px" }}>
                  <span className={`icon-tile ${r.accent ? "accent" : "neutral"}`} style={{ width: 34, height: 34 }}>
                    {r.icon}
                  </span>
                  <span className="grow muted">{r.label}</span>
                  <strong className="num">{r.value}</strong>
                </div>
              ))}
              {s.top && (
                <div className="list-row" style={{ padding: "12px 14px" }}>
                  <span className="icon-tile warning" style={{ width: 34, height: 34 }}>
                    <Lightbulb size={18} />
                  </span>
                  <span className="grow muted">You struggled with</span>
                  <strong>{CATEGORY_INFO[s.top].focus}</strong>
                </div>
              )}
              {s.next && (
                <div className="list-row" style={{ padding: "12px 14px" }}>
                  <span className="icon-tile neutral" style={{ width: 34, height: 34 }}>
                    <CalendarClock size={18} />
                  </span>
                  <span className="grow muted">Your next review</span>
                  <strong>{whenLabel(s.next, now)}</strong>
                </div>
              )}
            </div>
          </div>

          {s.remember && (
            <div className="card card-flat">
              <div className="eyebrow" style={{ marginBottom: 6 }}>One thing to remember</div>
              <p style={{ fontSize: "1.05rem", fontWeight: 550 }}>{s.remember}</p>
            </div>
          )}

          {s.unlocked.length > 0 && (
            <div className="row wrap" style={{ gap: 8 }}>
              {s.unlocked.map((id) => {
                const a = ACHIEVEMENTS.find((x) => x.id === id);
                return a ? (
                  <span key={id} className="chip primary">
                    <Award size={14} /> {a.title}
                  </span>
                ) : null;
              })}
            </div>
          )}

          <div className="row-between">
            <span className="small faint num">+{s.xp} XP</span>
            <button className="btn btn-primary btn-lg" onClick={onDone} autoFocus>
              {plan.kind === "daily" ? "Continue tomorrow" : "Done"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
