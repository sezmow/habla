import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mic, Lock, Check, Sparkles, Info, MessagesSquare, ChevronRight } from "lucide-react";
import { useLearner, useNow } from "../state/store";
import { SCENARIOS, LESSONS, personalize } from "../content";
import { dailyChallenge, speakingStage, STAGE_INFO } from "../engine/session";
import { lessonsCompleted } from "../engine/progress";
import { conversationDifficulty } from "../engine/conversation";
import { aiStatus, type AiStatus } from "../services/ai";
import { sttAvailable } from "../services/stt";
import { micPermission, type MicPermission } from "../services/recorder";
import { PageHead } from "../components/AppShell";
import { Modal } from "../components/ui";
import { SpeakingRecorder } from "../components/SpeakingRecorder";

const TOPICS = [
  { id: "weekend", label: "Tu fin de semana", en: "Your weekend" },
  { id: "family", label: "Tu familia", en: "Your family" },
  { id: "food", label: "La comida", en: "Food" },
  { id: "plans", label: "Tus planes", en: "Your plans" },
  { id: "day", label: "Tu día", en: "Your day" },
  { id: "open", label: "Libre", en: "Anything" },
];

function Dots({ value }: { value: number }) {
  const n = Math.max(1, Math.min(5, Math.round(value * 10)));
  return (
    <span className="dots" aria-label={`Difficulty ${n} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= n ? "on" : ""} />
      ))}
    </span>
  );
}

export default function Speak() {
  const learner = useLearner()!;
  const now = useNow();
  const navigate = useNavigate();
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [mic, setMic] = useState<MicPermission | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  useEffect(() => {
    aiStatus().then(setAi);
    micPermission().then(setMic);
  }, []);
  const done = new Set(lessonsCompleted(learner));
  const stage = speakingStage(learner);
  const challenge = dailyChallenge(learner, now);
  const difficulty = conversationDifficulty(learner, now);
  const stt = sttAvailable();

  return (
    <div className="page">
      <PageHead title="Speak" subtitle="Habla is built to get you speaking. Start by repeating, work up to answering on your own, then hold real conversations." />

      <div className="two-col">
        <div className="stack" style={{ "--gap": "28px" } as React.CSSProperties}>
          <section className="card card-lg challenge-card">
            <div className="eyebrow" style={{ color: "var(--accent-text)" }}>Today's speaking challenge</div>
            <p className="es" style={{ fontSize: "1.7rem", lineHeight: 1.25, margin: "8px 0 4px" }}>{personalize(challenge.prompt, learner.profile.name)}</p>
            <p className="muted">{challenge.promptEn}</p>
            <div className="row wrap" style={{ gap: 12, marginTop: 20 }}>
              <button className="btn btn-accent btn-lg" onClick={() => navigate("/session/speaking")}>
                <Mic size={19} /> Start a 3-minute session
              </button>
            </div>
          </section>

          <section>
            <div className="section-head">
              <h2>Speaking ladder</h2>
              <span className="small faint">You're ready for stage {stage}</span>
            </div>
            <div className="card" style={{ padding: 6 }}>
              <div className="list padded">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => {
                  const info = STAGE_INFO[n];
                  const unlocked = n <= stage;
                  const to = n === 6 ? "#roleplays" : n === 7 ? "#free" : `/session/stage/${n}`;
                  return (
                    <button
                      key={n}
                      className={`list-row stage-row ${unlocked ? "" : "locked"}`}
                      onClick={() => {
                        if (!unlocked) return;
                        if (to.startsWith("#")) document.getElementById(to.slice(1))?.scrollIntoView({ behavior: "smooth" });
                        else navigate(to);
                      }}
                      aria-disabled={!unlocked}
                    >
                      <span className={`stage-n ${n < stage ? "done" : n === stage ? "current" : ""}`}>{n < stage ? <Check size={15} strokeWidth={3} /> : n}</span>
                      <span className="grow">
                        <span style={{ fontWeight: 650, display: "block" }}>{info.title}</span>
                        <span className="small muted">
                          {info.description} <span className="es">“{info.example}”</span>
                        </span>
                      </span>
                      {unlocked ? <ChevronRight size={18} className="faint" /> : <Lock size={16} className="faint" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section id="roleplays">
            <div className="section-head">
              <h2>Real-world roleplays</h2>
              <span className="small faint">Guided · runs on your device</span>
            </div>
            <div className="grid-2">
              {SCENARIOS.map((s) => {
                const unlocked = !s.requiresLesson || done.has(s.requiresLesson);
                return (
                  <button key={s.id} className={`card card-link scenario-card ${unlocked ? "" : "locked"}`} style={{ textAlign: "left" }} onClick={() => unlocked && navigate(`/speak/conversation/${s.id}`)} aria-disabled={!unlocked}>
                    <div className="row-between">
                      <span className="scenario-emoji" aria-hidden="true">{s.emoji}</span>
                      <Dots value={s.difficulty} />
                    </div>
                    <div className="card-title" style={{ marginTop: 10 }}>{s.title}</div>
                    <div className="card-sub">{s.role}</div>
                    <div className="small faint" style={{ marginTop: 10 }}>
                      {unlocked ? `${s.goals.length} goals · with ${s.partner}` : <span className="row" style={{ gap: 6 }}><Lock size={13} /> After “{LESSONS[s.requiresLesson!].title}”</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section id="free">
            <div className="section-head">
              <h2>Free conversation</h2>
              <span className="small faint">AI partner · difficulty {difficulty.toFixed(1)}</span>
            </div>
            <div className="card">
              {ai?.available ? (
                <>
                  <p className="muted" style={{ marginBottom: 14 }}>
                    An AI partner that speaks at your level: mostly words you know, a few new ones, and gentle corrections. Pick a topic:
                  </p>
                  <div className="row wrap" style={{ gap: 8 }}>
                    {TOPICS.map((t) => (
                      <button key={t.id} className="pill-button" onClick={() => navigate(`/speak/conversation/free?topic=${t.id}`)}>
                        <span className="es">{t.label}</span>
                      </button>
                    ))}
                  </div>
                  {stage < 7 && <p className="tiny faint" style={{ marginTop: 12 }}>Free conversation is stage 7. It's open to you now, but guided roleplays may feel more comfortable first.</p>}
                </>
              ) : (
                <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
                  <span className="icon-tile neutral">
                    <MessagesSquare size={20} />
                  </span>
                  <div>
                    <div style={{ fontWeight: 650 }}>The AI conversation partner isn't connected</div>
                    <p className="small muted" style={{ marginTop: 4 }}>
                      {ai === null ? "Checking…" : `${ai.reason ?? ""} Free conversation needs Habla's conversation server with an Anthropic API key (see the README). Guided roleplays above work without it.`}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="stack" style={{ "--gap": "20px" } as React.CSSProperties}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Your microphone</div>
            <ul className="status-list">
              <li className={mic === "denied" ? "bad" : "good"}>
                {mic === "denied" ? <Info size={16} /> : <Check size={16} />}
                {mic === "granted" ? "Microphone allowed" : mic === "denied" ? "Microphone blocked in browser settings" : mic === "unsupported" ? "No microphone access in this browser" : "Microphone permission not asked yet"}
              </li>
              <li className={stt ? "good" : "bad"}>
                {stt ? <Check size={16} /> : <Info size={16} />}
                {stt ? "Speech recognition available" : "No speech recognition — speaking is self-assessed"}
              </li>
            </ul>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 14 }} onClick={() => setTesting(true)}>
              Test microphone
            </button>
            {testResult && <p className="small" style={{ marginTop: 10 }}>{testResult}</p>}
          </div>
          <div className="card card-flat">
            <div className="row" style={{ gap: 8, marginBottom: 6 }}>
              <Sparkles size={16} color="var(--accent)" />
              <strong>How speaking is judged</strong>
            </div>
            <p className="small muted">We check whether each word was understood, whether your sentence has what it needs, and how smoothly you spoke. We don't penalize accents — the goal is being understood.</p>
          </div>
          <Link to="/practice/pronunciation" className="card card-link tool-card">
            <span className="icon-tile accent">
              <Mic size={18} />
            </span>
            <span className="grow">
              <span className="card-title" style={{ display: "block" }}>Pronunciation drills</span>
              <span className="card-sub">r/rr, j, ñ, vowels…</span>
            </span>
            <ChevronRight size={18} className="faint" />
          </Link>
        </aside>
      </div>

      <Modal open={testing} onClose={() => setTesting(false)} title="Microphone test">
        <h2 style={{ marginBottom: 6 }}>Microphone test</h2>
        <p className="muted small" style={{ marginBottom: 16 }}>Say: <span className="es">“Hola, me llamo {learner.profile.name || "Ana"}.”</span></p>
        <SpeakingRecorder
          stage={1}
          accepted={[`Hola, me llamo ${learner.profile.name || "Ana"}.`]}
          maxSeconds={10}
          onOutcome={(o) => {
            setTesting(false);
            micPermission().then(setMic);
            setTestResult(o.selfAssessed ? "Recording works. Speech recognition isn't available here, so you'll rate yourself." : o.evaluation.transcript ? `We heard: “${o.evaluation.transcript}”. You're all set.` : "We couldn't hear anything — check your input device.");
          }}
        />
      </Modal>
    </div>
  );
}
