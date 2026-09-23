import { describe, expect, it } from "vitest";
import { unaFilaPorOF } from "../server/rps";

// TGM_PENDIENTE_OT da una fila por TAREA pendiente, no por OF. Los casos son
// los de AR.26.03626, donde la OF 0230700 llegaba dos veces.

const fila = (OF: string, Tarea: string, marca = "", CodTarea: string | null = null) => ({
  OF,
  Tarea,
  marca,
  CodTarea,
});

describe("unaFilaPorOF", () => {
  it("deja pasar las OF que solo traen una tarea", () => {
    const filas = [fila("0230697", "OFICINA TECNICA"), fila("0230699", "TALLER CAPOTAS")];
    expect(unaFilaPorOF(filas)).toEqual(filas);
  });

  it("fusiona las dos filas de la misma OF y se queda con la tarea de OT", () => {
    // La de taller llega PRIMERO a propósito: quedarse con la primera sin mirar
    // qué tarea es marcaría la OF como ajena a Oficina Técnica y desaparecería
    // del tablero, que es justo el trabajo que sí toca plantear.
    const filas = [
      fila("0230700", "TALLER CAPOTAS", "taller"),
      fila("0230700", "OFICINA TECNICA", "ot"),
    ];
    expect(unaFilaPorOF(filas)).toEqual([fila("0230700", "OFICINA TECNICA", "ot")]);
  });

  it("da igual el orden en que vengan", () => {
    const filas = [
      fila("0230700", "OFICINA TECNICA", "ot"),
      fila("0230700", "TALLER CAPOTAS", "taller"),
    ];
    expect(unaFilaPorOF(filas)).toEqual([fila("0230700", "OFICINA TECNICA", "ot")]);
  });

  it("si TODAS son de taller se queda una, y sigue siendo de taller", () => {
    // No se puede ascender a trabajo de OT algo que no lo es: la OF tiene que
    // seguir marcándose como ajena para que el tablero no la enseñe.
    const filas = [fila("0230699", "TALLER CAPOTAS", "a"), fila("0230699", "TALLER FALDONES", "b")];
    expect(unaFilaPorOF(filas)).toEqual([fila("0230699", "TALLER CAPOTAS", "a")]);
  });

  it("conserva el orden de aparición de las OF", () => {
    // El pedido enseña sus OF en el orden en que las da RPS; fusionar no puede
    // reordenarlas.
    const filas = [
      fila("0230701", "OFICINA TECNICA"),
      fila("0230700", "TALLER CAPOTAS"),
      fila("0230700", "OFICINA TECNICA"),
      fila("0230697", "OFICINA TECNICA"),
    ];
    expect(unaFilaPorOF(filas).map((f) => f.OF)).toEqual(["0230701", "0230700", "0230697"]);
  });

  it("agrupa aunque el nº de OF venga con espacios de RPS", () => {
    const filas = [fila(" 0230700 ", "TALLER CAPOTAS"), fila("0230700", "OFICINA TECNICA")];
    expect(unaFilaPorOF(filas)).toHaveLength(1);
  });

  // Diseño Gráfico, AR.26.04684 (22/09/2026): la OF 0232394 trae DOS tareas
  // suyas, la 6 (diseñar, A-DGRA) y la 10 (cortar, P-PCUS). Fusionarlas dejaba
  // una sola al azar, y Carrón fichó el diseño en el corte sin poder elegir.
  it("no fusiona dos tareas de la sección: cada una es su propio trabajo", () => {
    const filas = [
      fila("0232394", "CORTAR ROTULACION", "corte", "10"),
      fila("0232394", "DISEÑAR ROTULACION", "diseno", "6"),
    ];
    expect(unaFilaPorOF(filas).map((f) => f.marca)).toEqual(["diseno", "corte"]);
  });

  it("las tareas de una OF salen en el orden de la ruta, numérico", () => {
    // "10" < "6" como texto: ordenar alfabéticamente pondría el corte antes
    // que el diseño, que es al revés de como se hace.
    const filas = [
      fila("0232394", "CORTAR ROTULACION", "", "10"),
      fila("0232394", "DISEÑAR ROTULACION", "", "6"),
    ];
    expect(unaFilaPorOF(filas).map((f) => f.CodTarea)).toEqual(["6", "10"]);
    expect(unaFilaPorOF([...filas].reverse()).map((f) => f.CodTarea)).toEqual(["6", "10"]);
  });

  it("el corte va detrás del diseño aunque su número sea menor", () => {
    // 0232360 (AR.26.04662): cortar es la 10 y diseñar la 11. Por número
    // saldría primero el corte, y el botón de la fila ficharía ahí el diseño.
    const filas = [
      { OF: "0232360", Tarea: "CORTAR ROTULACION", CodTarea: "10", Recurso: "P-PCUS" },
      { OF: "0232360", Tarea: "DISEÑAR ROTULACION", CodTarea: "11", Recurso: "A-DGRA" },
    ];
    const alFinal = (f: (typeof filas)[number]) => f.Recurso === "P-PCUS";
    expect(unaFilaPorOF(filas, alFinal).map((f) => f.CodTarea)).toEqual(["11", "10"]);
  });

  it("la misma tarea repetida sale una vez", () => {
    // La consulta cruza con las líneas del pedido: una OF colgada de dos
    // líneas trae su tarea dos veces, y eso no son dos trabajos.
    const filas = [
      fila("0232394", "DISEÑAR ROTULACION", "a", "6"),
      fila("0232394", "DISEÑAR ROTULACION", "b", "6"),
    ];
    expect(unaFilaPorOF(filas).map((f) => f.marca)).toEqual(["a"]);
  });

  it("la de taller se sigue cayendo aunque haya dos de la sección", () => {
    const filas = [
      fila("0230700", "PLANTEAR EN TALLER", "taller", "3"),
      fila("0230700", "OFICINA TECNICA", "ot", "2"),
      fila("0230700", "OFICINA TECNICA 2", "ot2", "4"),
    ];
    expect(unaFilaPorOF(filas).map((f) => f.marca)).toEqual(["ot", "ot2"]);
  });

  it("dos tareas de la sección no desordenan las OF entre sí", () => {
    const filas = [
      fila("0232395", "DISEÑAR ROTULACION", "", "6"),
      fila("0232394", "CORTAR ROTULACION", "", "10"),
      fila("0232394", "DISEÑAR ROTULACION", "", "6"),
    ];
    expect(unaFilaPorOF(filas).map((f) => `${f.OF}:${f.CodTarea}`)).toEqual([
      "0232395:6",
      "0232394:6",
      "0232394:10",
    ]);
  });
});
