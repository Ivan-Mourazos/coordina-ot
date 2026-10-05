import { describe, expect, it } from "vitest";
import { esTareaDeTaller, unaFilaPorOF } from "../server/rps";

// TGM_PENDIENTE_OT da una fila por TAREA pendiente, no por OF. Los casos son
// los de AR.26.03626, donde la OF 0230700 llegaba dos veces.

// Todas de CAPOTA: es la familia en la que una tarea que dice "TALLER" es del
// taller de verdad (ver `esTareaDeTaller`).
const fila = (OF: string, Tarea: string, marca = "", Articulo = "  1 - CAPOTA") => ({ OF, Tarea, marca, Articulo });

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
});

// AR.26.04714 (05/10/2026): "PLANTEAR EN TALLER" de un toldo de fachada, que
// plantea Oficina Técnica, salía como "para taller" y no había forma de verla
// como trabajo propio. Medido en RPS sobre 2026: en toldo fachada esa tarea la
// ficha OT (31 tareas, 887 min); en capota y otras estructuras, el taller.
describe("esTareaDeTaller", () => {
  it("una capota que dice TALLER es del taller", () => {
    expect(esTareaDeTaller("PLANTEAR EN TALLER", "  1 - CAPOTA")).toBe(true);
  });

  it("otras estructuras que dicen TALLER también", () => {
    expect(esTareaDeTaller("PLANTEAR EN TALLER", "  1 - OTR.ESTRUCTURAS")).toBe(true);
  });

  it("un toldo de fachada que dice TALLER es de Oficina Técnica", () => {
    expect(esTareaDeTaller("PLANTEAR EN TALLER", "  4 - TOLDO FACHADA")).toBe(false);
  });

  it("sin familia no se esconde: no se sabe que sea del taller", () => {
    expect(esTareaDeTaller("PLANTEAR EN TALLER", null)).toBe(false);
  });

  it("una capota cuya tarea no dice TALLER sigue siendo de OT", () => {
    expect(esTareaDeTaller("PLANTEAR Y PREPARAR ARCHIVO MAQ. DE CORTE", "  1 - CAPOTA")).toBe(false);
  });
});

describe("unaFilaPorOF con un toldo de fachada", () => {
  // Las dos tareas son de OT, pero tiene que ganar SIEMPRE la misma: el id de
  // la OF lleva la tarea dentro, y si bailara según el orden en que RPS da las
  // filas, el autor y el estado guardados se quedarían colgando de la otra.
  it("con las dos pendientes sigue ganando la que no dice TALLER, venga como venga", () => {
    const taller = fila("0232464", "PLANTEAR EN TALLER", "5", "  4 - TOLDO FACHADA");
    const corte = fila("0232464", "PLANTEAR Y PREPARAR ARCHIVO MAQ. DE CORTE", "6", "  4 - TOLDO FACHADA");
    expect(unaFilaPorOF([taller, corte]).map((f) => f.marca)).toEqual(["6"]);
    expect(unaFilaPorOF([corte, taller]).map((f) => f.marca)).toEqual(["6"]);
  });
});
