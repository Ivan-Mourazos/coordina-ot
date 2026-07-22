import { getPool } from "./db";
import { operarioDeEmpleado } from "./operarios";
import { OPERARIOS, PEDIDOS } from "../mock";
import {
  PAGE_SIZE,
  construirFiltros,
  filaAItem,
  type FilaPagina,
  type HistorialFiltros,
  type HistorialItem,
  type HistorialOF,
} from "../historial";

// ─── Historial permanente: acceso a RPS (solo lectura) ───────────────────────
// Señal de finalización: tgm_estadosof_olanet.idestadoof=3, agrupado por pedido.
// Paginación OFFSET/FETCH (validada: <1 s incluso en profundidad). En modo mock
// se sirve un historial derivado de los pedidos mock, para desarrollo sin BD.

const ES_MOCK = process.env.DATASOURCE !== "rps";

const NOMBRE_POR_OPERARIO = new Map(OPERARIOS.map((o) => [o.id, o.nombre]));

export async function leerHistorialPagina(
  f: HistorialFiltros,
): Promise<{ pedidos: HistorialItem[]; hasMore: boolean }> {
  if (ES_MOCK) return paginaMock(f);

  const { clausulas, params } = construirFiltros(f);
  const where = clausulas.length ? `WHERE ${clausulas.join(" AND ")}` : "";
  const off = Math.max(0, f.page) * PAGE_SIZE;

  const pool = await getPool();
  const req = pool.request();
  for (const p of params) req.input(p.nombre, p.valor);
  req.input("off", off);
  req.input("size", PAGE_SIZE + 1); // una fila extra para saber si hay más

  const r = await req.query<FilaPagina>(`
    ;WITH FinOT AS (
      SELECT e.orden, MAX(e.fecha_cambio) AS fin
      FROM dbo.tgm_estadosof_olanet e
      WHERE e.idestadoof = 3
      GROUP BY e.orden
    ),
    PedFin AS (
      SELECT o.CodOrder AS pedido, MAX(f.fin) AS finalizada,
             MAX(o.IDCustomer) AS idc,
             COUNT(DISTINCT mo.IDManufacturingOrder) AS n_of
      FROM FinOT f
      JOIN dbo.CPRManufacturingOrder mo
        ON mo.CodManufacturingOrder = f.orden AND mo.CodCompany = '001'
      JOIN dbo.FACOrderLineSL l ON l.IDManufacturingOrder = mo.IDManufacturingOrder
      JOIN dbo.FACOrderSL o ON o.IDOrder = l.IDOrder AND o.CodCompany = '001'
      GROUP BY o.CodOrder
    )
    SELECT p.pedido, p.finalizada, p.n_of, cli.Description AS cliente
    FROM PedFin p
    LEFT JOIN dbo.FACCustomer cli ON cli.IDCustomer = p.idc
    ${where}
    ORDER BY p.finalizada DESC, p.pedido DESC
    OFFSET @off ROWS FETCH NEXT @size ROWS ONLY
  `);

  const filas = r.recordset;
  const hasMore = filas.length > PAGE_SIZE;
  const pedidos = filas.slice(0, PAGE_SIZE).map(filaAItem);
  return { pedidos, hasMore };
}

interface FilaDetalle {
  orden: string | null;
  descripcion: string | null;
  empleado: string | null;
  minutos: number | null;
}

