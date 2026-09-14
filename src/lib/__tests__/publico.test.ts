import { expect, test } from "vitest";
import type { HistorialPedidoDetalle } from "../historial";
import type { BaseHistorial, IndiceHistorial } from "../historial-indice";
import {
  detallePublico,
  estaPendiente,
  filtrarPublico,
  frasePublica,
  normalizarFiltrosPublicos,
  PAGE_PUBLICO,
} from "../publico";

const base = (p: Partial<BaseHistorial> & { pedido: string }): BaseHistorial => ({
  fechaPedido: Date.UTC(2026, 0, 1),
  nOf: 1,
  tieneSeccion: false,
  pendienteSeccion: false,
  pendienteTotal: false,
  finalizada: Date.UTC(2026, 0, 5),
  fechaEntrega: Date.UTC(2026, 1, 1),
  pendienteEntrega: false,
  ...p,
});

test("pendiente es tener tarea abierta O algo sin entregar", () => {
  expect(estaPendiente(base({ pedido: "A", pendienteTotal: true }))).toBe(true);
  expect(estaPendiente(base({ pedido: "B", pendienteEntrega: true }))).toBe(true);
  expect(estaPendiente(base({ pedido: "C" }))).toBe(false);
});

test("la frase dice por dónde va, y la entrega es el último tramo", () => {
  expect(frasePublica(["CORTE AUTOMÁTICO", "CONFECCION SANTIAGO"], true))
    .toBe("Pendiente de: Corte automático, Confeccion santiago");
  expect(frasePublica([], true)).toBe("Fabricado, pendiente de entregar");
  expect(frasePublica([], false)).toBe("Entregado");
});

const indice = (filas: BaseHistorial[]): IndiceHistorial => ({
  at: Date.now(),
  base: { ot: filas, diseno: filas },
  info: new Map(filas.map((f) => [f.pedido, {
    cliente: "MAHOU, S.A.", negocio: null, familias: ["TOLDO"],
    ordenes: "0230001", textos: "MAHOU, S.A.\nTOLDO DE FACHADA",
  }])),
  personas: new Map(),
});

test("pendientes: primero lo que se entrega antes, y lo sin fecha al final", () => {
  const i = indice([
    base({ pedido: "A", pendienteTotal: true, fechaEntrega: Date.UTC(2026, 2, 1) }),
    base({ pedido: "B", pendienteTotal: true, fechaEntrega: Date.UTC(2026, 1, 1) }),
    base({ pedido: "C", pendienteTotal: true, fechaEntrega: null }),
  ]);
  const { filas } = filtrarPublico(i, { lista: "pendientes", page: 0 });
  expect(filas.map((f) => f.pedido)).toEqual(["B", "A", "C"]);
});

test("realizados: lo último terminado primero, y no se cuela un pendiente", () => {
  const i = indice([
    base({ pedido: "A", finalizada: Date.UTC(2026, 0, 2) }),
    base({ pedido: "B", finalizada: Date.UTC(2026, 0, 9) }),
    base({ pedido: "VIVO", pendienteEntrega: true }),
  ]);
  const { filas } = filtrarPublico(i, { lista: "realizados", page: 0 });
  expect(filas.map((f) => f.pedido)).toEqual(["B", "A"]);
});

test("hasMore avisa de que hay otra página, sin devolver la fila de más", () => {
  const filas = Array.from({ length: PAGE_PUBLICO + 5 }, (_, n) =>
    base({ pedido: `P${String(n).padStart(3, "0")}`, pendienteTotal: true }));
  const r = filtrarPublico(indice(filas), { lista: "pendientes", page: 0 });
  expect(r.filas).toHaveLength(PAGE_PUBLICO);
  expect(r.hasMore).toBe(true);
});

test("buscar por código encuentra el pedido", () => {
  const i = indice([
    base({ pedido: "AR.26.00123", pendienteTotal: true }),
    base({ pedido: "AR.26.00999", pendienteTotal: true }),
  ]);
  const { filas } = filtrarPublico(i, { lista: "pendientes", page: 0, q: "AR.26.00123" });
  expect(filas.map((f) => f.pedido)).toEqual(["AR.26.00123"]);
});

