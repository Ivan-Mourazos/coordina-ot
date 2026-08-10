import { describe, expect, it } from "vitest";
import { estadoDePedido } from "../frase-estado";
import type { OF, Pedido } from "../types";

const nombre = (id: string) => ({ ivan: "Iván", tamara: "Tamara", jaime: "Jaime" })[id] ?? id;

const of = (extra: Partial<OF> = {}): OF => ({
  id: "of1",
  codigo: "OF-01",
  descripcion: "x",
  familia: "TOLDO",
  piezas: 1,
  autorId: null,
  revisorId: null,
  estado: "pendiente",
  fichandoRol: null,
  tiempoEstimadoMin: 0,
  tiempoPlanteoMin: 0,
  tiempoRevisionMin: 0,
  ...extra,
});

const pedido = (ofs: OF[]): Pedido => ({
  id: "p1",
  codigo: "AR.26.00001",
  cliente: "MAHOU",
  situacion: "procesado",
  fechaSolicitud: "2026-09-01",
  fechaPlanificacion: "2026-08-20",
  fechaEntrega: "2026-09-01",
  prioridad: 2,
  ofs,
  accent: "ninguno",
  lineas: 0,
  croquis: false,
});

const frase = (ofs: OF[]) => estadoDePedido(pedido(ofs), nombre);

describe("estadoDePedido", () => {
  it("sin autor: no hay a quién nombrar", () => {
    const [planteo] = frase([of()]);
    expect(planteo).toMatchObject({ quien: [], verbo: "Sin asignar", minutos: 0 });
  });

  it("con autor y sin empezar", () => {
    const [planteo] = frase([of({ autorId: "jaime" })]);
    expect(planteo).toMatchObject({ quien: ["Jaime"], verbo: "Sin empezar", enMarcha: false });
  });

  it("fichando ahora: Planteando", () => {
    const [planteo] = frase([
      of({ autorId: "ivan", estado: "en_curso", fichandoRol: "plantear", tiempoPlanteoMin: 25 }),
    ]);
    expect(planteo).toMatchObject({ quien: ["Iván"], verbo: "Planteando", enMarcha: true });
  });

  it("empezado y con el reloj parado: Planteado con su tiempo", () => {
    const [planteo] = frase([of({ autorId: "ivan", estado: "en_curso", tiempoPlanteoMin: 25 })]);
    expect(planteo).toMatchObject({ verbo: "Planteado", minutos: 25, enMarcha: false });
  });

  it("el tramo de revisión no aparece hasta que significa algo", () => {
    expect(frase([of({ autorId: "ivan", estado: "en_curso" })])).toHaveLength(1);
    expect(
      frase([of({ autorId: "ivan", revisorId: "tamara", estado: "en_curso" })]),
    ).toHaveLength(2);
  });

  it("entregado a revisión, con revisor", () => {
    const [planteo, revision] = frase([
      of({
        autorId: "ivan",
        revisorId: "tamara",
        estado: "por_revisar",
        tiempoPlanteoMin: 25,
      }),
    ]);
    expect(planteo).toMatchObject({ verbo: "Planteado", minutos: 25 });
    expect(revision).toMatchObject({ quien: ["Tamara"], verbo: "Por revisar", minutos: 0 });
  });

  it("entregado y sin revisor: lo dice con nombre propio", () => {
    const [, revision] = frase([of({ autorId: "ivan", estado: "por_revisar" })]);
    expect(revision).toMatchObject({ quien: [], verbo: "Falta revisor" });
  });

  it("aprobado: los dos tramos con su tiempo", () => {
    const [planteo, revision] = frase([
      of({
        autorId: "ivan",
        revisorId: "tamara",
        estado: "aprobada",
        tiempoPlanteoMin: 95,
        tiempoRevisionMin: 10,
      }),
    ]);
    expect(planteo).toMatchObject({ verbo: "Planteado", minutos: 95 });
    expect(revision).toMatchObject({ verbo: "Revisado", minutos: 10 });
  });

  it("devuelta manda sobre el resto: hay que rehacerla", () => {
    const [planteo, revision] = frase([
      of({ autorId: "ivan", revisorId: "tamara", estado: "devuelta", tiempoPlanteoMin: 30 }),
    ]);
    expect(planteo.verbo).toBe("Devuelto");
    expect(revision.verbo).toBe("Devuelto");
  });

  it("varias OF: los nombres no se repiten y los tiempos suman", () => {
    const [planteo] = frase([
      of({ id: "a", autorId: "ivan", estado: "en_curso", tiempoPlanteoMin: 20 }),
      of({ id: "b", autorId: "ivan", estado: "en_curso", tiempoPlanteoMin: 15 }),
      of({ id: "c", autorId: "jaime", estado: "en_curso", tiempoPlanteoMin: 5 }),
    ]);
    expect(planteo.quien).toEqual(["Iván", "Jaime"]);
    expect(planteo.minutos).toBe(40);
  });

  it("las anuladas no cuentan ni en nombres ni en tiempo", () => {
    const [planteo] = frase([
      of({ id: "a", autorId: "ivan", estado: "en_curso", tiempoPlanteoMin: 20 }),
      of({ id: "b", autorId: "jaime", estado: "anulada", tiempoPlanteoMin: 200 }),
    ]);
    expect(planteo.quien).toEqual(["Iván"]);
    expect(planteo.minutos).toBe(20);
  });

  it("una OF entregada y otra a medias todavía no es 'Planteado' del todo", () => {
    const [planteo] = frase([
      of({ id: "a", autorId: "ivan", estado: "por_revisar", tiempoPlanteoMin: 30 }),
      of({ id: "b", autorId: "ivan", estado: "en_curso", tiempoPlanteoMin: 10 }),
    ]);
    // Sigue habiendo trabajo de planteo abierto, así que el tiempo es lo que
    // manda: 40 minutos echados y el pedido sin entregar entero.
    expect(planteo).toMatchObject({ verbo: "Planteado", minutos: 40, enMarcha: false });
  });
});
