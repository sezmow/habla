// Core domain types for Habla's learning engine.
// Content types describe the curriculum; learner types describe memory and history.

export type Variety = "latam" | "mx" | "es" | "rioplatense";

export type PartOfSpeech =
  | "noun"
  | "verb"
  | "adjective"
  | "adverb"
  | "phrase"
  | "pronoun"
  | "preposition"
  | "conjunction"
  | "interjection"
  | "number"
  | "article"
  | "question"
  | "function";

export type Gender = "m" | "f" | "mf";

export interface VocabItem {
  id: string;
  es: string;
  en: string;
  altEn?: string[];
  pos: PartOfSpeech;
  gender?: Gender;
  /** Syllable breakdown, e.g. "pe·rro". */
  syllables: string;
  /** Spanish-only explanation, used once the learner is ready to drop English. */
  defEs?: string;
  /** A concept picture for "thinking in Spanish" exercises. */
  emoji?: string;
  related?: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** Approximate frequency rank in everyday Spanish (lower = more common). */
  frequency: number;
  lessonId: string;
  /** Normalized token sequences that count as an occurrence of this item. */
  keys: string[];
  /** Regional label when the word is not universal. */
  region?: string;
  /** Function words count for comprehension coverage but are not drilled alone. */
  drill: boolean;
  /** Verb infinitive when this item is a verb. */
  lemma?: string;
}

export interface Sentence {
  id: string;
  es: string;
  en: string;
  /** Other correct Spanish renderings. */
  alt: string[];
  altEn: string[];
  vocab: string[];
  concepts: string[];
  lessonId: string;
  /** Sentence starter used while assistance is high, e.g. "Tengo…". */
  starter?: string;
  /** One-line explanation of why the sentence is built this way. */
  note?: string;
}

export interface GrammarExample {
  es: string;
  en: string;
  highlight?: string;
}

export interface Concept {
  id: string;
  title: string;
  /** Short learner-facing summary: the one thing to remember. */
  remember: string;
  whatChanged: string;
  why: string;
  how: string;
  examples: GrammarExample[];
  /** Sentence ids used for targeted remediation drills. */
  drills: string[];
  lessonId?: string;
}

export type SpeakingStage = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface KeywordRequirement {
  /** Any one of these normalized fragments satisfies the requirement. */
  anyOf: string[];
  label: string;
}

export interface SpeakingPrompt {
  id: string;
  stage: SpeakingStage;
  prompt: string;
  promptEn: string;
  /** Model sentence to repeat (stage 1) or complete (stage 2). */
  model?: string;
  starter?: string;
  requirements: KeywordRequirement[];
  sample: string;
  sampleEn: string;
  scene?: string;
  lessonId?: string;
}

export type LessonKind = "core" | "scenario";

export interface Lesson {
  id: string;
  unitId: string;
  index: number;
  title: string;
  titleEs: string;
  goal: string;
  kind: LessonKind;
  vocab: string[];
  sentences: string[];
  concepts: string[];
  speaking: string[];
  scenarioId?: string;
  minutes: number;
}

export interface Unit {
  id: string;
  levelId: string;
  index: number;
  title: string;
  description: string;
  canDo: string[];
  lessons: string[];
}

export interface Level {
  id: string;
  index: number;
  title: string;
  cefr: string;
  description: string;
  units: string[];
  /** Units exist on the roadmap but lessons are not yet authored. */
  available: boolean;
}

// ─── Listening & scenarios ───────────────────────────────────────────────

export interface ListeningLine {
  speaker?: string;
  es: string;
  en: string;
}

export interface ComprehensionQuestion {
  q: string;
  options: string[];
  answer: number;
}

export type ListeningSpeed = "slow" | "normal" | "fast";

export interface ListeningPiece {
  id: string;
  title: string;
  kind: "story" | "dialogue" | "description" | "voicemail";
  level: 1 | 2 | 3;
  speed: ListeningSpeed;
  minutes: number;
  summary: string;
  lines: ListeningLine[];
  questions: ComprehensionQuestion[];
  requiresLesson?: string;
  region?: string;
}

export interface SlotOption {
  /** Normalized fragment the learner might say. */
  match: string;
  /** How the partner refers to it, e.g. "un café". */
  display: string;
}

export interface ScenarioIntent {
  id: string;
  requirements: KeywordRequirement[];
  slot?: { name: string; options: SlotOption[] };
  reply?: { es: string; en: string };
  next: string | "end";
  goal?: string;
}

export interface ScenarioTurn {
  id: string;
  npc: { es: string; en: string };
  intents: ScenarioIntent[];
  starters: string[];
  reprompt: { es: string; en: string };
}

export interface Scenario {
  id: string;
  title: string;
  setting: string;
  role: string;
  partner: string;
  level: 1 | 2 | 3;
  difficulty: number;
  goals: { id: string; label: string }[];
  vocab: string[];
  phrases: string[];
  turns: ScenarioTurn[];
  requiresLesson?: string;
  emoji: string;
}

export interface PronunciationWord {
  es: string;
  en: string;
  syllables: string;
}

export interface PronunciationModule {
  id: string;
  sound: string;
  title: string;
  summary: string;
  tip: string;
  mouth: string;
  words: PronunciationWord[];
  contrast?: [string, string][];
  sentence: { es: string; en: string };
}

