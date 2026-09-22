// One view per exercise type. Views collect the learner's answer and report an
// Outcome; the session runner handles recording, feedback and follow-ups.

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X, Lightbulb, Eye } from "lucide-react";
import type { ArrangeEx, ChoiceEx, ConceptEx, DialogueEx, FillEx, GrammarEx, IntroEx, ListenEx, MatchEx, OpenEx, SpeakEx, TranslateEx, DictationEx } from "../../engine/exercises";
import { checkEnglish, checkRequirements, checkSpanish } from "../../engine/answer";
import { CONCEPTS, SENTENCES, VOCAB, personalize } from "../../content";
import { getLearner } from "../../state/store";
import { AudioButton, AudioPair } from "../audio";
import { SpanishText } from "../SpanishText";
import { SpeakingRecorder, type SpeechOutcome } from "../SpeakingRecorder";
import { SpeechResult } from "../SpeechResult";
import { titleFor, type Outcome, type ViewProps } from "./types";
import { sttAvailable } from "../../services/stt";

const ACCENTS = ["á", "é", "í", "ó", "ú", "ñ", "ü", "¿", "¡"];

export function AccentKeys({ onInsert }: { onInsert: (ch: string) => void }) {
  return (
    <div className="accent-keys" aria-label="Spanish characters">
      {ACCENTS.map((c) => (
        <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert(c)} aria-label={`Insert ${c}`}>
          {c}
        </button>
      ))}
    </div>
  );
}

function useSubmit(submitRef: ViewProps<unknown>["submitRef"], fn: () => void) {
  const f = useRef(fn);
  f.current = fn;
  useEffect(() => {
    submitRef.current = () => f.current();
    return () => {
      submitRef.current = null;
    };
  }, [submitRef]);
}

// ─── Learn ───────────────────────────────────────────────────

export function IntroView({ ex, onReady }: ViewProps<IntroEx>) {
  useEffect(() => { onReady(true); }, [onReady]);
  const name = getLearner()?.profile.name ?? "";
  if (ex.sentenceId) {
    const s = SENTENCES[ex.sentenceId];
    const text = personalize(s.es, name);
    const learner = getLearner();
    const newWords = new Set(s.vocab.filter((v) => VOCAB[v]?.drill && !learner?.memory[v]?.exposureCount));
    return (
      <div className="exercise">
        <div className="exercise-head">
          <span className="eyebrow">New sentence</span>
        </div>
        <div className="intro-card">
          <div className="prompt-row">
            <AudioButton text={text} autoPlay />
            <div className="stack" style={{ "--gap": "6px" } as React.CSSProperties}>
              <SpanishText text={text} className="prompt-es" newWords={newWords} />
              <span className="prompt-translation">{s.en}</span>
            </div>
          </div>
          {newWords.size > 0 && (
            <div className="intro-words">
              {[...newWords].map((id) => (
                <span key={id} className="intro-word">
                  <span className="es">{VOCAB[id].es}</span>
                  <span className="muted">{VOCAB[id].en}</span>
                </span>
              ))}
            </div>
          )}
          {s.note && (
            <p className="notice info" style={{ margin: 0 }}>
              <Lightbulb size={18} />
              <span>{s.note}</span>
            </p>
          )}
        </div>
        <p className="tiny faint">Tap any word to hear it and see what it means.</p>
      </div>
    );
  }
  const v = VOCAB[ex.vocabId!];
  return (
    <div className="exercise">
      <div className="exercise-head">
        <span className="eyebrow">New word</span>
      </div>
      <div className="intro-card" style={{ alignItems: "flex-start" }}>
        {v.emoji && <div style={{ fontSize: 56, lineHeight: 1 }}>{v.emoji}</div>}
        <div className="prompt-row">
          <AudioButton text={v.es} autoPlay />
          <div>
            <div className="prompt-es es">{v.es}</div>
            <div className="prompt-translation">{v.en}</div>
          </div>
        </div>
        <div className="intro-meta">
          <span className="syllables">{v.syllables}</span>
          <span>{v.pos}</span>
          {v.gender && v.gender !== "mf" && <span>{v.gender === "f" ? "feminine" : "masculine"}</span>}
          {v.region && <span className="chip warning">{v.region}</span>}
        </div>
      </div>
    </div>
  );
}

