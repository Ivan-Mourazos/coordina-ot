import { expect, test } from "vitest";
import { extraerMenciones, tokenMencion, trocearTexto } from "../nota-pedido";

test("token estable de persona y sección", () => {
  expect(tokenMencion({ tipo: "persona", id: "ivan" })).toBe("@[persona:ivan]");
  expect(tokenMencion({ tipo: "seccion", id: "produccion" })).toBe("@[seccion:produccion]");
});

test("extrae menciones únicas e ignora secciones inventadas", () => {
  const t = "ojo @[persona:ivan] y @[seccion:ot], otra vez @[persona:ivan] @[seccion:marketing]";
  expect(extraerMenciones(t)).toEqual([{ tipo: "persona", id: "ivan" }, { tipo: "seccion", id: "ot" }]);
});

test("trocea para pintar etiquetas", () => {
  expect(trocearTexto("hola @[seccion:diseno]!")).toEqual([
    { tipo: "texto", texto: "hola " },
    { tipo: "mencion", destino: { tipo: "seccion", id: "diseno" } },
    { tipo: "texto", texto: "!" },
  ]);
});

test("una sección inventada se queda como texto al trocear", () => {
  expect(trocearTexto("@[seccion:marketing]")).toEqual([{ tipo: "texto", texto: "@[seccion:marketing]" }]);
});

test("una @ suelta o un email no es mención", () => {
  expect(extraerMenciones("escribe a a@b.com o @alguien")).toEqual([]);
});
