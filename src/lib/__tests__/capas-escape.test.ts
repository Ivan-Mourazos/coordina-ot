import { describe, expect, it } from "vitest";
import { crearPila } from "../capas-escape";

// Escape tiene que cerrar lo último que se abrió y nada más. Con la ficha
// abierta y un desplegable encima, cerraba los dos a la vez.

describe("pila de capas de Escape", () => {
  it("cierra solo la de arriba", () => {
    const pila = crearPila();
    const cerradas: string[] = [];
    pila.apilar(() => cerradas.push("ficha"));
    pila.apilar(() => cerradas.push("materiales"));
    expect(pila.cerrarUltima()).toBe(true);
    expect(cerradas).toEqual(["materiales"]);
  });

  it("la segunda pulsación llega a la de debajo cuando la de arriba se ha ido", () => {
    const pila = crearPila();
    const cerradas: string[] = [];
    pila.apilar(() => cerradas.push("ficha"));
    const quitar = pila.apilar(() => cerradas.push("materiales"));
    pila.cerrarUltima();
    // La ventana, al cerrarse, se desmonta y sale de la pila.
    quitar();
    pila.cerrarUltima();
    expect(cerradas).toEqual(["materiales", "ficha"]);
  });

  it("si la de arriba no se quita, la siguiente pulsación sigue siendo suya", () => {
    // Una capa que aún no se ha desmontado (una animación de salida) no puede
    // dejar pasar el Escape a la ficha de debajo.
    const pila = crearPila();
    const cerradas: string[] = [];
    pila.apilar(() => cerradas.push("ficha"));
    pila.apilar(() => cerradas.push("confirmar"));
    pila.cerrarUltima();
    pila.cerrarUltima();
    expect(cerradas).toEqual(["confirmar", "confirmar"]);
  });

  it("quitar una capa de en medio no altera el orden del resto", () => {
    const pila = crearPila();
    const cerradas: string[] = [];
    pila.apilar(() => cerradas.push("ficha"));
    const quitarSelect = pila.apilar(() => cerradas.push("select"));
    pila.apilar(() => cerradas.push("visor"));
    quitarSelect();
    pila.cerrarUltima();
    expect(cerradas).toEqual(["visor"]);
  });

  it("dos capas con la misma función son dos capas", () => {
    const pila = crearPila();
    let veces = 0;
    const cerrar = () => veces++;
    const quitarPrimera = pila.apilar(cerrar);
    pila.apilar(cerrar);
    quitarPrimera();
    expect(pila.cerrarUltima()).toBe(true);
    expect(veces).toBe(1);
  });

  it("sin nada abierto no se queda la pulsación", () => {
    expect(crearPila().cerrarUltima()).toBe(false);
  });

  it("quitar dos veces la misma capa no se lleva otra", () => {
    const pila = crearPila();
    const cerradas: string[] = [];
    pila.apilar(() => cerradas.push("ficha"));
    const quitar = pila.apilar(() => cerradas.push("materiales"));
    quitar();
    quitar();
    pila.cerrarUltima();
    expect(cerradas).toEqual(["ficha"]);
  });
});