export function GrammarView({ ex, onReady }: ViewProps<GrammarEx>) {
  useEffect(() => { onReady(true); }, [onReady]);
  const c = CONCEPTS[ex.conceptId];
  return (
    <div className="exercise grammar-card">
      <div className="exercise-head">
        <span className="eyebrow">Pattern</span>
        <h2 className="exercise-instruction">{c.title}</h2>
      </div>
      <div className="grammar-examples">
        {c.examples.map((e) => (
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
          <dd>{c.whatChanged}</dd>
        </div>
        <div>
          <dt>Why?</dt>
          <dd>{c.why}</dd>
        </div>
        <div>
          <dt>How do I use it?</dt>
          <dd>{c.how}</dd>
        </div>
      </dl>
    </div>
  );
}

export function highlight(text: string, part?: string) {
  if (!part) return text;
  const i = text.toLowerCase().indexOf(part.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + part.length)}</mark>
      {text.slice(i + part.length)}
    </>
  );
}

// ─── Recognition ─────────────────────────────────────────────

function OptionList({ options, lang, selected, onSelect, checked, answer }: { options: string[]; lang: "es" | "en"; selected: number | null; onSelect: (i: number) => void; checked: boolean; answer: number }) {
  useEffect(() => {
    if (checked) return;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= options.length && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLInputElement)) onSelect(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options.length, onSelect, checked]);
  return (
    <div className="options" role="radiogroup">
      {options.map((o, i) => {
        const state = checked ? (i === answer ? "correct" : i === selected ? "incorrect" : "") : "";
        return (
          <button key={i} type="button" role="radio" aria-checked={selected === i} aria-pressed={selected === i} className={`option ${state}`} disabled={checked} onClick={() => onSelect(i)}>
            <span className="kbd">{i + 1}</span>
            <span className={`option-text ${lang === "es" ? "es" : ""}`}>{o}</span>
            {state === "correct" && <Check className="option-mark" size={20} color="var(--success)" aria-label="Correct answer" />}
            {state === "incorrect" && <X className="option-mark" size={20} color="var(--danger)" aria-label="Your answer" />}
          </button>
        );
      })}
    </div>
  );
}

export function ChoiceView({ ex, checked, onReady, submitRef, onOutcome }: ViewProps<ChoiceEx>) {
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => { onReady(sel != null); }, [sel, onReady]);
  useSubmit(submitRef, () => {
    if (sel == null) return;
    const ok = sel === ex.answer;
    onOutcome({
      quality: ok ? 1 : 0,
      verdict: ok ? "correct" : "incorrect",
      given: ex.options[sel],
      expected: ex.options[ex.answer],
      diff: [],
      feedback: { title: ok ? "Correct" : "Not quite", answer: ok ? undefined : ex.options[ex.answer], answerLabel: "Correct answer", notes: [], translation: ex.promptLang === "es" && ex.prompt ? undefined : undefined },
    });
  });
  const audioOnly = !ex.prompt && ex.audio;
  return (
    <div className="exercise">
      <div className="exercise-head">
        <h2 className="exercise-instruction">{ex.instruction}</h2>
      </div>
      {audioOnly ? (
        <AudioPair text={ex.audio!} autoPlay size="lg" />
      ) : ex.promptLang === "es" ? (
        <div className="prompt-row">
          {ex.audio && <AudioButton text={ex.audio} autoPlay />}
          <SpanishText text={ex.prompt} className="prompt-es" glosses={checked} />
        </div>
      ) : (
        <p className="prompt-en">{ex.prompt}</p>
      )}
      <OptionList options={ex.options} lang={ex.optionLang} selected={sel} onSelect={setSel} checked={checked} answer={ex.answer} />
    </div>
  );
}

