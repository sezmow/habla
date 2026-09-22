import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Plane, Briefcase, Users, GraduationCap, Music, Home, Check } from "lucide-react";
import type { Profile, Reason, Settings } from "../engine/types";
import { Logo } from "../components/Logo";
import { ProgressBar } from "../components/ui";
import { AudioPair } from "../components/audio";
import { AccentKeys } from "../components/exercises/views";
import { SpeakingRecorder } from "../components/SpeakingRecorder";
import { actions, useLearner } from "../state/store";
import { answerPlacement, estimatePlacement, nextPlacementItem, startPlacement, PLACEMENT_LENGTH, type PlacementRun } from "../engine/placement";
import { PLACEMENT_SPEAKING } from "../content";
import type { PlacementItem } from "../content/extras";
import { checkSpanish } from "../engine/answer";
import { LESSONS, UNIT_MAP, LEVEL_MAP } from "../content";
import type { PlacementResult } from "../engine/types";

type Step = "name" | "prior" | "reason" | "time" | "understand" | "speak" | "placement-intro" | "placement" | "placement-speaking" | "result";

const REASONS: { value: Reason; label: string; icon: React.ReactNode }[] = [
  { value: "travel", label: "Travel", icon: <Plane size={20} /> },
  { value: "work", label: "Work", icon: <Briefcase size={20} /> },
  { value: "family", label: "Family & friends", icon: <Users size={20} /> },
  { value: "school", label: "School", icon: <GraduationCap size={20} /> },
  { value: "culture", label: "Culture & media", icon: <Music size={20} /> },
  { value: "move", label: "Moving abroad", icon: <Home size={20} /> },
];

