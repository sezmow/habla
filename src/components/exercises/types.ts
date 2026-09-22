import type { MutableRefObject } from "react";
import type { SpeechEvaluation, TokenDiff, Verdict } from "../../engine/answer";
import type { Skill } from "../../engine/types";

export interface FeedbackInfo {
  title: string;
  answer?: string;
  answerLabel?: string;
  diff?: TokenDiff[];
  notes: string[];
  translation?: string;
}

export interface Outcome {
  quality: number;
  verdict: Verdict;
  given: string;
  expected: string;
  diff: TokenDiff[];
  hinted?: boolean;
  speech?: SpeechEvaluation | null;
  selfAssessed?: boolean;
  speakingSeconds?: number;
  perItem?: Record<string, number>;
  /** When a speaking task was answered by typing, it's production evidence. */
  skillOverride?: Skill;
  feedback: FeedbackInfo;
  /** The view shows its own detailed result (speaking); the footer stays compact. */
  inlineResult?: boolean;
}

export interface ViewProps<E> {
  ex: E;
  checked: boolean;
  onReady: (ready: boolean) => void;
  submitRef: MutableRefObject<(() => void) | null>;
  onOutcome: (o: Outcome) => void;
}

export function titleFor(verdict: Verdict): string {
  return verdict === "correct" ? "Correct" : verdict === "almost" ? "Almost there" : "Not quite";
}
