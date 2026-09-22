import { describe, expect, it } from "vitest";
import { CONCEPTS, CONTENT_STATS, LESSONS, SCENARIOS, SENTENCES, VOCAB, LESSON_ORDER, TOKEN_INDEX, CONCEPT_IDS_USED } from "./index";
import { CONCEPT_DEFS } from "./concepts";
import { tokenize } from "../engine/text";

describe("content integrity", () => {
  it("has a substantial curriculum", () => {
    expect(CONTENT_STATS.lessons).toBeGreaterThan(35);
    expect(CONTENT_STATS.sentences).toBeGreaterThan(200);
  });
  it("resolves every concept drill", () => {
    for (const def of CONCEPT_DEFS) {
      expect(CONCEPTS[def.id].drills.length, def.id).toBe(def.drillText.length);
    }
  });
  it("references only known concepts", () => {
    for (const id of CONCEPT_IDS_USED) expect(CONCEPTS[id], id).toBeTruthy();
  });
  it("references existing vocab and lessons in scenarios", () => {
    for (const s of SCENARIOS) {
      for (const v of s.vocab) expect(VOCAB[v], `${s.id}:${v}`).toBeTruthy();
      if (s.requiresLesson) expect(LESSONS[s.requiresLesson], s.id).toBeTruthy();
    }
  });
  it("links vocabulary into sentences", () => {
    for (const s of Object.values(SENTENCES)) expect(s.vocab.length, s.es).toBeGreaterThan(0);
  });
  it("reports tokens not covered by any vocabulary", () => {
    const unknown = new Map<string, string>();
    for (const id of LESSON_ORDER) {
      for (const sid of LESSONS[id].sentences) {
        const s = SENTENCES[sid];
        const orig = s.es.split(/\s+/);
        tokenize(s.es).forEach((t, i) => {
          if (!TOKEN_INDEX.has(t) && !/^[A-ZÁÉÍÓÚÑ]/.test((orig[i] ?? "").replace(/^[¿¡]/, "")) && !/^\d/.test(t)) unknown.set(t, s.es);
        });
      }
    }
    console.log("uncovered tokens:", unknown.size, [...unknown.keys()].join(", "));
    console.log(CONTENT_STATS);
  });
});
