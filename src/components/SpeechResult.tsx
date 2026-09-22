import { Check, Triangle, CircleAlert, Sparkles, ArrowRight } from "lucide-react";
import type { TokenDiff } from "../engine/answer";
import { AudioButton } from "./audio";
import { PlayRecording, RetryButton, type SpeechOutcome } from "./SpeakingRecorder";

export function Diff({ diff }: { diff: TokenDiff[] }) {
  return (
    <span className="diff" lang="es">
      {diff.map((d, i) => (
        <span key={i}>
          {i > 0 && " "}
          <span className={d.status} title={d.status === "missing" ? "Missing" : d.status === "wrong" ? `Expected “${d.expected}”` : d.status === "accent" ? "Accent" : undefined}>
            {d.status === "accent" || d.status === "typo" ? d.expected : d.word}
          </span>
        </span>
      ))}
    </span>
  );
}

function CheckChip({ label, level }: { label: string; level: "good" | "okay" | "work" }) {
  const Icon = level === "good" ? Check : level === "okay" ? Triangle : CircleAlert;
  const word = level === "good" ? "" : level === "okay" ? " — nearly" : " — practice";
  return (
    <span className={`check ${level === "good" ? "" : level}`}>
      <Icon size={14} strokeWidth={2.6} aria-hidden="true" />
      {label}
      <span className="sr-only">{level === "good" ? " good" : word}</span>
      {level !== "good" && <span aria-hidden="true" style={{ fontWeight: 550 }}>{word}</span>}
    </span>
  );
}

/** "You said… / ✓ Vocabulary ✓ Grammar △ Pronunciation / coaching." */
export function SpeechResult({ outcome, sample, sampleEn, onRetry }: { outcome: SpeechOutcome; sample?: string; sampleEn?: string; onRetry?: () => void }) {
  const e = outcome.evaluation;
  return (
    <div className="speech-result" aria-live="polite">
      {e.transcript ? (
        <div>
          <div className="eyebrow">You said</div>
          <p className="es" style={{ fontSize: "1.3rem", marginTop: 4 }}>
            {e.diff.length ? <Diff diff={e.diff.filter((d) => d.status !== "missing")} /> : `“${e.transcript}”`}
          </p>
        </div>
      ) : (
        outcome.selfAssessed && <div className="eyebrow">Self-assessed attempt</div>
      )}
      <div className="checks">
        <CheckChip label="Vocabulary" level={e.checks.vocabulary ? "good" : "work"} />
        <CheckChip label="Grammar" level={e.checks.grammar ? "good" : "okay"} />
        <CheckChip label="Pronunciation" level={e.checks.pronunciation} />
      </div>
      {e.feedback.length > 0 && (
        <ul className="coach-lines">
          {e.feedback.map((f, i) => (
            <li key={i}>
              {f.tone === "good" ? <Sparkles size={16} color="var(--success)" /> : <ArrowRight size={16} color="var(--accent)" />}
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
      )}
      {sample && (
        <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
          <AudioButton text={sample} size="sm" />
          <div>
            <div className="eyebrow">{e.passed ? "Another natural way" : "One way to say it"}</div>
            <div className="es" style={{ fontSize: "1.1rem" }}>{sample}</div>
            {sampleEn && <div className="small muted">{sampleEn}</div>}
          </div>
        </div>
      )}
      <div className="row wrap" style={{ gap: 10 }}>
        {outcome.recordingUrl && <PlayRecording url={outcome.recordingUrl} />}
        {onRetry && <RetryButton onClick={onRetry} />}
      </div>
      {!outcome.selfAssessed && e.transcript && (
        <p className="tiny faint">Pronunciation is judged by whether each word was understood — accents are welcome.</p>
      )}
    </div>
  );
}
