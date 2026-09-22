import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, ChevronRight, Info, Snail } from "lucide-react";
import { PRONUNCIATION } from "../content";
import { useLearner, actions } from "../state/store";
import { PageHead } from "../components/AppShell";
import { AudioButton, useAudio } from "../components/audio";
import { SpeakingRecorder, type SpeechOutcome } from "../components/SpeakingRecorder";
import { speakSyllables } from "../services/tts";
import type { PronunciationModule } from "../engine/types";
import { sttAvailable } from "../services/stt";

export default function Pronunciation() {
  const { id } = useParams();
  const mod = PRONUNCIATION.find((m) => m.id === id);
  return mod ? <ModuleView mod={mod} /> : <ModuleList />;
}

function ModuleList() {
  const learner = useLearner()!;
  return (
    <div className="page page-narrow">
      <Link to="/practice" className="btn btn-ghost btn-sm" style={{ marginLeft: -10 }}>
        <ArrowLeft size={16} /> Practice
      </Link>
      <PageHead title="Pronunciation" subtitle="The sounds that most change how well you're understood. The goal is clear, understandable Spanish — not erasing your accent." />
      <div className="card" style={{ padding: 6 }}>
        <div className="list padded">
          {PRONUNCIATION.map((m) => {
            const p = learner.pronunciation[m.id];
            return (
              <Link key={m.id} to={`/practice/pronunciation/${m.id}`} className="list-row">
                <span className="sound-badge es">{m.sound}</span>
                <span className="grow">
                  <span style={{ fontWeight: 650, display: "block" }}>{m.title}</span>
                  <span className="small muted">{m.summary}</span>
                </span>
                {p && <span className="chip success"><Check size={12} /> {Math.round(p.best * 100)}%</span>}
                <ChevronRight size={18} className="faint" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ModuleView({ mod }: { mod: PronunciationModule }) {
  const learner = useLearner()!;
  const { play } = useAudio();
  const [results, setResults] = useState<Record<string, number>>({});
  const [active, setActive] = useState<string | null>(null);
  const seconds = useRef(0);
  const opts = { variety: learner.settings.variety, voiceURI: learner.settings.voiceURI };

  const onOutcome = (word: string) => (o: SpeechOutcome) => {
    const q = o.evaluation.intelligibility ?? o.evaluation.quality;
    seconds.current += o.durationMs / 1000;
    const next = { ...results, [word]: q };
    setResults(next);
    setActive(null);
    const vals = Object.values(next);
    actions.pronunciation(mod.id, vals.reduce((a, b) => a + b, 0) / vals.length, o.durationMs / 1000);
  };

  const items = [...mod.words.map((w) => ({ ...w, key: w.es })), { es: mod.sentence.es, en: mod.sentence.en, syllables: "", key: "sentence" }];

  return (
    <div className="page page-narrow">
      <Link to="/practice/pronunciation" className="btn btn-ghost btn-sm" style={{ marginLeft: -10 }}>
        <ArrowLeft size={16} /> Pronunciation
      </Link>
      <div className="page-head">
        <div className="row" style={{ gap: 16 }}>
          <span className="sound-badge lg es">{mod.sound}</span>
          <div>
            <h1>{mod.title}</h1>
            <p className="muted">{mod.summary}</p>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card card-flat">
          <div className="eyebrow" style={{ marginBottom: 6 }}>Tip</div>
          <p>{mod.tip}</p>
        </div>
        <div className="card card-flat">
          <div className="eyebrow" style={{ marginBottom: 6 }}>Mouth position</div>
          <p>{mod.mouth}</p>
        </div>
      </div>

      {mod.contrast && (
        <section className="section">
          <div className="section-head">
            <h2>Hear the difference</h2>
          </div>
          <div className="row wrap" style={{ gap: 10 }}>
            {mod.contrast.map(([a, b]) => (
              <div key={a + b} className="contrast">
                <button className="pill-button es" onClick={() => play(a, { speed: "slow" })}>{a}</button>
                <span className="faint">vs</span>
                <button className="pill-button es" onClick={() => play(b, { speed: "slow" })}>{b}</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Practice</h2>
          <span className="small faint">Listen · slow · syllables · then say it</span>
        </div>
        {!sttAvailable() && (
          <p className="notice" style={{ marginBottom: 14 }}>
            <Info size={18} /> This browser can't recognize speech, so you'll compare your recording with the model and rate yourself.
          </p>
        )}
        <div className="card" style={{ padding: 6 }}>
          <div className="list padded">
            {items.map((w) => {
              const r = results[w.key];
              return (
                <div key={w.key} className="pron-row">
                  <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                    <div className="grow" style={{ minWidth: 160 }}>
                      <div className="es" style={{ fontSize: w.key === "sentence" ? "1.2rem" : "1.45rem", fontWeight: 600 }}>{w.es}</div>
                      <div className="small muted">
                        {w.en}
                        {w.syllables && <span className="syllables"> · {w.syllables}</span>}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <AudioButton text={w.es} size="sm" label={`Play ${w.es}`} />
                      <AudioButton text={w.es} size="sm" speed="slow" label={`Play ${w.es} slowly`} />
                      {w.syllables && (
                        <button className="pill-button" style={{ height: 36 }} onClick={() => speakSyllables(w.syllables, opts)} aria-label={`Play syllables of ${w.es}`}>
                          <Snail size={15} /> <span className="syllables">{w.syllables}</span>
                        </button>
                      )}
                      <button className={`btn btn-sm ${active === w.key ? "btn-secondary" : "btn-accent"}`} onClick={() => setActive(active === w.key ? null : w.key)}>
                        {active === w.key ? "Cancel" : r != null ? "Again" : "Say it"}
                      </button>
                    </div>
                  </div>
                  {r != null && active !== w.key && (
                    <p className={`small ${r >= 0.8 ? "" : "muted"}`} style={{ marginTop: 8, color: r >= 0.8 ? "var(--success-text)" : undefined }}>
                      {r >= 0.8 ? "Clear — it was understood." : r >= 0.5 ? "Close. Listen to the slow version and try once more." : "It didn't come through. Try the syllables slowly, then speed up."}
                    </p>
                  )}
                  {active === w.key && (
                    <div style={{ marginTop: 12 }}>
                      <SpeakingRecorder compact stage={1} accepted={[w.es]} model={w.es} maxSeconds={10} onOutcome={onOutcome(w.key)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
