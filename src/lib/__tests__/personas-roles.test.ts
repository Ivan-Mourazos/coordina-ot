import { describe, expect, it } from "vitest";
import { esRolAcceso, esSoloLectura, puedeVerComoDireccion } from "../personas";

describe("roles de acceso", () => {
  it("direccion es un rol válido", () => {
    expect(esRolAcceso("direccion")).toBe(true);
    expect(esRolAcceso("jefe")).toBe(false);
  });

  it("sin tecnico es solo lectura, haya interruptor o no", () => {
    expect(esSoloLectura(["direccion"], false)).toBe(true);
    expect(esSoloLectura([], false)).toBe(true);
    expect(esSoloLectura(["supervisor"], false)).toBe(true);
  });

  it("un técnico escribe salvo que tenga direccion y el interruptor puesto", () => {
    expect(esSoloLectura(["tecnico"], false)).toBe(false);
    expect(esSoloLectura(["tecnico"], true)).toBe(false);
    expect(esSoloLectura(["tecnico", "supervisor", "direccion"], false)).toBe(false);
    expect(esSoloLectura(["tecnico", "supervisor", "direccion"], true)).toBe(true);
  });

  it("el interruptor solo existe para quien tiene tecnico y direccion", () => {
    expect(puedeVerComoDireccion(["tecnico", "direccion"])).toBe(true);
    expect(puedeVerComoDireccion(["direccion"])).toBe(false);
    expect(puedeVerComoDireccion(["tecnico", "supervisor"])).toBe(false);
  });
});
