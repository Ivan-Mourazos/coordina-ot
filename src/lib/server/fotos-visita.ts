import sql from "mssql";
import { getPool } from "./db";

interface FotoDeVisita {
  descripcion: string;
  ruta: string;
  clase: string;
}

// Las vistas de monitorización calculan el pedido desde la ruta de un PDF.
// El aviso ya guarda IDPedidoVenta: usar esa relación evita recorrer todas
// las asistencias y sus documentos para abrir un solo pedido. Solo lectura.
//
// Segunda vía (09/11/2026): muchos avisos no llevan el pedido, pero cuelgan de
// una oportunidad que sí se cerró con él (FACOportunitySL.IDOrder). En 2026
// eran 1.282 visitas cerradas con fotos que no salían, frente a 1.970 por la
// vía del aviso. Si el aviso nombra un pedido, manda ese: la oportunidad solo
// cuenta cuando el aviso no dice nada. Cuesta unos 0,3 s más por pedido, y
// la caché de abajo lo paga una vez cada cinco minutos.
export const SQL_FOTOS_VISITA = `
  WITH pedido AS (
    SELECT o.IDOrder FROM dbo.FACOrderSL o
     WHERE o.CodCompany = '001' AND o.CodOrder = @pedido
  ), avisos AS (
    SELECT c.IDMaintenanceWarning
      FROM pedido p JOIN dbo._MANMaintenanceWarning_Custom c ON c.IDPedidoVenta = p.IDOrder
    UNION
    SELECT c.IDMaintenanceWarning
      FROM pedido p
      JOIN dbo.FACOportunitySL op ON op.IDOrder = p.IDOrder
      JOIN dbo._MANMaintenanceWarning_Custom c ON c.IDOportunidad = op.IDOportunity
     WHERE c.IDPedidoVenta IS NULL
  )
  SELECT a.MaintenanceOrderCode AS asistencia,
         d.CodMaintenanceWarningType AS tipo, f.foto,
         ROW_NUMBER() OVER (PARTITION BY a.MaintenanceOrderCode ORDER BY f.foto) AS n
    FROM avisos v
    JOIN dbo.MANMaintenanceWarning b ON b.IDMaintenanceWarning = v.IDMaintenanceWarning
    JOIN dbo.MANMaintenanceOrder a ON a.IDMaintenanceWarning = b.IDMaintenanceWarning
    LEFT JOIN dbo.MANMaintenenceWarningType d ON d.IDMaintenanceWarningType = b.IDMaintenanceWarningType
    JOIN dbo.MANMaintenanceOrderStatus g ON g.IDMaintenanceOrderStatus = a.IDMaintenanceOrderStatus
    JOIN dbo.TGM_MONITORIZACION_FOTOS f ON f.asistencia = a.MaintenanceOrderCode
   WHERE a.CodCompany = '001' AND g.CodStatus = '9'
     AND a.ExecutionDate >= DATEFROMPARTS(YEAR(GETDATE()) - 3, 1, 1)
   ORDER BY a.MaintenanceOrderCode, f.foto
`;

const VIDA_CACHE_MS = 5 * 60_000;
const MAX_PEDIDOS = 200;
const cache = new Map<string, { at: number; fotos: FotoDeVisita[] }>();
const cargas = new Map<string, Promise<FotoDeVisita[]>>();

export async function fotosDeVisita(codigo: string): Promise<FotoDeVisita[]> {
  if (process.env.DATASOURCE !== "rps") return [];
  const pedido = codigo.trim().toUpperCase();
  const guardada = cache.get(pedido);
  if (guardada && Date.now() - guardada.at < VIDA_CACHE_MS) return guardada.fotos;
  let carga = cargas.get(pedido);
  if (!carga) {
    carga = cargar(pedido).then((fotos) => {
      cache.delete(pedido);
      cache.set(pedido, { at: Date.now(), fotos });
      if (cache.size > MAX_PEDIDOS) cache.delete(cache.keys().next().value!);
      return fotos;
    }).finally(() => cargas.delete(pedido));
    cargas.set(pedido, carga);
  }
  try {
    return await carga;
  } catch (e) {
    // Un fallo de fotos no oculta los demás documentos ni se cachea como vacío.
    console.error("[historial] fotos de visita:", (e as Error).message);
    return guardada?.fotos ?? [];
  }
}

async function cargar(pedido: string): Promise<FotoDeVisita[]> {
  const pool = await getPool();
  const r = await pool.request().input("pedido", sql.VarChar(25), pedido).query<{
    asistencia: string; tipo: string | null; foto: string; n: number;
  }>(SQL_FOTOS_VISITA);
  return r.recordset.map((fila) => {
    const instalacion = (fila.tipo ?? "").trim().toUpperCase() === "PM";
    return {
      descripcion: `Foto ${fila.n} de ${instalacion ? "la instalación" : "la visita"} ${fila.asistencia}`,
      ruta: fila.foto,
      clase: instalacion ? "Fotos de la instalación" : "Fotos de la visita",
    };
  });
}
