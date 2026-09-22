// Habla server: serves the built app and the optional AI conversation partner.
//
//   ANTHROPIC_API_KEY=… npm run server      # http://localhost:8787
//
// Without credentials the app still works fully; /api/health reports that the
// conversation partner is unavailable and the UI offers guided roleplays.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const PORT = Number(process.env.PORT ?? 8787);
const MODEL = "claude-opus-5";
const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, "../dist");

const hasCredentials = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const client = hasCredentials ? new Anthropic() : null;

// ─── Request / response shapes ────────────────────────────────────────────

const RequestSchema = z.object({
  context: z.object({
    name: z.string().max(60),
    variety: z.string().max(80),
    level: z.string().max(80),
    difficulty: z.number().min(0).max(1),
    knownWords: z.array(z.string().max(60)).max(400),
    reviewWords: z.array(z.string().max(60)).max(30),
    recentMistakes: z.array(z.string().max(120)).max(10),
    grammarLearned: z.array(z.string().max(60)).max(60),
    topicsPracticed: z.array(z.string().max(80)).max(20),
    translationSupport: z.boolean(),
  }),
  scenario: z
    .object({
      title: z.string().max(120),
      setting: z.string().max(300),
      role: z.string().max(300),
      partner: z.string().max(60),
      goals: z.array(z.string().max(120)).max(10),
    })
    .nullable(),
  history: z.array(z.object({ role: z.enum(["partner", "learner"]), text: z.string().max(1000) })).max(60),
});

const TurnSchema = z.object({
  reply: z.string().describe("Your next line in Spanish, as the conversation partner."),
  replyEn: z.string().describe("A natural English translation of your reply."),
  understood: z.boolean().describe("Whether the learner's last message communicated its meaning (true if there was no learner message yet)."),
  relevance: z.number().describe("0–1: how relevant the learner's last message was to the conversation (1 if none yet)."),
  correction: z
    .object({
      original: z.string(),
      corrected: z.string(),
      explanation: z.string().describe("One short, friendly sentence in English."),
    })
    .nullable()
    .describe("Only for a meaningful error in the learner's last message; null otherwise or when there is no learner message."),
  newWords: z.array(z.object({ es: z.string(), en: z.string() })).describe("Words in your reply that are NOT in the learner's known list (at most 2)."),
  goalsMet: z.array(z.string()).describe("Scenario goals the learner has now accomplished (exact goal labels)."),
  shouldEnd: z.boolean().describe("True when the conversation has reached a natural close."),
});

type TurnRequest = z.infer<typeof RequestSchema>;

// ─── Prompt ───────────────────────────────────────────────────────────────

// Stable instructions come first so they can be cached across turns.
const SYSTEM = `You are a Spanish conversation partner inside Habla, a language-learning app whose goal is to get learners actually speaking Spanish.

You are not a general chatbot. You hold a natural, friendly conversation in Spanish at exactly the learner's level:
- Use mostly words the learner already knows. Introduce at most one or two new words per turn, and only when the context makes their meaning clear.
- Keep sentences short and concrete at low difficulty; allow longer, more varied sentences as difficulty rises.
- Use only grammar the learner has learned. At low difficulty stay in the present tense unless the learner uses another tense.
- Ask one question per turn so the learner always knows how to respond. Build on what they said.
- Naturally weave in words they are currently reviewing when it fits.
- If the learner's message has a meaningful error, still respond to what they meant, and report one gentle correction. Ignore missing accents and tiny slips. Never correct regional variation that is valid Spanish. A learner who communicates successfully with imperfect grammar has succeeded.
- If the learner writes in English or seems lost, reply in very simple Spanish and model a sentence they could use.
- Never switch the conversation into English. Never lecture.
- Do not use slang unless the chosen variety uses it in everyday speech, and keep it rare.
- End the conversation naturally after the scenario goals are met or after roughly 8–10 exchanges.

Difficulty scale: 0.1 absolute beginner · 0.2 beginner · 0.3 advanced beginner · 0.4 early conversational · 0.5 intermediate. Map it to sentence length (about 5 + 12 × difficulty words), speech complexity and the number of unfamiliar words.`;

