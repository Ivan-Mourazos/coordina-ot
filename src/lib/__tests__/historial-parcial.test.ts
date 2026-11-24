import { afterAll, beforeEach, expect, test, vi } from "vitest";
import type { BaseHistorial, IndiceHistorial } from "../historial-indice";
import type { OF, Pedido } from "../types";
import type { PasoAProduccion } from "../server/estado-db";

const { indiceSiListo, leerPedidosPasados, consultar } = vi.hoisted(() => {
  vi.stubEnv("DATASOURCE", "rps");
  return { indiceSiListo: vi.fn(), leerPedidosPasados: vi.fn(), consultar: vi.fn() };
});
vi.mock("../server/historial-indice", () => ({ indiceSiListo }));
vi.mock("../server/estado-db", () => ({
  leerPedidosPasados,
  leerOverlay: () => ({ ofs: new Map() }),
}));
vi.mock("../server/fichaje-db", () => ({ leerTodosIntervalos: () => [] }));
vi.mock("../server/nombres-historial", () => ({
  nombresHistorial: async () => new Map([["10", "Ana"], ["20", "Bea"], ["ana", "Ana"]]),
}));
vi.mock("../server/db", () => ({
  getPool: async () => ({
    request: () => {
      const params = new Map();
      return {
        input(nombre: string, tipoOValor: unknown, valor?: unknown) {
          params.set(nombre, valor ?? tipoOValor);
          return this;
        },
        query: async (sql: string) => ({ recordset: consultar(sql, params) }),
      };
    },
  }),
}));

import { leerHistorialPagina, leerHistorialPedidoDetalle } from "../server/historial-db";

const pedido = "AR.26.00001";
const completo = "AR.26.00002";
const pasada = "0230001";
const restante = "0230002";
const at = "2026-11-18T09:00:00.000Z";
const fila = (orden: string, empleado: string, minutos: number, descripcion: string) => ({
  pedido, orden, empleado, minutos, descripcion, tarea: "1", centro: "ot",
  fecha: new Date("2026-11-12"), cliente: "Cliente", subfamilia: null,
});
const filas = [fila(pasada, "10", 12, "Toldo pasado"), fila(restante, "20", 75, "Lona detenida")];
const of = (codigo: string, cambios: Partial<OF>): OF => ({ id: `${codigo}:1`, codigo, ...cambios }) as OF;
const vivo = (cambios: Partial<Pedido> = {}): Pedido => ({
  id: pedido, codigo: pedido, cliente: "Cliente", situacion: "procesado",
  ofs: [of(pasada, { estado: "aprobada" }), of(restante, { estado: "pendiente", detenida: true })],
  ...cambios,
}) as Pedido;
const base = (codigo: string, cambios: Partial<BaseHistorial> = {}): BaseHistorial => ({
  pedido: codigo, fechaPedido: 0, finalizada: 0, nOf: 2, tieneSeccion: true,
  pendienteSeccion: false, pendienteTotal: false, fechaEntrega: null,
  fechaEntregado: null, pendienteEntrega: false, trabajoAbierto: false, ...cambios,
});

beforeEach(() => {
  const indice: IndiceHistorial = {
    at: 0,
    base: { ot: [base(pedido, { pendienteSeccion: true }), base(completo)], diseno: [], impresion: [] },
    info: new Map(),
    personas: new Map([[pedido, new Set(["10", "20"])]]),
  };
  indiceSiListo.mockReturnValue(indice);
  leerPedidosPasados.mockReturnValue(new Map<string, PasoAProduccion>());
  consultar.mockReset().mockImplementation((sql: string, params: Map<string, unknown>) => {
    if (params.has("ofParciales")) return filas;
    if (sql.includes("SUM(i.ExecutionTime)")) return filas;
    if (sql.includes("AS piezas") && sql.includes("OUTER APPLY")) return [{ piezas: params.has("ordenes") ? 2 : 5, prioridad: 1 }];
    return [];
  });
});

afterAll(() => vi.unstubAllEnvs());

