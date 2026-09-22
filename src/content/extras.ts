// Phrase bank, curriculum roadmap beyond the authored levels, placement items
// and daily speaking challenges.

import type { UnitDef } from "./build";
import type { SpeakingStage } from "../engine/types";

// ─── Phrase bank ─────────────────────────────────────────────────────────
// Survival and conversation phrases that should become automatic.

export type PhraseCategory = "survival" | "conversation" | "reactions" | "polite";

export interface PhraseDef {
  es: string;
  en: string;
  category: PhraseCategory;
  when: string;
  region?: string;
  emoji?: string;
}

export const PHRASES: PhraseDef[] = [
  { es: "No entiendo.", en: "I don't understand.", category: "survival", when: "Any time you're lost. It's always okay to say it." },
  { es: "¿Puedes repetirlo?", en: "Can you repeat that?", category: "survival", when: "Ask someone to say it again (informal)." },
  { es: "Más despacio, por favor.", en: "Slower, please.", category: "survival", when: "When someone speaks too fast." },
  { es: "¿Cómo se dice ___ en español?", en: "How do you say ___ in Spanish?", category: "survival", when: "Fill a gap without switching to English." },
  { es: "¿Qué significa…?", en: "What does … mean?", category: "survival", when: "Ask about a word you heard." },
  { es: "Tengo una pregunta.", en: "I have a question.", category: "survival", when: "Before asking something — in class, at work, anywhere." },
  { es: "No sé.", en: "I don't know.", category: "conversation", when: "An honest, very common answer." },
  { es: "Depende.", en: "It depends.", category: "conversation", when: "When the answer isn't simple." },
  { es: "Creo que sí.", en: "I think so.", category: "conversation", when: "A soft yes." },
  { es: "Creo que no.", en: "I don't think so.", category: "conversation", when: "A soft no." },
  { es: "¿Qué quieres hacer?", en: "What do you want to do?", category: "conversation", when: "Making plans with a friend." },
  { es: "A ver…", en: "Let's see…", category: "conversation", when: "Buys you a second to think — natives say it constantly." },
  { es: "Bueno…", en: "Well… / Okay…", category: "conversation", when: "Start a reply or move the conversation on." },
  { es: "¿En serio?", en: "Really? / Seriously?", category: "reactions", when: "React to surprising news." },
  { es: "¡Qué bien!", en: "That's great!", category: "reactions", when: "React to good news." },
  { es: "¡Qué pena!", en: "What a shame!", category: "reactions", when: "React to bad news." },
  { es: "¡Claro!", en: "Of course! / Sure!", category: "reactions", when: "Enthusiastic yes." },
  { es: "Vale.", en: "Okay.", category: "reactions", when: "Agreeing. Very common in Spain.", region: "Spain" },
  { es: "Perdón.", en: "Sorry. / Excuse me.", category: "polite", when: "Apologize or get past someone." },
  { es: "Disculpe.", en: "Excuse me (formal).", category: "polite", when: "Get a stranger's attention politely." },
  { es: "De nada.", en: "You're welcome.", category: "polite", when: "Reply to gracias." },
  { es: "Con permiso.", en: "Excuse me (may I pass).", category: "polite", when: "Moving past people or leaving a table." },
  { es: "¡Buen provecho!", en: "Enjoy your meal!", category: "polite", when: "Said to people who are eating." },
  { es: "No pasa nada.", en: "No problem. / It's fine.", category: "polite", when: "Reassure someone after a small mistake." },
];

// ─── Roadmap ─────────────────────────────────────────────────────────────

export const LEVEL3_ROADMAP: UnitDef[] = [
  { title: "Storytelling", description: "Tell longer stories with background and events: the imperfect vs. the preterite.", canDo: ["Describe what things were like", "Tell a story with background and events"], lessons: [] },
  { title: "Explaining Problems", description: "Describe what's wrong at the doctor, with a landlord or at work.", canDo: ["Explain a problem clearly", "Ask for help"], lessons: [] },
  { title: "Opinions in Depth", description: "Give reasons, disagree politely and change your mind.", canDo: ["Justify an opinion", "Disagree politely"], lessons: [] },
  { title: "Uncertainty", description: "Maybe, probably, I doubt it: first steps into the subjunctive.", canDo: ["Express doubt and possibility"], lessons: [] },
  { title: "Natural Conversation", description: "Fillers, interruptions and keeping a conversation alive.", canDo: ["Keep a conversation going", "Use natural fillers"], lessons: [] },
  { title: "Casual Expressions", description: "Everyday expressions, clearly labeled by region.", canDo: ["Understand common casual expressions"], lessons: [] },
];

