import sql from "mssql";
import { getPool } from "./db";
import { interpretarBusqueda } from "../codigo-busqueda";
import { PEDIDOS } from "../mock";
import type { PedidoEncontrado } from "../buscador";

export type { PedidoEncontrado };

// ─── Buscar CUALQUIER pedido de venta en RPS ─────────────────────────────────
// El buscador de la cabecera ya miraba en el tablero (lo pendiente de OT) y en
// el Historial (lo que OT cerró). Faltaba todo lo demás, que no es poco: los
// pedidos que nunca pasaron por Oficina Técnica, los que planteó el taller, y
// los que se quedaron en alguna grieta de RPS.
//
// Esta consulta no filtra por nada: si existe el pedido, sale. Es la única
// forma de que "no encuentro el 3577" tenga siempre respuesta.

const ES_MOCK = process.env.DATASOURCE !== "rps";

/** Mínimo para preguntarle a RPS. Es más alto que el del buscador local (2)
 *  porque esto es una consulta de verdad contra la base, y con dos letras
 *  devolvería lo primero que pillara de 25 años de pedidos. */
export const MIN_LETRAS_RPS = 3;

/** Cuántos se traen. El buscador solo enseña diez en total, así que pedir más
 *  es pagar por lo que nadie va a leer. */
const TOPE = 12;

export async function buscarPedidosRps(termino: string): Promise<PedidoEncontrado[]> {
  const term = termino.trim();
  if (term.length < MIN_LETRAS_RPS) return [];
  if (ES_MOCK) {
    const q = term.toLowerCase();
    return PEDIDOS.filter(
      (p) => p.codigo.toLowerCase().includes(q) || p.cliente.toLowerCase().includes(q),
    )
      .slice(0, TOPE)
      .map((p) => ({
        codigo: p.codigo,
        cliente: p.cliente,
        negocio: p.negocio ?? null,
        fecha: p.fechaSolicitud,
      }));
  }

  const pool = await getPool();
  const que = interpretarBusqueda(term, new Date().getFullYear());
  const req = pool.request();
  // Parametrizado, nunca interpolado: esto viene de una caja de texto. Y
  // TIPADO: sin tipo, el texto va como nvarchar contra un código varchar y
  // SQL Server deja de usar el índice.
  let donde: string;
  if (que.tipo === "pedido") {
    const exactos = que.exactos.map((c, i) => (req.input(`e${i}`, sql.VarChar(25), c), `@e${i}`));
    const prefijos = que.prefijos.map((c, i) => (req.input(`p${i}`, sql.VarChar(26), `${c}%`), `o.CodOrder LIKE @p${i}`));
    donde = [exactos.length ? `o.CodOrder IN (${exactos.join(", ")})` : "", ...prefijos].filter(Boolean).join(" OR ");
  } else if (que.tipo === "of") {
    req.input("of", sql.VarChar(25), que.codigo);
    donde = `o.IDOrder IN (
          SELECT l.IDOrder FROM dbo.CPRManufacturingOrder mo
          JOIN dbo.FACOrderLineSL l ON l.IDManufacturingOrder = mo.IDManufacturingOrder
          WHERE mo.CodCompany = '001' AND mo.CodManufacturingOrder = @of)`;
  } else {
    req.input("q", sql.NVarChar(200), `%${que.texto}%`);
    donde = "cli.Description LIKE @q";
  }
  // Ordenado por FECHA y no por código: el código ordena alfabéticamente y
  // ponía los presupuestos "QU.25…" por encima de los pedidos "AR.26…", o sea
  // lo viejo por encima de lo de esta semana.
  const r = await req.query<{
      pedido: string | null;
      cliente: string | null;
      negocio: string | null;
      fecha: Date | null;
    }>(`
      SELECT TOP ${TOPE}
             o.CodOrder AS pedido, cli.Description AS cliente,
             d.Description AS negocio, o.OrderDate AS fecha
      FROM dbo.FACOrderSL o
      LEFT JOIN dbo.FACCustomer cli ON cli.IDCustomer = o.IDCustomer
      LEFT JOIN dbo.FACCustomerDeliveryAddress d
        ON d.IDCustomerDeliveryAddress = o.IDCustomerDeliveryAddress
      WHERE o.CodCompany = '001'
        AND (${donde})
      ORDER BY o.OrderDate DESC
    `);

  return r.recordset
    .filter((f) => f.pedido?.trim())
    .map((f) => ({
      codigo: f.pedido!.trim(),
      cliente: (f.cliente ?? "").trim() || null,
      negocio: (f.negocio ?? "").trim() || null,
      fecha: f.fecha ? f.fecha.toISOString() : null,
      // Por OF, el código del pedido no contiene lo escrito: el buscador lo
      // reconoce por la consulta exacta, como hace con el Historial.
      ...(que.tipo === "of" ? { busqueda: term } : {}),
    }));
}
