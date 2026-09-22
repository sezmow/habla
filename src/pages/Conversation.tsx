import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { X, Info, Sparkles, RotateCcw, Target } from "lucide-react";
import { SCENARIO_MAP, VOCAB } from "../content";
import { useLearner, actions, getLearner } from "../state/store";
import { aiStatus, type AiStatus } from "../services/ai";
import { conversationDifficulty, scoreConversation, structuresUsed, wordsUsed } from "../engine/conversation";
import { ConversationInterface, GoalList, type ConversationResult } from "../components/ConversationInterface";
import { SkillMeter } from "../components/ui";
import type { ConversationRecord, ConversationScores } from "../engine/types";

const TOPICS: Record<string, { label: string; en: string }> = {
  weekend: { label: "Tu fin de semana", en: "your weekend" },
  family: { label: "Tu familia", en: "your family" },
  food: { label: "La comida", en: "food" },
  plans: { label: "Tus planes", en: "your plans" },
  day: { label: "Tu día", en: "your day" },
  open: { label: "Libre", en: "anything you like" },
};

const STRUCTURE_DRILL: Record<string, string> = {
  "past tense": "preterite",
  "going to (ir a)": "ir-a",
  gustar: "gustar",
  "tener que": "tener-que",
  "giving opinions": "opinions",
  estar: "ser-estar",
};

