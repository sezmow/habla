import { Link } from "react-router-dom";
import { LineChart, Settings, CircleAlert, BookText, ChevronRight, MessageSquareQuote } from "lucide-react";
import { useLearner, useNow } from "../state/store";
import { cefrEstimate, learningStats } from "../engine/progress";
import { WeekStrip } from "../components/WeekStrip";

export default function Profile() {
  const learner = useLearner()!;
  const now = useNow();
  const cefr = cefrEstimate(learner, now);
  const stats = learningStats(learner, now);
  const since = new Date(learner.profile.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const links = [
    { to: "/progress", icon: <LineChart size={19} />, label: "Progress", sub: "Skill profile, level estimate, practice time" },
    { to: "/review/mistakes", icon: <CircleAlert size={19} />, label: "Your mistakes", sub: "Patterns and targeted practice" },
    { to: "/practice/vocabulary", icon: <BookText size={19} />, label: "Vocabulary", sub: `${stats.wordsLearned} words in memory` },
    { to: "/practice/phrases", icon: <MessageSquareQuote size={19} />, label: "Phrase bank", sub: "Phrases to make automatic" },
    { to: "/settings", icon: <Settings size={19} />, label: "Settings", sub: "Goal, audio, speaking, privacy, data" },
  ];
  return (
    <div className="page page-narrow">
      <div className="profile-head">
        <span className="avatar" style={{ width: 64, height: 64, fontSize: "1.6rem" }}>
          {(learner.profile.name || "?")[0].toUpperCase()}
        </span>
        <div>
          <h1>{learner.profile.name}</h1>
          <p className="muted small">
            Learning since {since} · around {cefr.band}
            {learner.demo && " · demo learner"}
          </p>
        </div>
      </div>
      <div className="grid-3" style={{ margin: "20px 0" }}>
        <div className="stat">
          <span className="stat-label">Words retained</span>
          <span className="stat-value num">{stats.wordsRetained}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Minutes spoken</span>
          <span className="stat-value num">{stats.minutesSpoken}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Conversations</span>
          <span className="stat-value num">{stats.conversations}</span>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 20 }}>
        <WeekStrip />
      </div>
      <div className="card" style={{ padding: 6 }}>
        <div className="list padded">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="list-row">
              <span className="icon-tile neutral" style={{ width: 36, height: 36 }}>{l.icon}</span>
              <span className="grow">
                <span style={{ fontWeight: 650, display: "block" }}>{l.label}</span>
                <span className="small muted">{l.sub}</span>
              </span>
              <ChevronRight size={18} className="faint" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
