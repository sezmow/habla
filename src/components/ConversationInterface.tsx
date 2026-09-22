// A conversation that looks and feels like one. Works in two modes:
//  • guided — scripted roleplay matched to key phrases, fully on-device
//  • ai     — an AI partner constrained to the learner's level (server-side)

import { useEffect, useRef, useState } from "react";
import { Mic, Snail, Languages, Check, Circle, Lightbulb, Send, Volume2 } from "lucide-react";
import type { Scenario } from "../engine/types";
import { respondGuided, startGuided, type GuidedState, type LearnerTurn } from "../engine/conversation";
import type { SpeechEvaluation } from "../engine/answer";
import { aiTurn, type AiTurnResponse } from "../services/ai";
import { buildAiContext } from "../engine/conversation";
import { getLearner } from "../state/store";
import { sttAvailable } from "../services/stt";
import { useAudio } from "./audio";
import { SpanishText } from "./SpanishText";
import { SpeakingRecorder } from "./SpeakingRecorder";
import { AccentKeys } from "./exercises/views";

export interface Message {
  id: number;
  from: "partner" | "me";
  es: string;
  en?: string;
  correction?: AiTurnResponse["correction"];
  note?: string;
}

export interface ConversationResult {
  turns: LearnerTurn[];
  goalsMet: string[];
  messages: Message[];
  speakingSeconds: number;
  newWords: { es: string; en: string }[];
}

interface Props {
  mode: "guided" | "ai";
  scenario: Scenario | null;
  topic?: { label: string; en: string };
  onFinish: (r: ConversationResult) => void;
  onGoalsChange?: (goals: string[]) => void;
}

let msgId = 0;