// ─── Learner state ───────────────────────────────────────────────────────

export type Skill =
  | "recognition"
  | "comprehension"
  | "recall"
  | "production"
  | "listening"
  | "speaking"
  | "pronunciation";

export const SKILLS: Skill[] = [
  "recognition",
  "comprehension",
  "recall",
  "production",
  "listening",
  "speaking",
  "pronunciation",
];

export type ItemKind = "vocab" | "sentence";

export interface MemoryState {
  id: string;
  kind: ItemKind;
  introducedAt: number;
  exposureCount: number;
  correctCount: number;
  incorrectCount: number;
  /** Successful retrievals that were not recognition-only. */
  recallSuccesses: number;
  lastSeen: number;
  lastCorrect: number | null;
  /** Last time the item was scheduled (a retrieval attempt). */
  lastReview: number;
  nextReview: number;
  /** Days until predicted recall drops to 90%. */
  stability: number;
  /** 0 (easy for this learner) … 1 (hard). */
  difficulty: number;
  /** Position on the spacing ladder. */
  step: number;
  lapses: number;
  scores: Record<Skill, number | null>;
  attempts: Record<Skill, number>;
  avgLatencyMs: number | null;
  confidence: number;
  /** Longest gap (days) after which the learner still recalled the item. */
  longestRecallGap: number;
  usedInSentence: boolean;
  /** Recent exercise variants, newest last, to avoid cramming. */
  recentVariants: string[];
  lastSkill: Skill | null;
}

export type ExerciseType =
  | "intro"
  | "grammar"
  | "choice"
  | "match"
  | "arrange"
  | "translate"
  | "fill"
  | "dictation"
  | "listen"
  | "speak"
  | "open"
  | "picture"
  | "concept"
  | "dialogue";

export interface AttemptRecord {
  at: number;
  itemId: string;
  skill: Skill;
  type: ExerciseType;
  correct: boolean;
  quality: number;
  latencyMs: number;
  /** Days since the item was last reviewed, at the time of this attempt. */
  gapDays: number;
  hinted: boolean;
}

export type MistakeCategory =
  | "ser-estar"
  | "ser-forms"
  | "tener-expressions"
  | "gender-agreement"
  | "por-para"
  | "preterite"
  | "verb-forms"
  | "gustar"
  | "ir-a"
  | "accents"
  | "word-order"
  | "missing-words"
  | "vocabulary"
  | "listening-detail"
  | "pronunciation";

export interface MistakeRecord {
  id: string;
  at: number;
  category: MistakeCategory;
  itemId?: string;
  prompt: string;
  expected: string;
  given: string;
  detail: string;
}

export interface DayActivity {
  date: string;
  seconds: number;
  xp: number;
  speakingSeconds: number;
  listeningSeconds: number;
  reviewed: number;
  learned: number;
  exercises: number;
  correct: number;
  sessions: number;
}

export interface ConversationRecord {
  id: string;
  at: number;
  scenarioId: string | null;
  title: string;
  turns: number;
  goalsMet: number;
  goalsTotal: number;
  wordsUsed: string[];
  practiced: string[];
  scores: ConversationScores;
  mode: "guided" | "ai";
}

export interface ConversationScores {
  comprehension: number;
  relevance: number;
  vocabulary: number;
  grammar: number;
  fluency: number | null;
  pronunciation: number | null;
  continuation: number;
}

export type AssistanceMode = "adaptive" | "more" | "less";
export type DifficultyPreference = "adaptive" | "gentle" | "challenging";
export type ThemePreference = "system" | "light" | "dark";

export interface Settings {
  variety: Variety;
  goalMinutes: 5 | 10 | 15 | 30 | 60;
  reminders: { enabled: boolean; time: string };
  audioRate: number;
  difficulty: DifficultyPreference;
  assistance: AssistanceMode;
  theme: ThemePreference;
  reducedMotion: "system" | "on" | "off";
  speakingEnabled: boolean;
  voiceURI: string | null;
  captions: boolean;
  aiConversation: boolean;
}

export type Reason = "travel" | "work" | "family" | "school" | "culture" | "move";

export interface Profile {
  name: string;
  createdAt: number;
  priorStudy: "none" | "some" | "lots";
  reason: Reason;
  selfUnderstanding: "none" | "some" | "good";
  selfSpeaking: "none" | "some" | "good";
  placement: PlacementResult | null;
}

export interface PlacementResult {
  at: number;
  band: string;
  startLessonId: string;
  levelIndex: number;
  scores: { vocabulary: number; grammar: number; listening: number; reading: number; production: number; speaking: number | null };
}

export interface LessonProgress {
  completedAt: number | null;
  attempts: number;
  bestAccuracy: number;
  testedOut?: boolean;
}

export interface LearnerState {
  version: number;
  onboarded: boolean;
  demo: boolean;
  profile: Profile;
  settings: Settings;
  memory: Record<string, MemoryState>;
  lessons: Record<string, LessonProgress>;
  mistakes: MistakeRecord[];
  attempts: AttemptRecord[];
  activity: Record<string, DayActivity>;
  conversations: ConversationRecord[];
  achievements: Record<string, number>;
  listened: Record<string, number>;
  pronunciation: Record<string, { attempts: number; best: number; lastAt: number }>;
  xp: number;
  /** Rest days the learner has used to protect consistency this week. */
  restDays: string[];
}
