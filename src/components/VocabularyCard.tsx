// Everything Habla knows about one word — including the gap between
// recognizing it and being able to use it.

import { Check, Circle, X } from "lucide-react";
import type { LearnerState } from "../engine/types";
import { VOCAB, SENTENCES_BY_VOCAB, SENTENCES, LESSONS, personalize } from "../content";
import { MASTERY_LABEL, masteryEvidence, masteryLevel, memoryStrength, DAY } from "../engine/memory";
import { AudioButton } from "./audio";
import { SkillMeter } from "./ui";
import { SpanishText } from "./SpanishText";

export function MasteryChip({ level }: { level: ReturnType<typeof masteryLevel> }) {
  const tone = level === "mastered" ? "success" : level === "strong" ? "primary" : level === "familiar" ? "" : level === "learning" ? "warning" : "outline";
  return <span className={`chip ${tone}`}>{MASTERY_LABEL[level]}</span>;
}

function when(ms: number, now: number) {
  const d = (ms - now) / DAY;
  if (d <= 0) return "Due now";
  if (d < 1 / 24) return `In ${Math.max(1, Math.round(d * 1440))} min`;
  if (d < 1) return `In ${Math.round(d * 24)} h`;
  return `In ${Math.round(d)} ${Math.round(d) === 1 ? "day" : "days"}`;
}

export function VocabularyCard({ id, learner, onClose }: { id: string; learner: LearnerState; onClose?: () => void }) {
  const v = VOCAB[id];
  const m = learner.memory[id];
  const now = Date.now();
  const level = masteryLevel(m);
  const examples = (SENTENCES_BY_VOCAB[id] ?? []).slice(0, 4).map((sid) => SENTENCES[sid]);
  const sentenceIds = new Set(SENTENCES_BY_VOCAB[id] ?? []);
  const errors = learner.mistakes.filter((x) => x.itemId === id || (x.itemId && sentenceIds.has(x.itemId))).slice(-4).reverse();
  const dims: [string, number | null | undefined][] = [
    ["Recognition", m?.scores.recognition ?? m?.scores.comprehension],
    ["Recall", m?.scores.recall],
    ["Production", m?.scores.production],
    ["Listening", m?.scores.listening],
    ["Speaking", m?.scores.speaking],
  ];

  return (
    <div className="stack" style={{ "--gap": "20px" } as React.CSSProperties}>
      <div className="row-between" style={{ alignItems: "flex-start" }}>
        <div className="row" style={{ gap: 14 }}>
          <AudioButton text={v.es} />
          <div>
            <div className="es" style={{ fontSize: "1.8rem", fontWeight: 600, lineHeight: 1.1 }}>{v.es}</div>
            <div className="muted">{v.en}</div>
          </div>
        </div>
        {onClose && (
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        )}
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <MasteryChip level={level} />
        <span className="chip outline syllables">{v.syllables}</span>
        <span className="chip outline">{v.pos}</span>
        {v.gender && v.gender !== "mf" && <span className="chip outline">{v.gender === "f" ? "feminine" : "masculine"}</span>}
        {v.region && <span className="chip warning">{v.region}</span>}
        {v.lessonId !== "phrases" && LESSONS[v.lessonId] && <span className="chip">From “{LESSONS[v.lessonId].title}”</span>}
      </div>
      {v.defEs && (
        <p className="es card card-flat" style={{ fontStyle: "italic" }}>
          {v.es.replace(/^(el|la|los|las) /, "")} = {v.defEs}
        </p>
      )}

      {m ? (
        <>
          <div>
            <div className="eyebrow" style={{ marginBottom: 12 }}>What you can do with it</div>
            <div className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
              {dims.map(([label, val]) => (
                <SkillMeter key={label} label={label} value={val ?? null} tone={label === "Speaking" ? "accent" : undefined} />
              ))}
            </div>
          </div>
          <div className="grid-2" style={{ gap: 10 }}>
            <div className="stat">
              <span className="stat-label">Memory strength</span>
              <span className="stat-value num">{Math.round(memoryStrength(m, now) * 100)}%</span>
            </div>
            <div className="stat">
              <span className="stat-label">Next review</span>
              <span className="stat-value">{when(m.nextReview, now)}</span>
            </div>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Mastery needs evidence</div>
            <ul className="evidence">
              {masteryEvidence(m).map((e) => (
                <li key={e.label} className={e.met ? "met" : ""}>
                  {e.met ? <Check size={15} strokeWidth={3} /> : <Circle size={15} />}
                  {e.label}
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <p className="muted small">You haven't met this word yet. It's introduced in “{LESSONS[v.lessonId]?.title ?? "the phrase bank"}.”</p>
      )}

      {examples.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>In context</div>
          <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
            {examples.map((s) => (
              <div key={s.id} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                <AudioButton text={personalize(s.es, learner.profile.name)} size="sm" />
                <div>
                  <SpanishText text={personalize(s.es, learner.profile.name)} />
                  <div className="small muted">{s.en}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Your mistakes with it</div>
          <ul className="mistake-examples">
            {errors.map((e) => (
              <li key={e.id}>
                <span className="es strike">{e.given}</span> → <span className="es">{e.expected}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
