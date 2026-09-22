// Spanish text with tap-to-gloss words. Tapping a word shows its meaning,
// syllables and audio; new words can be underlined; a character range can be
// highlighted in sync with audio playback.

import { useEffect, useMemo, useRef, useState } from "react";
import { TOKEN_INDEX, VOCAB } from "../content";
import { normalize } from "../engine/text";
import { AudioButton } from "./audio";

interface Props {
  text: string;
  className?: string;
  /** Vocab ids to underline as new. */
  newWords?: Set<string>;
  /** [start, end) character range currently being spoken. */
  speaking?: [number, number] | null;
  glosses?: boolean;
}

interface Token {
  raw: string;
  start: number;
  lead: string;
  core: string;
  trail: string;
  vocabId: string | null;
}

function tokenizeDisplay(text: string): Token[] {
  const out: Token[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const lead = raw.match(/^[¿¡"«(]*/)?.[0] ?? "";
    const trail = raw.match(/[?!.,;:"»)…]*$/)?.[0] ?? "";
    const core = raw.slice(lead.length, raw.length - trail.length);
    const ids = TOKEN_INDEX.get(normalize(core)) ?? [];
    // Prefer a teachable word over a function word, and a single-word entry.
    const best = ids.map((id) => VOCAB[id]).filter(Boolean).sort((a, b) => Number(b.drill) - Number(a.drill) || a.es.split(" ").length - b.es.split(" ").length)[0];
    out.push({ raw, start: m.index, lead, core, trail, vocabId: best?.id ?? null });
  }
  return out;
}

export function SpanishText({ text, className, newWords, speaking, glosses = true }: Props) {
  const tokens = useMemo(() => tokenizeDisplay(text), [text]);
  const [open, setOpen] = useState<number | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (open == null) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && wrap.current?.contains(e.target as Node)) return;
      setOpen(null);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  const toggle = (i: number, el: HTMLElement) => {
    if (open === i) return setOpen(null);
    const host = wrap.current!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(0, Math.min(r.left - host.left, host.width - 200)), top: r.bottom - host.top + 8 });
    setOpen(i);
  };

  const openTok = open != null ? tokens[open] : null;
  const v = openTok?.vocabId ? VOCAB[openTok.vocabId] : null;

  return (
    <span ref={wrap} className={`es ${className ?? ""}`} style={{ position: "relative", display: "inline" }} lang="es">
      {tokens.map((t, i) => {
        const isSpeaking = speaking && t.start < speaking[1] && t.start + t.raw.length > speaking[0];
        const content = (
          <>
            {t.lead}
            {glosses && t.vocabId ? (
              <span
                role="button"
                tabIndex={0}
                aria-expanded={open === i}
                aria-label={`${t.core}: show meaning`}
                className={`word ${newWords?.has(t.vocabId) ? "new" : ""} ${isSpeaking ? "speaking" : ""}`}
                onClick={(e) => toggle(i, e.currentTarget)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle(i, e.currentTarget))}
              >
                {t.core}
              </span>
            ) : (
              <span className={isSpeaking ? "word speaking" : undefined}>{t.core}</span>
            )}
            {t.trail}
          </>
        );
        return (
          <span key={i}>
            {i > 0 && " "}
            {content}
          </span>
        );
      })}
      {openTok && pos && (
        <span className="gloss" style={{ left: pos.left, top: pos.top }} role="dialog" aria-label={`Meaning of ${openTok.core}`}>
          <span className="row" style={{ gap: 8, alignItems: "center" }}>
            <span className="grow">
              <span className="gloss-es" style={{ display: "block" }}>{v?.es ?? openTok.core}</span>
              <span className="muted" style={{ display: "block" }}>{v?.en ?? "—"}</span>
            </span>
            <AudioButton text={openTok.core} size="sm" />
          </span>
          {v && (
            <span className="tiny faint" style={{ display: "block", marginTop: 6 }}>
              <span className="syllables">{v.syllables}</span>
              {v.gender && <> · {v.gender === "f" ? "feminine" : v.gender === "m" ? "masculine" : ""}</>}
              {v.region && <> · {v.region}</>}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