export const LEVEL4_ROADMAP: UnitDef[] = [
  { title: "Longer Conversations", description: "Sustain 10-minute conversations on familiar topics.", canDo: ["Hold a longer conversation"], lessons: [] },
  { title: "News and Podcasts", description: "Follow the main points of authentic audio.", canDo: ["Follow news on familiar topics"], lessons: [] },
  { title: "Abstract Ideas", description: "Talk about plans, hopes, society and change.", canDo: ["Discuss abstract topics"], lessons: [] },
  { title: "Nuance and Idioms", description: "Idiomatic expressions and the subtleties of tone.", canDo: ["Use common idioms appropriately"], lessons: [] },
  { title: "Regional Differences", description: "Hear Mexico, the Caribbean, the Southern Cone and Spain side by side.", canDo: ["Understand major regional accents"], lessons: [] },
  { title: "Complex Grammar", description: "Subjunctive, conditionals and reported speech in context.", canDo: ["Use complex sentences"], lessons: [] },
];

// ─── Placement ───────────────────────────────────────────────────────────

export type PlacementSkill = "vocabulary" | "grammar" | "listening" | "reading" | "production" | "speaking";

export interface PlacementItem {
  id: string;
  tier: 1 | 2 | 3 | 4 | 5;
  skill: PlacementSkill;
  prompt: string;
  /** For listening items: text spoken by TTS. */
  audio?: string;
  passage?: string;
  options?: string[];
  answer?: number;
  /** For production/speaking: accepted Spanish answers. */
  accepted?: string[];
}

export const PLACEMENT: PlacementItem[] = [
  // Tier 1 — absolute basics
  { id: "p1", tier: 1, skill: "vocabulary", prompt: "What does “gracias” mean?", options: ["Please", "Thank you", "Hello", "Sorry"], answer: 1 },
  { id: "p2", tier: 1, skill: "listening", prompt: "What did you hear?", audio: "Buenos días.", options: ["Good night", "Good morning", "Goodbye", "Good afternoon"], answer: 1 },
  { id: "p3", tier: 1, skill: "production", prompt: "Write in Spanish: “My name is Ana.”", accepted: ["Me llamo Ana.", "Mi nombre es Ana.", "Soy Ana.", "Yo me llamo Ana."] },
  { id: "p4", tier: 1, skill: "reading", prompt: "“Soy de México.” — What does the speaker say?", options: ["They live in Mexico", "They are from Mexico", "They like Mexico", "They are going to Mexico"], answer: 1 },
  // Tier 2 — early A1
  { id: "p5", tier: 2, skill: "grammar", prompt: "Choose the correct word: “Yo ___ hambre.”", options: ["soy", "estoy", "tengo", "es"], answer: 2 },
  { id: "p6", tier: 2, skill: "vocabulary", prompt: "Which word means “tomorrow”?", options: ["ayer", "hoy", "mañana", "tarde"], answer: 2 },
  { id: "p7", tier: 2, skill: "listening", prompt: "How old is the person?", audio: "Tengo veinte años.", options: ["12", "20", "30", "2"], answer: 1 },
  { id: "p8", tier: 2, skill: "production", prompt: "Write in Spanish: “I'm hungry.”", accepted: ["Tengo hambre.", "Yo tengo hambre."] },
  // Tier 3 — solid A1
  { id: "p9", tier: 3, skill: "grammar", prompt: "Choose: “Hoy ___ muy cansado.”", options: ["soy", "estoy", "tengo", "hay"], answer: 1 },
  { id: "p10", tier: 3, skill: "grammar", prompt: "Choose: “Me ___ las manzanas.”", options: ["gusta", "gustan", "gusto", "gustas"], answer: 1 },
  { id: "p11", tier: 3, skill: "reading", passage: "Carlos se levanta a las siete. Primero se ducha y después desayuna. Va al trabajo en metro.", prompt: "What does Carlos do right after he showers?", options: ["Goes to work", "Has breakfast", "Gets up", "Takes the metro"], answer: 1 },
  { id: "p12", tier: 3, skill: "listening", prompt: "Where is the bank?", audio: "El banco está a la izquierda, al lado del hotel.", options: ["On the right, by the park", "On the left, next to the hotel", "Straight ahead", "Far away"], answer: 1 },
  { id: "p13", tier: 3, skill: "production", prompt: "Write in Spanish: “Where is the bathroom?”", accepted: ["¿Dónde está el baño?"] },
  // Tier 4 — A2
  { id: "p14", tier: 4, skill: "grammar", prompt: "Choose: “Ayer ___ al cine con mis amigos.”", options: ["voy", "fui", "iba a", "vamos"], answer: 1 },
  { id: "p15", tier: 4, skill: "vocabulary", prompt: "“De repente” means…", options: ["Slowly", "Suddenly", "Finally", "Again"], answer: 1 },
  { id: "p16", tier: 4, skill: "reading", passage: "El sábado Elena tiene que trabajar por la mañana, pero por la tarde está libre. Quiere ir al cine.", prompt: "When can Elena go to the movies?", options: ["Saturday morning", "Saturday afternoon", "Sunday", "Never"], answer: 1 },
  { id: "p17", tier: 4, skill: "listening", prompt: "What did the person do?", audio: "El fin de semana pasado fui a la playa y comí pescado.", options: ["Went to the beach and ate fish", "Is going to the beach", "Stayed home", "Went to a restaurant in the city"], answer: 0 },
  { id: "p18", tier: 4, skill: "production", prompt: "Write in Spanish: “Tomorrow I'm going to eat with my family.”", accepted: ["Mañana voy a comer con mi familia.", "Voy a comer con mi familia mañana."] },
  // Tier 5 — beyond A2
  { id: "p19", tier: 5, skill: "grammar", prompt: "Choose: “Cuando era niño, ___ al fútbol todos los días.”", options: ["jugué", "jugaba", "juego", "jugaré"], answer: 1 },
  { id: "p20", tier: 5, skill: "grammar", prompt: "Choose: “Espero que ___ un buen día.”", options: ["tienes", "tengas", "tener", "tuviste"], answer: 1 },
  { id: "p21", tier: 5, skill: "reading", passage: "Aunque el restaurante era caro, decidimos quedarnos porque la comida olía increíble.", prompt: "Why did they stay?", options: ["It was cheap", "The food smelled amazing", "They were tired", "A friend insisted"], answer: 1 },
  { id: "p22", tier: 5, skill: "production", prompt: "Write in Spanish: “I think it's a good idea.”", accepted: ["Creo que es una buena idea.", "Pienso que es una buena idea.", "Me parece una buena idea."] },
];

