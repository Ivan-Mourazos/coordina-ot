import { describe, expect, test } from "vitest";
import { ofsFueraPorPedido } from "../server/rps";
import { ofsFueraVisibles } from "../fases-tablero";
import type { OF, OFFuera } from "../types";

// AR.26.04890: en RPS dos OF, en la web una. La de las solapas no tiene tarea
// de Oficina Técnica y no sale en la vista; se enseña plegada en la ficha.
describe("las OF del pedido sin tarea de la sección", () => {
  const fila = (orden: string, codTarea: string, tarea: string) => ({
    pedido: "AR.26.04890", orden, descripcion: "SOLAPA CON VELCRO PARA TOLDOS CORTINA",
    cantidad: 6, codTarea, tarea, maquina: "P-COST",
  });

  test("una por OF, con su ruta en el orden del parte (por número de tarea)", () => {
    const m = ofsFueraPorPedido([
      fila("0232764", "99", "SOLICITA ALBERTO VISIA DE JUAN CON OT "),
      fila("0232764", "11", "CONFECCION LONA PVC"),
      fila("0232764", "6", "CORTE LONA PVC"),
      fila("0232764", "25", "FINALIZACION "),
    ]);
    expect(m.get("AR.26.04890")).toEqual([
      {
        codigo: "0232764",
        descripcion: "SOLAPA CON VELCRO PARA TOLDOS CORTINA",
        piezas: 6,
        tareas: ["CORTE LONA PVC", "CONFECCION LONA PVC", "FINALIZACION", "SOLICITA ALBERTO VISIA DE JUAN CON OT"],
        motivo: "sinTarea",
      },
    ]);
  });

  test("con una tarea en una máquina de la sección es que ya está hecha, no que no la lleve", () => {
    // AR.26.04832: "PLANTEAR Y PREPARA ARCHIVOS MAQ. DE CORTE" en OTEC-A, ya
    // hecha. Llamarla «sin tarea de OT» sería falso.
    const m = ofsFueraPorPedido(
      [
        { ...fila("0232689", "5", "PLANTEAR"), maquina: "OTEC-A" },
        { ...fila("0232689", "10", "CORTAR"), maquina: "CORT-P" },
      ],
      ["a-otec", "otec-a"],
    );
    expect(m.get("AR.26.04890")?.[0].motivo).toBe("hecha");
  });

  test("si le ponen una tarea nuestra y ya es OF de verdad, deja de salir como fuera", () => {
    const fuera: OFFuera = { codigo: "0232764", descripcion: "SOLAPA", piezas: 6, tareas: [], motivo: "sinTarea" };
    const otra: OFFuera = { codigo: "0232999", descripcion: "OTRA", piezas: 1, tareas: [], motivo: "hecha" };
    const normal = { codigo: "0232764" } as OF;
    expect(ofsFueraVisibles({ ofs: [normal], ofsFuera: [fuera, otra] })).toEqual([otra]);
    expect(ofsFueraVisibles({ ofs: [], ofsFuera: [fuera] })).toEqual([fuera]);
    expect(ofsFueraVisibles({ ofs: [] })).toEqual([]);
  });
});
