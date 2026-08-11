import { describe, expect, it } from "vitest";
import { unaFilaPorOF } from "../server/rps";

// TGM_PENDIENTE_OT da una fila por TAREA pendiente, no por OF. Los casos son
// los de AR.26.03626, donde la OF 0230700 llegaba dos veces.

const fila = (OF: string, Tarea: string, marca = "") => ({ OF, Tarea, marca });

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
