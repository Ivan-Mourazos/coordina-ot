import { expect, test } from "vitest";
import type { OF, Pedido } from "../types";
import { pedidoParaInvitado } from "../publico";

// La pestaña «En curso» del invitado reutiliza la vista Pendientes del equipo,
// pero con los pedidos limpiados EN EL SERVIDOR: lo que no se enseña no viaja
// (regla de la consulta pública desde la v1).

const of = (extra: Partial<OF> = {}): OF => ({
  id: "0232817:5",
  codigo: "0232817",
  descripcion: "LONA PARA PUERTA",
  detalleVenta: "Texto de la línea de venta",
  familia: "LONA",
  piezas: 1,
  autorId: "ivan",
  revisorId: "jaime",
  estado: "devuelta",
  observacion: "Faltan las medidas del faldón",
  fichandoRol: null,
  avisos: ["06/10 AVISA LADINA VISITA"],
  materiales: [],
  compras: [],
  reservasMaterial: 2,
  reservasDetalle: ["LONA PVC 650"],
  materialPendienteHasta: "2026-10-12",
  tiempoEstimadoMin: 60,
  tiempoPlanteoMin: 17,
  tiempoRevisionMin: 2,
  ...extra,
});

const pedido = (extra: Partial<Pedido> = {}): Pedido => ({
  id: "p1",
  codigo: "AR.26.04904",
  cliente: "2006 PORTANOVA, S.L.",
  situacion: "procesado",
  fechaSolicitud: "2026-10-20",
  fechaPlanificacion: "2026-10-13",
  fechaEntrega: "2026-10-20",
  prioridad: 3,
  ofs: [of()],
  scanUrl: "/api/pedidos/AR.26.04904",
  comentarioVenta: "Llamar antes de ir",
  reabiertoPor: ["0232817:5"],
  accent: "ninguno",
  lineas: 0,
  croquis: false,
  ...extra,
});

test("no viajan notas, avisos, comentario de venta, material ni prioridad", () => {
  const p = pedidoParaInvitado(pedido());
  const texto = JSON.stringify(p);
  for (const prohibido of ["Faltan las medidas", "AVISA LADINA", "Llamar antes", "LONA PVC 650"]) {
    expect(texto).not.toContain(prohibido);
  }
  expect(p.ofs[0].materiales).toBeUndefined();
  expect(p.ofs[0].reservasMaterial).toBeUndefined();
  expect(p.ofs[0].materialPendienteHasta).toBeUndefined();
  expect(p.scanUrl).toBeUndefined();
  expect(p.prioridad).toBe(2);
});

test("el texto de la línea de venta SÍ viaja: describe el producto, no es una nota", () => {
  expect(pedidoParaInvitado(pedido()).ofs[0].detalleVenta).toBe("Texto de la línea de venta");
});

test("una OF devuelta se enseña como planteando: no se ve a quién se le devolvió", () => {
  expect(pedidoParaInvitado(pedido()).ofs[0].estado).toBe("en_curso");
  expect(pedidoParaInvitado(pedido({ ofs: [of({ estado: "por_revisar" })] })).ofs[0].estado).toBe("por_revisar");
});

test("se queda lo que dice quién lo lleva, cómo va y para cuándo", () => {
  const p = pedidoParaInvitado(pedido());
  expect(p.codigo).toBe("AR.26.04904");
  expect(p.cliente).toBe("2006 PORTANOVA, S.L.");
  expect(p.fechaPlanificacion).toBe("2026-10-13");
  expect(p.ofs[0]).toMatchObject({ autorId: "ivan", revisorId: "jaime", tiempoPlanteoMin: 17, tiempoRevisionMin: 2 });
});
