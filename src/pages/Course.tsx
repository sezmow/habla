import { Link, useNavigate } from "react-router-dom";
import { Check, Lock, ArrowLeft, Compass } from "lucide-react";
import { LEVELS, LESSONS, UNIT_MAP } from "../content";
import { useLearner } from "../state/store";
import { nextLessonId, unitProgress } from "../engine/progress";
import { ProgressBar, useToast } from "../components/ui";
import { PageHead } from "../components/AppShell";
import { LessonCard } from "../components/LessonCard";

export default function Course() {
  const learner = useLearner()!;
  const navigate = useNavigate();
  const toast = useToast();
  const next = nextLessonId(learner);

  return (
    <div className="page page-narrow">
      <Link to="/" className="btn btn-ghost btn-sm" style={{ marginLeft: -10 }}>
        <ArrowLeft size={16} /> Today
      </Link>
      <PageHead title="Spanish course" subtitle="A clear path from your first hello to real conversations. Each unit ends with you using it out loud." />

      <div className="stack" style={{ "--gap": "40px" } as React.CSSProperties}>
        {LEVELS.map((level) => (
          <section key={level.id} aria-labelledby={`${level.id}-title`}>
            <div className="level-head">
              <span className="level-badge">{level.cefr}</span>
              <div>
                <h2 id={`${level.id}-title`}>
                  Level {level.index + 1} — {level.title}
                </h2>
                <p className="small muted">{level.description}</p>
              </div>
            </div>
            {!level.available && (
              <p className="notice" style={{ marginBottom: 14 }}>
                <Compass size={18} />
                <span>These units are on the roadmap and not yet available. Levels 1 and 2 cover roughly A1–A2.</span>
              </p>
            )}
            <div className="stack" style={{ "--gap": "14px" } as React.CSSProperties}>
              {level.units.map((uid) => {
                const unit = UNIT_MAP[uid];
                const { done, total } = unitProgress(learner, uid);
                const complete = total > 0 && done === total;
                return (
                  <div key={uid} className={`card unit-card ${!level.available ? "roadmap" : ""}`}>
                    <div className="row-between" style={{ alignItems: "flex-start" }}>
                      <div>
                        <div className="small faint">Unit {uid.slice(1)}</div>
                        <h3 style={{ fontSize: "1.1rem" }}>{unit.title}</h3>
                        <p className="small muted" style={{ marginTop: 2 }}>{unit.description}</p>
                      </div>
                      {complete ? (
                        <span className="chip success">
                          <Check size={13} /> Complete
                        </span>
                      ) : total > 0 ? (
                        <span className="small faint num">
                          {done}/{total}
                        </span>
                      ) : null}
                    </div>
                    {total > 0 && (
                      <div style={{ margin: "12px 0 6px" }}>
                        <ProgressBar value={done / total} size="thin" tone={complete ? "success" : undefined} label={`${unit.title} progress`} />
                      </div>
                    )}
                    <div className="can-do">
                      <span className="eyebrow">You'll be able to</span>
                      <ul>
                        {unit.canDo.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </div>
                    {unit.lessons.length > 0 && (
                      <div className="lesson-list">
                        {unit.lessons.map((lid) => {
                          const lesson = LESSONS[lid];
                          const p = learner.lessons[lid];
                          const status = p?.completedAt ? (p.testedOut ? "tested" : "done") : lid === next ? "current" : "locked";
                          return (
                            <LessonCard
                              key={lid}
                              lesson={lesson}
                              status={status}
                              onOpen={() => {
                                if (status === "locked") toast("Finish the lessons before this one first.", <Lock size={16} />);
                                else navigate(`/session/lesson/${lid}`);
                              }}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
