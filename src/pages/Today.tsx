import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Mic, RotateCcw, Headphones, Play, Clock, Sparkles, BookOpen, CircleAlert, Coffee, ChevronRight, MessageCircle } from "lucide-react";
import { useLearner, useNow, actions } from "../state/store";
import { buildDailySession, dailyChallenge, dueItems, type SessionPlan } from "../engine/session";
import { skillProfile, nextLessonId, weaknesses, PROFILE_LABEL, lessonsCompleted, type ProfileSkill } from "../engine/progress";
import { consistency } from "../engine/gamification";
import { activePatterns } from "../engine/mistakes";
import { LESSONS, UNIT_MAP, LEVEL_MAP, personalize } from "../content";
import { SkillMeter, Segmented, ProgressBar, useToast } from "../components/ui";
import { WeekStrip } from "../components/WeekStrip";
import { speakingAvailable } from "../services/capabilities";
import { dateKey } from "../engine/progress";
import type { LearnerState } from "../engine/types";

function greeting(now: number) {
  const h = new Date(now).getHours();
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const STEP_TEXT: Record<string, (plan: SessionPlan, count: number) => string> = {
  review: (_p, n) => `Review ${n} ${n === 1 ? "item" : "items"} you're close to forgetting`,
  new: (p) => `Today's lesson: ${p.lessonId ? LESSONS[p.lessonId].title : "new material"}`,
  listening: () => "Listening practice",
  speaking: () => "Speaking practice",
  weakness: () => "Fix a weak spot",
  conversation: () => "Quick conversation",
};

type Nudge = { key: string; icon: React.ReactNode; title: string; body: string; cta: string; to: string; tone: "accent" | "primary" | "warning" | "success" };

function pickNudge(learner: LearnerState, now: number): Nudge | null {
  const c = consistency(learner, now);
  const spokeToday = (learner.activity[dateKey(now)]?.speakingSeconds ?? 0) > 20;
  const done = lessonsCompleted(learner).length;
  const due = dueItems(learner, now).length;
  const weak = weaknesses(skillProfile(learner, now));
  if (c.canRestYesterday) {
    return { key: "rest", icon: <Coffee size={20} />, title: "You missed yesterday — that's okay.", body: "Use this week's rest day to keep your streak going. Consistency beats perfection.", cta: "Use rest day", to: "#rest", tone: "primary" };
  }
  if (done >= 1 && !spokeToday && (weak[0]?.skill === "speaking" || weak.length === 0 || c.todaySeconds < 60)) {
    return { key: "speak", icon: <Mic size={20} />, title: "You haven't spoken Spanish today.", body: "Try a 3-minute speaking session — it's the fastest way to make words usable.", cta: "Start speaking", to: "/session/speaking", tone: "accent" };
  }
  if (due >= 12) {
    return { key: "review", icon: <RotateCcw size={20} />, title: `${due} items are ready for review.`, body: "These are words and sentences you're close to forgetting. A quick review now keeps them.", cta: "Review now", to: "/session/review/due", tone: "success" };
  }
  if (weak[0]?.skill === "listening") {
    return { key: "listen", icon: <Headphones size={20} />, title: "Let's work on listening today.", body: "Your listening is behind your reading. A few dictations will help your ear catch up.", cta: "Practice listening", to: "/session/review/listening", tone: "primary" };
  }
  return null;
}

export default function Today() {
  const learner = useLearner()!;
  const now = useNow();
  const navigate = useNavigate();
  const toast = useToast();
  const [minutes, setMinutes] = useState(learner.settings.goalMinutes);
  const nowBucket = Math.floor(now / 300_000);

  const plan = useMemo(() => buildDailySession(learner, { now, speaking: speakingAvailable(), minutes, seed: nowBucket }), [learner, minutes, nowBucket]); // eslint-disable-line react-hooks/exhaustive-deps
  const profile = useMemo(() => skillProfile(learner, now), [learner, nowBucket]); // eslint-disable-line react-hooks/exhaustive-deps
  const due = useMemo(() => dueItems(learner, now).length, [learner, nowBucket]); // eslint-disable-line react-hooks/exhaustive-deps
  const nudge = pickNudge(learner, now);
  const weak = weaknesses(profile).filter((w) => (["speaking", "listening", "vocabulary", "grammar", "pronunciation"] as ProfileSkill[]).includes(w.skill));
  const nextId = nextLessonId(learner);
  const done = lessonsCompleted(learner).length;
  const firstTime = done === 0;
  const challenge = dailyChallenge(learner, now);
  const patterns = activePatterns(learner.mistakes, now);
  const name = learner.profile.name;

  const course = nextId ? { lesson: LESSONS[nextId], unit: UNIT_MAP[LESSONS[nextId].unitId], level: LEVEL_MAP[UNIT_MAP[LESSONS[nextId].unitId].levelId] } : null;
  const speakingFirst = weak[0]?.skill === "speaking";

  const skills: ProfileSkill[] = ["speaking", "listening", "vocabulary", "grammar"];

  const speakingCard = (
    <div className="card" key="speak">
      <div className="card-head">
        <div className="row" style={{ gap: 12 }}>
          <span className="icon-tile accent">
            <Mic size={20} />
          </span>
          <div>
            <div className="card-title">Speaking practice</div>
            <div className="card-sub">Today's speaking challenge</div>
          </div>
        </div>
        {speakingFirst && <span className="chip accent">Focus today</span>}
      </div>
      <p className="es" style={{ fontSize: "1.35rem", lineHeight: 1.3 }}>{personalize(challenge.prompt, name)}</p>
      <p className="small muted" style={{ marginTop: 4 }}>{challenge.promptEn}</p>
      <div className="row wrap" style={{ marginTop: 16, gap: 10 }}>
        <button className="btn btn-accent" onClick={() => navigate("/session/speaking")}>
          <Mic size={18} /> Start speaking
        </button>
        <Link to="/speak" className="btn btn-ghost">
          Conversations <ChevronRight size={16} />
        </Link>
      </div>
    </div>
  );

  const courseCard = course && (
    <div className="card" key="course">
      <div className="card-head">
        <div className="row" style={{ gap: 12 }}>
          <span className="icon-tile">
            <BookOpen size={20} />
          </span>
          <div>
            <div className="card-title">Continue learning</div>
            <div className="card-sub">
              {course.level.title} · Level {course.level.index + 1}
            </div>
          </div>
        </div>
      </div>
      <div className="small muted">
        Unit {course.unit.id.slice(1)} — {course.unit.title}
      </div>
      <div className="row-between" style={{ marginTop: 4, alignItems: "flex-end" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: "1.15rem" }}>
            {course.lesson.title} <span className="es muted" style={{ fontWeight: 500 }}>· {course.lesson.titleEs}</span>
          </div>
          <div className="small faint">
            Lesson {course.lesson.index + 1} of {course.unit.lessons.length} · about {course.lesson.minutes} min
          </div>
        </div>
      </div>
      <div style={{ margin: "14px 0 16px" }}>
        <ProgressBar value={course.lesson.index / course.unit.lessons.length} size="thin" label="Unit progress" />
      </div>
      <div className="row wrap" style={{ gap: 10 }}>
        <button className="btn btn-secondary" onClick={() => navigate(`/session/lesson/${course.lesson.id}`)}>
          Continue <ArrowRight size={17} />
        </button>
        <Link to="/course" className="btn btn-ghost">
          Course map
        </Link>
      </div>
    </div>
  );

  const reviewCard = (
    <div className="card" key="review">
      <div className="card-head">
        <div className="row" style={{ gap: 12 }}>
          <span className="icon-tile success">
            <RotateCcw size={20} />
          </span>
          <div>
            <div className="card-title">Due for review</div>
            <div className="card-sub">Spaced repetition</div>
          </div>
        </div>
      </div>
      <div className="num" style={{ fontSize: "2rem", fontWeight: 750, letterSpacing: "-0.03em" }}>
        {due} <span style={{ fontSize: "1rem", fontWeight: 600 }} className="muted">{due === 1 ? "item" : "items"}</span>
      </div>
      <p className="small muted" style={{ margin: "4px 0 16px" }}>
        {due ? "Words and sentences the system believes you're close to forgetting." : "Nothing is fading right now. New reviews appear as time passes."}
      </p>
      <button className="btn btn-secondary" disabled={!due} onClick={() => navigate("/session/review/due")}>
        Review now
      </button>
    </div>
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>
            {greeting(now)}
            {name ? `, ${name}` : ""}
          </h1>
          <p className="muted">{firstTime ? "Let's get you speaking Spanish in your very first session." : "Here's what will help most right now."}</p>
        </div>
      </div>

      <div className="two-col">
        <div className="stack" style={{ "--gap": "20px" } as React.CSSProperties}>
          {nudge && (
            <div className={`nudge nudge-${nudge.tone} enter`}>
              <span className={`icon-tile ${nudge.tone === "primary" ? "" : nudge.tone}`}>{nudge.icon}</span>
              <div className="grow">
                <div style={{ fontWeight: 700 }}>{nudge.title}</div>
                <div className="small muted">{nudge.body}</div>
              </div>
              <button
                className={`btn btn-sm ${nudge.tone === "accent" ? "btn-accent" : "btn-secondary"}`}
                onClick={() => {
                  if (nudge.to === "#rest") {
                    actions.restDay(consistency(learner, now).yesterday);
                    toast("Rest day used — your streak is safe.");
                  } else navigate(nudge.to);
                }}
              >
                {nudge.cta}
              </button>
            </div>
          )}

          <section className="card card-lg session-card" aria-labelledby="next-session">
            <div className="row-between wrap" style={{ gap: 12 }}>
              <div className="eyebrow" id="next-session">
                {firstTime ? "Your first session" : "Your next session"}
              </div>
              {!firstTime && (
                <Segmented
                  label="Session length"
                  value={minutes}
                  onChange={(m) => setMinutes(m)}
                  options={[5, 10, 15, 30].map((m) => ({ value: m as 5 | 10 | 15 | 30, label: `${m}m` }))}
                />
              )}
            </div>
            <h2 className="session-title">
              {firstTime ? "Hello, Spanish" : plan.title}
            </h2>
            {firstTime ? (
              <ol className="plan-steps">
                <li><span className="step-n">1</span>Learn to say hello and your name</li>
                <li><span className="step-n">2</span>Understand it, then recall it without help</li>
                <li><span className="step-n">3</span>Say <span className="es">“Hola, me llamo {name || "…"}”</span> out loud</li>
              </ol>
            ) : (
              <ol className="plan-steps">
                {plan.segments.map((s, i) => (
                  <li key={s.kind}>
                    <span className={`step-n seg-${s.kind}`}>{i + 1}</span>
                    <span className="grow">{STEP_TEXT[s.kind](plan, s.count)}</span>
                    <span className="small faint num">{s.minutes} min</span>
                  </li>
                ))}
              </ol>
            )}
            {!firstTime && plan.rationale.length > 0 && (
              <p className="rationale">
                <Sparkles size={15} /> {plan.rationale[0]}
              </p>
            )}
            <div className="row wrap" style={{ gap: 12, marginTop: 20 }}>
              <button className="btn btn-primary btn-lg" onClick={() => navigate(firstTime && nextId === "u1-l1" ? "/session/first" : firstTime && nextId ? `/session/lesson/${nextId}` : `/session/daily/${minutes}`)}>
                <Play size={18} fill="currentColor" /> {firstTime ? "Start my first lesson" : "Start session"}
              </button>
              {!firstTime && (
                <span className="small faint row" style={{ gap: 6 }}>
                  <Clock size={15} /> Adapts to your weakest skills
                </span>
              )}
            </div>
          </section>

          {!firstTime && (
            <div className="grid-2">
              {speakingFirst ? [speakingCard, courseCard] : [courseCard, speakingCard]}
            </div>
          )}

          {!firstTime && (
            <div className="grid-2">
              {reviewCard}
              {patterns[0] ? (
                <div className="card">
                  <div className="card-head">
                    <div className="row" style={{ gap: 12 }}>
                      <span className="icon-tile warning">
                        <CircleAlert size={20} />
                      </span>
                      <div>
                        <div className="card-title">Your mistakes</div>
                        <div className="card-sub">Patterns, not one-offs</div>
                      </div>
                    </div>
                  </div>
                  <p style={{ fontWeight: 600 }}>
                    {patterns[0].info.lead} <strong>{patterns[0].info.focus}</strong>.
                  </p>
                  <p className="small muted" style={{ margin: "4px 0 16px" }}>{patterns[0].info.tip}</p>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <button className="btn btn-secondary" onClick={() => navigate(`/session/drill/${patterns[0].category}`)}>
                      Practice this
                    </button>
                    <Link to="/review/mistakes" className="btn btn-ghost">
                      All mistakes
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="card">
                  <div className="card-head">
                    <div className="row" style={{ gap: 12 }}>
                      <span className="icon-tile">
                        <MessageCircle size={20} />
                      </span>
                      <div>
                        <div className="card-title">Real-world practice</div>
                        <div className="card-sub">Guided conversations</div>
                      </div>
                    </div>
                  </div>
                  <p className="small muted" style={{ marginBottom: 16 }}>Order a coffee, meet someone new or ask for directions — out loud.</p>
                  <Link to="/speak" className="btn btn-secondary">
                    Choose a scenario
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="stack" style={{ "--gap": "20px" } as React.CSSProperties} aria-label="Your progress">
          <div className="card">
            <div className="card-head" style={{ marginBottom: 12 }}>
              <div className="card-title">This week</div>
              <Link to="/progress" className="small">
                Progress
              </Link>
            </div>
            <WeekStrip />
          </div>
          <div className="card">
            <div className="card-head" style={{ marginBottom: 16 }}>
              <div>
                <div className="card-title">Your skills right now</div>
                <div className="card-sub">From your recent practice</div>
              </div>
            </div>
            <div className="stack" style={{ "--gap": "14px" } as React.CSSProperties}>
              {skills.map((s) => (
                <SkillMeter key={s} label={PROFILE_LABEL[s]} value={profile[s].value} tone={s === "speaking" ? "accent" : undefined} />
              ))}
            </div>
            {skills.some((s) => profile[s].value == null) && <p className="tiny faint" style={{ marginTop: 12 }}>A dash means there isn't enough evidence yet — it fills in as you practice.</p>}
            {weak[0] && (
              <p className="small" style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                <strong>{PROFILE_LABEL[weak[0].skill]}</strong> <span className="muted">is getting extra time in your sessions.</span>
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