export const PLACEMENT_SPEAKING = {
  prompt: "¿Cómo te llamas y de dónde eres?",
  promptEn: "What's your name and where are you from?",
  requirements: [["me llamo", "soy", "mi nombre"], ["de", "vivo"]],
};

// ─── Daily speaking challenges ───────────────────────────────────────────

export interface Challenge {
  stage: SpeakingStage;
  prompt: string;
  promptEn: string;
  starter: string;
  sample: string;
  requirements: string[];
  minLesson: string;
}

export const CHALLENGES: Challenge[] = [
  { stage: 3, prompt: "Preséntate en dos frases.", promptEn: "Introduce yourself in two sentences.", starter: "Hola, me llamo…", sample: "Hola, me llamo {name}. Soy de Chicago.", requirements: ["me llamo|soy|mi nombre"], minLesson: "u1-l2" },
  { stage: 4, prompt: "¿Cómo estás hoy y por qué?", promptEn: "How are you today and why?", starter: "Hoy estoy…", sample: "Hoy estoy un poco cansado porque trabajé mucho.", requirements: ["estoy"], minLesson: "u1-l4" },
  { stage: 4, prompt: "Describe a tu familia.", promptEn: "Describe your family.", starter: "Mi familia…", sample: "Mi familia es pequeña. Tengo una hermana.", requirements: ["familia|madre|padre|hermano|hermana|tengo"], minLesson: "u2-l2" },
  { stage: 4, prompt: "¿Qué te gusta comer?", promptEn: "What do you like to eat?", starter: "Me gusta…", sample: "Me gusta mucho el pollo con arroz, pero no me gusta el queso.", requirements: ["me gusta|me gustan"], minLesson: "u3-l2" },
  { stage: 4, prompt: "Describe tu rutina de la mañana.", promptEn: "Describe your morning routine.", starter: "Me levanto a las…", sample: "Me levanto a las siete, me ducho y desayuno café.", requirements: ["me levanto|desayuno|me ducho"], minLesson: "u4-l4" },
  { stage: 4, prompt: "¿Qué vas a hacer este fin de semana?", promptEn: "What are you going to do this weekend?", starter: "Voy a…", sample: "Voy a visitar a mi familia y voy a ir al cine.", requirements: ["voy a|vamos a"], minLesson: "u5-l4" },
  { stage: 4, prompt: "Describe lo que hiciste hoy.", promptEn: "Describe what you did today.", starter: "Hoy…", sample: "Hoy trabajé, comí con mis amigos y fui al supermercado.", requirements: ["fui|comi|comí|trabaje|trabajé|estudie|estudié|hice|vi|sali|salí|hable|hablé"], minLesson: "u7-l1" },
  { stage: 5, prompt: "Describe tu ciudad.", promptEn: "Describe your city.", starter: "Mi ciudad es…", sample: "Mi ciudad es grande y bonita. Hay muchos parques.", requirements: ["es|hay|tiene"], minLesson: "u10-l2" },
];
