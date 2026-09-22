import { Link, useNavigate } from "react-router-dom";
import { Headphones, PenLine, AudioLines, BookText, MessageSquareQuote, Shapes, CircleAlert, Mic, ChevronRight } from "lucide-react";
import { useLearner } from "../state/store";
import { LISTENING, PRONUNCIATION, PHRASE_BANK, CONCEPTS, VOCAB } from "../content";
import { PageHead } from "../components/AppShell";
import { textCoverage } from "../engine/coverage";
import { mistakePatterns } from "../engine/mistakes";

export default function Practice() {
  const learner = useLearner()!;
  const navigate = useNavigate();
  const words = Object.values(learner.memory).filter((m) => m.kind === "vocab" && VOCAB[m.id]?.drill && m.exposureCount > 0).length;
  const phrasesStarted = PHRASE_BANK.filter((p) => learner.memory[p.id]?.exposureCount).length;
  const patterns = mistakePatterns(learner.mistakes, Date.now()).length;

  const tools = [
    { to: "/practice/listening", icon: <Headphones size={20} />, title: "Listening", sub: `${LISTENING.length} stories and dialogues at three speeds`, tone: "" },
    { to: "/session/review/listening", icon: <PenLine size={20} />, title: "Dictation", sub: "Hear a sentence, type exactly what was said", tone: "" },
    { to: "/practice/pronunciation", icon: <AudioLines size={20} />, title: "Pronunciation", sub: `${PRONUNCIATION.length} sounds: r/rr, j, ñ, vowels and more`, tone: "accent" },
    { to: "/practice/vocabulary", icon: <BookText size={20} />, title: "Vocabulary", sub: `${words} words in memory — see what you can really use`, tone: "" },
    { to: "/practice/phrases", icon: <MessageSquareQuote size={20} />, title: "Phrase bank", sub: `${phrasesStarted}/${PHRASE_BANK.length} phrases that should become automatic`, tone: "" },
    { to: "/practice/grammar", icon: <Shapes size={20} />, title: "Grammar patterns", sub: `${Object.keys(CONCEPTS).length} short, example-first explanations`, tone: "" },
    { to: "/review/mistakes", icon: <CircleAlert size={20} />, title: "Your mistakes", sub: patterns ? `${patterns} patterns tracked, with targeted practice` : "Patterns appear here as you practice", tone: "warning" },
    { to: "/speak", icon: <Mic size={20} />, title: "Speaking & conversation", sub: "Roleplays and free conversation", tone: "accent" },
  ];

  const recommended = LISTENING.map((p) => ({ p, cov: textCoverage(p.lines.map((l) => l.es).join(" "), learner) }))
    .filter((x) => x.cov.pct >= 0.8 && !learner.listened[x.p.id])
    .sort((a, b) => Math.abs(0.94 - a.cov.pct) - Math.abs(0.94 - b.cov.pct))
    .slice(0, 3);

  return (
    <div className="page">
      <PageHead title="Practice" subtitle="Focused practice outside your daily session. Everything here feeds the same memory model." />
      <div className="grid-auto">
        {tools.map((t) => (
          <Link key={t.to} to={t.to} className="card card-link tool-card">
            <span className={`icon-tile ${t.tone}`}>{t.icon}</span>
            <div className="grow">
              <div className="card-title">{t.title}</div>
              <div className="card-sub">{t.sub}</div>
            </div>
            <ChevronRight size={18} className="faint" />
          </Link>
        ))}
      </div>

      {recommended.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Recommended listening</h2>
            <Link to="/practice/listening" className="small">
              Library
            </Link>
          </div>
          <div className="grid-3">
            {recommended.map(({ p, cov }) => (
              <button key={p.id} className="card card-link" style={{ textAlign: "left" }} onClick={() => navigate(`/practice/listening/${p.id}`)}>
                <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                  <span className="chip">{p.kind}</span>
                  <span className="chip outline">{p.speed}</span>
                </div>
                <div className="es" style={{ fontSize: "1.2rem", fontWeight: 600 }}>{p.title}</div>
                <div className="small muted">{p.summary}</div>
                <div className="small" style={{ marginTop: 10 }}>
                  You know <strong>{Math.round(cov.pct * 100)}%</strong> of the words
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
