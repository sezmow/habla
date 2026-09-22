// A compact Spanish conjugator covering the verbs used in the curriculum.
// Used to (1) recognize inflected forms in learner input and content, and
// (2) classify conjugation mistakes such as "yo es" → "yo soy".

export type Tense = "present" | "preterite" | "imperfect";
export const PERSONS = ["yo", "tú", "él/ella/usted", "nosotros", "vosotros", "ellos/ustedes"] as const;

interface VerbDef {
  inf: string;
  en: string;
  /** Stem change in the present (not nosotros/vosotros). */
  stem?: "ie" | "ue" | "i" | "u-ue";
  /** -ir stem change in preterite 3rd persons (e→i, o→u). */
  pretStem?: "i" | "u";
  yo?: string;
  present?: string[];
  preterite?: string[];
  imperfect?: string[];
  reflexive?: boolean;
}

const V: VerbDef[] = [
  { inf: "ser", en: "to be (identity)", present: ["soy", "eres", "es", "somos", "sois", "son"], preterite: ["fui", "fuiste", "fue", "fuimos", "fuisteis", "fueron"], imperfect: ["era", "eras", "era", "éramos", "erais", "eran"] },
  { inf: "estar", en: "to be (state, location)", present: ["estoy", "estás", "está", "estamos", "estáis", "están"], preterite: ["estuve", "estuviste", "estuvo", "estuvimos", "estuvisteis", "estuvieron"] },
  { inf: "tener", en: "to have", present: ["tengo", "tienes", "tiene", "tenemos", "tenéis", "tienen"], preterite: ["tuve", "tuviste", "tuvo", "tuvimos", "tuvisteis", "tuvieron"] },
  { inf: "ir", en: "to go", present: ["voy", "vas", "va", "vamos", "vais", "van"], preterite: ["fui", "fuiste", "fue", "fuimos", "fuisteis", "fueron"], imperfect: ["iba", "ibas", "iba", "íbamos", "ibais", "iban"] },
  { inf: "hacer", en: "to do, to make", present: ["hago", "haces", "hace", "hacemos", "hacéis", "hacen"], preterite: ["hice", "hiciste", "hizo", "hicimos", "hicisteis", "hicieron"] },
  { inf: "querer", en: "to want", stem: "ie", preterite: ["quise", "quisiste", "quiso", "quisimos", "quisisteis", "quisieron"] },
  { inf: "poder", en: "to be able to", stem: "ue", preterite: ["pude", "pudiste", "pudo", "pudimos", "pudisteis", "pudieron"] },
  { inf: "venir", en: "to come", present: ["vengo", "vienes", "viene", "venimos", "venís", "vienen"], preterite: ["vine", "viniste", "vino", "vinimos", "vinisteis", "vinieron"] },
  { inf: "decir", en: "to say", present: ["digo", "dices", "dice", "decimos", "decís", "dicen"], preterite: ["dije", "dijiste", "dijo", "dijimos", "dijisteis", "dijeron"] },
  { inf: "ver", en: "to see", present: ["veo", "ves", "ve", "vemos", "veis", "ven"], preterite: ["vi", "viste", "vio", "vimos", "visteis", "vieron"], imperfect: ["veía", "veías", "veía", "veíamos", "veíais", "veían"] },
  { inf: "dar", en: "to give", present: ["doy", "das", "da", "damos", "dais", "dan"], preterite: ["di", "diste", "dio", "dimos", "disteis", "dieron"] },
  { inf: "saber", en: "to know (facts)", yo: "sé", preterite: ["supe", "supiste", "supo", "supimos", "supisteis", "supieron"] },
  { inf: "salir", en: "to go out, to leave", yo: "salgo" },
  { inf: "poner", en: "to put", yo: "pongo", preterite: ["puse", "pusiste", "puso", "pusimos", "pusisteis", "pusieron"] },
  { inf: "traer", en: "to bring", yo: "traigo", preterite: ["traje", "trajiste", "trajo", "trajimos", "trajisteis", "trajeron"] },
  { inf: "conocer", en: "to know (people, places)", yo: "conozco" },
  { inf: "parecer", en: "to seem", yo: "parezco" },
  { inf: "seguir", en: "to continue, to follow", stem: "i", pretStem: "i", yo: "sigo" },
  { inf: "pedir", en: "to ask for, to order", stem: "i", pretStem: "i" },
  { inf: "preferir", en: "to prefer", stem: "ie", pretStem: "i" },
  { inf: "pensar", en: "to think", stem: "ie" },
  { inf: "empezar", en: "to start", stem: "ie" },
  { inf: "cerrar", en: "to close", stem: "ie" },
  { inf: "entender", en: "to understand", stem: "ie" },
  { inf: "dormir", en: "to sleep", stem: "ue", pretStem: "u" },
  { inf: "volver", en: "to return", stem: "ue" },
  { inf: "almorzar", en: "to have lunch", stem: "ue" },
  { inf: "costar", en: "to cost", stem: "ue" },
  { inf: "acostarse", en: "to go to bed", stem: "ue", reflexive: true },
  { inf: "jugar", en: "to play", stem: "u-ue" },
  { inf: "llover", en: "to rain", stem: "ue" },
  { inf: "leer", en: "to read", preterite: ["leí", "leíste", "leyó", "leímos", "leísteis", "leyeron"] },
  { inf: "creer", en: "to believe", preterite: ["creí", "creíste", "creyó", "creímos", "creísteis", "creyeron"] },
  ...[
    ["hablar", "to speak"], ["trabajar", "to work"], ["estudiar", "to study"], ["comprar", "to buy"], ["pagar", "to pay"],
    ["necesitar", "to need"], ["buscar", "to look for"], ["llegar", "to arrive"], ["tomar", "to take, to drink"],
    ["cocinar", "to cook"], ["escuchar", "to listen"], ["mirar", "to look at"], ["caminar", "to walk"], ["viajar", "to travel"],
    ["visitar", "to visit"], ["descansar", "to rest"], ["desayunar", "to have breakfast"], ["cenar", "to have dinner"],
    ["bailar", "to dance"], ["nadar", "to swim"], ["ayudar", "to help"], ["esperar", "to wait, to hope"], ["llevar", "to carry, to wear"],
    ["usar", "to use"], ["gustar", "to be pleasing"], ["encantar", "to love (a thing)"], ["cambiar", "to change"], ["doblar", "to turn"],
    ["cruzar", "to cross"], ["bajar", "to go down"], ["llamar", "to call"], ["pasar", "to happen, to spend"], ["reservar", "to reserve"],
    ["explicar", "to explain"], ["practicar", "to practice"], ["terminar", "to finish"], ["preguntar", "to ask"], ["quedar", "to meet up"],
    ["ganar", "to earn, to win"], ["enseñar", "to teach"], ["olvidar", "to forget"], ["dejar", "to leave (something)"],
  ].map(([inf, en]) => ({ inf, en })),
  { inf: "llamarse", en: "to be called", reflexive: true },
  { inf: "levantarse", en: "to get up", reflexive: true },
  { inf: "ducharse", en: "to shower", reflexive: true },
  ...[
    ["comer", "to eat"], ["beber", "to drink"], ["aprender", "to learn"], ["vender", "to sell"], ["correr", "to run"],
    ["deber", "should, to owe"], ["comprender", "to understand"],
  ].map(([inf, en]) => ({ inf, en })),
  ...[
    ["vivir", "to live"], ["escribir", "to write"], ["abrir", "to open"], ["subir", "to go up"], ["recibir", "to receive"],
    ["decidir", "to decide"], ["compartir", "to share"],
  ].map(([inf, en]) => ({ inf, en })),
];

