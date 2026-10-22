import { describe, expect, it } from "vitest";
import { lineasDe } from "../devolucion";

describe("lineasDe", () => {
  it("una casilla por línea, sin la viñeta escrita a mano", () => {
    // La nota real de una devolución de lonas (22/10/2026).
    const nota = [
      "- EN EL LARGO HACER BASTILLA DE 4,5, PARA QUE QUEDE DEL MISMO ANCHO QUE EN LAS CABEZAS",
      "- EN LAS CABEZAS METER LA TIRA AL CORTE",
      "- LA TIRA QUE DOBLE QUE VA AL ANCHO HACE SESGADO",
      "-OLLAOS ENFRENTADOS",
      "",
      "- MANDAR GOMA",
    ].join("\n");
    expect(lineasDe(nota)).toEqual([
      "EN EL LARGO HACER BASTILLA DE 4,5, PARA QUE QUEDE DEL MISMO ANCHO QUE EN LAS CABEZAS",
      "EN LAS CABEZAS METER LA TIRA AL CORTE",
      "LA TIRA QUE DOBLE QUE VA AL ANCHO HACE SESGADO",
      "OLLAOS ENFRENTADOS",
      "MANDAR GOMA",
    ]);
  });
  it("un párrafo seguido es una sola casilla, y la numeración también se quita", () => {
    expect(lineasDe("Revisa las cotas del lateral y la tornillería")).toEqual(["Revisa las cotas del lateral y la tornillería"]);
    expect(lineasDe("1. cotas\n2) tornillería\r\n• goma")).toEqual(["cotas", "tornillería", "goma"]);
  });
});
