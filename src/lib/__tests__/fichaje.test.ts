import { describe, expect, it } from "vitest";
import { FICHAJE_VACIO, abierto, fichar, pausar } from "../fichaje";

const T0 = "2026-07-06T08:00:00.000Z";
const T1 = "2026-07-06T08:30:00.000Z";

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
