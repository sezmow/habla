import type { LearnerState } from "../engine/types";
import { SENTENCES, VOCAB, personalize } from "../content";
import { masteryLevel, retrievability, DAY } from "../engine/memory";
import { MasteryChip } from "./VocabularyCard";
import { AudioButton } from "./audio";

function due(ms: number, now: number) {
  const d = (ms - now) / DAY;
  if (d <= 0) {
    const ago = -d;
    return ago < 1 ? "Due now" : `Due ${Math.round(ago)}d ago`;
  }
  return d < 1 ? `In ${Math.max(1, Math.round(d * 24))}h` : `In ${Math.round(d)}d`;
}

/** One row in a review list: the item, how strong the memory is, and when it's due. */
export function ReviewItem({ id, learner, now, onOpen }: { id: string; learner: LearnerState; now: number; onOpen?: () => void }) {
  const m = learner.memory[id];
  const v = VOCAB[id];
  const s = SENTENCES[id];
  const es = v ? v.es : personalize(s.es, learner.profile.name);
  const en = v ? v.en : s.en;
  const r = m ? retrievability(m, now) : 0;
  const text = (
    <>
      <span className="es" style={{ fontSize: "1.08rem", fontWeight: 600, display: "block" }}>{es}</span>
      <span className="small muted">{en}</span>
    </>
  );
  return (
    <div className="list-row review-row">
      <AudioButton text={es} size="sm" />
      {onOpen ? (
        <button type="button" className="grow row-link" style={{ minWidth: 0 }} onClick={onOpen} aria-label={`${es}: details`}>
          {text}
        </button>
      ) : (
        <span className="grow" style={{ minWidth: 0 }}>{text}</span>
      )}
      <span className="memory-meter hide-mobile" title={`Predicted recall: ${Math.round(r * 100)}%`}>
        <span className="bar thin" style={{ width: 64 }}>
          <span style={{ width: `${Math.round(r * 100)}%`, background: r < 0.7 ? "var(--warning)" : "var(--success)" }} />
        </span>
        <span className="tiny faint num">{m ? due(m.nextReview, now) : ""}</span>
      </span>
      <MasteryChip level={masteryLevel(m)} />
    </div>
  );
}
