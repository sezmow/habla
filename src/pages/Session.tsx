import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { X, Check, CircleAlert, Triangle, Lightbulb } from "lucide-react";
import type { Exercise } from "../engine/exercises";
import { exerciseLabel, followUps } from "../engine/exercises";
import { buildDailySession, buildDrillSession, buildFirstSession, buildLessonSession, buildReviewSession, buildSpeakingSession, buildStageSession, type ReviewFocus, type SessionPlan } from "../engine/session";
import type { MistakeRecord } from "../engine/types";
import { CATEGORY_INFO } from "../engine/mistakes";
import { CONCEPTS, SENTENCES } from "../content";
import { actions, getLearner, useLearner } from "../state/store";
import { ProgressBar, Modal } from "../components/ui";
import { takeSpokenMs } from "../components/audio";
import { stopSpeaking } from "../services/tts";
import { speakingAvailable } from "../services/capabilities";
import { Diff } from "../components/SpeechResult";
import { SessionSummary, type SessionResult } from "../components/SessionSummary";
import type { Outcome, ViewProps } from "../components/exercises/types";
import * as V from "../components/exercises/views";
import { rng } from "../engine/text";


function buildPlan(kind: string, arg: string | undefined): SessionPlan | null {
  const state = getLearner();
  if (!state) return null;
  const opts = { now: Date.now(), speaking: speakingAvailable() };
  switch (kind) {
    case "daily":
      return buildDailySession(state, { ...opts, minutes: arg ? Number(arg) : undefined });
    case "lesson":
      return arg ? buildLessonSession(state, arg, opts) : null;
    case "review":
      return buildReviewSession(state, (arg ?? "due") as ReviewFocus, opts);
    case "drill":
      return arg ? buildDrillSession(state, arg, opts) : null;
    case "speaking":
      return buildSpeakingSession(state, opts);
    case "first":
      return buildFirstSession(state, opts);
    case "stage":
      return buildStageSession(state, Number(arg ?? 1), opts);
    default:
      return null;
  }
}

function explanationFor(ex: Exercise, mistakes: MistakeRecord[]): string | null {
  if (mistakes.length) return CATEGORY_INFO[mistakes[0].category].tip;
  if (ex.conceptId && CONCEPTS[ex.conceptId]) return CONCEPTS[ex.conceptId].remember;
  const s = SENTENCES[ex.itemId];
  if (s?.note) return s.note;
  const c = s?.concepts[0];
  return c && CONCEPTS[c] ? CONCEPTS[c].remember : null;
}

const SELF_ADVANCING = new Set(["intro", "grammar"]);

