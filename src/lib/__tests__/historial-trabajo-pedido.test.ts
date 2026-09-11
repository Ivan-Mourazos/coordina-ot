import { describe, expect, it } from "vitest";
import { resumirTrabajoPedidos, type FilaTrabajoPedido } from "../historial";

// Lo que enseña cada fila del Historial: el tiempo y quién lo echó, con la
// misma regla que la ficha. Lo de la sección y, si el pedido no tiene nada de
// la sección, lo de los otros centros diciendo cuáles. SA.24.00312 salía en OT
// con un solo nombre sin avisar de que era trabajo de Taller.

const fila = (
  pedido: string,
  centro: FilaTrabajoPedido["centro"],
  minutos: number,
  orden = "0001",
  empleado = `emp-${centro}-${minutos}`,
  nombre = "",
): FilaTrabajoPedido => ({
  pedido,
  orden,
  tarea: "10",
  empleado,
  nombre,
  centro,
  minutos,
});

describe("resumirTrabajoPedidos", () => {
  it("con tareas de la sección solo suma las suyas", () => {
    const r = resumirTrabajoPedidos([fila("A", "ot", 30), fila("A", "taller", 400), fila("A", "ot", 12, "0002")], "ot");
    expect(r.get("A")).toMatchObject({ minutos: 42 });
    expect(r.get("A")?.otrosCentros).toBeUndefined();
  });

  it("sin tareas de la sección enseña los otros centros y lo dice", () => {
    const r = resumirTrabajoPedidos([fila("B", "taller", 432)], "ot");
    expect(r.get("B")).toMatchObject({ minutos: 432, otrosCentros: ["taller"] });
  });

  it("varios centros ajenos salen en orden estable", () => {
    const r = resumirTrabajoPedidos([fila("C", "taller", 5), fila("C", "ot", 7)], "diseno");
    expect(r.get("C")).toMatchObject({ minutos: 12, otrosCentros: ["ot", "taller"] });
  });

  it("una tarea de la sección sin minutos sigue siendo de la sección: 0, no ajeno", () => {
    const r = resumirTrabajoPedidos([fila("D", "ot", 0), fila("D", "taller", 90)], "ot");
    expect(r.get("D")).toMatchObject({ minutos: 0 });
    expect(r.get("D")?.otrosCentros).toBeUndefined();
  });

  it("una OF en dos líneas de venta no cuenta dos veces el mismo minutaje", () => {
    // Misma OF, misma tarea, misma persona: la consulta la trae una vez por
    // línea de venta, y es el mismo trabajo.
    const repetida = fila("G", "taller", 36, "0202576", "E1", "Hugo Millán");
    const r = resumirTrabajoPedidos([fila("G", "taller", 396, "0202576", "E2", "Luis Santos"), repetida, { ...repetida }], "ot");
    expect(r.get("G")).toMatchObject({ minutos: 432, otrosCentros: ["taller"] });
    expect(r.get("G")?.personas).toEqual([
      { nombre: "Luis Santos", min: 396 },
      { nombre: "Hugo Millán", min: 36 },
    ]);
  });

  it("las personas salen de más minutos a menos, sumando sus tareas", () => {
    const r = resumirTrabajoPedidos(
      [
        fila("H", "ot", 5, "0001", "E1", "Jaime Vázquez"),
        fila("H", "ot", 20, "0002", "E2", "Adrián Quinteiro"),
        { ...fila("H", "ot", 10, "0003", "E1", "Jaime Vázquez"), tarea: "20" },
      ],
      "ot",
    );
    expect(r.get("H")?.personas).toEqual([
      { nombre: "Adrián Quinteiro", min: 20 },
      { nombre: "Jaime Vázquez", min: 15 },
    ]);
  });

  it("a igualdad de minutos, por nombre; y quien no echó nada no sale", () => {
    const r = resumirTrabajoPedidos(
      [
        fila("I", "ot", 10, "0001", "E1", "Tamara Villar"),
        fila("I", "ot", 10, "0002", "E2", "Alberto Carbón"),
        fila("I", "ot", 0, "0003", "E3", "Iván Sánchez"),
      ],
      "ot",
    );
    expect(r.get("I")?.personas.map((p) => p.nombre)).toEqual(["Alberto Carbón", "Tamara Villar"]);
  });

  it("cada pedido va por su lado", () => {
    const r = resumirTrabajoPedidos([fila("E", "ot", 10), fila("F", "taller", 20)], "ot");
    expect(r.get("E")).toMatchObject({ minutos: 10 });
    expect(r.get("F")).toMatchObject({ minutos: 20, otrosCentros: ["taller"] });
  });
});
