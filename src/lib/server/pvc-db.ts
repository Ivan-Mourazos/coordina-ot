import sql from "mssql";
import { getPool } from "./db";
import { esPedidoDePvc } from "../planteamiento";

// ─── ¿Es de PVC? Lo que dice RPS de las OF del pedido ────────────────────────
// Solo lectura. La regla está en planteamiento.ts (esPedidoDePvc); aquí solo se
// traen la ruta y la línea de venta de cada OF. Una consulta, con el código
// TIPADO (varchar, como la columna): sin tipo, SQL Server no usa el índice.

interface Fila {
  of: string;
  linea: string | null;
  tarea: string | null;
}

/** true si alguna OF del pedido es de PVC. Si RPS no responde, false: se
 *  queda la norma del sufijo (-10 en adelante), la de antes. Pasar el pedido
 *  no puede depender de esto. */
export async function pedidoEsDePvc(pedido: string): Promise<boolean> {
  if (process.env.DATASOURCE !== "rps") return false;
  try {
    const pool = await getPool();
    const r = await pool.request().input("pedido", sql.VarChar(25), pedido).query<Fila>(`
      SELECT mo.CodManufacturingOrder AS [of], CAST(lin.Comment AS varchar(4000)) AS linea,
             CAST(t.Description AS varchar(300)) AS tarea
      FROM dbo.FACOrderSL p
      JOIN dbo.FACOrderLineSL lin ON lin.IDOrder = p.IDOrder
      JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = lin.IDManufacturingOrder
      LEFT JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = mo.IDManufacturingOrder
      WHERE p.CodCompany = '001' AND p.CodOrder = @pedido`);
    const porOf = new Map<string, { tareas: string[]; linea: string | null }>();
    for (const f of r.recordset) {
      const of = porOf.get(f.of) ?? { tareas: [], linea: f.linea };
      if (f.tarea) of.tareas.push(f.tarea);
      porOf.set(f.of, of);
    }
    return esPedidoDePvc([...porOf.values()]);
  } catch (e) {
    console.warn(`[planteamiento] no se pudo saber si ${pedido} es de PVC:`, (e as Error).message);
    return false;
  }
}
