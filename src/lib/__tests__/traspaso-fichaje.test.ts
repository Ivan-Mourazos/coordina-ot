import { describe, expect, it } from "vitest";
import { bonosDe, claveBonoRps } from "../bonos";
import { diasYOperariosDe, intervaloYaEnRps } from "../traspaso-fichaje";
import type { Intervalo } from "../fichaje";

// Cuando el fichaje pase a `activo`, OLANET sube nuestros bonos a RPS y esos
// minutos aparecen también en las imputaciones. A partir de ahí el tiempo tiene
// que contarlo RPS y NO CoordinaOT, o el mismo trabajo se cuenta dos veces.
//
// Horas en verano peninsular (UTC+2), igual que en bonos.test.ts:
//   2026-08-03T08:00:00Z = 10:00 en Madrid.

const COD = { ivan: "195", jaime: "120" };

const iv = (
  inicio: string,
  fin: string | null,
  ofIds: string[],
  operarioId = "ivan",
): Intervalo => ({ inicio, fin, ofIds, rol: "plantear", operarioId });

/** Las claves de los bonos que saldrían de estos tramos: es lo que devolvería
 *  OLANET si ya los hubiera traspasado. */
const claves = (...intervalos: Intervalo[]) =>
  new Set(bonosDe(intervalos, COD).map(claveBonoRps));

describe("intervaloYaEnRps", () => {
  it("sí cuando todos sus bonos están traspasados", () => {
    const tramo = iv("2026-08-03T08:00:00Z", "2026-08-03T08:30:00Z", ["0231245:1"]);
    expect(intervaloYaEnRps(tramo, COD, claves(tramo))).toBe(true);
  });

  it("no mientras OLANET no lo haya traspasado", () => {
    const tramo = iv("2026-08-03T08:00:00Z", "2026-08-03T08:30:00Z", ["0231245:1"]);
    expect(intervaloYaEnRps(tramo, COD, new Set())).toBe(false);
  });

  it("un tramo de dos OFs no cuenta hasta que están las dos", () => {
    // El tramo se parte en un bono por OF: si solo subió uno, la mitad del
    // tiempo sigue sin estar en RPS y tiene que seguir contando desde aquí.
    const tramo = iv("2026-08-03T08:00:00Z", "2026-08-03T09:00:00Z", ["0231245:1", "0231246:1"]);
    const soloUno = new Set([claveBonoRps(bonosDe([tramo], COD)[0])]);
    expect(intervaloYaEnRps(tramo, COD, soloUno)).toBe(false);
    expect(intervaloYaEnRps(tramo, COD, claves(tramo))).toBe(true);
  });

  it("un tramo que cruza la medianoche necesita sus dos trozos", () => {
    const tramo = iv("2026-08-03T21:00:00Z", "2026-08-03T23:00:00Z", ["0231245:1"]);
    const bonos = bonosDe([tramo], COD);
    expect(bonos.length).toBe(2); // 23:00→24:00 y 00:00→01:00 en hora local
    expect(intervaloYaEnRps(tramo, COD, new Set([claveBonoRps(bonos[0])]))).toBe(false);
    expect(intervaloYaEnRps(tramo, COD, claves(tramo))).toBe(true);
  });

  it("el tramo que se está fichando ahora nunca se da por traspasado", () => {
    // Sin `fin` no hay bono todavía: ese tiempo solo lo tiene CoordinaOT.
    expect(intervaloYaEnRps(iv("2026-08-03T08:00:00Z", null, ["0231245:1"]), COD, new Set()))
      .toBe(false);
  });

  it("sin bonos que traspasar, tampoco: ese tiempo no ha salido de aquí", () => {
    // OF sin tarea (no se puede imputar) y operario sin código de RPS.
    const sinTarea = iv("2026-08-03T08:00:00Z", "2026-08-03T08:30:00Z", ["0231245"]);
    expect(intervaloYaEnRps(sinTarea, COD, new Set())).toBe(false);
    const ajeno = iv("2026-08-03T08:00:00Z", "2026-08-03T08:30:00Z", ["0231245:1"], "nadie");
    expect(intervaloYaEnRps(ajeno, COD, new Set())).toBe(false);
  });
});

describe("diasYOperariosDe", () => {
  it("acota la consulta a los días y operarios que hacen falta", () => {
    const a = iv("2026-08-03T08:00:00Z", "2026-08-03T08:30:00Z", ["0231245:1"]);
    const b = iv("2026-08-04T08:00:00Z", "2026-08-04T08:30:00Z", ["0231246:1"], "jaime");
    expect(diasYOperariosDe([a, b], COD)).toEqual({
      dias: ["2026-08-03", "2026-08-04"],
      operarios: ["120", "195"],
    });
  });

  it("un tramo a caballo de dos días pide los dos", () => {
    const cruza = iv("2026-08-03T21:00:00Z", "2026-08-03T23:00:00Z", ["0231245:1"]);
    expect(diasYOperariosDe([cruza], COD).dias).toEqual(["2026-08-03", "2026-08-04"]);
  });

  it("los tramos abiertos y los que no se pueden traducir no piden nada", () => {
    const abierto = iv("2026-08-03T08:00:00Z", null, ["0231245:1"]);
    const ajeno = iv("2026-08-03T08:00:00Z", "2026-08-03T08:30:00Z", ["0231245:1"], "nadie");
    expect(diasYOperariosDe([abierto, ajeno], COD)).toEqual({ dias: [], operarios: [] });
  });
});