export default function Conversation() {
  const { scenario: scenarioId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const learner = useLearner()!;
  const scenario = scenarioId && scenarioId !== "free" ? SCENARIO_MAP[scenarioId] ?? null : null;
  const topic = TOPICS[params.get("topic") ?? "open"];
  const wantsAi = scenarioId === "free" || params.get("mode") === "ai";
  const [ai, setAi] = useState<AiStatus | null>(wantsAi ? null : { available: false });
  const [goals, setGoals] = useState<string[]>([]);
  const [result, setResult] = useState<ConversationResult | null>(null);
  const [started] = useState(() => Date.now());
  const onGoals = useCallback((g: string[]) => setGoals(g), []);

  useEffect(() => {
    if (wantsAi) aiStatus(true).then(setAi);
  }, [wantsAi]);

  if (!scenario && scenarioId !== "free") {
    navigate("/speak", { replace: true });
    return null;
  }

  const mode: "guided" | "ai" = wantsAi ? "ai" : "guided";
  const title = scenario ? scenario.title : `Free conversation: ${topic.en}`;

  return (
    <div className="conv-page">
      <header className="conv-top">
        <button className="icon-btn" aria-label="Leave conversation" onClick={() => navigate("/speak")}>
          <X size={22} />
        </button>
        <div className="grow" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{title}</div>
          <div className="tiny faint">
            {mode === "guided" ? `Guided roleplay with ${scenario!.partner} · replies matched to key phrases, on your device` : `AI conversation partner · difficulty ${conversationDifficulty(learner, Date.now()).toFixed(1)}`}
          </div>
        </div>
        {scenario && !result && (
          <span className="chip primary num">
            <Target size={13} /> {goals.length}/{scenario.goals.length}
          </span>
        )}
      </header>

      {result ? (
        <ConversationReview result={result} mode={mode} scenarioId={scenario?.id ?? null} title={title} started={started} goalsTotal={scenario?.goals.length ?? 0} onAgain={() => window.location.reload()} />
      ) : mode === "ai" && ai && !ai.available ? (
        <div className="conv-body">
          <div className="card card-lg" style={{ maxWidth: 520, margin: "10vh auto" }}>
            <div className="row" style={{ gap: 10, marginBottom: 10 }}>
              <Info size={20} />
              <h2>The AI partner isn't connected</h2>
            </div>
            <p className="muted">{ai.reason} Free conversation runs through Habla's conversation server with an Anthropic API key — see the README for the one-line setup.</p>
            <div className="row wrap" style={{ marginTop: 18 }}>
              <button className="btn btn-primary" onClick={() => navigate("/speak#roleplays")}>
                Try a guided roleplay
              </button>
            </div>
          </div>
        </div>
      ) : mode === "ai" && !ai ? (
        <div className="conv-body" style={{ display: "grid", placeItems: "center" }}>
          <span className="spinner" />
        </div>
      ) : (
        <div className="conv-body">
          <div className="conv-layout">
            {scenario && (
              <aside className="conv-side">
                <div className="card card-flat">
                  <div className="scenario-emoji" aria-hidden="true" style={{ marginBottom: 8 }}>{scenario.emoji}</div>
                  <div style={{ fontWeight: 650, marginTop: 8 }} className="scenario-role">{scenario.setting}</div>
                  <p className="small muted scenario-role" style={{ marginTop: 4 }}>{scenario.role}</p>
                  <div className="eyebrow" style={{ margin: "0 0 8px" }}>Goals</div>
                  <GoalList scenario={scenario} met={goals} />
                  <div className="eyebrow phrase-label" style={{ margin: "16px 0 8px" }}>Useful phrases</div>
                  <ul className="phrase-hints">
                    {scenario.phrases.map((p) => (
                      <li key={p} className="es">{p}</li>
                    ))}
                  </ul>
                </div>
              </aside>
            )}
            <ConversationInterface mode={mode} scenario={scenario} topic={topic} onGoalsChange={onGoals} onFinish={setResult} />
          </div>
        </div>
      )}
    </div>
  );
}

function ConversationReview({ result, mode, scenarioId, title, started, goalsTotal, onAgain }: { result: ConversationResult; mode: "guided" | "ai"; scenarioId: string | null; title: string; started: number; goalsTotal: number; onAgain: () => void }) {
  const navigate = useNavigate();
  const learner = getLearner()!;
  const texts = result.turns.map((t) => t.text);
  const scores: ConversationScores = useMemo(() => scoreConversation(result.turns, result.goalsMet.length, goalsTotal, learner), []); // eslint-disable-line react-hooks/exhaustive-deps
  const used = useMemo(() => wordsUsed(texts, learner), []); // eslint-disable-line react-hooks/exhaustive-deps
  const structures = useMemo(() => structuresUsed(texts), []); // eslint-disable-line react-hooks/exhaustive-deps
  const corrections = result.messages.filter((m) => m.correction);

  useEffect(() => {
    const rec: ConversationRecord = {
      id: `conv-${started}`,
      at: Date.now(),
      scenarioId,
      title,
      turns: result.turns.length,
      goalsMet: result.goalsMet.length,
      goalsTotal,
      wordsUsed: used,
      practiced: structures,
      scores,
      mode,
    };
    actions.conversation(rec, result.speakingSeconds, Math.min(1800, (Date.now() - started) / 1000));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const understood = result.turns.filter((t) => t.understood).length;
  const practice = structures.filter((s) => STRUCTURE_DRILL[s]).slice(0, 2);

  return (
    <div className="conv-body">
      <div className="stack enter" style={{ "--gap": "20px", maxWidth: 640, margin: "0 auto", padding: "24px 0 48px" } as React.CSSProperties}>
        <h1>Conversation review</h1>
        <p className="muted">
          You took {result.turns.length} turns and were understood {understood} {understood === 1 ? "time" : "times"}.
          {goalsTotal > 0 && ` You completed ${result.goalsMet.length} of ${goalsTotal} goals.`}
        </p>

        {used.length > 0 && (
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 10 }}>You used</div>
            <div className="row wrap" style={{ gap: 8 }}>
              {used.slice(0, 16).map((id) => (
                <span key={id} className="chip primary es" style={{ fontSize: "0.9rem" }}>{VOCAB[id].es}</span>
              ))}
            </div>
          </div>
        )}

        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 14 }}>How it went</div>
          <div className="stack" style={{ "--gap": "12px" } as React.CSSProperties}>
            <SkillMeter label="Understanding" value={scores.comprehension} />
            <SkillMeter label="Relevance" value={scores.relevance} />
            <SkillMeter label="Vocabulary" value={scores.vocabulary} />
            <SkillMeter label="Grammar" value={scores.grammar} />
            <SkillMeter label="Fluency" value={scores.fluency} tone="accent" />
            <SkillMeter label="Pronunciation" value={scores.pronunciation} tone="accent" />
            <SkillMeter label="Kept it going" value={scores.continuation} tone="success" />
          </div>
          {(scores.fluency == null || scores.pronunciation == null) && <p className="tiny faint" style={{ marginTop: 10 }}>Fluency and pronunciation are measured when you speak your replies.</p>}
          <p className="small muted" style={{ marginTop: 12 }}>Communicating successfully matters more than perfect grammar — imperfect sentences that get your meaning across still count.</p>
        </div>

        {corrections.length > 0 && (
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 10 }}>More natural ways to say it</div>
            <ul className="mistake-examples">
              {corrections.map((m) => (
                <li key={m.id}>
                  <span className="es strike">{m.es}</span> → <span className="es">{m.correction!.corrected}</span>
                  <div className="tiny muted">{m.correction!.explanation}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.newWords.length > 0 && (
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 10 }}>New words you heard</div>
            <div className="row wrap" style={{ gap: 8 }}>
              {result.newWords.slice(0, 8).map((w) => (
                <span key={w.es} className="chip">
                  <span className="es">{w.es}</span> · {w.en}
                </span>
              ))}
            </div>
          </div>
        )}

        {practice.length > 0 && (
          <div className="card card-flat">
            <div className="row" style={{ gap: 8, marginBottom: 10 }}>
              <Sparkles size={16} color="var(--primary)" />
              <strong>Practice next</strong>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              {practice.map((s) => (
                <button key={s} className="btn btn-secondary btn-sm" onClick={() => navigate(`/session/drill/${STRUCTURE_DRILL[s]}`)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="row wrap" style={{ justifyContent: "flex-end", gap: 10 }}>
          <button className="btn btn-ghost" onClick={onAgain}>
            <RotateCcw size={16} /> Try again
          </button>
          <button className="btn btn-primary btn-lg" onClick={() => navigate("/speak")}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
