import { expect, test } from "vitest";
import type { HistorialOF, HistorialPedidoDetalle } from "../historial";
import { detalleConsulta } from "../publico";

// ─── El invitado NO ve el material gastado ───────────────────────────────────
// Decisión de la sección 1 de la spec del 15/09/2026: lo que salió del almacén
// es solo para el equipo, y no por esconderlo en pantalla — el camino del
// invitado no lo lee. Por eso va en ruta propia
// (`GET /api/historial/[pedido]/gastado`, con `soloConSesion`) y no dentro de
// `leerHistorialPedidoDetalle`, que es la misma función que llama la consulta
// sin login (`server/publico-db.ts`).
//
// `ofConsulta` es lista blanca, así que hoy no lo copia. Esta es la red para
// mañana: el día que alguien añada `gastado` al detalle del equipo —o lo meta
// en la lista blanca sin pensarlo— este test se pone en rojo. Sin él, el único
// aviso sería que un comercial viera el consumo de material de la casa.

const GASTADO = [
  { material: "RECACRIL 320 BLANCO", codigo: "REC320B", gastado: 17.7, ultimaSalida: "2026-09-12" },
];

function detalle(): HistorialPedidoDetalle {
  const of = {
    codigo: "0230001",
    descripcion: "Toldo cofre",
    tiempoImputadoMin: 120,
    quien: ["Juan Pérez"],
    centro: "ot" as const,
    materiales: [{ texto: "LONA ACRÍLICA · 5", apartado: true }],
    // Los tres nombres con los que esto podría aterrizar en la OF el día que
    // alguien junte las dos consultas.
    gastado: GASTADO,
    materialGastado: GASTADO,
    materialesGastados: GASTADO,
  } as unknown as HistorialOF;
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
    comentarioVenta: "",
    scanUrl: null,
    ofs: [of],
    documentos: [],
    // Y por si el mapa del pedido entero (lo que devuelve la ruta nueva) se
    // colara en el detalle: tampoco sale.
    gastado: { "0230001": GASTADO },
  } as unknown as HistorialPedidoDetalle;
}

test("el material gastado no entra en la ficha del invitado, ni en la OF ni en el pedido", () => {
  const d = detalleConsulta(detalle(), { situacion: "fabrica", fechaEntregado: null, donde: [] });
  const pedido = d as unknown as Record<string, unknown>;
  const of = d.ofs[0] as unknown as Record<string, unknown>;
  for (const clave of ["gastado", "materialGastado", "materialesGastados"]) {
    expect(of).not.toHaveProperty(clave);
    expect(pedido).not.toHaveProperty(clave);
  }
  // Ni por otro nombre: lo que no puede salir es el DATO.
  const crudo = JSON.stringify(d);
  expect(crudo).not.toContain("RECACRIL");
  expect(crudo).not.toContain("REC320B");
  expect(crudo).not.toContain("17.7");
});

test("y el material asignado sí, que es el que ya se enseñaba", () => {
  // Para que el test de arriba no pase por accidente: la ficha del invitado
  // sigue trayendo lo suyo.
  const d = detalleConsulta(detalle(), { situacion: "fabrica", fechaEntregado: null, donde: [] });
  expect(d.ofs[0].materiales).toEqual([{ texto: "LONA ACRÍLICA · 5", apartado: true }]);
});
