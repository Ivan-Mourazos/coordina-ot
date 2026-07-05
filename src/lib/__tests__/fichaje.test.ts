import { describe, expect, it } from "vitest";
import { FICHAJE_VACIO, abierto, fichar, pausar, minutosOF, ofsFichables } from "../fichaje";
import type { OF, Pedido } from "../types";

const T0 = "2026-07-06T08:00:00.000Z";
const T1 = "2026-07-06T08:30:00.000Z";
const T2 = "2026-07-06T09:00:00.000Z";

describe("fichar", () => {
  it("abre un intervalo con las OFs dadas", () => {
    const f = fichar(FICHAJE_VACIO, ["of1", "of2"], "plantear", "op1", T0);
    expect(abierto(f)).toMatchObject({ inicio: T0, fin: null, ofIds: ["of1", "of2"], rol: "plantear" });
  });
  it("cambiar el conjunto cierra el intervalo y abre otro (historia intacta)", () => {
    let f = fichar(FICHAJE_VACIO, ["of1"], "plantear", "op1", T0);
    f = fichar(f, ["of1", "of2"], "plantear", "op1", T1);
    expect(f.intervalos).toHaveLength(2);
    expect(f.intervalos[0]).toMatchObject({ inicio: T0, fin: T1, ofIds: ["of1"] });
    expect(abierto(f)).toMatchObject({ inicio: T1, ofIds: ["of1", "of2"] });
  });
  it("deduplica ofIds y con lista vacía solo pausa", () => {
    let f = fichar(FICHAJE_VACIO, ["of1", "of1"], "plantear", "op1", T0);
    expect(abierto(f)!.ofIds).toEqual(["of1"]);
    f = fichar(f, [], "plantear", "op1", T1);
    expect(abierto(f)).toBeNull();
    expect(f.intervalos[0].fin).toBe(T1);
  });
  it("mismo conjunto y rol: no toca nada (idempotente)", () => {
    const f = fichar(FICHAJE_VACIO, ["of1"], "plantear", "op1", T0);
    expect(fichar(f, ["of1"], "plantear", "op1", T1)).toBe(f);
  });
});

describe("pausar", () => {
  it("cierra el intervalo abierto", () => {
    const f = pausar(fichar(FICHAJE_VACIO, ["of1"], "plantear", "op1", T0), T1);
    expect(abierto(f)).toBeNull();
    expect(f.intervalos[0].fin).toBe(T1);
  });
  it("sin intervalo abierto es no-op", () => {
    expect(pausar(FICHAJE_VACIO, T1)).toBe(FICHAJE_VACIO);
  });
});

describe("minutosOF", () => {
  it("reparte cada tramo entre sus OFs", () => {
    let f = fichar(FICHAJE_VACIO, ["of1", "of2"], "plantear", "op1", T0); // 30 min entre 2
    f = fichar(f, ["of1"], "plantear", "op1", T1); // 30 min solo of1
    f = pausar(f, T2);
    expect(minutosOF(f, "of1")).toBeCloseTo(45);
    expect(minutosOF(f, "of2")).toBeCloseTo(15);
  });
  it("intervalo abierto cuenta hasta `ahora`; filtra por rol", () => {
    const f = fichar(FICHAJE_VACIO, ["of1"], "revisar", "op1", T0);
    expect(minutosOF(f, "of1", { ahora: T1 })).toBeCloseTo(30);
    expect(minutosOF(f, "of1", { ahora: T1, rol: "plantear" })).toBe(0);
  });
});

describe("ofsFichables", () => {
  const base: Omit<OF, "id" | "estado"> = {
    codigo: "OF-01", descripcion: "x", familia: "TOLDO", piezas: 1,
    autorId: "op1", revisorId: null, fichandoRol: null,
    tiempoEstimadoMin: 0, tiempoPlanteoMin: 0, tiempoRevisionMin: 0,
  };
  it("excluye detenidas, anuladas y aprobadas", () => {
    const p = {
      ofs: [
        { ...base, id: "a", estado: "pendiente" },
        { ...base, id: "b", estado: "anulada" },
        { ...base, id: "c", estado: "aprobada" },
        { ...base, id: "d", estado: "en_curso", detenida: true },
      ],
    } as unknown as Pedido;
    expect(ofsFichables(p).map((o: OF) => o.id)).toEqual(["a"]);
  });
});
