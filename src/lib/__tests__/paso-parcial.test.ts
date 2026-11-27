import { describe, expect, test } from "vitest";
import { decidirCierreVarias, decidirPase, hayCierreVarias, hayEleccion, ofsDelPase, ofsParaCerrarVarias } from "../paso-parcial";
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

test("las casillas salen solo con dos o más OF mías", () => {
  expect(hayEleccion(ofsDelPase(OFS, "ivan"))).toBe(true);
  expect(hayEleccion(ofsDelPase([of("1:9"), of("4:9", { detenida: true })], "ivan"))).toBe(false);
});

test("todas marcadas = el pase de siempre", () => {
  expect(decidirPase(ofsDelPase(OFS, "ivan"), new Set())).toEqual({ tipo: "todo" });
});

test("desmarcar una mía = se pasan solo las marcadas", () => {
  expect(decidirPase(ofsDelPase(OFS, "ivan"), new Set(["2:9"]))).toEqual({ tipo: "parcial", ofIds: ["1:9", "3:9"] });
});

test("desmarcadas todas las mías = nada que hacer", () => {
  expect(decidirPase(ofsDelPase(OFS, "ivan"), new Set(["1:9", "2:9", "3:9"]))).toEqual({ tipo: "nada" });
});

// «Dar por terminadas varias…» desde el "⋯" de una OF (27/11/2026).
describe("cerrar varias OF de un pedido", () => {
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

  test("se pueden marcar las mías que admiten cerrarse; las mandadas a revisar no", () => {
    const lista = ofsParaCerrarVarias(PED, "ivan");
    expect(lista.filter((x) => x.elegible).map((x) => x.of.id)).toEqual(["1:9", "2:9", "3:9"]);
    expect(lista.find((x) => x.of.id === "4:9")?.motivo).toBe("en_revision");
    expect(lista.find((x) => x.of.id === "5:9")?.motivo).toBe("detenida");
    expect(lista.find((x) => x.of.id === "6:9")?.motivo).toBe("de_otro");
    expect(lista.some((x) => x.of.id === "7:9" || x.of.id === "8:9")).toBe(false);
  });

  test("se ofrece con dos mías y otra que se quede", () => {
    expect(hayCierreVarias(PED, "ivan")).toBe(true);
    expect(hayCierreVarias([of("1:9", { estado: "en_curso" }), of("2:9", { estado: "en_curso" })], "ivan")).toBe(false);
    expect(hayCierreVarias([of("1:9", { estado: "en_curso" }), of("4:9", { estado: "por_revisar" }), of("6:9", { autorId: "tamara" })], "ivan")).toBe(false);
  });

  test("cierra solo las marcadas que se pueden", () => {
    expect(decidirCierreVarias(PED, "ivan", new Set(["1:9", "3:9", "4:9"]))).toEqual({ tipo: "cerrar", ofIds: ["1:9", "3:9"] });
    expect(decidirCierreVarias(PED, "ivan", new Set())).toEqual({ tipo: "nada" });
  });

  test("tiene que quedar otra sin cerrar: si no, es pasar el pedido", () => {
    const tres = [of("1:9", { estado: "en_curso" }), of("2:9", { estado: "en_curso" }), of("3:9", { estado: "en_curso" })];
    expect(decidirCierreVarias(tres, "ivan", new Set(["1:9", "2:9", "3:9"]))).toEqual({ tipo: "todas" });
    expect(decidirCierreVarias(tres, "ivan", new Set(["1:9", "2:9"]))).toEqual({ tipo: "cerrar", ofIds: ["1:9", "2:9"] });
  });
});
