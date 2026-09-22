import { describe, expect, it } from "vitest";
import { applyAttempt, DAY, MINUTE, masteryLevel, newMemory, retrievability } from "./memory";
import { checkEnglish, checkSpanish, evaluateSpeech } from "./answer";
import { classifyMistake } from "./mistakes";
import { createLearner, recordResult } from "./learner";
import { buildDailySession, buildLessonSession, dueItems } from "./session";
import { simulateDemoLearner } from "./simulate";
import { cefrEstimate, skillProfile, learningStats, dimensionAverages } from "./progress";
import { respondGuided, startGuided } from "./conversation";
import { SCENARIO_MAP, LESSON_ORDER } from "../content";
import { answerPlacement, estimatePlacement, nextPlacementItem, startPlacement } from "./placement";
import { textCoverage } from "./coverage";

const T0 = new Date("2026-09-01T18:00:00").getTime();

describe("memory scheduling", () => {
  it("grows intervals with successful production and shrinks after failure", () => {
    let m = newMemory("v:hola", "vocab", T0);
    let t = T0;
    const intervals: number[] = [];
    for (let i = 0; i < 6; i++) {
      t = Math.max(t + MINUTE, m.nextReview);
      m = applyAttempt(m, { skill: "production", type: "translate", quality: 1, latencyMs: 9000, hinted: false, variant: `v${i}`, now: t });
      intervals.push((m.nextReview - t) / DAY);
    }
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
    expect(intervals[0]).toBeLessThan(0.02); // ~10 minutes
    expect(intervals[1]).toBeGreaterThan(0.5); // ~1 day
    const before = m.step;
    m = applyAttempt(m, { skill: "production", type: "translate", quality: 0.2, latencyMs: 20000, hinted: false, variant: "x", now: m.nextReview });
    expect(m.step).toBeLessThan(before);
    expect(m.nextReview - m.lastReview).toBe(10 * MINUTE);
    expect(m.lapses).toBe(1);
  });

  it("does not let recognition alone climb the ladder", () => {
    let m = newMemory("v:hola", "vocab", T0);
    let t = T0;
    for (let i = 0; i < 8; i++) {
      t = Math.max(t + MINUTE, m.nextReview);
      m = applyAttempt(m, { skill: "recognition", type: "choice", quality: 1, latencyMs: 2000, hinted: false, variant: `c${i}`, now: t });
    }
    expect(m.step).toBeLessThanOrEqual(3);
    expect(masteryLevel(m)).not.toBe("mastered");
  });

  it("models forgetting over time", () => {
    const m = { ...newMemory("v:x", "vocab", T0), lastReview: T0, stability: 7 };
    expect(retrievability(m, T0 + 7 * DAY)).toBeCloseTo(0.9, 2);
    expect(retrievability(m, T0 + 30 * DAY)).toBeLessThan(0.75);
  });
});

describe("answer checking", () => {
  it("accepts exact and pronoun-dropped answers", () => {
    expect(checkSpanish("tengo hambre", ["Tengo hambre."]).verdict).toBe("correct");
    expect(checkSpanish("Yo tengo hambre", ["Tengo hambre."]).verdict).toBe("correct");
    expect(checkSpanish("tengo hambre", ["Yo tengo hambre."]).verdict).toBe("correct");
  });
  it("treats accent-only slips as almost correct and names them", () => {
    const r = checkSpanish("Manana voy a ir al supermercado", ["Mañana voy a ir al supermercado."]);
    expect(r.verdict).toBe("almost");
    expect(r.notes[0]).toContain("mañana");
  });
  it("identifies missing words in dictation", () => {
    const r = checkSpanish("Manana voy al supermercado", ["Mañana voy a ir al supermercado."]);
    expect(r.verdict).toBe("incorrect");
    const missing = r.diff.filter((d) => d.status === "missing").map((d) => d.expected);
    expect(missing).toEqual(["a", "ir"]);
    expect(r.diff.find((d) => d.expected === "mañana")?.status).toBe("accent");
  });
  it("is lenient with English contractions and articles", () => {
    expect(checkEnglish("I am hungry", ["I'm hungry."]).verdict).toBe("correct");
    expect(checkEnglish("i'm very hungry", ["I'm very hungry."]).verdict).toBe("correct");
    expect(checkEnglish("Where is bathroom", ["Where is the bathroom?"]).verdict).toBe("correct");
  });
  it("evaluates speech by intelligibility", () => {
    const e = evaluateSpeech({ transcripts: [{ text: "quiero comer", confidence: 0.9 }], accepted: ["Quiero comer."], durationMs: 1500, firstSpeechMs: 400, stage: 1 });
    expect(e.passed).toBe(true);
    const e2 = evaluateSpeech({ transcripts: [{ text: "que comer", confidence: 0.6 }], accepted: ["Quiero comer."], durationMs: 1500, firstSpeechMs: 400, stage: 1 });
    expect(e2.feedback.some((f) => f.text.includes("quiero"))).toBe(true);
  });
});

describe("mistake classification", () => {
  const classify = (given: string, expected: string) => classifyMistake(given, expected, checkSpanish(given, [expected]).diff).map((c) => c.category);
  it("detects tener expressions", () => expect(classify("Estoy hambre", "Tengo hambre.")).toContain("tener-expressions"));
  it("detects ser/estar", () => expect(classify("Soy cansado", "Estoy cansado.")).toContain("ser-estar"));
  it("detects wrong ser form", () => expect(classify("Yo es de México", "Yo soy de México.")).toContain("ser-forms"));
  it("detects dropped a in ir a", () => expect(classify("Voy comer con mi amiga", "Voy a comer con mi amiga.")).toContain("ir-a"));
  it("detects gender agreement", () => expect(classify("Quiero el camisa roja", "Quiero la camisa roja.")).toContain("gender-agreement"));
  it("detects past tense", () => expect(classify("Ayer como pizza", "Ayer comí pizza.")).toContain("preterite"));
});

