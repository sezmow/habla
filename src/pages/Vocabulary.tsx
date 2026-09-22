import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Search, BookText } from "lucide-react";
import { VOCAB, LESSON_ORDER, lessonPosition } from "../content";
import { useLearner } from "../state/store";
import { masteryLevel, MASTERY_ORDER, type MasteryLevel } from "../engine/memory";
import { fold } from "../engine/text";
import { dimensionAverages } from "../engine/progress";
import { PageHead } from "../components/AppShell";
import { Modal, Tabs, EmptyState, pct } from "../components/ui";
import { VocabularyCard, MasteryChip } from "../components/VocabularyCard";

type Filter = "all" | MasteryLevel;

export default function Vocabulary() {
  const learner = useLearner()!;
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);

  const words = useMemo(
    () =>
      Object.values(VOCAB)
        .filter((v) => v.drill && learner.memory[v.id]?.exposureCount)
        .map((v) => ({ v, m: learner.memory[v.id], level: masteryLevel(learner.memory[v.id]) }))
        .sort((a, b) => lessonPosition(a.v.lessonId) - lessonPosition(b.v.lessonId)),
    [learner],
  );
  const counts = Object.fromEntries(MASTERY_ORDER.map((l) => [l, words.filter((w) => w.level === l).length])) as Record<MasteryLevel, number>;
  const shown = words.filter((w) => (filter === "all" || w.level === filter) && (!q || fold(w.v.es).includes(fold(q)) || fold(w.v.en).includes(fold(q))));
  const dims = dimensionAverages(learner);
  const rec = dims.find((d) => d.skill === "recognition")?.value ?? null;
  const prod = dims.find((d) => d.skill === "production")?.value ?? null;

  return (
    <div className="page">
      <Link to="/practice" className="btn btn-ghost btn-sm" style={{ marginLeft: -10 }}>
        <ArrowLeft size={16} /> Practice
      </Link>
      <PageHead title="Vocabulary" subtitle={`${words.length} words and phrases in your memory, taught in ${LESSON_ORDER.length} lessons.`} />

      {rec != null && prod != null && (
        <div className="card gap-card" style={{ marginBottom: 20 }}>
          <div className="gap-stat">
            <span className="stat-label">Recognition</span>
            <span className="gap-value num">{pct(rec)}</span>
            <span className="small muted">You know it when you see it</span>
          </div>
          <div className="gap-stat">
            <span className="stat-label">Production</span>
            <span className="gap-value num accent">{pct(prod)}</span>
            <span className="small muted">You can produce it yourself</span>
          </div>
          <p className="small muted gap-note">Habla counts a word as yours when you can produce it, hear it and say it — not just recognize it. Reviews focus on closing this gap.</p>
        </div>
      )}

      <div className="row wrap" style={{ gap: 12, marginBottom: 12 }}>
        <label className="search">
          <Search size={17} />
          <input className="input" placeholder="Search Spanish or English" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search vocabulary" />
        </label>
      </div>
      <Tabs
        label="Filter by mastery"
        value={filter}
        onChange={setFilter}
        tabs={[{ value: "all" as Filter, label: "All", count: words.length }, ...MASTERY_ORDER.filter((l) => l !== "new").map((l) => ({ value: l as Filter, label: l[0].toUpperCase() + l.slice(1), count: counts[l] }))]}
      />

      {shown.length ? (
        <div className="card" style={{ padding: 6, marginTop: 16 }}>
          <div className="list padded">
            {shown.slice(0, 300).map(({ v, m, level }) => (
              <button key={v.id} className="list-row vocab-row" onClick={() => setOpen(v.id)}>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="es" style={{ fontSize: "1.1rem", fontWeight: 600 }}>{v.es}</span>
                  <span className="small muted" style={{ display: "block" }}>{v.en}</span>
                </span>
                <span className="mini-dims hide-mobile" aria-label="Recognition, recall, production, listening, speaking">
                  {(["recognition", "recall", "production", "listening", "speaking"] as const).map((k) => (
                    <span key={k} title={`${k}: ${pct(m.scores[k])}`} className={k === "speaking" ? "accent" : ""}>
                      <i style={{ height: `${Math.round((m.scores[k] ?? 0) * 100)}%` }} />
                    </span>
                  ))}
                </span>
                <MasteryChip level={level} />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState icon={<BookText size={22} />} title={words.length ? "No words match" : "No words yet"}>
          {words.length ? "Try a different search or filter." : "Words appear here as soon as you meet them in a lesson."}
        </EmptyState>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title="Word details" wide>
        {open && <VocabularyCard id={open} learner={learner} onClose={() => setOpen(null)} />}
      </Modal>
    </div>
  );
}