export default function Session() {
  const { kind = "daily", arg } = useParams();
  const navigate = useNavigate();
  const learner = useLearner();
  const [plan] = useState(() => buildPlan(kind, arg));
  const [queue, setQueue] = useState<Exercise[]>(() => plan?.exercises ?? []);
  const [index, setIndex] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [results, setResultsState] = useState<SessionResult[]>([]);
  const resultsRef = useRef<SessionResult[]>([]);
  const setResults = (fn: (r: SessionResult[]) => SessionResult[]) => {
    resultsRef.current = fn(resultsRef.current);
    setResultsState(resultsRef.current);
  };
  const [finished, setFinished] = useState(false);
  const submitRef = useRef<(() => void) | null>(null);
  const started = useRef(performance.now());
  const random = useMemo(() => rng(Date.now()), []);
  const ex = queue[index];

  useEffect(() => {
    started.current = performance.now();
    takeSpokenMs();
    setReady(false);
    setOutcome(null);
    setExplanation(null);
    window.scrollTo({ top: 0 });
  }, [index, ex?.key]);

  useEffect(() => () => stopSpeaking(), []);

  const record = useCallback(
    (o: Outcome) => {
      if (!ex) return;
      const seconds = Math.min(120, (performance.now() - started.current) / 1000);
      const listened = takeSpokenMs() / 1000;
      const listeningTypes = ["listen", "dictation"];
      const recordedEx = o.skillOverride ? ({ ...ex, skill: o.skillOverride } as Exercise) : ex;
      const res = actions.record(recordedEx, {
        quality: o.quality,
        verdict: o.verdict,
        given: o.given,
        expected: o.expected,
        diff: o.diff,
        latencyMs: seconds * 1000,
        hinted: !!o.hinted,
        seconds,
        speech: o.speech,
        selfAssessed: o.selfAssessed,
        speakingSeconds: o.speakingSeconds,
        listeningSeconds: listeningTypes.includes(ex.type) ? Math.max(listened, 3) : 0,
        perItem: o.perItem,
      });
      const mistakes = res?.mistakes ?? [];
      setResults((r) => [...r, { ex, quality: o.quality, verdict: o.verdict, mistakes, xp: res?.xp ?? 0, learned: res?.learned ?? 0, unlocked: res?.unlocked ?? [], seconds, speakingSeconds: o.speakingSeconds ?? 0, listeningSeconds: listeningTypes.includes(ex.type) ? Math.max(listened, 3) : 0 }]);
      // Smart review: recall it again soon in another format, then later in a new sentence.
      if (o.quality < 0.6 && !ex.retry && getLearner()) {
        const f = followUps(ex, { state: getLearner()!, now: Date.now(), random, speaking: speakingAvailable(), segment: ex.segment });
        setQueue((q) => {
          const next = q.slice();
          if (f.again) next.splice(Math.min(next.length, index + 3), 0, f.again);
          if (f.context) next.splice(Math.min(next.length, index + 9), 0, f.context);
          return next;
        });
      }
      setExplanation(o.verdict === "correct" && !mistakes.length ? null : explanationFor(ex, mistakes));
      setOutcome(o);
    },
    [ex, index, random],
  );

  const advance = useCallback(() => {
    if (!ex) return;
    if (SELF_ADVANCING.has(ex.type)) {
      const seconds = Math.min(120, (performance.now() - started.current) / 1000);
      const res = actions.record(ex, { quality: 1, verdict: "correct", given: "", expected: "", diff: [], latencyMs: 0, hinted: false, seconds, listeningSeconds: takeSpokenMs() / 1000 });
      setResults((r) => [...r, { ex, quality: 1, verdict: "correct", mistakes: [], xp: res?.xp ?? 0, learned: res?.learned ?? 0, unlocked: res?.unlocked ?? [], seconds, speakingSeconds: 0, listeningSeconds: 0 }]);
    }
    stopSpeaking();
    if (index + 1 >= queue.length) finish();
    else setIndex(index + 1);
  }, [ex, index, queue.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const skip = () => {
    stopSpeaking();
    if (index + 1 >= queue.length) finish();
    else setIndex(index + 1);
  };

  function finish() {
    if (plan?.lessonId) {
      const lessonResults = resultsRef.current.filter((r) => r.ex.segment === "new" && !SELF_ADVANCING.has(r.ex.type));
      const acc = lessonResults.length ? lessonResults.filter((r) => r.quality >= 0.6).length / lessonResults.length : 1;
      actions.completeLesson(plan.lessonId, acc);
    }
    actions.sessionDone();
    setFinished(true);
  }

  // Enter to check / continue (typing fields handle their own Enter).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || confirmExit || finished) return;
      const t = e.target as HTMLElement;
      if (t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement || t.tagName === "BUTTON") return;
      e.preventDefault();
      if (outcome || (ex && SELF_ADVANCING.has(ex.type))) advance();
      else if (ready) submitRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [outcome, ready, ex, advance, confirmExit, finished]);

  if (!learner) return null;
  if (!plan || (!queue.length && !finished)) {
    return (
      <div className="session" style={{ placeItems: "center" }}>
        <div className="card card-lg" style={{ maxWidth: 440, margin: "20vh auto", textAlign: "center" }}>
          <h2>Nothing to practice here right now</h2>
          <p className="muted" style={{ margin: "8px 0 18px" }}>You're all caught up for this kind of review. New items will be ready as you learn more.</p>
          <button className="btn btn-primary" onClick={() => navigate("/")}>Back to today</button>
        </div>
      </div>
    );
  }

  if (finished) return <SessionSummary plan={plan} results={results} onDone={() => navigate("/")} />;

  const progress = index / queue.length;
  const verdictClass = outcome ? (outcome.verdict === "correct" ? "correct" : outcome.verdict === "almost" ? "almost" : "incorrect") : "";
  const needsCheck = ex && !SELF_ADVANCING.has(ex.type) && !["match", "speak", "dialogue"].includes(ex.type);
  const viewProps = { checked: !!outcome, onReady: setReady, submitRef, onOutcome: record };

  return (
    <div className="session">
      <header className="session-top">
        <button className="icon-btn" aria-label="Leave session" onClick={() => (results.length ? setConfirmExit(true) : navigate(-1))}>
          <X size={22} />
        </button>
        <div className="session-progress">
          <ProgressBar value={progress} size="thick" label="Session progress" />
          <div className="session-meta">
            <span className={`seg-dot ${ex.segment}`} aria-hidden="true" />
            <span>{plan.segments.find((s) => s.kind === ex.segment)?.label ?? plan.title}</span>
            <span aria-hidden="true">·</span>
            <span>{exerciseLabel(ex)}</span>
            {ex.reason && (
              <>
                <span aria-hidden="true">·</span>
                <span style={{ fontWeight: 550 }}>{ex.reason}</span>
              </>
            )}
          </div>
        </div>
        <span className="session-count">
          {index + 1}/{queue.length}
        </span>
      </header>

      <main className="session-body" key={ex.key}>
        {renderView(ex, viewProps)}
      </main>

      <footer className={`session-foot ${outcome && !outcome.inlineResult ? verdictClass : ""}`}>
        <div className="session-foot-inner">
          {outcome && !outcome.inlineResult ? (
            <FeedbackPanel outcome={outcome} explanation={explanation} />
          ) : outcome?.inlineResult && explanation ? (
            <p className="small muted row" style={{ gap: 8 }}>
              <Lightbulb size={16} /> {explanation}
            </p>
          ) : (
            <span className="small faint hide-mobile">{needsCheck ? <>Press <span className="kbd">Enter</span> to check</> : null}</span>
          )}
          <div className="foot-actions">
            {!outcome && ["speak", "dialogue"].includes(ex.type) && (
              <button className="btn btn-ghost" onClick={skip}>
                Skip for now
              </button>
            )}
            {outcome || (ex && SELF_ADVANCING.has(ex.type)) ? (
              <button className={`btn btn-lg ${outcome && outcome.verdict === "incorrect" && !outcome.inlineResult ? "btn-secondary" : "btn-primary"}`} onClick={advance} autoFocus>
                Continue
              </button>
            ) : needsCheck ? (
              <button className="btn btn-primary btn-lg" disabled={!ready} onClick={() => submitRef.current?.()}>
                Check
              </button>
            ) : null}
          </div>
        </div>
      </footer>

      <Modal open={confirmExit} onClose={() => setConfirmExit(false)} title="Leave session">
        <h2>Leave this session?</h2>
        <p className="muted" style={{ margin: "8px 0 20px" }}>Everything you've answered so far is saved and already shaping your reviews.</p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={() => setConfirmExit(false)}>
            Keep going
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              actions.sessionDone();
              navigate("/");
            }}
          >
            Leave
          </button>
        </div>
      </Modal>
    </div>
  );
}

