import { expect, test } from "vitest";
import { maquinasAPublicar } from "../server/olanet-worker";

// «Quién está fichando ahora» se publica máquina a máquina. La fila lleva la
// máquina de su TAREA, que puede no ser la de la sección (OTEC-A en OT): antes
// solo se recorrían A-OTEC y A-DGRA y esa fila se descartaba en silencio.

test("la máquina de una tarea fuera de la de su sección también se publica", () => {
  expect(maquinasAPublicar([{ maquina: "OTEC-A" }], new Set())).toContain("OTEC-A");
});

test("las de sección siguen aunque no haya nadie fichando (para vaciarlas)", () => {
  const m = maquinasAPublicar([], new Set());
  expect(m).toContain("A-OTEC");
  expect(m).toContain("A-DGRA");
});

test("la que tenía a alguien en la vuelta anterior se vuelve a sincronizar para borrarla", () => {
  expect(maquinasAPublicar([], new Set(["OTEC-A"]))).toContain("OTEC-A");
});

test("y una máquina que nadie de la web toca no se barre: la comparte el mini-olanet", () => {
  expect(maquinasAPublicar([{ maquina: "OTEC-A" }], new Set())).not.toContain("P-PCUS");
});
