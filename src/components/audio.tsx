import { useCallback, useEffect, useRef, useState } from "react";
import { Snail, Volume2 } from "lucide-react";
import { speak, stopSpeaking, ttsAvailable, RATE } from "../services/tts";
import { getLearner } from "../state/store";

// Total time audio has played, so sessions can credit listening time honestly.
let spokenMs = 0;
export function takeSpokenMs(): number {
  const v = spokenMs;
  spokenMs = 0;
  return v;
}

export type Speed = "slow" | "normal" | "fast";

export interface PlayOptions {
  speed?: Speed;
  speaker?: number;
  onBoundary?: (charIndex: number, charLength: number) => void;
}

export function useAudio() {
  const [playing, setPlaying] = useState<string | null>(null);
  const token = useRef(0);
  useEffect(() => () => stopSpeaking(), []);
  const play = useCallback(async (text: string, opts: PlayOptions = {}, key = text) => {
    const s = getLearner()?.settings;
    const base = s?.audioRate ?? 1;
    const rate = RATE[opts.speed ?? "normal"] * base;
    const my = ++token.current;
    setPlaying(key);
    const ms = await speak(text, { rate, variety: s?.variety ?? "latam", voiceURI: s?.voiceURI ?? null, speaker: opts.speaker, onBoundary: opts.onBoundary });
    spokenMs += ms;
    if (token.current === my) setPlaying(null);
    return ms;
  }, []);
  const stop = useCallback(() => {
    token.current++;
    stopSpeaking();
    setPlaying(null);
  }, []);
  return { play, stop, playing, available: ttsAvailable() };
}

export function AudioButton({ text, size, speed, label, autoPlay, speaker }: { text: string; size?: "sm" | "lg"; speed?: Speed; label?: string; autoPlay?: boolean; speaker?: number }) {
  const { play, stop, playing, available } = useAudio();
  const key = `${text}:${speed ?? "normal"}`;
  const isPlaying = playing === key;
  useEffect(() => {
    if (autoPlay && available) {
      const t = setTimeout(() => play(text, { speed, speaker }, key), 250);
      return () => clearTimeout(t);
    }
  }, [autoPlay, text]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!available) return null;
  const Icon = speed === "slow" ? Snail : Volume2;
  const iconSize = size === "lg" ? 34 : size === "sm" ? 17 : 21;
  return (
    <button
      type="button"
      className={`audio-btn ${size ?? ""} ${isPlaying ? "playing" : ""}`}
      aria-label={label ?? (speed === "slow" ? "Play slowly" : "Play audio")}
      onClick={() => (isPlaying ? stop() : play(text, { speed, speaker }, key))}
    >
      <Icon size={iconSize} strokeWidth={2.2} />
    </button>
  );
}

/** Normal + slow playback side by side. */
export function AudioPair({ text, autoPlay, size }: { text: string; autoPlay?: boolean; size?: "sm" | "lg" }) {
  return (
    <div className="audio-row">
      <AudioButton text={text} autoPlay={autoPlay} size={size} />
      <AudioButton text={text} speed="slow" size="sm" />
    </div>
  );
}