function learnerBrief(req: TurnRequest): string {
  const c = req.context;
  const s = req.scenario;
  return [
    `Learner: ${c.name || "the learner"}. Level: ${c.level}. Difficulty: ${c.difficulty}. Variety: ${c.variety}.`,
    `Known words (${c.knownWords.length}): ${c.knownWords.join(", ") || "very few yet"}.`,
    c.reviewWords.length ? `Words being reviewed now — use one or two if natural: ${c.reviewWords.join(", ")}.` : "",
    c.grammarLearned.length ? `Grammar learned: ${c.grammarLearned.join(", ")}.` : "Grammar learned: basic present tense only.",
    c.recentMistakes.length ? `Recent recurring mistakes (watch for these): ${c.recentMistakes.join("; ")}.` : "",
    c.topicsPracticed.length ? `Topics practiced: ${c.topicsPracticed.join(", ")}.` : "",
    s ? `Scenario: ${s.title}. Setting: ${s.setting} Learner's task: ${s.role} You play: ${s.partner}.${s.goals.length ? ` Goals: ${s.goals.join("; ")}.` : ""}` : "",
    req.history.length === 0 ? "Open the conversation with a short greeting and one easy question." : "",
    "Latency-sensitive; begin your answer immediately.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function converse(req: TurnRequest) {
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  // The brief is the first user turn; the transcript follows as alternating turns.
  const transcript = req.history.map((m) => `${m.role === "partner" ? "Partner" : "Learner"}: ${m.text}`).join("\n");
  messages.push({
    role: "user",
    content: `${learnerBrief(req)}\n\n${transcript ? `Conversation so far:\n${transcript}\n\nRespond to the learner's last message.` : "(No messages yet.)"}`,
  });

  const response = await client!.beta.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages,
    output_config: { effort: "low", format: betaZodOutputFormat(TurnSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  if (response.stop_reason === "refusal") throw new HttpError(422, "The conversation partner couldn't continue this conversation.");
  if (!response.parsed_output) throw new HttpError(502, "The conversation partner returned an unexpected response.");
  const out = response.parsed_output;
  return { ...out, relevance: Math.max(0, Math.min(1, out.relevance)), newWords: out.newWords.slice(0, 2) };
}

// ─── HTTP ─────────────────────────────────────────────────────────────────

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 200_000) throw new HttpError(413, "Request too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  if (!fs.existsSync(DIST)) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Build the app first with `npm run build`, or use `npm run dev` for development.");
    return;
  }
  const url = new URL(req.url ?? "/", "http://localhost");
  let file = path.join(DIST, decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  const ext = path.extname(file);
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache" });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/health") {
      return send(res, 200, client ? { conversation: true, model: MODEL } : { conversation: false, reason: "No Anthropic API key is configured on the server." });
    }
    if (req.url === "/api/converse" && req.method === "POST") {
      if (!client) throw new HttpError(503, "The AI conversation partner isn't configured.");
      const parsed = RequestSchema.safeParse(await readJson(req));
      if (!parsed.success) throw new HttpError(400, "Invalid conversation request.");
      return send(res, 200, await converse(parsed.data));
    }
    if (req.url?.startsWith("/api/")) throw new HttpError(404, "Not found.");
    serveStatic(req, res);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    if (e instanceof Anthropic.RateLimitError) return send(res, 429, { error: "The conversation partner is busy. Try again in a moment." });
    if (e instanceof Anthropic.AuthenticationError) return send(res, 503, { error: "The server's Anthropic API key was rejected." });
    if (e instanceof Anthropic.APIConnectionError) return send(res, 502, { error: "Couldn't reach the conversation service." });
    if (e instanceof Anthropic.APIError) return send(res, 502, { error: `Conversation service error (${e.status}).` });
    console.error(e);
    send(res, 500, { error: "Something went wrong." });
  }
});

server.listen(PORT, () => {
  console.log(`Habla server on http://localhost:${PORT} — AI conversation ${client ? `enabled (${MODEL})` : "disabled (set ANTHROPIC_API_KEY to enable)"}`);
});
