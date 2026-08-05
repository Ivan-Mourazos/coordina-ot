import { describe, expect, it } from "vitest";
import type { AccionLog } from "../server/estado-db";
import { avisosPara } from "../avisos";

const accion = (parcial: Partial<AccionLog>): AccionLog => ({
  id: 1,
  ts: "2026-08-05T09:00:00.000Z",
  operarioId: "ivan",
  motivo: "traspaso",
  cambiosOF: [],
  previos: [],
  ...parcial,
});

const of = (ofId: string, autorId: string | null, revisorId: string | null) => ({
  ofId,
  autorId,
  revisorId,
  estado: "en_curso" as const,
  observacion: null,
});

describe("avisosPara", () => {
  const traspaso = accion({
    id: 7,
    operarioId: "ivan",
    previos: [of("of-1", "ivan", null)],
    cambiosOF: [of("of-1", "tamara", null)],
  });

  it("avisa al que recibe el trabajo", () => {
    const r = avisosPara([traspaso], "tamara", new Set());
    expect(r).toEqual([
      { logId: 7, ts: traspaso.ts, tipo: "recibida", ofId: "of-1", quien: "ivan", otro: "ivan" },
    ]);
  });

  it("avisa también al que lo pierde: si no, ve desaparecer algo sin saber por qué", () => {
    const deAngel = accion({ ...traspaso, id: 8, operarioId: "angel" });
    const r = avisosPara([deAngel], "ivan", new Set());
    expect(r[0]).toMatchObject({ tipo: "cedida", quien: "angel", otro: "tamara" });
  });

  it("no se avisa a sí mismo de lo que acaba de hacer", () => {
    expect(avisosPara([traspaso], "ivan", new Set())).toEqual([]);
  });

  it("no avisa de asignar trabajo que no tenía dueño", () => {
    const asignar = accion({
      id: 9,
      motivo: "asignar",
      previos: [of("of-2", null, null)],
      cambiosOF: [of("of-2", "tamara", null)],
    });
    // Una OF que sale de la bandeja ya se anuncia sola en la campana como
    // "sin empezar": repetirlo aquí sería el mismo aviso dos veces.
    expect(avisosPara([asignar], "tamara", new Set())).toEqual([]);
  });

  it("avisa del cambio de revisor en las dos direcciones", () => {
    const cambio = accion({
      id: 10,
      motivo: "revisor",
      operarioId: "ivan",
      previos: [of("of-3", "ivan", "tamara")],
      cambiosOF: [of("of-3", "ivan", "jaime")],
    });
    expect(avisosPara([cambio], "jaime", new Set())[0]).toMatchObject({
      tipo: "revisarNueva",
      otro: "tamara",
    });
    expect(avisosPara([cambio], "tamara", new Set())[0]).toMatchObject({
      tipo: "revisarQuitada",
      otro: "jaime",
    });
  });

  it("los ya vistos no vuelven a salir", () => {
    expect(avisosPara([traspaso], "tamara", new Set([7]))).toEqual([]);
  });

  it("ignora los cambios que no mueven a nadie de sitio", () => {
    const soloEstado = accion({
      id: 11,
      motivo: "accion",
      previos: [of("of-4", "ivan", null)],
      cambiosOF: [{ ...of("of-4", "ivan", null), estado: "por_revisar" }],
    });
    expect(avisosPara([soloEstado], "ivan", new Set())).toEqual([]);
  });
});
