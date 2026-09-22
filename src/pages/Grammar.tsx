import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, Play } from "lucide-react";
import { CONCEPTS, LESSONS } from "../content";
import { useLearner } from "../state/store";
import { PageHead } from "../components/AppShell";
import { AudioButton } from "../components/audio";
import { highlight } from "../components/exercises/views";

export default function Grammar() {
  const { id } = useParams();
  const learner = useLearner()!;
  const navigate = useNavigate();
  const concept = id ? CONCEPTS[id] : null;

  if (concept) {
    const learned = concept.lessonId && learner.lessons[concept.lessonId]?.completedAt;
    return (
      <div className="page page-narrow">
        <Link to="/practice/grammar" className="btn btn-ghost btn-sm" style={{ marginLeft: -10 }}>
          <ArrowLeft size={16} /> Grammar
        </Link>
        <PageHead
          title={concept.title}
          subtitle={concept.lessonId ? `Taught in “${LESSONS[concept.lessonId].title}”` : undefined}
          actions={
            concept.drills.length > 0 && (
              <button className="btn btn-primary" onClick={() => navigate(`/session/drill/${concept.id}`)}>
                <Play size={16} fill="currentColor" /> Practice this pattern
              </button>
            )
          }
        />
        <div className="card card-flat" style={{ marginBottom: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Remember</div>
          <p style={{ fontWeight: 600, fontSize: "1.05rem" }}>{concept.remember}</p>
        </div>
        <div className="grammar-card stack" style={{ "--gap": "18px" } as React.CSSProperties}>
          <div className="grammar-examples">
            {concept.examples.map((e) => (
              <div key={e.es} className="grammar-example">
                <AudioButton text={e.es} size="sm" />
                <div>
                  <div className="es">{highlight(e.es, e.highlight)}</div>
                  <div className="small muted">{e.en}</div>
                </div>
              </div>
            ))}
          </div>
          <dl className="grammar-qa">
            <div>
              <dt>What changed?</dt>
              <dd>{concept.whatChanged}</dd>
            </div>
            <div>
              <dt>Why?</dt>
              <dd>{concept.why}</dd>
            </div>
            <div>
              <dt>How do I use it?</dt>
              <dd>{concept.how}</dd>
            </div>
          </dl>
        </div>
        {!learned && concept.lessonId && <p className="small faint" style={{ marginTop: 20 }}>You haven't reached this lesson yet — practice will use sentences you know so far.</p>}
      </div>
    );
  }

  const all = Object.values(CONCEPTS).filter((c) => c.lessonId);
  const learned = all.filter((c) => learner.lessons[c.lessonId!]?.completedAt);
  const upcoming = all.filter((c) => !learner.lessons[c.lessonId!]?.completedAt);
  const Section = ({ title, list }: { title: string; list: typeof all }) =>
    list.length ? (
      <section className="section">
        <div className="section-head">
          <h2>{title}</h2>
        </div>
        <div className="card" style={{ padding: 6 }}>
          <div className="list padded">
            {list.map((c) => (
              <Link key={c.id} to={`/practice/grammar/${c.id}`} className="list-row">
                <span className="grow">
                  <span style={{ fontWeight: 650, display: "block" }}>{c.title}</span>
                  <span className="small muted">{c.remember}</span>
                </span>
                <ChevronRight size={18} className="faint" />
              </Link>
            ))}
          </div>
        </div>
      </section>
    ) : null;

  return (
    <div className="page page-narrow">
      <Link to="/practice" className="btn btn-ghost btn-sm" style={{ marginLeft: -10 }}>
        <ArrowLeft size={16} /> Practice
      </Link>
      <PageHead title="Grammar patterns" subtitle="Short and practical: examples first, then what changed, why, and how to use it." />
      <Section title="Patterns you've met" list={learned} />
      <Section title="Coming up" list={upcoming} />
    </div>
  );
}
