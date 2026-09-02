import { describe, expect, it } from "vitest";
import { claveFase, filasQueFaltan } from "../server/rps";

// Cruce de las dos fuentes del tablero: las fases vivas de OLANET y la vista de
// RPS. Medido contra la BD el 2026-09-02 (ver la spec de Diseño Gráfico).

const fila = (OF: string, CodTarea: string, extra = {}) => ({
  OF,
  CodTarea,
  SitOF: "CON IMPUTACIONES",
  PermiteImputaciones: true,
  ...extra,
});

describe("claveFase", () => {
  it("los ceros a la izquierda no hacen dos fases de una", () => {
    // RPS guarda la tarea como "03" y OLANET la misma fase como "3". Comparadas
    // en crudo son dos, y la OF saldría DOS veces en el tablero: una por cada
    // fuente.
    expect(claveFase("0230700", "03")).toBe(claveFase("0230700", "3"));
  });

  it("distingue fases distintas de la misma OF", () => {
    expect(claveFase("0230700", "3")).not.toBe(claveFase("0230700", "30"));
  });

  it("aguanta los huecos y los nulos que trae RPS", () => {
    expect(claveFase(" 0230700 ", " 03 ")).toBe(claveFase("0230700", "3"));
    expect(claveFase(null, null)).toBe("/");
  });

  it("una fase que se llama '0' no se queda sin nombre", () => {
    // El recorte de ceros no puede comerse el último dígito: la tarea 0
    // ("Materiales") existe de verdad en RPS.
    expect(claveFase("0230700", "0")).toBe("0230700/0");
    expect(claveFase("0230700", "00")).toBe("0230700/0");
  });
});

describe("filasQueFaltan", () => {
  it("no repite lo que OLANET ya trajo", () => {
    const filas = [fila("0230700", "10")];
    expect(filasQueFaltan(filas, [{ of: "0230700", fase: "10" }])).toEqual([]);
  });

  it("añade lo recién lanzado que OLANET todavía no tiene", () => {
    // OLANET recibe las fases el mismo día (51 de 58 medidas), pero puede
    // tardar hasta 3. AR.26.04286 se lanzó la mañana del 02/09 y no estaba.
    const nueva = fila("0231780", "6");
    expect(filasQueFaltan([nueva], [])).toEqual([nueva]);
  });

  it("no añade lo que no se puede fichar", () => {
    // Las DETENIDAS y CREADAS no están en OLANET precisamente porque no admiten
    // imputaciones. Traerlas de la vista devolvería al tablero tarjetas con el
    // reloj muerto: 10 de las 43 filas que Diseño veía el 02/09.
    const parada = fila("0229289", "20", { SitOF: "DETENIDA", PermiteImputaciones: false });
    expect(filasQueFaltan([parada], [])).toEqual([]);
  });

  it("sin el bit de la vista, decide la situación", () => {
    const parada = fila("0229289", "20", { SitOF: "DETENIDA", PermiteImputaciones: null });
    const viva = fila("0231780", "6", { SitOF: "LANZADA", PermiteImputaciones: null });
    expect(filasQueFaltan([parada, viva], [])).toEqual([viva]);
  });

  it("empareja aunque los ceros no coincidan entre los dos sistemas", () => {
    const filas = [fila("0230526", "03")];
    expect(filasQueFaltan(filas, [{ of: "0230526", fase: "3" }])).toEqual([]);
  });
});
