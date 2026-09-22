import { Check, Coffee } from "lucide-react";
import { useLearner, useNow } from "../state/store";
import { consistency } from "../engine/gamification";
import { Ring } from "./ui";

/** Consistency, framed kindly: days practiced this week, not a streak that can "die". */
export function WeekStrip() {
  const learner = useLearner()!;
  const now = useNow();
  const c = consistency(learner, now);
  const mins = Math.floor(c.todaySeconds / 60);
  return (
    <div className="stack" style={{ "--gap": "16px" } as React.CSSProperties}>
      <div className="week" role="list" aria-label="Practice this week">
        {c.week.map((d) => (
          <div key={d.date} role="listitem" className={`week-day ${d.practiced ? "done" : ""} ${d.rest ? "rest" : ""} ${d.today ? "today" : ""} ${d.future ? "future" : ""}`} aria-label={`${d.date}: ${d.practiced ? "practiced" : d.rest ? "rest day" : d.future ? "upcoming" : "no practice"}`}>
            <span className="week-dot">{d.practiced ? <Check size={14} strokeWidth={3} /> : d.rest ? <Coffee size={13} /> : null}</span>
            {d.label}
          </div>
        ))}
      </div>
      <p className="small">
        {c.daysThisWeek === 0 && c.streak >= 2 ? (
          <>
            <strong>New week.</strong> <span className="muted">You're on a {c.streak}-day run — today keeps it going.</span>
          </>
        ) : (
          <>
            <strong>
              You've practiced {c.daysThisWeek} {c.daysThisWeek === 1 ? "day" : "days"} this week.
            </strong>{" "}
            {c.streak >= 2 && <span className="muted">That's {c.streak} days in a row.</span>}
          </>
        )}
      </p>
      <div className="row" style={{ gap: 12 }}>
        <Ring value={c.todaySeconds / c.goalSeconds} size={40} stroke={5} done={c.goalMet} label={`${Math.round(Math.min(1, c.todaySeconds / c.goalSeconds) * 100)}%`} />
        <div>
          <div style={{ fontWeight: 650 }} className="num">
            {mins} of {learner.settings.goalMinutes} minutes today
          </div>
          <div className="small muted">{c.goalMet ? "Daily goal reached." : "Your daily goal"}</div>
        </div>
      </div>
    </div>
  );
}
