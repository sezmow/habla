import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CircleAlert, TrendingDown, TrendingUp, Minus, Play } from "lucide-react";
import { useLearner, useNow } from "../state/store";
import { mistakePatterns } from "../engine/mistakes";
import { CONCEPTS } from "../content";
import { PageHead } from "../components/AppShell";
import { EmptyState } from "../components/ui";

export default function Mistakes() {
  const learner = useLearner()!;
  const now = useNow();
  const navigate = useNavigate();
  const patterns = mistakePatterns(learner.mistakes, now);

  return (
    <div className="page page-narrow">
      <Link to="/review" className="btn btn-ghost btn-sm" style={{ marginLeft: -10 }}>
        <ArrowLeft size={16} /> Review
      </Link>
      <PageHead title="Your mistakes" subtitle="Habla groups your errors into patterns. When one keeps coming back, your sessions add targeted practice with new sentences — never the same question twice." />
      {patterns.length ? (
        <div className="stack" style={{ "--gap": "14px" } as React.CSSProperties}>
          {patterns.map((p) => {
            const concept = p.info.concept ? CONCEPTS[p.info.concept] : null;
            const TrendIcon = p.trend === "improving" ? TrendingDown : p.trend === "rising" ? TrendingUp : Minus;
            return (
              <div key={p.category} className="card mistake-card">
                <div className="row-between" style={{ alignItems: "flex-start", gap: 12 }}>
                  <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                    <span className="icon-tile warning">
                      <CircleAlert size={20} />
                    </span>
                    <div>
                      <div style={{ fontSize: "1.05rem" }}>
                        {p.info.lead} <strong>{p.info.focus}</strong>
                      </div>
                      <div className="small muted">{p.info.tip}</div>
                    </div>
                  </div>
                  <span className={`chip ${p.trend === "improving" ? "success" : p.trend === "rising" ? "danger" : ""}`}>
                    <TrendIcon size={13} /> {p.trend === "improving" ? "Improving" : p.trend === "rising" ? "More often lately" : "Steady"}
                  </span>
                </div>
                <ul className="mistake-examples" style={{ marginTop: 14 }}>
                  {p.examples.map((e) => (
                    <li key={e.id}>
                      <span className="es strike">{e.given}</span> → <span className="es">{e.expected}</span>
                    </li>
                  ))}
                </ul>
                <div className="row-between wrap" style={{ marginTop: 14, gap: 10 }}>
                  <span className="small faint num">
                    {p.recent} this week · {p.total} total
                  </span>
                  <div className="row" style={{ gap: 8 }}>
                    {concept && (
                      <Link to={`/practice/grammar/${concept.id}`} className="btn btn-ghost btn-sm">
                        How it works
                      </Link>
                    )}
                    <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/session/drill/${p.category}`)}>
                      <Play size={14} fill="currentColor" /> Practice this
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<CircleAlert size={22} />} title="No patterns yet">
          As you answer in Spanish, Habla notices recurring mistakes — like mixing up ser and estar — and builds practice around them.
        </EmptyState>
      )}
    </div>
  );
}