const ENDINGS = {
  ar: {
    present: ["o", "as", "a", "amos", "áis", "an"],
    preterite: ["é", "aste", "ó", "amos", "asteis", "aron"],
    imperfect: ["aba", "abas", "aba", "ábamos", "abais", "aban"],
  },
  er: {
    present: ["o", "es", "e", "emos", "éis", "en"],
    preterite: ["í", "iste", "ió", "imos", "isteis", "ieron"],
    imperfect: ["ía", "ías", "ía", "íamos", "íais", "ían"],
  },
  ir: {
    present: ["o", "es", "e", "imos", "ís", "en"],
    preterite: ["í", "iste", "ió", "imos", "isteis", "ieron"],
    imperfect: ["ía", "ías", "ía", "íamos", "íais", "ían"],
  },
};

function changeStem(stem: string, change: string): string {
  const map: Record<string, [RegExp, string]> = {
    ie: [/e([^aeiou]*)$/, "ie$1"],
    ue: [/o([^aeiou]*)$/, "ue$1"],
    i: [/e([^aeiou]*)$/, "i$1"],
    "u-ue": [/u([^aeiou]*)$/, "ue$1"],
    u: [/o([^aeiou]*)$/, "u$1"],
  };
  const [re, rep] = map[change];
  return stem.replace(re, rep);
}

