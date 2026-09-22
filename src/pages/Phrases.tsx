import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Play } from "lucide-react";
import { PHRASE_BANK } from "../content";
import { useLearner, actions } from "../state/store";
import { masteryLevel } from "../engine/memory";
import { PageHead } from "../components/AppShell";
import { AudioButton } from "../components/audio";
import { MasteryChip } from "../components/VocabularyCard";

const CATEGORIES = [
  { id: "survival", title: "Survival", sub: "Keep any conversation alive — even when you're lost" },
  { id: "conversation", title: "Conversation", sub: "Sound natural and buy time to think" },
  { id: "reactions", title: "Reactions", sub: "Respond like you're really listening" },
  { id: "polite", title: "Politeness", sub: "Small words that open doors" },
] as const;

export default function Phrases() {
  const learner = useLearner()!;
  const navigate = useNavigate();
  const notStarted = PHRASE_BANK.filter((p) => !learner.memory[p.id]?.exposureCount).map((p) => p.id);
  const started = PHRASE_BANK.length - notStarted.length;

  return (
    <div className="page page-narrow">
      <Link to="/practice" className="btn btn-ghost btn-sm" style={{ marginLeft: -10 }}>
        <ArrowLeft size={16} /> Practice
      </Link>
      <PageHead
        title="Phrase bank"
        subtitle="Phrases you should be able to say without translating. They work in every guided conversation — try “¿Puedes repetirlo?” when you're lost."
        actions={
          <button
            className="btn btn-primary"
            onClick={() => {
              if (notStarted.length) actions.introduce(notStarted.slice(0, 6));
              navigate("/session/review/recent");
            }}
          >
            <Play size={16} fill="currentColor" /> {notStarted.length ? `Learn ${Math.min(6, notStarted.length)} new phrases` : "Practice phrases"}
          </button>
        }
      />
      <p className="small muted" style={{ marginBottom: 20 }}>
        {started} of {PHRASE_BANK.length} phrases started
      </p>
      <div className="stack" style={{ "--gap": "28px" } as React.CSSProperties}>
        {CATEGORIES.map((c) => (
          <section key={c.id}>
            <div className="section-head">
              <div>
                <h2>{c.title}</h2>
                <p className="small muted">{c.sub}</p>
              </div>
            </div>
            <div className="card" style={{ padding: 6 }}>
              <div className="list padded">
                {PHRASE_BANK.filter((p) => p.category === c.id).map((p) => (
                  <div key={p.id} className="list-row">
                    <AudioButton text={p.es.replace(/_+/g, "…")} size="sm" />
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="es" style={{ fontSize: "1.15rem", fontWeight: 600 }}>{p.es}</span>
                      <span className="small muted" style={{ display: "block" }}>
                        {p.en} — {p.when}
                      </span>
                    </span>
                    {p.region && <span className="chip warning hide-mobile">{p.region}</span>}
                    {learner.memory[p.id]?.exposureCount ? <MasteryChip level={masteryLevel(learner.memory[p.id])} /> : <span className="chip outline">Not started</span>}
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