function Choice<T extends string | number>({ value, current, onPick, title, sub, icon }: { value: T; current: T | null; onPick: (v: T) => void; title: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={current === value} className="choice-card" onClick={() => onPick(value)}>
      {icon && <span className="icon-tile">{icon}</span>}
      <span className="grow">
        <span className="choice-title" style={{ display: "block" }}>{title}</span>
        {sub && <span className="choice-sub">{sub}</span>}
      </span>
      {current === value && <Check size={20} color="var(--primary)" />}
    </button>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const existing = useLearner();
  const [step, setStep] = useState<Step>("name");
  const [profile, setProfile] = useState<Partial<Profile>>({ name: "", priorStudy: undefined, reason: undefined, selfUnderstanding: undefined, selfSpeaking: undefined });
  const [goal, setGoal] = useState<Settings["goalMinutes"]>(15);
  const [run, setRun] = useState<PlacementRun | null>(null);
  const [result, setResult] = useState<PlacementResult | null>(null);

  useEffect(() => {
    if (existing?.onboarded) navigate("/", { replace: true });
  }, [existing, navigate]);

  const order: Step[] = ["name", "prior", "reason", "time", "understand", "speak"];
  const qIndex = order.indexOf(step);
  const back = () => qIndex > 0 && setStep(order[qIndex - 1]);

  const finishQuestions = () => {
    actions.create(profile, { goalMinutes: goal, assistance: profile.priorStudy === "none" ? "more" : "adaptive" });
    const beginner = profile.priorStudy === "none" && profile.selfUnderstanding === "none";
    if (beginner) {
      actions.finishOnboarding();
      navigate("/", { replace: true });
    } else {
      setStep("placement-intro");
    }
  };

  const pick = <K extends keyof Profile>(key: K, next: Step | "done") => (v: Profile[K]) => {
    setProfile((p) => ({ ...p, [key]: v }));
    setTimeout(() => (next === "done" ? null : setStep(next)), 160);
  };

  return (
    <div className="onboarding">
      <header className="onboarding-top">
        <Logo size={28} />
        {qIndex >= 0 && (
          <div style={{ width: 200 }}>
            <ProgressBar value={(qIndex + 1) / order.length} size="thin" label="Onboarding progress" />
          </div>
        )}
      </header>
      <main className="onboarding-body" key={step}>
        {qIndex > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={back} style={{ alignSelf: "flex-start", marginLeft: -10 }}>
            <ArrowLeft size={16} /> Back
          </button>
        )}

        {step === "name" && (
          <form
            className="stack enter"
            style={{ "--gap": "20px" } as React.CSSProperties}
            onSubmit={(e) => {
              e.preventDefault();
              if (profile.name?.trim()) setStep("prior");
            }}
          >
            <h1>What should we call you?</h1>
            <p className="muted">You'll use your name in your first Spanish sentence.</p>
            <input className="input" style={{ height: 54, fontSize: "1.1rem" }} autoFocus value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="Your first name" aria-label="Your first name" maxLength={40} />
            <button className="btn btn-primary btn-lg" disabled={!profile.name?.trim()}>
              Continue <ArrowRight size={18} />
            </button>
          </form>
        )}

        {step === "prior" && (
          <div className="stack enter" style={{ "--gap": "20px" } as React.CSSProperties}>
            <h1>Have you studied Spanish before?</h1>
            <div className="choice-grid" role="radiogroup">
              <Choice value="none" current={profile.priorStudy ?? null} onPick={pick("priorStudy", "reason")} title="No, I'm brand new" />
              <Choice value="some" current={profile.priorStudy ?? null} onPick={pick("priorStudy", "reason")} title="A little" sub="A class, an app, or picked some up" />
              <Choice value="lots" current={profile.priorStudy ?? null} onPick={pick("priorStudy", "reason")} title="Yes, quite a bit" sub="Several years of classes or time abroad" />
            </div>
          </div>
        )}

        {step === "reason" && (
          <div className="stack enter" style={{ "--gap": "20px" } as React.CSSProperties}>
            <h1>Why are you learning?</h1>
            <p className="muted">We'll lean toward scenarios that matter to you.</p>
            <div className="choice-grid onboarding-grid" role="radiogroup">
              {REASONS.map((r) => (
                <Choice key={r.value} value={r.value} current={profile.reason ?? null} onPick={pick("reason", "time")} title={r.label} icon={r.icon} />
              ))}
            </div>
          </div>
        )}

        {step === "time" && (
          <div className="stack enter" style={{ "--gap": "20px" } as React.CSSProperties}>
            <h1>How much time can you practice each day?</h1>
            <p className="muted">Sessions adapt to the time you have. You can change this any time.</p>
            <div className="choice-grid" role="radiogroup">
              {([5, 10, 15, 30, 60] as const).map((m) => (
                <Choice
                  key={m}
                  value={m}
                  current={goal}
                  onPick={(v) => {
                    setGoal(v);
                    setTimeout(() => setStep("understand"), 160);
                  }}
                  title={`${m} minutes`}
                  sub={m === 5 ? "A quick daily habit" : m === 15 ? "Recommended — steady progress" : m === 30 ? "Serious progress" : m === 60 ? "Intensive" : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {step === "understand" && (
          <div className="stack enter" style={{ "--gap": "20px" } as React.CSSProperties}>
            <h1>Can you understand basic Spanish?</h1>
            <p className="es muted" style={{ fontSize: "1.2rem" }}>“Hola, ¿cómo estás? ¿De dónde eres?”</p>
            <div className="choice-grid" role="radiogroup">
              <Choice value="none" current={profile.selfUnderstanding ?? null} onPick={pick("selfUnderstanding", "speak")} title="Not really" />
              <Choice value="some" current={profile.selfUnderstanding ?? null} onPick={pick("selfUnderstanding", "speak")} title="Some of it" />
              <Choice value="good" current={profile.selfUnderstanding ?? null} onPick={pick("selfUnderstanding", "speak")} title="Yes, easily" />
            </div>
          </div>
        )}

        {step === "speak" && (
          <div className="stack enter" style={{ "--gap": "20px" } as React.CSSProperties}>
            <h1>Can you speak basic Spanish?</h1>
            <p className="muted">For example, introduce yourself and say where you're from.</p>
            <div className="choice-grid" role="radiogroup">
              {(["none", "some", "good"] as const).map((v) => (
                <Choice
                  key={v}
                  value={v}
                  current={profile.selfSpeaking ?? null}
                  onPick={(val) => {
                    setProfile((p) => ({ ...p, selfSpeaking: val }));
                  }}
                  title={v === "none" ? "Not yet" : v === "some" ? "A few phrases" : "Yes, simple conversations"}
                />
              ))}
            </div>
            <button className="btn btn-primary btn-lg" disabled={!profile.selfSpeaking} onClick={finishQuestions}>
              Continue <ArrowRight size={18} />
            </button>
          </div>
        )}

        {step === "placement-intro" && (
          <div className="stack enter" style={{ "--gap": "18px" } as React.CSSProperties}>
            <span className="eyebrow">Placement</span>
            <h1>Let's find your starting point</h1>
            <p className="muted">About {PLACEMENT_LENGTH} short questions that adapt as you go — listening, reading, grammar, and writing Spanish yourself. It takes 3–4 minutes.</p>
            <p className="notice">It's an estimate, not a certificate. Your reviews in the first week will confirm or adjust it.</p>
            <div className="row wrap">
              <button
                className="btn btn-primary btn-lg"
                onClick={() => {
                  setRun(startPlacement(profile.selfUnderstanding === "good" || profile.priorStudy === "lots" ? "good" : "some"));
                  setStep("placement");
                }}
              >
                Start placement
              </button>
              <button
                className="btn btn-ghost btn-lg"
                onClick={() => {
                  actions.finishOnboarding();
                  navigate("/", { replace: true });
                }}
              >
                Start from the beginning
              </button>
            </div>
          </div>
        )}

        {step === "placement" && run && (
          <PlacementQuestion
            run={run}
            onAnswer={(item, quality) => {
              const next = answerPlacement(run, item, quality);
              setRun(next);
              if (!nextPlacementItem(next)) {
                const canSpeak = !!navigator.mediaDevices?.getUserMedia;
                if (canSpeak && next.answers.filter((a) => a.quality >= 0.6).length >= 3) setStep("placement-speaking");
                else {
                  setResult(estimatePlacement(next, null, Date.now()));
                  setStep("result");
                }
              }
            }}
          />
        )}

        {step === "placement-speaking" && run && (
          <div className="stack enter" style={{ "--gap": "18px" } as React.CSSProperties}>
            <span className="eyebrow">Last one · Speaking</span>
            <h1 className="es">{PLACEMENT_SPEAKING.prompt}</h1>
            <p className="muted">{PLACEMENT_SPEAKING.promptEn} Answer out loud.</p>
            <SpeakingRecorder
              stage={4}
              requirements={PLACEMENT_SPEAKING.requirements.map((anyOf) => ({ anyOf, label: anyOf[0] }))}
              onOutcome={(o) => {
                setResult(estimatePlacement(run, o.evaluation.quality, Date.now()));
                setStep("result");
              }}
            />
            <button
              className="btn btn-ghost"
              onClick={() => {
                setResult(estimatePlacement(run, null, Date.now()));
                setStep("result");
              }}
            >
              Skip speaking
            </button>
          </div>
        )}

        {step === "result" && result && <PlacementResultView result={result} />}
      </main>
    </div>
  );
}

function PlacementQuestion({ run, onAnswer }: { run: PlacementRun; onAnswer: (item: PlacementItem, quality: number) => void }) {
  const item = useMemo(() => nextPlacementItem(run), [run]);
  const [sel, setSel] = useState<number | null>(null);
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setSel(null);
    setText("");
  }, [item?.id]);
  if (!item) return null;
  const submit = () => {
    if (item.accepted) onAnswer(item, checkSpanish(text, item.accepted).quality);
    else if (sel != null) onAnswer(item, sel === item.answer ? 1 : 0);
  };
  const skillLabel = { vocabulary: "Vocabulary", grammar: "Grammar", listening: "Listening", reading: "Reading", production: "Writing", speaking: "Speaking" }[item.skill];
  return (
    <div className="stack enter" key={item.id} style={{ "--gap": "20px" } as React.CSSProperties}>
      <div className="row-between">
        <span className="eyebrow">{skillLabel}</span>
        <span className="small faint num">
          {run.answers.length + 1} / {PLACEMENT_LENGTH}
        </span>
      </div>
      <ProgressBar value={run.answers.length / PLACEMENT_LENGTH} size="thin" />
      {item.audio && <AudioPair text={item.audio} autoPlay size="lg" />}
      {item.passage && <p className="es card card-flat" style={{ fontSize: "1.2rem", lineHeight: 1.5 }}>{item.passage}</p>}
      <h2 style={{ fontSize: "1.3rem" }}>{item.prompt}</h2>
      {item.options ? (
        <div className="options">
          {item.options.map((o, i) => (
            <button key={i} className="option" aria-pressed={sel === i} onClick={() => setSel(i)}>
              <span className="kbd">{i + 1}</span>
              <span className={`option-text ${/^[a-záéíóúñ¿¡ ]+$/i.test(o) && item.skill === "grammar" ? "es" : ""}`}>{o}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <input ref={input} className="answer-input" style={{ minHeight: 0, height: 60 }} autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && text.trim() && submit()} lang="es" placeholder="Escribe en español…" aria-label="Your answer in Spanish" />
          <AccentKeys onInsert={(c) => setText((t) => t + c)} />
        </>
      )}
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button className="btn btn-ghost" onClick={() => onAnswer(item, 0)}>
          I don't know
        </button>
        <button className="btn btn-primary btn-lg" disabled={item.accepted ? !text.trim() : sel == null} onClick={submit}>
          Next
        </button>
      </div>
    </div>
  );
}

function PlacementResultView({ result }: { result: PlacementResult }) {
  const navigate = useNavigate();
  const lesson = LESSONS[result.startLessonId];
  const unit = UNIT_MAP[lesson.unitId];
  const level = LEVEL_MAP[unit.levelId];
  const beginner = result.startLessonId === "u1-l1";
  const s = result.scores;
  const rows: [string, number | null][] = [
    ["Vocabulary", s.vocabulary],
    ["Grammar", s.grammar],
    ["Listening", s.listening],
    ["Reading", s.reading],
    ["Writing", s.production],
    ["Speaking", s.speaking],
  ];
  return (
    <div className="stack enter" style={{ "--gap": "20px" } as React.CSSProperties}>
      <span className="eyebrow">Your starting point</span>
      <h1>{beginner ? "We'll start at the beginning" : `We'll start you around ${result.band} material`}</h1>
      <p className="muted">
        {beginner
          ? "That's the best place to build real speaking habits — you'll move quickly through anything you already know."
          : `Based on your placement test, your answers are consistent with approximately ${result.band}-level tasks. It's an estimate, not a certification.`}
      </p>
      <div className="card">
        <div className="small muted">Starting at</div>
        <div style={{ fontWeight: 700, fontSize: "1.1rem", marginTop: 2 }}>
          {level.title} · Unit {unit.id.slice(1)}: {unit.title}
        </div>
        {!beginner && <p className="small muted" style={{ marginTop: 6 }}>Earlier lessons are marked as tested out. Their words will come up in review over the next few days so we can confirm you really know them.</p>}
        <div className="stack" style={{ "--gap": "10px", marginTop: 16 } as React.CSSProperties}>
          {rows.filter(([, v]) => v != null).map(([label, v]) => (
            <div key={label} className="meter">
              <span className="meter-label">{label}</span>
              <ProgressBar value={v!} />
              <span className="meter-value">{Math.round(v! * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
      <div className="row wrap">
        <button
          className="btn btn-primary btn-lg"
          onClick={() => {
            if (!beginner) actions.placement(result);
            else actions.profile({ placement: result });
            actions.finishOnboarding();
            navigate("/", { replace: true });
          }}
        >
          Start learning <ArrowRight size={18} />
        </button>
        {!beginner && (
          <button
            className="btn btn-ghost btn-lg"
            onClick={() => {
              actions.profile({ placement: result });
              actions.finishOnboarding();
              navigate("/", { replace: true });
            }}
          >
            Start from the beginning instead
          </button>
        )}
      </div>
    </div>
  );
}
