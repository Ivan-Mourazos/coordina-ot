import { describe, expect, it } from "vitest";
import { nombreRps } from "../nombre-rps";

// Nombres tal y como los guarda GENEmployee: apellidos, coma, nombre de pila, y
// a veces espacios de más al final. Se enseñan solo cuando quien imputó tiempo
// no es del equipo de OT (a los de casa se les llama por su nombre del tablero).

describe("nombreRps", () => {
  it("pone el nombre delante de los apellidos", () => {
    expect(nombreRps("CARBON SEXTO, ALBERTO")).toBe("ALBERTO CARBON SEXTO");
    expect(nombreRps("QUINTELA PANDELO, MARIA RAQUEL")).toBe("MARIA RAQUEL QUINTELA PANDELO");
  });

  it("limpia los espacios sobrantes de RPS", () => {
    expect(nombreRps("  GOMEZ CAMINO,   LUCIA  ")).toBe("LUCIA GOMEZ CAMINO");
  });

  it("sin coma lo deja como está: no hay nada que dar la vuelta", () => {
    expect(nombreRps("TALLER 2")).toBe("TALLER 2");
  });

  it("con una mitad vacía no deja el nombre colgando de un espacio", () => {
    expect(nombreRps("PENAS MATO,")).toBe("PENAS MATO");
    expect(nombreRps(", IGNACIO")).toBe("IGNACIO");
  });
});
