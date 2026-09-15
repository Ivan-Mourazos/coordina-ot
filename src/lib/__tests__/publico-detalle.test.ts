import { expect, test } from "vitest";
import type { HistorialOF, HistorialPedidoDetalle } from "../historial";
import { detalleConsulta } from "../publico";

// ─── La lista blanca del detalle del invitado ────────────────────────────────
// Se prueba con un objeto hecho a mano porque el mock de desarrollo no genera
// ni notasProduccion ni materiales: sin esto, la mitad del recorte nunca se
// ejercitaría de verdad.

function detalle(): HistorialPedidoDetalle {
  const of = {
    codigo: "0230001",
    descripcion: "Toldo cofre",
    tiempoImputadoMin: 120,
    quien: ["Juan Pérez"],
    centro: "ot" as const,
    personas: [{ nombre: "Juan Pérez", min: 120 }],
    tareas: [{ codigo: "010", descripcion: "Plantear", tiempoImputadoMin: 120, personas: [{ nombre: "Juan Pérez", min: 120 }] }],
    autorRegistrado: "Juan Pérez",
    revisorRegistrado: "Jaime López",
    rol: { planteoMin: 100, revisionMin: 20, planteo: [], revision: [] },
    materiales: [{ texto: "LONA ACRÍLICA · 5", apartado: true }],
    notasProduccion: "BELEN AB - se devolvió por medidas mal tomadas",
    // Un campo que el Historial añadiera mañana no puede salir solo.
    campoNuevoInterno: "no debería salir",
  } as HistorialOF;
  return {
    estadoActual: "En curso",
    codigo: "AR.26.09999",
    cliente: "Cliente de prueba",
    negocio: "Negocio",
    ciudadEntrega: "Arzúa",
    prioridad: 2,
    fechaSolicitud: "2026-01-01",
    fechaFinalizacion: "2026-01-05",
    piezas: 3,
    familias: ["TOLDO NUEVO"],
    comentarioVenta: "Entre nosotros: cliente pesado, avisar a ventas",
    scanUrl: "/api/pedidos/AR.26.09999.pdf",
    ofs: [of],
    documentos: [
      { descripcion: "Planteamiento", archivo: "plan.pdf", clase: "Planteamiento", url: "/api/historial/AR.26.09999/documento/0" },
      { descripcion: "Sin fichero", archivo: "x.msg", clase: "Documento", url: null },
    ],
  };
}

const extra = { situacion: "fabrica" as const, fechaEntregado: null, donde: [] };

test("la cabecera interna no sale", () => {
  const d = detalleConsulta(detalle(), extra) as unknown as Record<string, unknown>;
  for (const clave of ["estadoActual", "prioridad", "comentarioVenta", "scanUrl", "fechaFinalizacion"]) {
    expect(d).not.toHaveProperty(clave);
  }
  expect(d.codigo).toBe("AR.26.09999");
  expect(d.ciudadEntrega).toBe("Arzúa");
});

test("vuelven los nombres, los tiempos y quién planteó y revisó: la ficha del equipo", () => {
  const of = detalleConsulta(detalle(), extra).ofs[0];
  expect(of.quien).toEqual(["Juan Pérez"]);
  expect(of.personas).toEqual([{ nombre: "Juan Pérez", min: 120 }]);
  expect(of.tiempoImputadoMin).toBe(120);
  expect(of.tareas?.[0]).toEqual({
    codigo: "010",
    descripcion: "Plantear",
    tiempoImputadoMin: 120,
    personas: [{ nombre: "Juan Pérez", min: 120 }],
  });
  expect(of.autorRegistrado).toBe("Juan Pérez");
  expect(of.revisorRegistrado).toBe("Jaime López");
  expect(of.rol?.planteoMin).toBe(100);
  expect(of.materiales).toHaveLength(1);
});

test("las notas de producción y lo que no está en la lista blanca, no", () => {
  const d = detalleConsulta(detalle(), extra);
  const of = d.ofs[0] as unknown as Record<string, unknown>;
  expect(of).not.toHaveProperty("notasProduccion");
  expect(of).not.toHaveProperty("campoNuevoInterno");
  const crudo = JSON.stringify(d);
  expect(crudo).not.toContain("devolvió");
  expect(crudo).not.toContain("cliente pesado");
});

test("los documentos apuntan a la ruta pública; sin fichero se queda en null", () => {
  const d = detalleConsulta(detalle(), extra);
  expect(d.documentos[0].url).toBe("/api/publico/pedidos/AR.26.09999/documento/0");
  expect(d.documentos[1].url).toBeNull();
});

test("situación, fecha de salida y dónde está pasan tal cual", () => {
  const donde = [{
    orden: "0230001",
    enCurso: [],
    pausadas: [],
    siguientes: [{ paso: "Corte", tarea: "Cortar", quien: null, desde: null }],
  }];
  const d = detalleConsulta(detalle(), { situacion: "entregado", fechaEntregado: "2026-09-14", donde });
  expect(d.situacion).toBe("entregado");
  expect(d.fechaEntregado).toBe("2026-09-14");
  expect(d.donde).toEqual(donde);
});