export async function leerHistorialPedido(pedido: string): Promise<HistorialOF[]> {
  if (ES_MOCK) return detalleMock(pedido);

  const pool = await getPool();
  const r = await pool
    .request()
    .input("pedido", pedido)
    .query<FilaDetalle>(`
      SELECT mo.CodManufacturingOrder AS orden, mo.Description AS descripcion,
             e.CodEmployee AS empleado, SUM(i.ExecutionTime) AS minutos
      FROM dbo.CPRManufacturingOrder mo
      JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = mo.IDManufacturingOrder
      LEFT JOIN dbo.CPRImputationMO i
        ON i.IDMOTask = t.IDMOTask AND i.IDManufacturingOrder = mo.IDManufacturingOrder
        AND i.ResourceType = 1
      LEFT JOIN dbo.GENEmployee e ON e.IDEmployee = i.IDEmployeeMachineTool
      WHERE mo.CodCompany = '001'
        AND EXISTS (
          SELECT 1 FROM dbo.FACOrderLineSL l
          JOIN dbo.FACOrderSL o ON o.IDOrder = l.IDOrder AND o.CodCompany = '001'
          WHERE l.IDManufacturingOrder = mo.IDManufacturingOrder AND o.CodOrder = @pedido
        )
        AND EXISTS (
          SELECT 1 FROM dbo.CPRMOResourceMachine rm
          WHERE rm.IDMOTask = t.IDMOTask AND rm.CodMOResourceMachine IN ('a-otec','otec-a')
        )
      GROUP BY mo.CodManufacturingOrder, mo.Description, e.CodEmployee
    `);

  // Agrupar por OF (orden): sumar minutos y juntar quién.
  const porOF = new Map<string, HistorialOF>();
  for (const fila of r.recordset) {
    const codigo = (fila.orden ?? "").trim();
    if (!codigo) continue;
    const of = porOF.get(codigo) ?? {
      codigo,
      descripcion: (fila.descripcion ?? "").trim(),
      tiempoImputadoMin: 0,
      quien: [] as string[],
    };
    of.tiempoImputadoMin += fila.minutos ?? 0;
    if (fila.empleado) {
      const codEmpleado = fila.empleado.trim();
      const idOperario = operarioDeEmpleado(codEmpleado);
      const nombre = (idOperario && NOMBRE_POR_OPERARIO.get(idOperario)) || codEmpleado;
      if (nombre && !of.quien.includes(nombre)) of.quien.push(nombre);
    }
    porOF.set(codigo, of);
  }
  return [...porOF.values()];
}

// ── Fallback mock (desarrollo sin BD) ──
function pedidosFinalizadosMock(): HistorialItem[] {
  return PEDIDOS.filter((p) => p.ofs.length > 0 && p.ofs.every((o) => o.estado === "aprobada"))
    .map((p) => ({
      pedido: p.codigo,
      cliente: p.cliente,
      finalizada: `${p.fechaPlanificacion}T00:00:00.000Z`,
      nOf: p.ofs.length,
    }))
    .sort((a, b) => b.finalizada.localeCompare(a.finalizada) || b.pedido.localeCompare(a.pedido));
}

function paginaMock(f: HistorialFiltros): { pedidos: HistorialItem[]; hasMore: boolean } {
  let todos = pedidosFinalizadosMock();
  const q = f.q?.trim().toLowerCase();
  if (q)
    todos = todos.filter(
      (p) => p.pedido.toLowerCase().includes(q) || (p.cliente ?? "").toLowerCase().includes(q),
    );
  if (f.desde?.trim()) todos = todos.filter((p) => p.finalizada >= f.desde!.trim());
  if (f.hasta?.trim()) todos = todos.filter((p) => p.finalizada < f.hasta!.trim());
  const off = Math.max(0, f.page) * PAGE_SIZE;
  const pagina = todos.slice(off, off + PAGE_SIZE + 1);
  return { pedidos: pagina.slice(0, PAGE_SIZE), hasMore: pagina.length > PAGE_SIZE };
}

function detalleMock(pedido: string): HistorialOF[] {
  const p = PEDIDOS.find((x) => x.codigo === pedido);
  if (!p) return [];
  return p.ofs.map((of) => ({
    codigo: of.codigo,
    descripcion: of.descripcion,
    tiempoImputadoMin: of.tiempoPlanteoMin + of.tiempoRevisionMin,
    quien: [],
  }));
}