export function ListenView({ ex, checked, onReady, submitRef, onOutcome }: ViewProps<ListenEx>) {
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => { onReady(sel != null); }, [sel, onReady]);
  useSubmit(submitRef, () => {
    if (sel == null) return;
    const ok = sel === ex.answer;
    onOutcome({ quality: ok ? 1 : 0, verdict: ok ? "correct" : "incorrect", given: ex.options[sel], expected: ex.options[ex.answer], diff: [], feedback: { title: ok ? "Correct" : "Not quite", answer: ex.text, answerLabel: "You heard", notes: [], translation: ex.translation } });
  });
  return (
    <div className="exercise">
      <div className="exercise-head">
        <h2 className="exercise-instruction">What does this mean?</h2>
        <p className="small muted">Listen first — the text appears after you answer.</p>
      </div>
      <AudioPair text={ex.text} autoPlay size="lg" />
      {checked && <SpanishText text={ex.text} className="prompt-es" />}
      <OptionList options={ex.options} lang="en" selected={sel} onSelect={setSel} checked={checked} answer={ex.answer} />
    </div>
  );
}

export function MatchView({ ex, onReady, onOutcome }: ViewProps<MatchEx>) {
  const right = useMemo(() => ex.pairs.slice().sort((a, b) => a.en.localeCompare(b.en)), [ex.pairs]);
  const [left, setLeft] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState<string | null>(null);
  const errors = useRef<Record<string, number>>({});
  useEffect(() => { onReady(false); }, [onReady]);
  const pickRight = (id: string) => {
    if (!left) return;
    if (id === left) {
      const next = new Set(done).add(id);
      setDone(next);
      setLeft(null);
      if (next.size === ex.pairs.length) {
        const perItem = Object.fromEntries(ex.pairs.map((p) => [p.id, errors.current[p.id] ? 0.5 : 1]));
        const mistakes = Object.keys(errors.current).length;
        onOutcome({
          quality: mistakes === 0 ? 1 : Math.max(0.5, 1 - mistakes / ex.pairs.length),
          verdict: mistakes === 0 ? "correct" : "almost",
          given: "",
          expected: "",
          diff: [],
          perItem,
          feedback: { title: mistakes === 0 ? "All matched" : "Matched — with a few retries", notes: [] },
        });
      }
    } else {
      errors.current[left] = (errors.current[left] ?? 0) + 1;
      setWrong(id);
      setTimeout(() => setWrong(null), 400);
    }
  };
  return (
    <div className="exercise">
      <div className="exercise-head">
        <h2 className="exercise-instruction">Match the pairs</h2>
      </div>
      <div className="match">
        <div className="match-col">
          {ex.pairs.map((p) => (
            <button key={p.id} type="button" className={`option ${done.has(p.id) ? "matched" : ""}`} aria-pressed={left === p.id} disabled={done.has(p.id)} onClick={() => setLeft(p.id)}>
              <span className="option-text es">{p.es}</span>
            </button>
          ))}
        </div>
        <div className="match-col">
          {right.map((p) => (
            <button key={p.id} type="button" className={`option ${done.has(p.id) ? "matched" : ""} ${wrong === p.id ? "incorrect" : ""}`} disabled={done.has(p.id) || !left} onClick={() => pickRight(p.id)}>
              <span className="option-text">{p.en}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Recall & production ─────────────────────────────────────

export function ArrangeView({ ex, checked, onReady, submitRef, onOutcome }: ViewProps<ArrangeEx>) {
  const [placed, setPlaced] = useState<number[]>([]);
  useEffect(() => { onReady(placed.length > 0); }, [placed, onReady]);
  useSubmit(submitRef, () => {
    const given = placed.map((i) => ex.tiles[i]).join(" ");
    const r = checkSpanish(given, ex.accepted);
    onOutcome({ quality: r.quality, verdict: r.verdict, given, expected: r.matched, diff: r.diff, feedback: { title: titleFor(r.verdict), answer: r.verdict === "correct" ? undefined : r.matched, diff: r.diff, notes: r.notes, translation: ex.prompt } });
  });
  return (
    <div className="exercise">
      <div className="exercise-head">
        <h2 className="exercise-instruction">Build this sentence in Spanish</h2>
      </div>
      <p className="prompt-en">{ex.prompt}</p>
      <div className="arrange-line" aria-label="Your sentence">
        {placed.map((ti, k) => (
          <button key={`${ti}-${k}`} type="button" className="tile" disabled={checked} onClick={() => setPlaced(placed.filter((_, j) => j !== k))}>
            {ex.tiles[ti]}
          </button>
        ))}
      </div>
      <div className="arrange-bank" aria-label="Word bank">
        {ex.tiles.map((t, i) => {
          const used = placed.includes(i);
          return (
            <button key={i} type="button" className={`tile ${used ? "ghost" : ""}`} disabled={used || checked} aria-hidden={used} onClick={() => setPlaced([...placed, i])}>
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function useTyped(onReady: (r: boolean) => void) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  useEffect(() => { onReady(value.trim().length > 0); }, [value, onReady]);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);
  const insert = (ch: string) => {
    const el = ref.current;
    if (!el) return setValue((v) => v + ch);
    const s = el.selectionStart ?? value.length;
    const e = el.selectionEnd ?? value.length;
    const next = value.slice(0, s) + ch + value.slice(e);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + ch.length, s + ch.length);
    });
  };
  return { value, setValue, ref, insert };
}

function Hint({ text, onReveal }: { text: string; onReveal: () => void }) {
  const [shown, setShown] = useState(false);
  return shown ? (
    <p className="hint-line">
      <Lightbulb size={16} /> Starts with <span className="es">{text}</span>
    </p>
  ) : (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      style={{ alignSelf: "flex-start" }}
      onClick={() => {
        setShown(true);
        onReveal();
      }}
    >
      <Eye size={16} /> Show a hint
    </button>
  );
}

const enterSubmits = (submitRef: ViewProps<unknown>["submitRef"]) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submitRef.current?.();
  }
};

export function TranslateView({ ex, checked, onReady, submitRef, onOutcome }: ViewProps<TranslateEx>) {
  const t = useTyped(onReady);
  const [hinted, setHinted] = useState(false);
  const toSpanish = ex.direction === "en-es";
  useSubmit(submitRef, () => {
    const r = toSpanish ? checkSpanish(t.value, ex.accepted) : checkEnglish(t.value, ex.accepted);
    onOutcome({
      quality: r.quality,
      verdict: r.verdict,
      given: t.value,
      expected: r.matched,
      diff: toSpanish ? r.diff : [],
      hinted,
      feedback: { title: titleFor(r.verdict), answer: r.verdict === "correct" && toSpanish ? undefined : toSpanish ? r.matched : ex.answer, diff: toSpanish ? r.diff : undefined, notes: r.notes, translation: toSpanish ? undefined : undefined },
    });
  });
  return (
    <div className="exercise">
      <div className="exercise-head">
        <h2 className="exercise-instruction">{toSpanish ? "Say this in Spanish" : "What does this mean?"}</h2>
      </div>
      {toSpanish ? (
        <p className="prompt-en">{ex.prompt}</p>
      ) : (
        <div className="prompt-row">
          <AudioButton text={ex.audio ?? ex.prompt} autoPlay />
          <SpanishText text={ex.prompt} className="prompt-es" />
        </div>
      )}
      <textarea
        ref={t.ref}
        className={`answer-input ${toSpanish ? "" : "en"}`}
        value={t.value}
        onChange={(e) => t.setValue(e.target.value)}
        onKeyDown={enterSubmits(submitRef)}
        disabled={checked}
        placeholder={toSpanish ? "Escribe en español…" : "Type it in English…"}
        aria-label={toSpanish ? "Your answer in Spanish" : "Your answer in English"}
        lang={toSpanish ? "es" : "en"}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="sentences"
        spellCheck={false}
        rows={3}
      />
      {toSpanish && !checked && (
        <div className="row-between wrap">
          <AccentKeys onInsert={t.insert} />
          {ex.starter && <Hint text={ex.starter} onReveal={() => setHinted(true)} />}
        </div>
      )}
    </div>
  );
}

export function DictationView({ ex, checked, onReady, submitRef, onOutcome }: ViewProps<DictationEx>) {
  const t = useTyped(onReady);
  useSubmit(submitRef, () => {
    const r = checkSpanish(t.value, ex.accepted);
    onOutcome({ quality: r.quality, verdict: r.verdict, given: t.value, expected: ex.text, diff: r.diff, feedback: { title: titleFor(r.verdict), answer: ex.text, answerLabel: "What was said", diff: r.diff, notes: r.notes, translation: ex.translation } });
  });
  return (
    <div className="exercise">
      <div className="exercise-head">
        <h2 className="exercise-instruction">Type what you hear</h2>
        <p className="small muted">Replay as often as you like. Try normal speed before slow.</p>
      </div>
      <AudioPair text={ex.text} autoPlay size="lg" />
      <textarea ref={t.ref} className="answer-input" value={t.value} onChange={(e) => t.setValue(e.target.value)} onKeyDown={enterSubmits(submitRef)} disabled={checked} placeholder="Escribe lo que oyes…" aria-label="What you heard" lang="es" autoComplete="off" autoCorrect="off" spellCheck={false} rows={3} />
      {!checked && <AccentKeys onInsert={t.insert} />}
    </div>
  );
}

export function ConceptView({ ex, checked, onReady, submitRef, onOutcome }: ViewProps<ConceptEx>) {
  const t = useTyped(onReady);
  useSubmit(submitRef, () => {
    const r = checkSpanish(t.value, ex.accepted);
    onOutcome({ quality: r.quality, verdict: r.verdict, given: t.value, expected: ex.answer, diff: r.diff, feedback: { title: titleFor(r.verdict), answer: r.verdict === "correct" ? undefined : ex.answer, notes: r.notes } });
  });
  return (
    <div className="exercise">
      <div className="exercise-head">
        <span className="chip primary" style={{ alignSelf: "flex-start" }}>Solo en español</span>
        <h2 className="exercise-instruction es">{ex.question}</h2>
      </div>
      {ex.definition ? <p className="concept-definition">“{ex.definition}”</p> : <div className="concept-picture" aria-label="Picture">{ex.emoji}</div>}
      <input ref={t.ref} className="answer-input" style={{ minHeight: 0, height: 64 }} value={t.value} onChange={(e) => t.setValue(e.target.value)} onKeyDown={enterSubmits(submitRef)} disabled={checked} placeholder="Es…" aria-label="Your answer in Spanish" lang="es" autoComplete="off" spellCheck={false} />
      {!checked && <AccentKeys onInsert={t.insert} />}
    </div>
  );
}

export function FillView({ ex, checked, onReady, submitRef, onOutcome }: ViewProps<FillEx>) {
  const [value, setValue] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const answerText = ex.options ? (sel != null ? ex.options[sel] : "") : value;
  useEffect(() => { onReady(answerText.trim().length > 0); }, [answerText, onReady]);
  useEffect(() => {
    if (!ex.options) setTimeout(() => input.current?.focus(), 80);
  }, [ex.options]);
  useSubmit(submitRef, () => {
    const r = checkSpanish(answerText, ex.accepted);
    const full = `${ex.before} ${answerText} ${ex.after}`.replace(/\s+/g, " ").trim();
    onOutcome({ quality: r.quality, verdict: r.verdict, given: full, expected: ex.full, diff: checkSpanish(full, [ex.full]).diff, feedback: { title: titleFor(r.verdict), answer: r.verdict === "correct" ? undefined : ex.full, notes: r.notes, translation: ex.translation } });
  });
  return (
    <div className="exercise">
      <div className="exercise-head">
        <h2 className="exercise-instruction">Fill in the missing word</h2>
        <p className="small muted">{ex.translation}</p>
      </div>
      <p className="fill-sentence" lang="es">
        {ex.before}{" "}
        <span className="fill-slot">
          {ex.options ? (
            answerText || " "
          ) : (
            <input ref={input} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitRef.current?.()} disabled={checked} aria-label="Missing word" autoComplete="off" spellCheck={false} size={Math.max(6, value.length + 1)} />
          )}
        </span>{" "}
        {ex.after}
      </p>
      {ex.options ? (
        <OptionList options={ex.options} lang="es" selected={sel} onSelect={setSel} checked={checked} answer={ex.options.findIndex((o) => o.toLowerCase() === ex.accepted[0].toLowerCase())} />
      ) : (
        !checked && <AccentKeys onInsert={(c) => setValue((v) => v + c)} />
      )}
    </div>
  );
}

// ─── Speaking ────────────────────────────────────────────────

export function SpeakView({ ex, checked, onReady, onOutcome }: ViewProps<SpeakEx>) {
  const [typing, setTyping] = useState(false);
  const [result, setResult] = useState<SpeechOutcome | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { onReady(false); }, [onReady]);
  const learner = getLearner();
  const speakingOff = learner?.settings.speakingEnabled === false;

  const handle = (o: SpeechOutcome) => {
    setResult(o);
    const e = o.evaluation;
    onOutcome({
      quality: e.quality,
      verdict: e.quality >= 0.9 ? "correct" : e.passed ? "almost" : "incorrect",
      given: e.transcript,
      expected: ex.accepted?.[0] ?? ex.sample,
      diff: e.diff,
      speech: e,
      selfAssessed: o.selfAssessed,
      speakingSeconds: o.durationMs / 1000,
      inlineResult: true,
      feedback: { title: e.passed ? (e.quality >= 0.9 ? "Nicely said" : "Good — you were understood") : "Let's try that again", notes: [] },
    });
  };

  if (typing || speakingOff) {
    return <TypedSpeak ex={ex} checked={checked} onReady={onReady} onOutcome={onOutcome} />;
  }

  const stageLabel = ["", "Repeat", "Complete", "Answer", "Answer without a model", "Describe", "Roleplay", "Conversation"][ex.stage];
  return (
    <div className="exercise">
      <div className="exercise-head">
        <div className="exercise-kicker">
          <span className="chip accent">Speaking · {stageLabel}</span>
        </div>
        {ex.stage === 1 ? <h2 className="exercise-instruction">Listen, then say it out loud</h2> : ex.promptLang === "en" ? <h2 className="exercise-instruction">{ex.prompt}</h2> : null}
      </div>
      {ex.stage === 1 && ex.model ? (
        <div className="prompt-row">
          <AudioButton text={ex.model} autoPlay />
          <div className="stack" style={{ "--gap": "4px" } as React.CSSProperties}>
            <SpanishText text={ex.model} className="prompt-es" />
            {ex.promptEn && <span className="prompt-translation">{ex.promptEn}</span>}
          </div>
        </div>
      ) : ex.promptLang === "es" ? (
        <div className="prompt-row">
          <AudioButton text={ex.prompt.replace("_____", "…")} autoPlay />
          <div className="stack" style={{ "--gap": "4px" } as React.CSSProperties}>
            <SpanishText text={ex.prompt} className="prompt-es" />
            {ex.promptEn && learner?.settings.assistance !== "less" && <span className="prompt-translation">{ex.promptEn}</span>}
          </div>
        </div>
      ) : null}
      {ex.scene && <div className="scene" aria-label="Picture to describe">{ex.scene}</div>}
      {ex.starter && !result && (
        <p className="hint-line">
          <Lightbulb size={16} /> You could start with <span className="es">{ex.starter}</span>
        </p>
      )}
      {result ? (
        <SpeechResult
          outcome={result}
          sample={ex.stage === 1 ? undefined : ex.sample}
          sampleEn={ex.sampleEn}
          onRetry={
            checked
              ? undefined
              : () => {
                  setResult(null);
                  setAttempt((a) => a + 1);
                }
          }
        />
      ) : (
        <SpeakingRecorder key={attempt} accepted={ex.accepted} requirements={ex.requirements} stage={ex.stage} model={ex.model ?? ex.sample} maxSeconds={ex.stage >= 4 ? 45 : 20} onOutcome={handle} onTypeInstead={() => setTyping(true)} />
      )}
    </div>
  );
}

function TypedSpeak({ ex, checked, onReady, onOutcome }: { ex: SpeakEx; checked: boolean; onReady: (r: boolean) => void; onOutcome: (o: Outcome) => void }) {
  const t = useTyped(onReady);
  const submitRef = useRef<(() => void) | null>(null);
  const submit = () => {
    if (ex.accepted?.length) {
      const r = checkSpanish(t.value, ex.accepted);
      onOutcome({ quality: r.quality, verdict: r.verdict, given: t.value, expected: r.matched, diff: r.diff, skillOverride: "production", feedback: { title: titleFor(r.verdict), answer: r.verdict === "correct" ? undefined : r.matched, diff: r.diff, notes: [...r.notes, "Typed answers count as writing practice, not speaking."] } });
    } else {
      const req = checkRequirements(t.value, ex.requirements ?? []);
      const q = req.ok ? 0.85 : req.met.length ? 0.55 : 0.25;
      onOutcome({ quality: q, verdict: req.ok ? "correct" : "incorrect", given: t.value, expected: ex.sample, diff: [], skillOverride: "production", feedback: { title: req.ok ? "That works" : "Almost", answer: ex.sample, answerLabel: "One way to say it", notes: req.ok ? [] : [`Try to include: ${req.missing.join(", ")}`] } });
    }
  };
  submitRef.current = submit;
  return (
    <div className="exercise">
      <div className="exercise-head">
        <h2 className="exercise-instruction">{ex.stage === 1 ? "Type the sentence" : ex.promptLang === "en" ? ex.prompt : "Answer in Spanish"}</h2>
      </div>
      {ex.promptLang === "es" && <SpanishText text={ex.stage === 1 && ex.model ? ex.model : ex.prompt} className="prompt-es" />}
      <textarea ref={t.ref} className="answer-input" value={t.value} onChange={(e) => t.setValue(e.target.value)} disabled={checked} rows={3} lang="es" placeholder="Escribe en español…" aria-label="Your answer" onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), submit())} />
      {!checked && (
        <div className="row-between wrap">
          <AccentKeys onInsert={t.insert} />
          <button className="btn btn-primary btn-sm" disabled={!t.value.trim()} onClick={submit}>
            Check
          </button>
        </div>
      )}
    </div>
  );
}

