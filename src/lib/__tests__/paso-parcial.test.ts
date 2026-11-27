import { describe, expect, test } from "vitest";
import { decidirPaseParcial, ofsDelPase, ofsDelPaseParcial, puedeDarPorTerminadas } from "../paso-parcial";
import type { OF } from "../types";

const of = (id: string, extra: Partial<OF> = {}): OF => ({
  id, codigo: id.split(":")[0], descripcion: "", familia: "TOLDO", piezas: 1,
  autorId: "ivan", revisorId: null, estado: "aprobada", fichandoRol: null,
  tiempoEstimadoMin: 0, tiempoPlanteoMin: 0, tiempoRevisionMin: 0, ...extra,
} as OF);

// El 5335: varias aprobadas mías, dos detenidas.
const OFS = [
  of("1:9"), of("2:9"), of("3:9"),
  of("4:9", { detenida: true }), of("5:9", { detenida: true }),
  of("6:9", { autorId: "tamara" }),
  of("7:9", { estado: "anulada" }),
  of("8:9", { cerradaRps: { at: "x", por: "ivan", modo: "activo" } }),
];

test("la lista deja fuera anuladas y ya cerradas; detenidas y ajenas salen sin poder marcarse", () => {
  const lista = ofsDelPase(OFS, "ivan");
  expect(lista.map((x) => x.of.id)).toEqual(["1:9", "2:9", "3:9", "4:9", "5:9", "6:9"]);
  expect(lista.filter((x) => x.elegible).map((x) => x.of.id)).toEqual(["1:9", "2:9", "3:9"]);
  expect(lista.find((x) => x.of.id === "4:9")?.motivo).toBe("detenida");
  expect(lista.find((x) => x.of.id === "6:9")?.motivo).toBe("de_otro");
});

// «Dar por terminadas…» en el "⋯" del pedido (27/11/2026).
describe("dar por terminadas algunas OF del pedido", () => {
  const PED = [
    of("1:9", { estado: "en_curso" }),
    of("2:9", { estado: "pendiente" }),
    of("3:9", { estado: "aprobada" }),
    of("4:9", { estado: "por_revisar" }),
    of("5:9", { estado: "en_curso", detenida: true }),
    of("6:9", { estado: "en_curso", autorId: "tamara" }),
    of("7:9", { estado: "anulada" }),
    of("8:9", { estado: "aprobada", cerradaRps: { at: "x", por: "ivan", modo: "activo" } }),
  ];
  const pedido = (ofs: OF[]) => ({ ofs, situacion: "procesado" as const });

  test("se marcan las mías que admiten cerrarse; las mandadas a revisar no", () => {
    const lista = ofsDelPaseParcial(PED, "ivan");
    expect(lista.filter((x) => x.elegible).map((x) => x.of.id)).toEqual(["1:9", "2:9", "3:9"]);
    expect(lista.find((x) => x.of.id === "4:9")?.motivo).toBe("en_revision");
    expect(lista.find((x) => x.of.id === "5:9")?.motivo).toBe("detenida");
    expect(lista.find((x) => x.of.id === "6:9")?.motivo).toBe("de_otro");
    expect(lista.some((x) => x.of.id === "7:9" || x.of.id === "8:9")).toBe(false);
  });

  test("la opción sale con una mía que se pueda cerrar y otra que se quede", () => {
    expect(puedeDarPorTerminadas(pedido(PED), "ivan")).toBe(true);
    expect(puedeDarPorTerminadas(pedido([of("1:9", { estado: "en_curso" }), of("4:9", { estado: "por_revisar" })]), "ivan")).toBe(true);
    // Una sola OF: no hay nada que dejar.
    expect(puedeDarPorTerminadas(pedido([of("1:9", { estado: "en_curso" })]), "ivan")).toBe(false);
    // Nada mío que se pueda cerrar.
    expect(puedeDarPorTerminadas(pedido([of("4:9", { estado: "por_revisar" }), of("6:9", { autorId: "tamara" })]), "ivan")).toBe(false);
    // Con todo aprobado también: se elige qué pasa ya.
    expect(puedeDarPorTerminadas(pedido([of("1:9"), of("2:9")]), "ivan")).toBe(true);
  });

  test("de serie van todas las que se pueden; desmarcar deja fuera", () => {
    expect(decidirPaseParcial(PED, "ivan", new Set())).toEqual({ tipo: "parcial", ofIds: ["1:9", "2:9", "3:9"] });
    expect(decidirPaseParcial(PED, "ivan", new Set(["2:9"]))).toEqual({ tipo: "parcial", ofIds: ["1:9", "3:9"] });
    expect(decidirPaseParcial(PED, "ivan", new Set(["1:9", "2:9", "3:9"]))).toEqual({ tipo: "nada" });
  });

  test("tiene que quedar otra sin cerrar: si no, es pasar el pedido", () => {
    const tres = [of("1:9", { estado: "en_curso" }), of("2:9", { estado: "en_curso" }), of("3:9", { estado: "en_curso" })];
    expect(decidirPaseParcial(tres, "ivan", new Set())).toEqual({ tipo: "todas" });
    expect(decidirPaseParcial(tres, "ivan", new Set(["3:9"]))).toEqual({ tipo: "parcial", ofIds: ["1:9", "2:9"] });
  });
});