function renderView(ex: Exercise, p: Omit<ViewProps<unknown>, "ex">) {
  switch (ex.type) {
    case "intro":
      return <V.IntroView ex={ex} {...p} />;
    case "grammar":
      return <V.GrammarView ex={ex} {...p} />;
    case "choice":
      return <V.ChoiceView ex={ex} {...p} />;
    case "listen":
      return <V.ListenView ex={ex} {...p} />;
    case "match":
      return <V.MatchView ex={ex} {...p} />;
    case "arrange":
      return <V.ArrangeView ex={ex} {...p} />;
    case "translate":
      return <V.TranslateView ex={ex} {...p} />;
    case "dictation":
      return <V.DictationView ex={ex} {...p} />;
    case "concept":
      return <V.ConceptView ex={ex} {...p} />;
    case "fill":
      return <V.FillView ex={ex} {...p} />;
    case "speak":
      return <V.SpeakView ex={ex} {...p} />;
    case "open":
    case "picture":
      return <V.OpenView ex={ex} {...p} />;
    case "dialogue":
      return <V.DialogueView ex={ex} {...p} />;
  }
}

function FeedbackPanel({ outcome, explanation }: { outcome: Outcome; explanation: string | null }) {
  const f = outcome.feedback;
  const Icon = outcome.verdict === "correct" ? Check : outcome.verdict === "almost" ? Triangle : CircleAlert;
  const showDiff = f.diff && outcome.verdict !== "correct" && f.diff.some((d) => d.status !== "ok");
  return (
    <div className={`feedback ${outcome.verdict}`} role="status" aria-live="assertive">
      <span className="feedback-icon">
        <Icon size={24} strokeWidth={2.6} aria-hidden="true" />
      </span>
      <div className="feedback-body">
        <span className="feedback-title">{f.title}</span>
        {showDiff && (
          <span>
            <span className="small muted">Your answer: </span>
            <Diff diff={f.diff!} />
          </span>
        )}
        {f.answer && (
          <span>
            <span className="small muted">{f.answerLabel ?? "Correct answer"}: </span>
            <span className="feedback-answer es">{f.answer}</span>
          </span>
        )}
        {f.translation && <span className="feedback-note">{f.translation}</span>}
        {f.notes.map((n) => (
          <span key={n} className="feedback-note">
            {n}
          </span>
        ))}
        {explanation && (
          <span className="feedback-note row" style={{ gap: 6, alignItems: "flex-start" }}>
            <Lightbulb size={15} style={{ marginTop: 3, flex: "none" }} /> {explanation}
          </span>
        )}
      </div>
    </div>
  );
}
