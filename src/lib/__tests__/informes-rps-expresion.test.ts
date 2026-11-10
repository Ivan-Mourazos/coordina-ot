import { describe, expect, test } from "vitest";
import { evaluar, rellenar, trozos } from "../informes-rps/expresion";

const hoy = new Date(Date.UTC(2026, 10, 10));
const fila = {
  ManufacturingOrder_CodManufacturingOrder: "0233881",
  ManufacturingOrder_InternalCode: "AR.26.05479",
  ManufacturingOrder_Quantity: 1,
  MeasureUnit_CodMeasureUnit: "UN",
  MeasureUnit2_CodMeasureUnit: "M2",
  OrderLineSL_QuantitySecondUnit: 0,
  ManufacturingOrder_ManualEndDate: new Date(Date.UTC(2026, 10, 19)),
  StockReserve_Quantity: 12,
  Stock_Series: null,
  Article2_CodArticle: "ACRILI2979P120",
};
const c = { fila, hoy };

describe("expresiones de las plantillas de RPS", () => {
  test("texto con campos", () => {
    expect(rellenar("MATERIALES RESERVADOS OF {Result.ManufacturingOrder_CodManufacturingOrder}, pedido {Result.ManufacturingOrder_InternalCode}", c))
      .toBe("MATERIALES RESERVADOS OF 0233881, pedido AR.26.05479");
  });

  test("las llaves dentro de comillas no cierran", () => {
    expect(trozos('{Format("{0:N2}", Result.StockReserve_Quantity)} m')).toEqual([
      { expresion: 'Format("{0:N2}", Result.StockReserve_Quantity)' },
      { literal: " m" },
    ]);
    expect(rellenar('{Format("{0:N2}", Result.StockReserve_Quantity)}', c)).toBe("12,00");
  });

  test("IIF de la cantidad de la hoja de ruta, con y sin segunda unidad", () => {
    const e = `IIF(Result.OrderLineSL_QuantitySecondUnit==0,Result.ManufacturingOrder_Quantity+" "+Result.MeasureUnit_CodMeasureUnit ,
Result.ManufacturingOrder_Quantity+" "+Result.MeasureUnit_CodMeasureUnit+" ("+Result.OrderLineSL_QuantitySecondUnit+" "+Result.MeasureUnit2_CodMeasureUnit+")")`;
    expect(evaluar(e, c)).toBe("1 UN");
    expect(evaluar(e, { ...c, fila: { ...fila, OrderLineSL_QuantitySecondUnit: 12.5 } })).toBe("1 UN (12,5 M2)");
  });

  test("código del vale: la serie o, sin serie, el artículo", () => {
    const e = "IIF(String.IsNullOrEmpty(Result.Stock_Series),Result.Article2_CodArticle,Result.Stock_Series)";
    expect(evaluar(e, c)).toBe("ACRILI2979P120");
    expect(evaluar(e, { ...c, fila: { ...fila, Stock_Series: "1324091976" } })).toBe("1324091976");
  });

  test("fechas: corta por defecto y larga con «D»", () => {
    expect(rellenar("{Today}", c)).toBe("10/11/2026");
    expect(rellenar("{Result.ManufacturingOrder_ManualEndDate}", c, "D")).toBe("jueves, 19 de noviembre de 2026");
  });

  test("un campo que la fila no trae es un error, no un hueco", () => {
    expect(() => rellenar("{Result.NoExiste}", c)).toThrow(/NoExiste/);
    expect(() => evaluar("Math.Max(1,2)", c)).toThrow();
  });
});