function spellYoPreterite(stem: string, ending: string): string {
  if (ending !== "é") return stem + ending;
  if (stem.endsWith("c")) return stem.slice(0, -1) + "qué";
  if (stem.endsWith("g")) return stem + "ué";
  if (stem.endsWith("z")) return stem.slice(0, -1) + "cé";
  return stem + ending;
}

export interface Conjugation {
  inf: string;
  en: string;
  reflexive: boolean;
  present: string[];
  preterite: string[];
  imperfect: string[];
}

function conjugate(def: VerbDef): Conjugation {
  const base = def.reflexive ? def.inf.slice(0, -2) : def.inf;
  const cls = base.slice(-2) as "ar" | "er" | "ir";
  const stem = base.slice(0, -2);
  const e = ENDINGS[cls];
  const present =
    def.present ??
    e.present.map((end, i) => {
      if (i === 0 && def.yo) return def.yo;
      const s = def.stem && i !== 3 && i !== 4 ? changeStem(stem, def.stem) : stem;
      return s + end;
    });
  const preterite =
    def.preterite ??
    e.preterite.map((end, i) => {
      if (i === 0) return spellYoPreterite(stem, end);
      if (def.pretStem && (i === 2 || i === 5)) return changeStem(stem, def.pretStem) + end;
      return stem + end;
    });
  const imperfect = def.imperfect ?? e.imperfect.map((end) => stem + end);
  return { inf: def.inf, en: def.en, reflexive: !!def.reflexive, present, preterite, imperfect };
}

export const VERBS: Record<string, Conjugation> = Object.fromEntries(V.map((d) => [d.inf, conjugate(d)]));

export interface FormInfo {
  lemma: string;
  tense: Tense;
  person: number;
}

/** Map every known conjugated form to its analyses. */
export const FORM_INDEX: Map<string, FormInfo[]> = (() => {
  const idx = new Map<string, FormInfo[]>();
  for (const c of Object.values(VERBS)) {
    (["present", "preterite", "imperfect"] as Tense[]).forEach((tense) => {
      c[tense].forEach((form, person) => {
        const list = idx.get(form) ?? [];
        list.push({ lemma: c.inf, tense, person });
        idx.set(form, list);
      });
    });
  }
  return idx;
})();

export function analyzeForm(word: string): FormInfo[] {
  return FORM_INDEX.get(word.toLowerCase()) ?? [];
}

export function allForms(inf: string): string[] {
  const c = VERBS[inf];
  if (!c) return [inf];
  const forms = new Set<string>([c.reflexive ? c.inf.slice(0, -2) : c.inf, c.inf, ...c.present, ...c.preterite, ...c.imperfect]);
  return [...forms];
}

export const SER_FORMS = new Set(allForms("ser").filter((f) => f !== "fui" && f !== "fue"));
export const ESTAR_FORMS = new Set(allForms("estar"));
export const TENER_FORMS = new Set(allForms("tener"));
