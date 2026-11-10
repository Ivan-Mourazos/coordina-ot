import sql from "mssql";
import { getPool } from "./db";
import type { Fila } from "../informes-rps/expresion";

// ─── Datos de la hoja de ruta y del vale de material ─────────────────────────
// Solo lectura, contra RPS. Son las consultas de las plantillas de RPS
// (CUSTReport: CPRROADMAP y CPRTICKETMAT), que están escritas contra su modelo
// de entidades, pasadas a las tablas de verdad. Cada columna se llama igual
// que el campo de la plantilla («ManufacturingOrder_CodManufacturingOrder»),
// así la plantilla se rellena sin traducir nada. Probado con la OF 0233881
// (AR.26.05479), la de la captura de Belén: mismos datos, menos de 100 ms.

const listaOF = (req: sql.Request, ofs: readonly string[]) =>
  ofs.map((of, i) => (req.input(`of${i}`, sql.VarChar(20), of), `@of${i}`)).join(", ");

const SQL_HOJA_RUTA = (ofs: string) => `
  SELECT mo.CodManufacturingOrder AS ManufacturingOrder_CodManufacturingOrder,
         CAST(mo.Description AS varchar(max)) AS ManufacturingOrder_Description,
         mo.ManualEndDate AS ManufacturingOrder_ManualEndDate,
         CAST(mo.Notes AS varchar(max)) AS ManufacturingOrder_Notes,
         mo.Quantity AS ManufacturingOrder_Quantity,
         art.CodArticle AS Article_CodArticle,
         CAST(art.Description AS varchar(max)) AS Article_Description,
         mu.CodMeasureUnit AS MeasureUnit_CodMeasureUnit,
         mu2.CodMeasureUnit AS MeasureUnit2_CodMeasureUnit,
         t.CodMOTask AS MOTask_CodMOTask,
         CAST(t.Description AS varchar(max)) AS MOTask_Description,
         t.[Order] AS MOTask_Order,
         t.ProductEntry AS MOTask_ProductEntry,
         t.PrintLabels AS MOTask_PrintLabels,
         rm.CodMOResourceMachine AS MOResourceMachine_CodMOResourceMachine,
         CAST(lin.Comment AS varchar(max)) AS OrderLineSL_Comment,
         lin.NumLine AS OrderLineSL_NumLine,
         lin.QuantitySecondUnit AS OrderLineSL_QuantitySecondUnit,
         lc.TextoRotulacion AS OrderLineSL_TextoRotulacion,
         ped.CodOrder AS OrderSL_CodOrder,
         ped.OrderNumberCustomer AS OrderSL_OrderNumberCustomer,
         cli.Description AS Customer_Description,
         alm.Description AS WareHouse_Description
  FROM dbo.CPRManufacturingOrder mo
  LEFT JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = mo.IDManufacturingOrder
  LEFT JOIN dbo.CPRMOResourceMachine rm ON rm.IDMOTask = t.IDMOTask
  LEFT JOIN dbo.FACOrderLineSL lin ON lin.IDManufacturingOrder = mo.IDManufacturingOrder
  LEFT JOIN dbo._FACOrderLineSL_Custom lc ON lc.IDOrderLine = lin.IDOrderLine
  LEFT JOIN dbo.FACOrderSL ped ON ped.IDOrder = lin.IDOrder
  LEFT JOIN dbo.FACCustomer cli ON cli.IDCustomer = ped.IDCustomer
  LEFT JOIN dbo.GENWarehouse alm ON alm.IDWarehouse = lin.IDWarehouse
  LEFT JOIN dbo.STKArticle art ON art.IDArticle = mo.IDArticle
  LEFT JOIN dbo.GENMeasureUnit mu ON mu.IDMeasureUnit = art.IDUnitQuantityWarehouse
  LEFT JOIN dbo.GENMeasureUnit mu2 ON mu2.IDMeasureUnit = art.IDUnitSecondUnit
  WHERE mo.CodCompany = '001' AND mo.CodManufacturingOrder IN (${ofs})`;

const SQL_VALE = (ofs: string) => `
  SELECT mo.CodManufacturingOrder AS ManufacturingOrder_CodManufacturingOrder,
         mo.InternalCode AS ManufacturingOrder_InternalCode,
         CAST(mo.Description AS varchar(max)) AS ManufacturingOrder_Description,
         mo.Quantity AS ManufacturingOrder_Quantity,
         art.CodArticle AS Article_CodArticle,
         t.CodMOTask AS MOTask_CodMOTask,
         mm.CodMOMaterial AS MOMaterial_CodMOMaterial,
         sr.Quantity AS StockReserve_Quantity,
         st.Series AS Stock_Series,
         a2.CodArticle AS Article2_CodArticle,
         CAST(a2.Description AS varchar(max)) AS Article2_Description,
         mu.Abreviature AS MeasureUnit_Abreviature
  FROM dbo.CPRManufacturingOrder mo
  LEFT JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = mo.IDManufacturingOrder
  LEFT JOIN dbo.CPRMOMaterial mm ON mm.IDMOTask = t.IDMOTask
  LEFT JOIN dbo.STKStockReserve sr ON sr.IDItem = mm.IDMOMaterial
  LEFT JOIN dbo.STKStock st ON st.IDStock = sr.IDStock
  LEFT JOIN dbo.STKArticle a2 ON a2.IDArticle = st.IDArticle
  LEFT JOIN dbo.GENMeasureUnit mu ON mu.IDMeasureUnit = a2.IDUnitQuantityWarehouse
  LEFT JOIN dbo.STKArticle art ON art.IDArticle = mo.IDArticle
  WHERE mo.CodCompany = '001' AND mo.CodManufacturingOrder IN (${ofs})`;

/** Recorta los textos (RPS los guarda con espacios de relleno). */
function limpiar(f: Record<string, unknown>): Fila {
  return Object.fromEntries(
    Object.entries(f).map(([k, v]) => [k, typeof v === "string" ? v.trim() : (v as Fila[string]) ?? null]),
  );
}

/** Ordena las filas como las OF pedidas: imprimir «todas las del pedido» las
 *  saca en el orden de la ficha, no en el de la base de datos. */
function enOrden(filas: Fila[], ofs: readonly string[]): Fila[] {
  const pos = new Map(ofs.map((o, i) => [o, i]));
  return filas
    .map((f, i) => ({ f, i }))
    .sort((a, b) =>
      (pos.get(String(a.f.ManufacturingOrder_CodManufacturingOrder)) ?? 0) -
        (pos.get(String(b.f.ManufacturingOrder_CodManufacturingOrder)) ?? 0) || a.i - b.i,
    )
    .map((x) => x.f);
}

export interface DatosImpresion {
  hojaRuta: Fila[];
  vale: Fila[];
}

export async function leerDatosImpresion(ofs: readonly string[]): Promise<DatosImpresion> {
  const limpias = [...new Set(ofs.map((o) => o.trim()).filter((o) => /^\d{5,10}$/.test(o)))].slice(0, 60);
  if (!limpias.length || process.env.DATASOURCE !== "rps") return { hojaRuta: [], vale: [] };
  const pool = await getPool();
  const r1 = pool.request();
  const r2 = pool.request();
  const [ruta, vale] = await Promise.all([
    r1.query<Record<string, unknown>>(SQL_HOJA_RUTA(listaOF(r1, limpias))),
    r2.query<Record<string, unknown>>(SQL_VALE(listaOF(r2, limpias))),
  ]);
  return {
    hojaRuta: enOrden(ruta.recordset.map(limpiar), limpias),
    vale: enOrden(vale.recordset.map(limpiar), limpias),
  };
}
