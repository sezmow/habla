// Microphone interface for every speaking task.
//
// With speech recognition (Chrome, Edge, Safari): we transcribe and evaluate
// what was understood. Without it (e.g. Firefox): the learner records, plays
// it back next to the model, and rates themselves — labeled as self-assessed.

import { useEffect, useRef, useState } from "react";
import { Mic, Square, RotateCcw, Play, Keyboard } from "lucide-react";
import type { KeywordRequirement } from "../engine/types";
import { evaluateSpeech, type SpeechEvaluation } from "../engine/answer";
import { describeSttError, startRecognition, sttAvailable, type RecognitionSession, type Transcript } from "../services/stt";
import { startRecording, type Recording } from "../services/recorder";
import { getLearner } from "../state/store";
import { AudioButton } from "./audio";

export interface SpeechOutcome {
  evaluation: SpeechEvaluation;
  durationMs: number;
  recordingUrl: string | null;
  selfAssessed: boolean;
}

interface Props {
  accepted?: string[];
  requirements?: KeywordRequirement[];
  stage: number;
  /** Model sentence for comparison in self-assessment mode. */
  model?: string;
  maxSeconds?: number;
  onOutcome: (o: SpeechOutcome) => void;
  onTypeInstead?: () => void;
  compact?: boolean;
}

type Phase = "idle" | "starting" | "recording" | "processing" | "self-rate" | "error";

