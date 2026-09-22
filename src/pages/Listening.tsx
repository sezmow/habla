import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Play, Pause, RotateCcw, Check, X, Eye, EyeOff, Headphones } from "lucide-react";
import { LISTENING, LESSONS } from "../content";
import { useLearner, actions } from "../state/store";
import { textCoverage } from "../engine/coverage";
import { PageHead } from "../components/AppShell";
import { Segmented } from "../components/ui";
import { SpanishText } from "../components/SpanishText";
import { useAudio, takeSpokenMs, type Speed } from "../components/audio";
import type { ListeningPiece } from "../engine/types";

export default function Listening() {
  const { id } = useParams();
  const piece = LISTENING.find((p) => p.id === id);
  return piece ? <Player piece={piece} /> : <Library />;
}

function fit(pct: number): { label: string; tone: string } {
  if (pct >= 0.98) return { label: "Easy", tone: "success" };
  if (pct >= 0.9) return { label: "Good fit", tone: "primary" };
  if (pct >= 0.8) return { label: "Stretch", tone: "warning" };
  return { label: "Challenging", tone: "danger" };
}

function Library() {
  const learner = useLearner()!;
  const navigate = useNavigate();
  const items = LISTENING.map((p) => ({ p, cov: textCoverage(p.lines.map((l) => l.es).join(" "), learner) }));
  return (
    <div className="page">
      <Link to="/practice" className="btn btn-ghost btn-sm" style={{ marginLeft: -10 }}>
        <ArrowLeft size={16} /> Practice
      </Link>
      <PageHead title="Listening" subtitle="Understandable Spanish, a little above your level. Listen first — the text and translation come after you try." />
      <p className="notice info" style={{ marginBottom: 20 }}>
        <Headphones size={18} />
        <span>
          The best practice is Spanish where you already know <strong>90–98%</strong> of the words. Each piece shows how much you know right now.
        </span>
      </p>
      <div className="grid-auto">
        {items.map(({ p, cov }) => {
          const f = fit(cov.pct);
          const score = learner.listened[p.id];
          return (
            <button key={p.id} className="card card-link" style={{ textAlign: "left" }} onClick={() => navigate(`/practice/listening/${p.id}`)}>
              <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
                <span className={`chip ${f.tone}`}>{f.label}</span>
                <span className="chip outline">{p.speed === "slow" ? "Slow" : p.speed === "fast" ? "Natural speed" : "Normal"}</span>
                {p.region && <span className="chip warning">{p.region}</span>}
              </div>
              <div className="es" style={{ fontSize: "1.25rem", fontWeight: 600 }}>{p.title}</div>
              <div className="small muted">{p.summary}</div>
              <div className="row-between small" style={{ marginTop: 14 }}>
                <span>
                  You know <strong>{Math.round(cov.pct * 100)}%</strong>
                </span>
                {score != null ? <span className="chip success"><Check size={12} /> {Math.round(score * 100)}%</span> : <span className="faint">{p.minutes} min</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Phase = "listen" | "questions" | "read";

function Player({ piece }: { piece: ListeningPiece }) {
  const learner = useLearner()!;
  const navigate = useNavigate();
  const { play, stop, playing } = useAudio();
  const [phase, setPhase] = useState<Phase>("listen");
  const [speed, setSpeed] = useState<Speed>(piece.speed === "fast" ? "fast" : piece.speed === "slow" ? "slow" : "normal");
  const [plays, setPlays] = useState(0);
  const [line, setLine] = useState<number | null>(null);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>(piece.questions.map(() => null));
  const [checked, setChecked] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [shown, setShown] = useState<Set<number>>(new Set());
  const cancel = useRef(false);
  const listenedMs = useRef(0);
  const speakers = useMemo(() => [...new Set(piece.lines.map((l) => l.speaker).filter(Boolean))], [piece]);
  const coverage = useMemo(() => textCoverage(piece.lines.map((l) => l.es).join(" "), learner), [piece, learner]);

  useEffect(() => () => {
    cancel.current = true;
    stop();
  }, [stop]);

  const playLine = async (i: number) => {
    setLine(i);
    const l = piece.lines[i];
    const ms = await play(l.es, { speed, speaker: l.speaker ? speakers.indexOf(l.speaker) : 0, onBoundary: (c, len) => setRange([c, c + Math.max(1, len)]) }, `line-${i}`);
    listenedMs.current += ms;
    setRange(null);
  };

  const playAll = async () => {
    if (playing) {
      cancel.current = true;
      stop();
      setLine(null);
      return;
    }
    cancel.current = false;
    for (let i = 0; i < piece.lines.length; i++) {
      if (cancel.current) break;
      await playLine(i);
      await new Promise((r) => setTimeout(r, speed === "slow" ? 500 : 250));
    }
    setLine(null);
    setPlays((p) => p + 1);
  };

  const score = checked ? answers.filter((a, i) => a === piece.questions[i].answer).length / piece.questions.length : 0;

  const finish = () => {
    takeSpokenMs();
    actions.listening(piece.id, score, Math.max(30, listenedMs.current / 1000));
    navigate("/practice/listening");
  };

  return (
    <div className="page page-narrow">
      <Link to="/practice/listening" className="btn btn-ghost btn-sm" style={{ marginLeft: -10 }}>
        <ArrowLeft size={16} /> Listening
      </Link>
      <div className="page-head">
        <div>
          <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
            <span className="chip">{piece.kind}</span>
            {piece.region && <span className="chip warning">{piece.region} Spanish</span>}
            {piece.requiresLesson && !learner.lessons[piece.requiresLesson]?.completedAt && <span className="chip outline">Pairs with “{LESSONS[piece.requiresLesson].title}”</span>}
          </div>
          <h1 className="es">{piece.title}</h1>
          <p className="muted">
            {piece.summary} You know {Math.round(coverage.pct * 100)}% of the words.
          </p>
        </div>
      </div>

      <div className="steps-row" aria-label="Steps">
        {(["listen", "questions", "read"] as Phase[]).map((p, i) => (
          <span key={p} className={`step-pill ${phase === p ? "active" : ""} ${(["listen", "questions", "read"] as Phase[]).indexOf(phase) > i ? "done" : ""}`}>
            {i + 1}. {p === "listen" ? "Listen" : p === "questions" ? "Check understanding" : "Read along"}
          </span>
        ))}
      </div>

      <div className="card card-lg listen-stage">
        <div className="row-between wrap" style={{ gap: 12 }}>
          <button className="btn btn-primary btn-lg" onClick={playAll}>
            {playing ? <Pause size={18} /> : plays ? <RotateCcw size={18} /> : <Play size={18} fill="currentColor" />}
            {playing ? "Pause" : plays ? "Listen again" : "Play"}
          </button>
          <Segmented
            label="Speed"
            value={speed}
            onChange={setSpeed}
            options={[
              { value: "slow", label: "Slow" },
              { value: "normal", label: "Normal" },
              { value: "fast", label: "Fast" },
            ]}
          />
        </div>
        {phase === "listen" && (
          <div className="listen-now">
            <div className="now-bars" aria-hidden="true">
              {piece.lines.map((_, i) => (
                <span key={i} className={line === i ? "on" : line != null && i < line ? "past" : ""} />
              ))}
            </div>
            <p className="small muted" style={{ textAlign: "center" }}>
              {playing ? `Line ${(line ?? 0) + 1} of ${piece.lines.length}` : "No text yet — try to understand it by ear first."}
            </p>
            {learner.settings.captions && playing && line != null && <p className="small faint" style={{ textAlign: "center" }}>Captions appear in step 3 so you can test your ear first.</p>}
            <button className="btn btn-secondary" disabled={!plays} onClick={() => setPhase("questions")} style={{ alignSelf: "center" }}>
              I've listened — check my understanding
            </button>
          </div>
        )}
      </div>

      {phase === "questions" && (
        <div className="stack enter" style={{ "--gap": "20px", marginTop: 24 } as React.CSSProperties}>
          {piece.questions.map((q, qi) => (
            <div key={qi} className="card">
              <div style={{ fontWeight: 650, marginBottom: 12 }}>{q.q}</div>
              <div className="options">
                {q.options.map((o, oi) => {
                  const state = checked ? (oi === q.answer ? "correct" : answers[qi] === oi ? "incorrect" : "") : "";
                  return (
                    <button key={oi} className={`option ${state}`} aria-pressed={answers[qi] === oi} disabled={checked} onClick={() => setAnswers(answers.map((a, j) => (j === qi ? oi : a)))}>
                      <span className="option-text">{o}</span>
                      {state === "correct" && <Check className="option-mark" size={18} color="var(--success)" />}
                      {state === "incorrect" && <X className="option-mark" size={18} color="var(--danger)" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {!checked ? (
            <button className="btn btn-primary btn-lg" disabled={answers.some((a) => a == null)} onClick={() => setChecked(true)} style={{ alignSelf: "flex-start" }}>
              Check answers
            </button>
          ) : (
            <div className="row-between wrap card">
              <div>
                <div style={{ fontWeight: 700 }}>
                  {Math.round(score * piece.questions.length)} of {piece.questions.length} correct
                </div>
                <div className="small muted">{score === 1 ? "You understood it by ear." : "Now read along to see what you missed."}</div>
              </div>
              <button className="btn btn-primary" onClick={() => setPhase("read")}>
                Read along
              </button>
            </div>
          )}
        </div>
      )}

      {phase === "read" && (
        <div className="stack enter" style={{ "--gap": "12px", marginTop: 24 } as React.CSSProperties}>
          <div className="row-between">
            <h2 style={{ fontSize: "1.1rem" }}>Transcript</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAll((s) => !s)}>
              {showAll ? <EyeOff size={16} /> : <Eye size={16} />} {showAll ? "Hide translations" : "Show translations"}
            </button>
          </div>
          <div className="card" style={{ padding: 8 }}>
            {piece.lines.map((l, i) => (
              <div key={i} className={`transcript-line ${line === i ? "active" : ""}`}>
                <button className="audio-btn sm" aria-label={`Play line ${i + 1}`} onClick={() => playLine(i)}>
                  <Play size={15} fill="currentColor" />
                </button>
                <div className="grow">
                  {l.speaker && <div className="tiny faint" style={{ fontWeight: 650 }}>{l.speaker}</div>}
                  <SpanishText text={l.es} speaking={line === i ? range : null} className="transcript-es" />
                  {showAll || shown.has(i) ? (
                    <div className="small muted">{l.en}</div>
                  ) : (
                    <button className="link-btn tiny" onClick={() => setShown(new Set(shown).add(i))}>
                      Show translation
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {coverage.unknown.length > 0 && (
            <p className="small muted">
              New to you: <span className="es">{coverage.unknown.slice(0, 8).join(", ")}</span>
            </p>
          )}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-primary btn-lg" onClick={finish}>
              Finish
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
