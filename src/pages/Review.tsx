import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Play, RotateCcw, CircleAlert, ChevronRight } from "lucide-react";
import { useLearner, useNow } from "../state/store";
import { reviewCandidates, REVIEW_TITLES, type ReviewFocus } from "../engine/session";
import { mistakePatterns } from "../engine/mistakes";
import { PageHead } from "../components/AppShell";
import { Tabs, EmptyState, Modal } from "../components/ui";
import { ReviewItem } from "../components/ReviewItem";
import { VocabularyCard } from "../components/VocabularyCard";

const FOCUS_COPY: Record<ReviewFocus, string> = {
  due: "Items the scheduler predicts you're about to forget. Reviewing them now is the most efficient thing you can do.",
  struggling: "Items you've missed more than once. They come back more often, in different sentences and formats.",
  recent: "Things you learned in the last three days — the most fragile memories.",
  speaking: "Things you understand but haven't said out loud well yet.",
  listening: "Things you can read but haven't caught by ear yet.",
};

export default function Review() {
  const learner = useLearner()!;
  const now = useNow();
  const navigate = useNavigate();
  const [tab, setTab] = useState<ReviewFocus>("due");
  const [open, setOpen] = useState<string | null>(null);
  const lists = useMemo(() => Object.fromEntries((["due", "struggling", "recent", "speaking", "listening"] as ReviewFocus[]).map((f) => [f, reviewCandidates(learner, now, f)])) as Record<ReviewFocus, string[]>, [learner, now]);
  const patterns = mistakePatterns(learner.mistakes, now);
  const items = lists[tab];

  return (
    <div className="page">
      <PageHead
        title="Review"
        subtitle="Spaced repetition decides what comes back and when. Each item has its own memory — and its own schedule."
        actions={
          lists.due.length > 0 && (
            <button className="btn btn-primary" onClick={() => navigate("/session/review/due")}>
              <Play size={16} fill="currentColor" /> Review {Math.min(15, lists.due.length)} now
            </button>
          )
        }
      />
      <Tabs
        label="Review focus"
        value={tab}
        onChange={setTab}
        tabs={(["due", "struggling", "recent", "speaking", "listening"] as ReviewFocus[]).map((f) => ({ value: f, label: REVIEW_TITLES[f], count: lists[f].length }))}
      />
      <div className="row-between wrap" style={{ margin: "18px 0 14px", gap: 12 }}>
        <p className="small muted" style={{ maxWidth: 560 }}>{FOCUS_COPY[tab]}</p>
        {items.length > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/session/review/${tab}`)}>
            <RotateCcw size={15} /> Practice {REVIEW_TITLES[tab].toLowerCase()}
          </button>
        )}
      </div>
      {items.length ? (
        <div className="card" style={{ padding: 6 }}>
          <div className="list padded">
            {items.slice(0, 60).map((id) => (
              <ReviewItem key={id} id={id} learner={learner} now={now} onOpen={id.startsWith("v:") ? () => setOpen(id) : undefined} />
            ))}
          </div>
          {items.length > 60 && <p className="small faint" style={{ padding: 14 }}>And {items.length - 60} more.</p>}
        </div>
      ) : (
        <EmptyState icon={<RotateCcw size={22} />} title={tab === "due" ? "All caught up" : "Nothing here right now"}>
          {tab === "due" ? "Nothing is fading at the moment. Items come back as time passes — learning something new is a good use of today." : "Items appear here as you practice."}
        </EmptyState>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Mistakes</h2>
          <Link to="/review/mistakes" className="small">
            All mistakes
          </Link>
        </div>
        {patterns.length ? (
          <div className="card" style={{ padding: 6 }}>
            <div className="list padded">
              {patterns.slice(0, 3).map((p) => (
                <Link key={p.category} to="/review/mistakes" className="list-row">
                  <span className="icon-tile warning" style={{ width: 34, height: 34 }}>
                    <CircleAlert size={17} />
                  </span>
                  <span className="grow">
                    {p.info.lead} <strong>{p.info.focus}</strong>
                    <span className="small faint" style={{ display: "block" }}>
                      {p.recent} this week · {p.total} total
                    </span>
                  </span>
                  <ChevronRight size={18} className="faint" />
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <p className="small muted">No recurring mistakes yet.</p>
        )}
      </section>

      <Modal open={!!open} onClose={() => setOpen(null)} title="Word details" wide>
        {open && <VocabularyCard id={open} learner={learner} onClose={() => setOpen(null)} />}
      </Modal>
    </div>
  );
}