export function SpeakingRecorder({ accepted, requirements, stage, model, maxSeconds = 30, onOutcome, onTypeInstead, compact }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [interim, setInterim] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const levels = useRef<number[]>([]);
  const rec = useRef<Recording | null>(null);
  const recog = useRef<RecognitionSession | null>(null);
  const started = useRef(0);
  const firstSpeech = useRef<number | null>(null);
  const lastLoud = useRef(0);
  const heardSpeech = useRef(false);
  const stopping = useRef(false);
  const stt = sttAvailable();
  const micSupported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  useEffect(
    () => () => {
      recog.current?.abort();
      rec.current?.cancel();
    },
    [],
  );

  // Waveform: draw recent input levels as rounded bars.
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const c = canvas.current;
      if (c) {
        const dpr = window.devicePixelRatio || 1;
        const w = c.clientWidth;
        const h = c.clientHeight;
        if (c.width !== w * dpr) {
          c.width = w * dpr;
          c.height = h * dpr;
        }
        const g = c.getContext("2d")!;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);
        const bars = Math.floor(w / 6);
        const data = levels.current.slice(-bars);
        const color = getComputedStyle(c).getPropertyValue("--accent").trim() || "#e5603f";
        const idle = getComputedStyle(c).getPropertyValue("--border-strong").trim() || "#ccc";
        for (let i = 0; i < bars; i++) {
          const lvl = data[i - (bars - data.length)] ?? 0;
          const bh = Math.max(3, lvl * h * 0.95);
          g.fillStyle = phase === "recording" ? color : idle;
          const x = i * 6 + 1;
          const y = (h - bh) / 2;
          g.beginPath();
          g.roundRect(x, y, 3, bh, 1.5);
          g.fill();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => {
      const t = (performance.now() - started.current) / 1000;
      setElapsed(t);
      // Auto-stop after a pause once the learner has spoken, or at the time limit.
      const quietFor = performance.now() - lastLoud.current;
      if ((heardSpeech.current && quietFor > 2200) || t >= maxSeconds) stop();
    }, 200);
    return () => clearInterval(id);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const begin = async () => {
    setError(null);
    setInterim("");
    setRecordingUrl(null);
    levels.current = [];
    firstSpeech.current = null;
    heardSpeech.current = false;
    stopping.current = false;
    setPhase("starting");
    try {
      rec.current = await startRecording((lvl) => {
        levels.current.push(lvl);
        if (levels.current.length > 400) levels.current.splice(0, 200);
        if (lvl > 0.12) {
          lastLoud.current = performance.now();
          if (!heardSpeech.current) {
            heardSpeech.current = true;
            firstSpeech.current ??= performance.now() - started.current;
          }
        }
      });
    } catch {
      setPhase("error");
      setError("Habla couldn't use your microphone. Check that it's connected and allowed for this site.");
      return;
    }
    started.current = performance.now();
    lastLoud.current = performance.now();
    if (stt) {
      recog.current = startRecognition({
        variety: getLearner()?.settings.variety ?? "latam",
        onInterim: setInterim,
        onSpeechStart: () => {
          firstSpeech.current ??= performance.now() - started.current;
        },
        onDone: finish,
        onError: (e) => {
          rec.current?.cancel();
          setPhase("error");
          setError(describeSttError(e));
        },
      });
    }
    setPhase("recording");
  };

  const durationRef = useRef(0);
  const urlRef = useRef<string | null>(null);

  const stopRecorder = async () => {
    const result = await rec.current?.stop();
    urlRef.current = result?.url ?? null;
    if (result?.url) setRecordingUrl(result.url);
    durationRef.current = result?.durationMs ?? performance.now() - started.current;
  };

  const stop = async () => {
    if (stopping.current) return;
    stopping.current = true;
    setPhase(stt ? "processing" : "self-rate");
    await stopRecorder();
    if (stt) recog.current?.stop();
  };

  async function finish(alts: Transcript[]) {
    // Recognition may end on its own after a long pause.
    if (!stopping.current) {
      stopping.current = true;
      await stopRecorder();
    }
    const durationMs = durationRef.current || performance.now() - started.current;
    if (!alts.length || !alts[0].text) {
      setPhase("idle");
      setError("We didn't catch anything. Try again a little closer to the microphone.");
      return;
    }
    const evaluation = evaluateSpeech({ transcripts: alts, accepted, requirements, durationMs, firstSpeechMs: firstSpeech.current, stage });
    setPhase("idle");
    onOutcome({ evaluation, durationMs, recordingUrl: urlRef.current, selfAssessed: false });
  }

  const selfRate = (quality: number) => {
    const evaluation: SpeechEvaluation = {
      transcript: "",
      diff: [],
      intelligibility: null,
      requirements: null,
      wpm: null,
      hesitationMs: firstSpeech.current,
      checks: { vocabulary: quality >= 0.6, grammar: quality >= 0.6, pronunciation: quality >= 0.85 ? "good" : quality >= 0.6 ? "okay" : "work" },
      feedback: [{ tone: quality >= 0.6 ? "good" : "tip", text: quality >= 0.85 ? "You rated this as clear. Keep going." : quality >= 0.6 ? "Mostly there — listen to the model once more." : "Listen to the model slowly, then try again." }],
      quality,
      passed: quality >= 0.6,
    };
    setPhase("idle");
    onOutcome({ evaluation, durationMs: durationRef.current, recordingUrl: urlRef.current, selfAssessed: true });
  };

  const mm = Math.floor(elapsed / 60);
  const ss = Math.floor(elapsed % 60).toString().padStart(2, "0");

  if (!micSupported) {
    return (
      <div className="recorder">
        <p className="rec-status">This browser can't access a microphone.</p>
        {onTypeInstead && (
          <button className="btn btn-secondary" onClick={onTypeInstead}>
            <Keyboard size={18} /> Type your answer instead
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="recorder" style={compact ? { padding: 18 } : undefined}>
      {phase === "self-rate" ? (
        <div className="stack" style={{ width: "100%", alignItems: "center", "--gap": "14px" } as React.CSSProperties}>
          <p className="rec-status">Compare your recording with the model, then rate yourself honestly.</p>
          <div className="row" style={{ gap: 12 }}>
            {recordingUrl && <PlayRecording url={recordingUrl} />}
            {model && (
              <span className="row" style={{ gap: 8 }}>
                <AudioButton text={model} label="Play the model" />
                <span className="small muted">Model</span>
              </span>
            )}
          </div>
          <div className="row wrap" style={{ justifyContent: "center", gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => selfRate(0.3)}>Not yet</button>
            <button className="btn btn-secondary btn-sm" onClick={() => selfRate(0.65)}>Mostly</button>
            <button className="btn btn-primary btn-sm" onClick={() => selfRate(0.9)}>Clear</button>
          </div>
          <p className="tiny faint" style={{ textAlign: "center" }}>Speech recognition isn't available in this browser, so this attempt is self-assessed.</p>
        </div>
      ) : (
        <>
          <button
            type="button"
            className={`mic-btn ${compact ? "sm" : ""} ${phase === "recording" ? "recording" : ""}`}
            onClick={phase === "recording" ? stop : begin}
            disabled={phase === "starting" || phase === "processing"}
            aria-label={phase === "recording" ? "Stop recording" : "Start speaking"}
          >
            {phase === "recording" ? <Square size={compact ? 20 : 26} fill="currentColor" /> : phase === "processing" || phase === "starting" ? <span className="spinner" style={{ borderTopColor: "#fff" }} /> : <Mic size={compact ? 24 : 34} />}
          </button>
          <canvas ref={canvas} className="waveform" aria-hidden="true" style={compact ? { height: 32 } : undefined} />
          <div className={`live-transcript ${phase === "recording" ? "interim" : ""}`} aria-live="polite">
            {interim}
          </div>
          <div className="rec-status" role="status">
            {phase === "recording" ? (
              <span className="rec-timer">
                Listening · {mm}:{ss}
              </span>
            ) : phase === "processing" ? (
              "Checking what we heard…"
            ) : phase === "starting" ? (
              "Starting the microphone…"
            ) : error ? (
              <span style={{ color: "var(--danger-text)" }}>{error}</span>
            ) : (
              <>Tap the microphone and speak{stt ? "" : " — then compare with the model"}</>
            )}
          </div>
          {onTypeInstead && phase !== "recording" && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onTypeInstead}>
              <Keyboard size={16} /> Can't speak right now? Type instead
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function PlayRecording({ url }: { url: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  return (
    <span className="row" style={{ gap: 8 }}>
      <button
        type="button"
        className={`audio-btn ${playing ? "playing" : ""}`}
        style={{ background: playing ? "var(--accent)" : "var(--accent-soft)", color: playing ? "#fff" : "var(--accent-text)" }}
        aria-label="Play your recording"
        onClick={() => {
          audio.current ??= new Audio(url);
          audio.current.onended = () => setPlaying(false);
          if (playing) {
            audio.current.pause();
            audio.current.currentTime = 0;
            setPlaying(false);
          } else {
            audio.current.play();
            setPlaying(true);
          }
        }}
      >
        <Play size={20} />
      </button>
      <span className="small muted">You</span>
    </span>
  );
}

export function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={onClick}>
      <RotateCcw size={16} /> Try again
    </button>
  );
}