test("un pase nuevo se incorpora a un índice antiguo solo con las OF que se pasaron", async () => {
  const tablero = [vivo()];
  const filtros = { page: 0 };
  expect((await leerHistorialPagina(filtros, tablero)).pedidos.map((p) => p.pedido)).toEqual([completo]);

  leerPedidosPasados.mockReturnValue(new Map([[pedido, { at, operarioId: "ana", ofIds: [`${pasada}:1`] }]]));
  const pagina = await leerHistorialPagina(filtros, tablero);
  expect(pagina.pedidos.map((p) => p.pedido)).toEqual([pedido, completo]);
  expect(pagina.pedidos[0]).toMatchObject({ nOf: 1, minutos: 12, autores: ["Ana"], pasadoAt: at });
  expect(pagina.porDia?.["2026-11-18"]).toBe(1);
  expect((await leerHistorialPagina({ ...filtros, operario: "ana", empleado: "10" }, tablero)).pedidos).toHaveLength(1);
  expect((await leerHistorialPagina({ ...filtros, operario: "bea", empleado: "20" }, tablero)).pedidos).toEqual([]);
  expect((await leerHistorialPagina({ ...filtros, q: restante }, tablero)).pedidos).toEqual([]);

  const detalle = await leerHistorialPedidoDetalle(pedido, "ot", tablero[0]);
  expect(detalle.ofs.map((o) => [o.codigo, o.tiempoImputadoMin])).toEqual([[pasada, 12]]);
  expect(detalle).toMatchObject({ piezas: 2, fechaFinalizacion: at });
  expect(tablero[0].ofs.map((o) => o.codigo)).toEqual([pasada, restante]);
});

test("un cierre individual entra aunque el pedido aún no exista en la instantánea", async () => {
  indiceSiListo.mockReturnValue({ at: 0, base: { ot: [], diseno: [], impresion: [] }, info: new Map(), personas: new Map() });
  const actual = vivo();
  actual.ofs[0].cerradaRps = { at, por: "ana", modo: "activo" };
  const pagina = await leerHistorialPagina({ page: 0 }, [actual]);
  expect(pagina.pedidos).toMatchObject([{ pedido, nOf: 1, minutos: 12 }]);
});

test("si solo cerró RPS o no se pasó ninguna OF, el pedido pendiente queda fuera", async () => {
  const indice: IndiceHistorial = indiceSiListo();
  const actual = vivo();
  for (const pendienteSeccion of [true, false]) {
    indice.base.ot[0].pendienteSeccion = pendienteSeccion;
    expect((await leerHistorialPagina({ page: 0 }, [actual])).pedidos.map((p) => p.pedido)).toEqual([completo]);
  }
  expect(consultar.mock.calls.some(([, params]) => params.has("ofParciales"))).toBe(false);
});

test("una OF reabierta o detenida queda fuera aunque conste en el pase anterior", async () => {
  leerPedidosPasados.mockReturnValue(new Map([[pedido, { at, ofIds: [`${pasada}:1`, `${restante}:1`] }]]));
  const actual = vivo({ reabiertoPor: [`${pasada}:1`] });
  actual.ofs[1].estado = "aprobada";
  expect((await leerHistorialPagina({ page: 0 }, [actual])).pedidos.map((p) => p.pedido)).toEqual([completo]);
});

test("el pedido completo conserva todas sus OF aunque tenga un registro de pase", async () => {
  leerPedidosPasados.mockReturnValue(new Map([[pedido, { at, operarioId: "ana", ofIds: [`${pasada}:1`, `${restante}:1`] }]]));
  const actual = vivo({ situacion: "completado", ofs: [of(pasada, { estado: "aprobada" }), of(restante, { estado: "aprobada" })] });
  const pagina = await leerHistorialPagina({ page: 0 }, [actual]);
  expect(pagina.pedidos[0]).toMatchObject({ pedido, nOf: 2, minutos: 87, pasadoAt: at });
  const detalle = await leerHistorialPedidoDetalle(pedido, "ot", actual);
  expect(detalle.ofs.map((o) => o.codigo)).toEqual([pasada, restante]);
  expect(detalle.piezas).toBe(5);
});

test("el respaldo SQL incorpora solo los parciales que pasan los filtros antes del OFFSET", async () => {
  indiceSiListo.mockReturnValue(null);
  const actual = vivo();
  actual.ofs[0].cerradaRps = { at, por: "ana", modo: "activo" };
  await leerHistorialPagina({ page: 2, operario: "ana", empleado: "10" }, [actual]);
  const [sql, params] = consultar.mock.calls.find(([sql]) => sql.includes("OFFSET @off"))!;
  expect(sql).toMatch(/UNION ALL[\s\S]*OFFSET @off/);
  expect(params.get("parcialesXml")).toContain(`pedido="${pedido}" fin="${at}" nOf="1"`);
  expect(params.get("pendientes")).toContain(`<p>${pedido}</p>`);
  expect(params.get("off")).toBe(80);
  consultar.mockClear();
  await leerHistorialPagina({ page: 0, operario: "bea", empleado: "20" }, [actual]);
  expect(consultar.mock.calls.find(([sql]) => sql.includes("OFFSET @off"))?.[1].has("parcialesXml")).toBe(false);
});