export function OpenView({ ex, checked, onReady, submitRef, onOutcome }: ViewProps<OpenEx>) {
  const t = useTyped(onReady);
  useSubmit(submitRef, () => {
    const req = checkRequirements(t.value, ex.requirements);
    const q = req.ok ? 0.85 : req.met.length ? 0.55 : 0.25;
    onOutcome({
      quality: q,
      verdict: req.ok ? "correct" : "incorrect",
      given: t.value,
      expected: ex.sample,
      diff: [],
      feedback: { title: req.ok ? "That works" : "Almost", answer: ex.sample, answerLabel: "One way to say it", notes: req.ok ? ["We check for the key structure, not one exact sentence."] : [`Try to include: ${req.missing.join(", ")}`], translation: ex.sampleEn || undefined },
    });
  });
  const english = !/[¿¡áéíóúñ]/i.test(ex.prompt) && /^(say|ask|order|tell|introduce)/i.test(ex.prompt);
  return (
    <div className="exercise">
      <div className="exercise-head">
        <span className="chip primary" style={{ alignSelf: "flex-start" }}>
          {ex.type === "picture" ? "Describe" : "Write"}
        </span>
        {english ? <h2 className="exercise-instruction">{ex.prompt}</h2> : <SpanishText text={ex.prompt} className="prompt-es" />}
        {!english && ex.promptEn && <p className="prompt-translation">{ex.promptEn}</p>}
      </div>
      {ex.scene && <div className="scene">{ex.scene}</div>}
      <textarea ref={t.ref} className="answer-input" value={t.value} onChange={(e) => t.setValue(e.target.value)} onKeyDown={enterSubmits(submitRef)} disabled={checked} rows={3} lang="es" placeholder={ex.starter ?? "Escribe en español…"} aria-label="Your answer in Spanish" spellCheck={false} />
      {!checked && <AccentKeys onInsert={t.insert} />}
      {!sttAvailable() && <p className="tiny faint">Speaking tasks appear as writing here because this browser can't recognize speech.</p>}
    </div>
  );
}

export function DialogueView({ ex, checked, onReady, onOutcome }: ViewProps<DialogueEx>) {
  // Without speech recognition we can't hear the reply, so start in typing mode.
  const [typing, setTyping] = useState(() => !sttAvailable() || getLearner()?.settings.speakingEnabled === false);
  const [reply, setReply] = useState<{ me: string; them?: { es: string; en: string }; ok: boolean } | null>(null);
  const [showEn, setShowEn] = useState(false);
  const t = useTyped(onReady);
  useEffect(() => { onReady(false); }, [onReady]);
  const evaluate = (text: string, speech?: SpeechOutcome) => {
    const matched = ex.intents.find((i) => checkRequirements(text, i.requirements).ok);
    const ok = !!matched;
    setReply({ me: text, them: matched?.reply, ok });
    onOutcome({
      quality: ok ? 0.9 : 0.4,
      verdict: ok ? "correct" : "incorrect",
      given: text,
      expected: ex.starters[0],
      diff: [],
      speech: speech?.evaluation ?? null,
      speakingSeconds: speech ? speech.durationMs / 1000 : 0,
      skillOverride: speech ? undefined : "production",
      feedback: { title: ok ? `${ex.partner} understood you` : "They didn't quite follow", answer: ok ? undefined : ex.starters.join("  ·  "), answerLabel: "You could say", notes: [] },
    });
  };
  const filled = (text: string) => text.replace(/\{\w+\}/g, "eso");
  return (
    <div className="exercise">
      <div className="exercise-head">
        <span className="chip accent" style={{ alignSelf: "flex-start" }}>Quick conversation</span>
        <h2 className="exercise-instruction">Reply to {ex.partner}</h2>
      </div>
      <div className="chat">
        <div className="bubble-row">
          <span className="bubble-avatar">{ex.partner[0]}</span>
          <div>
            <div className="bubble">
              <SpanishText text={ex.npc.es} />
              {showEn && <div className="bubble-translation">{ex.npc.en}</div>}
            </div>
            <div className="bubble-tools">
              <AudioButton text={ex.npc.es} size="sm" autoPlay />
              <button type="button" onClick={() => setShowEn((s) => !s)}>{showEn ? "Hide translation" : "Translate"}</button>
            </div>
          </div>
        </div>
        {reply && (
          <div className="bubble-row me">
            <div className="bubble">
              <span className="es">{reply.me}</span>
            </div>
          </div>
        )}
        {reply?.them && (
          <div className="bubble-row">
            <span className="bubble-avatar">{ex.partner[0]}</span>
            <div className="bubble">
              <SpanishText text={filled(reply.them.es)} />
              <div className="bubble-translation">{filled(reply.them.en)}</div>
            </div>
          </div>
        )}
      </div>
      {!reply && !checked && (
        <>
          {typing ? (
            <div className="stack">
              <textarea ref={t.ref} className="answer-input" value={t.value} onChange={(e) => t.setValue(e.target.value)} rows={2} lang="es" placeholder="Escribe tu respuesta…" aria-label="Your reply" onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && t.value.trim() && (e.preventDefault(), evaluate(t.value))} />
              <div className="row-between wrap">
                <AccentKeys onInsert={t.insert} />
                <button className="btn btn-primary btn-sm" disabled={!t.value.trim()} onClick={() => evaluate(t.value)}>
                  Send
                </button>
              </div>
            </div>
          ) : (
            <SpeakingRecorder stage={6} compact maxSeconds={25} onOutcome={(o) => evaluate(o.evaluation.transcript || "", o)} onTypeInstead={() => setTyping(true)} />
          )}
          <p className="hint-line">
            <Lightbulb size={16} /> Ideas: <span className="es">{ex.starters.slice(0, 2).join("  ·  ")}</span>
          </p>
        </>
      )}
    </div>
  );
}
