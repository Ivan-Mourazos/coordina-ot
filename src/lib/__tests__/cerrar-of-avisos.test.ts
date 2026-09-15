import { expect, test } from "vitest";
import { avisosTrasCerrarEnRps } from "../cerrar-of-avisos";

test("cierre normal: ningún aviso", () => {
  expect(avisosTrasCerrarEnRps({ yaEstaba: false, faseFila: "9", gemelasSinEscribir: [] })).toEqual([]);
});

test("ya estaba terminada: lo dice, y que queda apartada igual", () => {
  expect(avisosTrasCerrarEnRps({ yaEstaba: true, faseFila: "9", gemelasSinEscribir: [] })).toEqual([
    "Ya estaba terminada en RPS: la cerró alguien antes. Queda apartada aquí igual.",
  ]);
});

test("la trampa 2/02 con la gemela sin escribir: dice cuál entró y cuál no", () => {
  expect(avisosTrasCerrarEnRps({ yaEstaba: false, faseFila: "02", gemelasSinEscribir: ["2"] })).toEqual([
    "Se cerró la 02; la 2 no ha podido escribirse. Vuelve a pulsar para reintentarla.",
  ]);
});

test("respuesta antigua o de modo prueba, sin los campos: ningún aviso", () => {
  expect(avisosTrasCerrarEnRps({})).toEqual([]);
});
