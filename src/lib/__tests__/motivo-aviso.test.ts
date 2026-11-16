import { expect, test } from "vitest";
import { motivoAviso, textoLlano } from "../notificaciones";

const yo = ["persona:ivan", "seccion:ot", "seccion:direccion"];

test("te nombran a ti: «te menciona», aunque también nombren a tu sección", () => {
  const nota = { menciones: [{ tipo: "seccion" as const, id: "ot" as const }, { tipo: "persona" as const, id: "ivan" }], para: [] };
  expect(motivoAviso(nota, yo, "Belén")).toBe("Belén te menciona");
});

test("nombran a una sección tuya", () => {
  const nota = { menciones: [{ tipo: "seccion" as const, id: "direccion" as const }], para: [] };
  expect(motivoAviso(nota, yo, "Belén")).toBe("Belén menciona a Dirección");
});

test("una mención que no va contigo no cuenta: es por el público", () => {
  const nota = { menciones: [{ tipo: "persona" as const, id: "carlos" }], para: [{ tipo: "seccion" as const, id: "ot" as const }] };
  expect(motivoAviso(nota, yo, "Belén")).toBe("Nota para ti de Belén");
});

test("textoLlano cambia los tokens por nombres", () => {
  const nombres: Record<string, string> = { ivan: "Iván" };
  expect(textoLlano("@[persona:ivan] y @[seccion:produccion], mirad", (id) => nombres[id])).toBe("@Iván y @Producción, mirad");
  expect(textoLlano("@[persona:nadie] hola", () => null)).toBe("@nadie hola");
});

test("te responden: «te responde», salvo que además te nombren", () => {
  const nota = { menciones: [], para: [], respondeA: "ivan" };
  expect(motivoAviso(nota, yo, "Belén")).toBe("Belén te responde");
  const nombrado = { ...nota, menciones: [{ tipo: "persona" as const, id: "ivan" }] };
  expect(motivoAviso(nombrado, yo, "Belén")).toBe("Belén te menciona");
});
