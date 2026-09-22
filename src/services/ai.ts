// Client for the optional AI conversation service (server/index.ts).
// When the service isn't running, the app says so and uses guided roleplays.

import type { AiLearnerContext } from "../engine/conversation";

export interface AiStatus {
  available: boolean;
  model?: string;
  reason?: string;
}

// The conversation API lives next to the app by default; VITE_API_BASE can point elsewhere.
const API = import.meta.env.VITE_API_BASE ?? `${import.meta.env.BASE_URL}api`;

let statusCache: { at: number; value: AiStatus } | null = null;

export async function aiStatus(force = false): Promise<AiStatus> {
  if (!force && statusCache && Date.now() - statusCache.at < 30_000) return statusCache.value;
  let value: AiStatus;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${API}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    const body = res.ok && res.headers.get("content-type")?.includes("json") ? await res.json() : null;
    value = body?.conversation ? { available: true, model: body.model } : { available: false, reason: body?.reason ?? "The AI conversation service isn't configured." };
  } catch {
    value = { available: false, reason: "The AI conversation service isn't running." };
  }
  statusCache = { at: Date.now(), value };
  return value;
}

export interface AiScenario {
  title: string;
  setting: string;
  role: string;
  partner: string;
  goals: string[];
}

export interface AiTurnRequest {
  context: AiLearnerContext;
  scenario: AiScenario | null;
  history: { role: "partner" | "learner"; text: string }[];
}

export interface AiTurnResponse {
  reply: string;
  replyEn: string;
  understood: boolean;
  relevance: number;
  correction: { original: string; corrected: string; explanation: string } | null;
  newWords: { es: string; en: string }[];
  goalsMet: string[];
  shouldEnd: boolean;
}

export async function aiTurn(req: AiTurnRequest): Promise<AiTurnResponse> {
  const res = await fetch(`${API}/converse`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req) });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `The conversation service returned ${res.status}.`);
  }
  return res.json();
}
