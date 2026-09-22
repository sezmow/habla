// Comprehensible input: how much of a text the learner already knows.

import type { LearnerState } from "./types";
import { TOKEN_INDEX, VOCAB } from "../content";
import { normalize } from "./text";

export interface Coverage {
  known: number;
  total: number;
  pct: number;
  unknown: string[];
}

export function textCoverage(text: string, state: LearnerState): Coverage {
  const raw = text.split(/\s+/).filter(Boolean);
  let known = 0;
  let total = 0;
  const unknown: string[] = [];
  raw.forEach((w, i) => {
    const bare = w.replace(/^[¿¡"«(]+|[?!.,;:"»)…]+$/g, "");
    const tok = normalize(bare);
    if (!tok) return;
    total++;
    const isName = /^[A-ZÁÉÍÓÚÑ]/.test(bare) && i > 0 && !TOKEN_INDEX.has(tok);
    const ids = TOKEN_INDEX.get(tok) ?? [];
    if (isName || /^\d/.test(tok) || ids.some((id) => (state.memory[id]?.exposureCount ?? 0) > 0 || (VOCAB[id] && !VOCAB[id].drill && isIntroducedFunction(id, state)))) known++;
    else unknown.push(bare);
  });
  return { known, total, pct: total ? known / total : 1, unknown: [...new Set(unknown)] };
}

/** Function words count as known once the learner has completed their lesson. */
function isIntroducedFunction(id: string, state: LearnerState): boolean {
  return !!state.lessons[VOCAB[id].lessonId]?.completedAt;
}