test("hasta es inclusive: el cierre de media tarde de ese día entra entero", () => {
  const i = indice([
    // "hasta" se pone a medianoche LOCAL del día 9; este pedido cierra ese
    // mismo día 9 pero a las 17:00, así que tiene que salir igualmente.
    base({ pedido: "A", finalizada: new Date(2026, 0, 9, 17, 0).getTime() }),
    base({ pedido: "B", finalizada: new Date(2026, 0, 10, 0, 0).getTime() }),
  ]);
  const { filas } = filtrarPublico(i, { lista: "realizados", page: 0, hasta: "2026-01-09" });
  expect(filas.map((f) => f.pedido)).toEqual(["A"]);
});

test("desde es inclusive: entrar justo el día de desde", () => {
  const i = indice([
    base({ pedido: "A", pendienteTotal: true, fechaEntrega: new Date(2026, 0, 9, 0, 0).getTime() }),
    base({ pedido: "B", pendienteTotal: true, fechaEntrega: new Date(2026, 0, 8, 23, 0).getTime() }),
  ]);
  const { filas } = filtrarPublico(i, { lista: "pendientes", page: 0, desde: "2026-01-09" });
  expect(filas.map((f) => f.pedido)).toEqual(["A"]);
});

test("los comparadores desempatan igual en las dos direcciones", () => {
  const i = indice([
    base({ pedido: "B", pendienteTotal: true, fechaEntrega: Date.UTC(2026, 1, 1) }),
    base({ pedido: "A", pendienteTotal: true, fechaEntrega: Date.UTC(2026, 1, 1) }),
  ]);
  const { filas } = filtrarPublico(i, { lista: "pendientes", page: 0 });
  expect(filas.map((f) => f.pedido)).toEqual(["A", "B"]);
});

test("pendientes sin buscar no baja de 2025: RPS nunca cerró pedidos viejos y eso no es lo que está en marcha", () => {
  const i = indice([
    base({ pedido: "AR.19.05555", pendienteTotal: true, fechaPedido: Date.UTC(2019, 5, 1) }),
    base({ pedido: "AR.25.05555", pendienteTotal: true, fechaPedido: Date.UTC(2025, 0, 1) }),
  ]);
  const sinBuscar = filtrarPublico(i, { lista: "pendientes", page: 0 }).filas.map((f) => f.pedido);
  expect(sinBuscar).not.toContain("AR.19.05555");
  expect(sinBuscar).toContain("AR.25.05555");
});

test("buscando su código, el pendiente de 2019 sí sale: quien busca un pedido sabe lo que busca", () => {
  const i = indice([
    base({ pedido: "AR.19.05555", pendienteTotal: true, fechaPedido: Date.UTC(2019, 5, 1) }),
  ]);
  const { filas } = filtrarPublico(i, { lista: "pendientes", page: 0, q: "AR.19.05555" });
  expect(filas.map((f) => f.pedido)).toEqual(["AR.19.05555"]);
});

test("el pdf del pedido no se queda en la ruta que va a exigir sesión", () => {
  const detalle: HistorialPedidoDetalle = {
    codigo: "AR.26.02711",
    cliente: "MAHOU, S.A.",
    negocio: null,
    ciudadEntrega: null,
    prioridad: 1,
    fechaSolicitud: null,
    fechaFinalizacion: null,
    piezas: 0,
    familias: [],
    comentarioVenta: null,
    scanUrl: "/api/pedidos/AR.26.02711.pdf",
    ofs: [],
    documentos: [],
  };
  const { scanUrl } = detallePublico(detalle);
  expect(scanUrl).not.toMatch(/^\/api\/pedidos\//);
  expect(scanUrl).toBe("/api/publico/pedidos/AR.26.02711/pdf");
});

test("los filtros llegan de la URL con valores sanos", () => {
  const f = normalizarFiltrosPublicos(new URLSearchParams("lista=realizados&page=3&q=mahou"));
  expect(f).toMatchObject({ lista: "realizados", page: 3, q: "mahou" });
  // Basura en la URL no puede tumbar la página ni colar otra lista.
  expect(normalizarFiltrosPublicos(new URLSearchParams("lista=inventada&page=-7")))
    .toMatchObject({ lista: "pendientes", page: 0 });
});
