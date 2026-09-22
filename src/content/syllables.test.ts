import { describe, expect, it } from "vitest";
import { syllabify } from "./build";

describe("syllabify", () => {
  it.each([
    ["perro", "pe·rro"],
    ["hola", "ho·la"],
    ["mañana", "ma·ña·na"],
    ["quiero", "quie·ro"],
    ["hablar", "ha·blar"],
    ["también", "tam·bién"],
    ["día", "dí·a"],
    ["ciudad", "ciu·dad"],
    ["leer", "le·er"],
    ["calle", "ca·lle"],
    ["instrucción", "ins·truc·ción"],
    ["¿Cómo estás?", "¿Có·mo es·tás?"],
    ["muy", "muy"],
    ["guitarra", "gui·ta·rra"],
    ["escuchar", "es·cu·char"],
  ])("%s → %s", (word, expected) => {
    expect(syllabify(word)).toBe(expected);
  });
});