export function ConversationInterface({ mode, scenario, topic, onFinish, onGoalsChange }: Props) {
  const learner = getLearner()!;
  const { play } = useAudio();
  const [messages, setMessages] = useState<Message[]>([]);
  const [guided, setGuided] = useState<GuidedState | null>(scenario && mode === "guided" ? startGuided(scenario) : null);
  const [turns, setTurns] = useState<LearnerTurn[]>([]);
  const [goals, setGoals] = useState<string[]>([]);
  const [typing, setTyping] = useState(() => !sttAvailable() || !learner.settings.speakingEnabled);
  const [text, setText] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [shownEn, setShownEn] = useState<Set<number>>(new Set());
  const [finished, setFinished] = useState(false);
  const [recKey, setRecKey] = useState(0);
  const speaking = useRef(0);
  const newWords = useRef<{ es: string; en: string }[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const showStarters = learner.settings.assistance !== "less";

  const say = (m: { es: string; en?: string }, slow = false) => {
    const msg: Message = { id: ++msgId, from: "partner", es: m.es, en: m.en };
    setMessages((xs) => [...xs, msg]);
    play(m.es, { speed: slow ? "slow" : "normal" }, `msg-${msg.id}`);
  };

  // Opening line.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (mode === "guided" && scenario) say(scenario.turns[0].npc);
    else requestAi([]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { onGoalsChange?.(goals); }, [goals, onGoalsChange]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, waiting]);

  async function requestAi(history: Message[]) {
    setWaiting(true);
    setError(null);
    try {
      const res = await aiTurn({
        context: buildAiContext(learner, Date.now()),
        scenario: scenario
          ? { title: scenario.title, setting: scenario.setting, role: scenario.role, partner: scenario.partner, goals: scenario.goals.map((g) => g.label) }
          : { title: topic ? `Conversation: ${topic.en}` : "Free conversation", setting: "A relaxed chat between friends.", role: "Chat naturally about the topic.", partner: "Sofía", goals: [] },
        history: history.map((m) => ({ role: m.from === "me" ? "learner" : "partner", text: m.es })),
      });
      if (res.correction && history.length) {
        setMessages((xs) => xs.map((m, i) => (i === xs.length - 1 && m.from === "me" ? { ...m, correction: res.correction } : m)));
      }
      if (res.newWords?.length) newWords.current.push(...res.newWords);
      if (res.goalsMet?.length && scenario) {
        const ids = scenario.goals.filter((g) => res.goalsMet.some((x) => x.toLowerCase() === g.label.toLowerCase() || x === g.id)).map((g) => g.id);
        setGoals((gs) => [...new Set([...gs, ...ids])]);
      }
      if (history.length) {
        setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? { ...t, understood: res.understood, corrections: res.correction ? 1 : 0 } : t)));
      }
      say({ es: res.reply, en: res.replyEn });
      if (res.shouldEnd) setFinished(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The conversation partner didn't respond.");
    } finally {
      setWaiting(false);
    }
  }

  const send = (utterance: string, speech?: SpeechEvaluation | null, durationMs = 0) => {
    const clean = utterance.trim();
    if (!clean || finished) return;
    speaking.current += durationMs / 1000;
    const mine: Message = { id: ++msgId, from: "me", es: clean };
    const nextMessages = [...messages, mine];
    setMessages(nextMessages);
    setText("");
    setHint(null);
    setRecKey((k) => k + 1);

    if (mode === "guided" && scenario && guided) {
      const { state, reply } = respondGuided(scenario, guided, clean);
      setGuided(state);
      setTurns((ts) => [...ts, { text: clean, understood: reply.understood, speech }]);
      if (reply.newGoals.length) setGoals((gs) => [...new Set([...gs, ...reply.newGoals])]);
      if (reply.hint) setHint(reply.hint);
      setTimeout(() => {
        reply.lines.forEach((l, i) => setTimeout(() => say(l, reply.slow), i * 900));
        if (reply.finished) setTimeout(() => setFinished(true), reply.lines.length * 900 + 400);
      }, 450);
    } else {
      setTurns((ts) => [...ts, { text: clean, understood: true, speech }]);
      requestAi(nextMessages);
    }
  };

  const currentTurn = scenario && guided ? scenario.turns.find((t) => t.id === guided.turnId) : null;
  const starters = mode === "guided" && currentTurn ? currentTurn.starters : [];

  return (
    <div className="conversation">
      <div className="chat-scroll">
        <div className="chat">
          {messages.map((m) =>
            m.from === "partner" ? (
              <div key={m.id} className="bubble-row">
                <span className="bubble-avatar">{(scenario?.partner ?? "Sofía")[0]}</span>
                <div>
                  <div className="bubble">
                    <SpanishText text={m.es} />
                    {m.en && shownEn.has(m.id) && <div className="bubble-translation">{m.en}</div>}
                  </div>
                  <div className="bubble-tools">
                    <button type="button" onClick={() => play(m.es, {}, `msg-${m.id}`)} aria-label="Play again">
                      <Volume2 size={13} /> Play
                    </button>
                    <button type="button" onClick={() => play(m.es, { speed: "slow" }, `msg-${m.id}-slow`)}>
                      <Snail size={13} /> Slow
                    </button>
                    {m.en && (
                      <button type="button" onClick={() => setShownEn((s) => new Set(s).add(m.id))} disabled={shownEn.has(m.id)}>
                        <Languages size={13} /> Translate
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div key={m.id} className="stack" style={{ "--gap": "6px", alignItems: "flex-end" } as React.CSSProperties}>
                <div className="bubble-row me">
                  <div className="bubble">
                    <span className="es">{m.es}</span>
                  </div>
                </div>
                {m.correction && (
                  <div className="correction">
                    More natural: <span className="es">{m.correction.corrected}</span>
                    <div className="tiny" style={{ marginTop: 2 }}>{m.correction.explanation}</div>
                  </div>
                )}
              </div>
            ),
          )}
          {waiting && (
            <div className="bubble-row">
              <span className="bubble-avatar">{(scenario?.partner ?? "Sofía")[0]}</span>
              <div className="bubble typing" aria-label="Your partner is replying">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
          <div ref={bottom} className="chat-end" />
        </div>
      </div>

      <div className="composer">
        {error && (
          <p className="notice warning" style={{ marginBottom: 10 }}>
            {error}{" "}
            <button className="link-btn" onClick={() => requestAi(messages)}>
              Try again
            </button>
          </p>
        )}
        {finished ? (
          <div className="row-between wrap" style={{ gap: 12 }}>
            <span className="row" style={{ gap: 8, fontWeight: 650 }}>
              <Check size={18} color="var(--success)" /> Conversation complete
            </span>
            <button className="btn btn-primary btn-lg" onClick={() => onFinish({ turns, goalsMet: goals, messages, speakingSeconds: speaking.current, newWords: newWords.current })}>
              See your review
            </button>
          </div>
        ) : (
          <>
            {hint && (
              <p className="hint-line" style={{ marginBottom: 10 }}>
                <Lightbulb size={16} /> {hint}
              </p>
            )}
            {showStarters && starters.length > 0 && (
              <div className="starters" aria-label="Sentence starters">
                {starters.map((s) => (
                  <button key={s} className="pill-button es" onClick={() => (typing ? setText(s.replace(/…$/, " ")) : play(s.replace(/…$/, ""), { speed: "slow" }))}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {typing ? (
              <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
                <div className="row" style={{ gap: 8 }}>
                  <input
                    className="input grow es"
                    style={{ fontSize: "1.1rem", height: 52 }}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && send(text)}
                    placeholder="Escribe tu respuesta…"
                    aria-label="Your reply"
                    lang="es"
                    disabled={waiting}
                    autoFocus
                  />
                  <button className="btn btn-primary" style={{ height: 52 }} disabled={!text.trim() || waiting} onClick={() => send(text)} aria-label="Send">
                    <Send size={18} />
                  </button>
                </div>
                <div className="row-between wrap">
                  <AccentKeys onInsert={(c) => setText((t) => t + c)} />
                  {sttAvailable() && learner.settings.speakingEnabled && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setTyping(false)}>
                      <Mic size={16} /> Speak instead
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="stack" style={{ "--gap": "4px", alignItems: "center" } as React.CSSProperties}>
                <SpeakingRecorder key={recKey} stage={mode === "ai" ? 7 : 6} compact maxSeconds={40} onOutcome={(o) => send(o.evaluation.transcript, o.evaluation, o.durationMs)} onTypeInstead={() => setTyping(true)} />
              </div>
            )}
            <div className="row-between" style={{ marginTop: 10 }}>
              <span className="tiny faint">
                Lost? Say <span className="es">“¿Puedes repetirlo?”</span> or <span className="es">“Más despacio, por favor.”</span>
              </span>
              {turns.length >= 2 && (
                <button className="btn btn-ghost btn-sm" onClick={() => onFinish({ turns, goalsMet: goals, messages, speakingSeconds: speaking.current, newWords: newWords.current })}>
                  End conversation
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function GoalList({ scenario, met }: { scenario: Scenario; met: string[] }) {
  return (
    <ul className="goal-list">
      {scenario.goals.map((g) => (
        <li key={g.id} className={met.includes(g.id) ? "met" : ""}>
          {met.includes(g.id) ? <Check size={15} strokeWidth={3} /> : <Circle size={15} />}
          {g.label}
        </li>
      ))}
    </ul>
  );
}
