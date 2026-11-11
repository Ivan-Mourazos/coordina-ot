import type { PedidoEntregaBelen } from "../entregas-belen";
import { PEDIDOS } from "../mock";
import { getPool } from "./db";
import { ES_RPS, iso, texto } from "./rps-belen-comun";

// ─── Pedidos por fecha solicitada: una fila por OF ───────────────────────────
// Solo lectura, contra RPS. Cada OF cuya línea de pedido sigue pendiente de
// entregar (PendingDelivery = 1: ni albaranada ni cumplimentada), de Arzúa y de
// las delegaciones (Santiago y Bergondo); la pantalla elige cuál ver. Como el
// Excel de Belén (11/11/2026): prioridad, pedido, OF, cliente, artículo, forma
// de entrega, rotulación y fecha solicitada. Solo las OF con alguna tarea sin
// acabar (Belén, 11/11/2026: «los ya finalizados no deben salir; si tienen
// alguna tarea sin finalizar, sí»): ni al 100 % en RPS ni finalizada en
// OLANET. Medido contra RPS el 11/11/2026: 524 OF de 306 pedidos en 0,1 s
// (sin ese filtro eran 760).

const SQL = `
  SELECT ped.CodOrder AS codigo, mo.CodManufacturingOrder AS [of], cli.Description AS cliente,
         mo.Priority AS prioridad, lin.Quantity AS cantidad, art.CodArticle AS articulo,
         CAST(art.Description AS varchar(300)) AS articuloDescripcion,
         fe.DescripcionFormaEntregaPedido AS formaEntrega, lc.TextoRotulacion AS rotulacion,
         lin.ReceptionDemandDate AS fSol
  FROM dbo.FACOrderLineSL lin
  JOIN dbo.FACOrderSL ped ON ped.IDOrder = lin.IDOrder
  JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = lin.IDManufacturingOrder
  LEFT JOIN dbo.STKArticle art ON art.IDArticle = mo.IDArticle
  LEFT JOIN dbo.FACCustomer cli ON cli.IDCustomer = ped.IDCustomer
  LEFT JOIN dbo._FACOrderLineSL_Custom lc ON lc.IDOrderLine = lin.IDOrderLine
  LEFT JOIN dbo._FormaEntregaPedido fe ON fe.IDFormaEntregaPedido = lc.IDFormaEntrega
  WHERE lin.CodCompany = '001' AND ped.CodCompany = '001' AND lin.PendingDelivery = 1
    AND (ped.CodOrder LIKE 'AR.%' OR ped.CodOrder LIKE 'SA.%' OR ped.CodOrder LIKE 'BE.%')
    AND EXISTS (
      SELECT 1 FROM dbo.CPRMOTask t
      WHERE t.IDManufacturingOrder = mo.IDManufacturingOrder AND t.PercentProgress < 100
        AND ISNULL((SELECT TOP (1) e.idestadoof FROM dbo.tgm_estadosof_olanet e
                    WHERE e.orden = mo.CodManufacturingOrder AND e.fase = t.CodMOTask
                    ORDER BY e.fecha_cambio DESC), 0) <> 3)`;

interface FilaRps {
  codigo: string;
  of: string;
  cliente: string | null;
  prioridad: number | null;
  cantidad: number | null;
  articulo: string | null;
  articuloDescripcion: string | null;
  formaEntrega: string | null;
  rotulacion: string | null;
  fSol: Date | null;
}

/** «1 × CAMTELTOL»: unidades sin ceros de sobra y el código del artículo. */
export function articuloConCantidad(cantidad: number | null | undefined, codigo: string | null | undefined): string | null {
  const c = texto(codigo);
  if (!c) return null;
  const n = Number(cantidad);
  return Number.isFinite(n) && n > 0 ? `${n.toLocaleString("es-ES", { maximumFractionDigits: 2 })} × ${c}` : c;
}

export function aEntrega(f: FilaRps): PedidoEntregaBelen {
  return {
    codigo: f.codigo.trim(),
    of: f.of.trim(),
    cliente: texto(f.cliente),
    prioridad: f.prioridad ?? null,
    articulo: articuloConCantidad(f.cantidad, f.articulo),
    articuloDescripcion: texto(f.articuloDescripcion),
    formaEntrega: texto(f.formaEntrega),
    rotulacion: texto(f.rotulacion),
    fechaEntrega: iso(f.fSol),
  };
}

export async function leerEntregasBelen(): Promise<PedidoEntregaBelen[]> {
  if (!ES_RPS()) {
    // Sin RPS (desarrollo): una fila por OF de los pedidos de muestra.
    return PEDIDOS.filter((p) => /^(AR|SA|BE)\./.test(p.codigo)).flatMap((p) =>
      p.ofs.map((o) => ({
        codigo: p.codigo,
        of: o.codigo,
        cliente: p.cliente ?? null,
        prioridad: 2,
        articulo: null,
        articuloDescripcion: o.descripcion ?? null,
        formaEntrega: null,
        rotulacion: null,
        fechaEntrega: p.fechaEntrega || null,
      })),
    );
  }
  const pool = await getPool();
  const r = await pool.request().query<FilaRps>(SQL);
  return r.recordset.map(aEntrega);
}
