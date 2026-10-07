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

const frase = (ofs: OF[]) => estadoDePedido(pedido(ofs), nombre).tramos;
const estado = (ofs: OF[]) => estadoDePedido(pedido(ofs), nombre);

describe("estadoDePedido", () => {
  it("sin autor: no hay a quién nombrar, y se marca como pendiente de alguien", () => {
    const [planteo] = frase([of()]);
    expect(planteo).toMatchObject({
      quien: [],
      verbo: "Sin asignar",
      minutos: 0,
      // Lo que hace que NO se pinte del verde de "Planteado": un pedido que no
      // ha tocado nadie no puede parecer terminado.
      pendienteDeAlguien: true,
    });
  });

  it("con alguien asignado, el tramo no está pendiente de nadie", () => {
    const [planteo] = frase([of({ autorId: "jaime" })]);
    expect(planteo.pendienteDeAlguien).toBe(false);
  });

  it("entregado y sin revisor: el tramo de revisión sí está pendiente", () => {
    const [, revision] = frase([of({ autorId: "ivan", estado: "por_revisar" })]);
    expect(revision).toMatchObject({ verbo: "Falta revisor", pendienteDeAlguien: true });
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

  it("devuelta: cada tramo dice lo SUYO, no la misma palabra dos veces", () => {
    const [planteo, revision] = frase([
      of({ autorId: "ivan", revisorId: "tamara", estado: "devuelta", tiempoPlanteoMin: 30 }),
    ]);
    // La pelota vuelve al autor: el trabajo pendiente es suyo y así se lee.
    expect(planteo.verbo).toBe("A corregir");
    // Y el revisor ya hizo lo suyo, en pasado.
    expect(revision.verbo).toBe("Devolvió");
  });

  it("un pedido devuelto NO está listo para pasar", () => {
    expect(
      estado([of({ autorId: "ivan", revisorId: "tamara", estado: "devuelta" })]).listoParaPasar,
    ).toBe(false);
  });

  it("todas aprobadas: el pedido está listo para Producción", () => {
    expect(
      estado([
        of({ id: "a", autorId: "ivan", revisorId: "tamara", estado: "aprobada" }),
        of({ id: "b", autorId: "ivan", revisorId: "tamara", estado: "aprobada" }),
      ]).listoParaPasar,
    ).toBe(true);
  });

  it("una aprobada y otra a medias NO es un pedido listo", () => {
    // El caso que hacía falta distinguir: "Revisado" habla del revisor, no del
    // parte, y con cuatro OF puede haber una revisada y tres sin empezar.
    expect(
      estado([
        of({ id: "a", autorId: "ivan", revisorId: "tamara", estado: "aprobada" }),
        of({ id: "b", autorId: "ivan", estado: "en_curso" }),
      ]).listoParaPasar,
    ).toBe(false);
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

// AR.26.04671 y AR.26.04633 (07/10/2026): en Pendientes salía "Ángel · Por
// revisar" y "Jaime · Por revisar", y ninguno tenía nada en Revisiones. Su OF
// ya estaba resuelta; lo que le quedaba al pedido eran otras OF. Ahora hay una
// línea por revisor, y cada una cuenta solo las OF de esa persona.
describe("estadoDePedido: una línea por revisor", () => {
  const revision = (ofs: OF[]) => frase(ofs).slice(1);

  it("revisó la suya y el resto está sin entregar: lo dice en pasado y sin total", () => {
    const lineas = revision([
      of({ id: "a", codigo: "OF-A", autorId: "ivan", revisorId: "jaime", estado: "aprobada", revisada: true }),
      of({ id: "b", autorId: "ivan", estado: "en_curso" }),
      of({ id: "c", autorId: "ivan", estado: "en_curso" }),
    ]);
    // "1 OF", no "1 de 3": las otras dos no son suyas.
    expect(lineas).toEqual([
      expect.objectContaining({ quien: ["Jaime"], verbo: "Revisó 1 OF", hecho: true, detalle: "OF-A" }),
    ]);
  });

  it("devolvió, el autor la dio por corregida, y luego añadieron una OF sin revisor", () => {
    // El caso contado por Iván del AR.26.04633: a Jaime no le queda nada.
    const lineas = revision([
      of({ id: "a", autorId: "ivan", revisorId: "jaime", estado: "aprobada", revisada: true }),
      of({ id: "b" }),
    ]);
    expect(lineas.map((l) => `${l.quien.join()} ${l.verbo}`)).toEqual(["Jaime Revisó 1 OF"]);
  });

  it("dos revisores: cada uno su línea, primero el que tiene algo pendiente", () => {
    const lineas = revision([
      of({ id: "a", autorId: "ivan", revisorId: "jaime", estado: "aprobada", revisada: true }),
      of({ id: "b", autorId: "ivan", revisorId: "tamara", estado: "por_revisar" }),
    ]);
    expect(lineas.map((l) => `${l.quien.join()} ${l.verbo}`)).toEqual([
      "Tamara Por revisar 1 OF",
      "Jaime Revisó 1 OF",
    ]);
    expect(lineas[0].hecho).toBeFalsy();
  });

  it("uno con el reloj en marcha y otro esperando", () => {
    const lineas = revision([
      of({ id: "a", autorId: "ivan", revisorId: "jaime", estado: "en_revision", fichandoRol: "revisar" }),
      of({ id: "b", autorId: "ivan", revisorId: "tamara", estado: "por_revisar" }),
    ]);
    expect(lineas.map((l) => `${l.quien.join()} ${l.verbo}`)).toEqual([
      "Jaime Revisando 1 OF",
      "Tamara Por revisar 1 OF",
    ]);
    expect(lineas.map((l) => l.enMarcha)).toEqual([true, false]);
  });

  it("el mismo revisor con una esperando y otra ya revisada: manda lo pendiente", () => {
    const lineas = revision([
      of({ id: "a", autorId: "ivan", revisorId: "tamara", estado: "por_revisar" }),
      of({ id: "b", autorId: "ivan", revisorId: "tamara", estado: "aprobada", revisada: true }),
      of({ id: "c", autorId: "ivan", estado: "en_curso" }),
    ]);
    expect(lineas.map((l) => l.verbo)).toEqual(["Por revisar 1 OF · 1 revisada"]);
  });

  it("una esperando y otra que devolvió: también se apunta la devuelta", () => {
    const lineas = revision([
      of({ id: "a", autorId: "ivan", revisorId: "tamara", estado: "por_revisar" }),
      of({ id: "b", autorId: "ivan", revisorId: "tamara", estado: "devuelta" }),
    ]);
    expect(lineas.map((l) => l.verbo)).toEqual(["Por revisar 1 OF · 1 devuelta"]);
  });

  it("si lleva todas las OF del pedido no hace falta contarlas", () => {
    const lineas = revision([
      of({ id: "a", autorId: "ivan", revisorId: "tamara", estado: "por_revisar" }),
      of({ id: "b", autorId: "ivan", revisorId: "tamara", estado: "por_revisar" }),
    ]);
    expect(lineas.map((l) => l.verbo)).toEqual(["Por revisar"]);
  });

  it("esperando revisión y sin revisor, aunque otra OF sí lo tuviera: falta revisor", () => {
    const lineas = revision([
      of({ id: "a", autorId: "ivan", revisorId: "jaime", estado: "aprobada", revisada: true }),
      of({ id: "b", autorId: "ivan", estado: "por_revisar" }),
    ]);
    expect(lineas.map((l) => `${l.quien.join()} ${l.verbo}`)).toEqual([
      " Falta revisor 1 OF",
      "Jaime Revisó 1 OF",
    ]);
    expect(lineas[0].pendienteDeAlguien).toBe(true);
  });

  it("los minutos de cada línea son los de sus OF, no los del pedido", () => {
    const lineas = revision([
      of({ id: "a", autorId: "ivan", revisorId: "jaime", estado: "aprobada", revisada: true, tiempoRevisionMin: 10 }),
      of({ id: "b", autorId: "ivan", revisorId: "tamara", estado: "por_revisar", tiempoRevisionMin: 4 }),
    ]);
    expect(lineas.map((l) => l.minutos)).toEqual([4, 10]);
  });

  it("aprobada sin revisión, con o sin revisor nombrado, y el resto sin entregar: no hay línea", () => {
    expect(revision([of({ id: "a", autorId: "ivan", estado: "aprobada" }), of({ id: "b" })])).toEqual([]);
    expect(
      revision([of({ id: "a", autorId: "ivan", revisorId: "jaime", estado: "aprobada" }), of({ id: "b" })]),
    ).toEqual([]);
  });

  it("revisor nombrado y la OF aún sin entregar: la revisará, no la tiene por revisar", () => {
    const lineas = revision([of({ autorId: "ivan", revisorId: "jaime", estado: "en_curso" })]);
    expect(lineas).toEqual([expect.objectContaining({ quien: ["Jaime"], verbo: "Revisará", hecho: true })]);
  });
});
