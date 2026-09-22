import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Award, Check, Info } from "lucide-react";
import { useLearner, useNow } from "../state/store";
import { activitySeries, cefrEstimate, dimensionAverages, learningStats, retentionMetrics, skillProfile, PROFILE_LABEL, PROFILE_SKILLS } from "../engine/progress";
import { ACHIEVEMENTS } from "../engine/gamification";
import { PageHead } from "../components/AppShell";
import { ProgressBar, SkillMeter, pct } from "../components/ui";
import { ActivityChart } from "../components/ActivityChart";
import { WeekStrip } from "../components/WeekStrip";

export default function Progress() {
  const learner = useLearner()!;
  const now = useNow();
  const profile = useMemo(() => skillProfile(learner, now), [learner, now]);
  const cefr = useMemo(() => cefrEstimate(learner, now), [learner, now]);
  const stats = useMemo(() => learningStats(learner, now), [learner, now]);
  const dims = useMemo(() => dimensionAverages(learner), [learner]);
  const retention = useMemo(() => retentionMetrics(learner), [learner]);
  const days = activitySeries(learner, now, 14);

  const tiles = [
    { label: "Words learned", value: stats.wordsLearned },
    { label: "Words you actively retain", value: stats.wordsRetained, note: "Recalled recently and still strong" },
    { label: "Sentences mastered", value: stats.sentencesMastered },
    { label: "Minutes spoken", value: stats.minutesSpoken },
    { label: "Conversations", value: stats.conversations },
    { label: "Listening minutes", value: stats.listeningMinutes },
    { label: "Lessons completed", value: `${stats.lessonsCompleted}/${stats.lessonsTotal}` },
    { label: "Days practiced", value: stats.daysPracticed },
  ];

  const rec = dims.find((d) => d.skill === "recognition")!;
  const prod = dims.find((d) => d.skill === "production")!;

  return (
    <div className="page">
      <PageHead title="Progress" subtitle="A skill profile, not one number. What matters is what you can actually do in Spanish." />

      <div className="two-col">
        <div className="stack" style={{ "--gap": "20px" } as React.CSSProperties}>
          <section className="card card-lg">
            <div className="row-between wrap" style={{ alignItems: "flex-start" }}>
              <div>
                <div className="eyebrow">Estimated level</div>
                <div className="cefr-band">{cefr.band}</div>
              </div>
              <span className="chip outline">
                <Info size={13} /> Approximate
              </span>
            </div>
            <p style={{ marginTop: 8 }}>{cefr.statement}</p>
            <div style={{ margin: "14px 0 4px" }}>
              <ProgressBar value={cefr.progressToNext} label="Progress to next band" />
            </div>
            <p className="tiny faint">Toward the next band</p>
            <div className="grid-2" style={{ marginTop: 18 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>You can</div>
                {cefr.canDo.length ? (
                  <ul className="can-list">
                    {cefr.canDo.map((c) => (
                      <li key={c}>
                        <Check size={15} strokeWidth={3} /> {c}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="small muted">Finish your first unit to see this fill in.</p>
                )}
              </div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Next you'll be able to</div>
                <ul className="can-list next">
                  {cefr.next.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Skill profile</div>
                <div className="card-sub">Weighted toward your recent practice</div>
              </div>
            </div>
            <div className="stack" style={{ "--gap": "14px" } as React.CSSProperties}>
              {PROFILE_SKILLS.map((s) => (
                <SkillMeter key={s} label={PROFILE_LABEL[s]} value={profile[s].value} tone={s === "speaking" || s === "pronunciation" ? "accent" : s === "retention" ? "success" : undefined} note={profile[s].value == null ? "Not enough practice yet to measure" : undefined} />
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Knowing it vs. using it</div>
                <div className="card-sub">Average across every word and sentence you've learned</div>
              </div>
            </div>
            <div className="stack" style={{ "--gap": "12px" } as React.CSSProperties}>
              {dims.map((d) => (
                <SkillMeter key={d.skill} label={d.label} value={d.value} tone={d.skill === "speaking" ? "accent" : undefined} />
              ))}
            </div>
            {rec.value != null && prod.value != null && rec.value - prod.value > 0.05 && (
              <p className="small" style={{ marginTop: 14 }}>
                You recognize <strong>{pct(rec.value)}</strong> but can produce <strong>{pct(prod.value)}</strong>. <span className="muted">Reviews lean toward production and speaking to close that gap.</span>
              </p>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Practice time</div>
                <div className="card-sub">Last 14 days, in minutes</div>
              </div>
            </div>
            <ActivityChart days={days} goal={learner.settings.goalMinutes} />
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Long-term memory</div>
                <div className="card-sub">How often you still remembered items when they came back</div>
              </div>
            </div>
            <div className="grid-3">
              {([
                ["After ~1 day", retention.day1],
                ["After ~1 week", retention.day7],
                ["After ~1 month", retention.day30],
              ] as const).map(([label, r]) => (
                <div key={label} className="stat">
                  <span className="stat-label">{label}</span>
                  <span className="stat-value num">{r.rate == null ? "—" : pct(r.rate)}</span>
                  <span className="tiny faint">{r.rate == null ? "Not enough reviews yet" : `${r.n} reviews`}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="stack" style={{ "--gap": "20px" } as React.CSSProperties}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Consistency</div>
            <WeekStrip />
          </div>
          <div className="card" style={{ padding: 6 }}>
            <div className="list padded">
              {tiles.map((t) => (
                <div key={t.label} className="list-row" style={{ padding: "12px 14px" }}>
                  <span className="grow">
                    <span className="small" style={{ display: "block" }}>{t.label}</span>
                    {t.note && <span className="tiny faint">{t.note}</span>}
                  </span>
                  <strong className="num" style={{ fontSize: "1.1rem" }}>{t.value}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-head" style={{ marginBottom: 10 }}>
              <div className="card-title">Milestones</div>
              <span className="small faint num">{learner.xp.toLocaleString()} XP</span>
            </div>
            <ul className="achievements">
              {ACHIEVEMENTS.map((a) => {
                const got = learner.achievements[a.id];
                return (
                  <li key={a.id} className={got ? "got" : ""}>
                    <span className="ach-icon">{got ? <Award size={16} /> : <Award size={16} />}</span>
                    <span>
                      <span style={{ fontWeight: 650, display: "block" }}>{a.title}</span>
                      <span className="tiny muted">{a.description}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="tiny faint" style={{ marginTop: 10 }}>
              XP rewards speaking and producing Spanish most. Easy questions on words you already know earn nothing. <Link to="/review">Review</Link> what's fading instead.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