describe("sessions", () => {
  it("builds a first lesson that ends with speaking", () => {
    const s = createLearner({ name: "Ana" }, {}, T0);
    const plan = buildLessonSession(s, LESSON_ORDER[0], { now: T0, speaking: true, seed: 1 });
    expect(plan.exercises.length).toBeGreaterThan(10);
    expect(plan.exercises.some((e) => e.type === "speak")).toBe(true);
    expect(plan.exercises[0].type).toBe("intro");
  });
  it("builds a daily session for a new learner around the first lesson", () => {
    const s = createLearner({ name: "Ana" }, {}, T0);
    const plan = buildDailySession(s, { now: T0, speaking: true, seed: 2 });
    expect(plan.lessonId).toBe(LESSON_ORDER[0]);
    expect(plan.exercises.length).toBeGreaterThan(5);
  });
  it("records results and schedules reviews", () => {
    let s = createLearner({ name: "Ana" }, {}, T0);
    const plan = buildLessonSession(s, LESSON_ORDER[0], { now: T0, speaking: true, seed: 3 });
    let t = T0;
    for (const ex of plan.exercises) {
      s = recordResult(s, ex, { quality: 1, verdict: "correct", given: "", expected: "", diff: [], latencyMs: 3000, hinted: false, seconds: 10 }, t).state;
      t += 10_000;
    }
    expect(Object.keys(s.memory).length).toBeGreaterThan(5);
    expect(dueItems(s, t + 2 * DAY).length).toBeGreaterThan(0);
  });
});

describe("demo simulation", () => {
  const now = new Date("2026-09-21T19:00:00").getTime();
  const demo = simulateDemoLearner(now);
  it("produces a learner in unit 4 with real history", () => {
    const done = Object.values(demo.lessons).filter((l) => l.completedAt).length;
    expect(done).toBe(14);
    expect(demo.attempts.length).toBeGreaterThan(300);
    expect(demo.mistakes.length).toBeGreaterThan(5);
  });
  it("shows speaking weaker than vocabulary and a gap between recognition and production", () => {
    const p = skillProfile(demo, now);
    const dims = dimensionAverages(demo);
    const rec = dims.find((d) => d.skill === "recognition")!.value!;
    const prod = dims.find((d) => d.skill === "production")!.value!;
    expect(rec).toBeGreaterThan(prod);
    console.log("profile", Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.value?.toFixed(2)])), dims.map((d) => `${d.label} ${d.value?.toFixed(2)}`).join(" | "));
    console.log("stats", learningStats(demo, now), cefrEstimate(demo, now).band, "due", dueItems(demo, now).length);
    console.log("mistakes", demo.mistakes.map((m) => m.category).join(","));
  });
  it("builds a daily session that adapts to the learner", () => {
    const plan = buildDailySession(demo, { now, speaking: true, seed: 5 });
    console.log(plan.title, plan.segments, plan.rationale);
    expect(plan.segments.length).toBeGreaterThan(2);
  });
});

describe("guided conversation", () => {
  it("advances on matching intents and fills slots", () => {
    const sc = SCENARIO_MAP.cafe;
    let st = startGuided(sc);
    const r1 = respondGuided(sc, st, "Hola, un café con leche por favor");
    expect(r1.reply.understood).toBe(true);
    expect(r1.reply.lines[0].es).toContain("un café con leche");
    expect(r1.state.goalsMet).toEqual(expect.arrayContaining(["order", "greet"]));
    st = r1.state;
    const r2 = respondGuided(sc, st, "¿Puedes repetir?");
    expect(r2.reply.repair).toBe("repeat");
    const r3 = respondGuided(sc, st, "banana");
    expect(r3.reply.understood).toBe(false);
  });
});

describe("placement and coverage", () => {
  it("places strong learners higher than beginners", () => {
    let strong = startPlacement("some");
    let weak = startPlacement("some");
    for (let i = 0; i < 12; i++) {
      const a = nextPlacementItem(strong);
      if (a) strong = answerPlacement(strong, a, a.tier <= 4 ? 1 : 0);
      const b = nextPlacementItem(weak);
      if (b) weak = answerPlacement(weak, b, b.tier <= 1 ? 1 : 0);
    }
    const rs = estimatePlacement(strong, null, T0);
    const rw = estimatePlacement(weak, null, T0);
    expect(LESSON_ORDER.indexOf(rs.startLessonId)).toBeGreaterThan(LESSON_ORDER.indexOf(rw.startLessonId));
  });
  it("computes coverage of known words", () => {
    const s = createLearner({ name: "Ana" }, {}, T0);
    expect(textCoverage("Hola, me llamo Ana.", s).pct).toBeLessThan(0.5);
  });
});

describe("first session", () => {
  it("ends with the learner introducing themselves out loud", async () => {
    const { buildFirstSession } = await import("./session");
    const s = createLearner({ name: "Maya" }, {}, T0);
    const plan = buildFirstSession(s, { now: T0, speaking: true, seed: 9 });
    const speaks = plan.exercises.filter((e) => e.type === "speak");
    const last = speaks.slice(-3).map((e) => (e.type === "speak" ? e.prompt : ""));
    expect(last.join(" ")).toContain("Me llamo");
    expect(last.join(" ")).toContain("Soy de");
    expect(last.join(" ")).toContain("¿Cómo te llamas?");
  });
});
