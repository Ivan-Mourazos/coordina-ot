import { describe, expect, it } from "vitest";
import { resumirTrabajoPedidos, type FilaTrabajoPedido } from "../historial";

// El tiempo que enseña cada fila del Historial sigue la misma regla que su
// autoría: lo de la sección, y si no hay nada de la sección, lo de los otros
// centros diciendo cuáles. SA.24.00312 salía en OT con "Autor: Luis Santos"
// sin avisar de que era trabajo de Taller.

const fila = (
  pedido: string,
  centro: FilaTrabajoPedido["centro"],
  minutos: number,
  orden = "0001",
  empleado = `emp-${centro}-${minutos}`,
): FilaTrabajoPedido => ({
  pedido,
  orden,
  tarea: "10",
  empleado,
  centro,
  minutos,
});

describe("resumirTrabajoPedidos", () => {
  it("con tareas de la sección solo suma las suyas", () => {
    const r = resumirTrabajoPedidos([fila("A", "ot", 30), fila("A", "taller", 400), fila("A", "ot", 12, "0002")], "ot");
    expect(r.get("A")).toEqual({ minutos: 42 });
  });

  it("sin tareas de la sección enseña los otros centros y lo dice", () => {
    const r = resumirTrabajoPedidos([fila("B", "taller", 432)], "ot");
    expect(r.get("B")).toEqual({ minutos: 432, otrosCentros: ["taller"] });
  });

  it("varios centros ajenos salen en orden estable", () => {
    const r = resumirTrabajoPedidos([fila("C", "taller", 5), fila("C", "ot", 7)], "diseno");
    expect(r.get("C")).toEqual({ minutos: 12, otrosCentros: ["ot", "taller"] });
  });

  it("una tarea de la sección sin minutos sigue siendo de la sección: 0, no ajeno", () => {
    const r = resumirTrabajoPedidos([fila("D", "ot", 0), fila("D", "taller", 90)], "ot");
    expect(r.get("D")).toEqual({ minutos: 0 });
  });

  it("una OF en dos líneas de venta no cuenta dos veces el mismo minutaje", () => {
    // Misma OF, misma tarea, misma persona: la consulta la trae una vez por
    // línea de venta, y es el mismo trabajo.
    const repetida = fila("G", "taller", 36, "0202576", "E1");
    const r = resumirTrabajoPedidos([fila("G", "taller", 396, "0202576", "E2"), repetida, { ...repetida }], "ot");
    expect(r.get("G")).toEqual({ minutos: 432, otrosCentros: ["taller"] });
  });

  it("cada pedido va por su lado", () => {
    const r = resumirTrabajoPedidos([fila("E", "ot", 10), fila("F", "taller", 20)], "ot");
    expect(r.get("E")).toEqual({ minutos: 10 });
    expect(r.get("F")).toEqual({ minutos: 20, otrosCentros: ["taller"] });
  });
});
