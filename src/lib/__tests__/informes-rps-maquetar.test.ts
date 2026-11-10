import { describe, expect, test } from "vitest";
import { maquetar, type Elemento } from "../informes-rps/maquetar";
import { PLANTILLA_HOJA_RUTA, PLANTILLA_VALE } from "../informes-rps/plantillas";
import type { Fila } from "../informes-rps/expresion";

const hoy = new Date(Date.UTC(2026, 10, 10));

const tarea = (of: string, cod: string, orden: number, extra: Partial<Fila> = {}): Fila => ({
  ManufacturingOrder_CodManufacturingOrder: of,
  ManufacturingOrder_Description: "",
  ManufacturingOrder_ManualEndDate: new Date(Date.UTC(2026, 10, 19)),
  ManufacturingOrder_Notes: null,
  ManufacturingOrder_Quantity: 1,
  Article_CodArticle: "CAMTELTOL",
  Article_Description: "",
  MeasureUnit_CodMeasureUnit: "UN",
  MeasureUnit2_CodMeasureUnit: null,
  MOTask_CodMOTask: cod,
  MOTask_Description: `TAREA ${cod}`,
  MOTask_Order: orden,
  MOTask_ProductEntry: false,
  MOTask_PrintLabels: false,
  MOResourceMachine_CodMOResourceMachine: "A-MONT",
  OrderLineSL_Comment: "POR CONFECCION",
  OrderLineSL_NumLine: 1,
  OrderLineSL_QuantitySecondUnit: 0,
  OrderLineSL_TextoRotulacion: null,
  OrderSL_CodOrder: "AR.26.05479",
  OrderSL_OrderNumberCustomer: null,
  Customer_Description: "CLIENTE",
  WareHouse_Description: null,
  ...extra,
});

const textos = (els: Elemento[]) => els.flatMap((e) => (e.tipo === "texto" ? [e.texto] : []));
const barras = (els: Elemento[]) => els.flatMap((e) => (e.tipo === "barras" ? [e.texto] : []));

describe("hoja de ruta calcada de RPS", () => {
  test("una OF: su hoja y la de tablas en blanco; tareas en el orden de RPS y sin la «0»", () => {
    const filas = [tarea("0233881", "19", 6, { MOTask_ProductEntry: true }), tarea("0233881", "01", 1), tarea("0233881", "0", 0), tarea("0233881", "02", 3)];
    const paginas = maquetar(PLANTILLA_HOJA_RUTA, filas, hoy);
    expect(paginas).toHaveLength(2);
    const [hoja] = paginas;
    expect(textos(hoja.elementos)).toContain("HOJA RUTA");
    expect(textos(hoja.elementos)).toContain("jueves, 19 de noviembre de 2026");
    expect(textos(hoja.elementos)).toContain("10/11/2026");
    // Un código de barras para la OF y uno por tarea, con la tarea tal cual.
    expect(barras(hoja.elementos)).toEqual(["0233881", "0233881-01", "0233881-02", "0233881-19"]);
    // El icono de entrada de producto (Webdings «F») solo en la tarea que la da.
    expect(textos(hoja.elementos).filter((t) => t === "F")).toHaveLength(1);
    expect(textos(paginas[1].elementos)).toContain("IMPUTACIÓN DE TIEMPOS A ORDEN DE FABRICACIÓN");
  });

  test("el pie va al fondo de la hoja y el marco llega hasta él", () => {
    const [hoja] = maquetar(PLANTILLA_HOJA_RUTA, [tarea("0233881", "01", 1)], hoy);
    const desc = hoja.elementos.find((e) => e.tipo === "texto" && e.texto === "DESCRIPCION");
    expect(desc && "y" in desc && desc.y).toBeGreaterThan(29.7 - 1 - 4.8);
    const marco = hoja.elementos.find((e) => e.tipo === "rectangulo");
    expect(marco && marco.tipo === "rectangulo" && marco.y + marco.alto).toBeGreaterThan(24);
  });

  test("muchas tareas pasan a otra hoja sin pisar el pie", () => {
    const filas = Array.from({ length: 20 }, (_, i) => tarea("0233881", String(i + 1).padStart(2, "0"), i));
    const paginas = maquetar(PLANTILLA_HOJA_RUTA, filas, hoy);
    expect(paginas.length).toBeGreaterThanOrEqual(3);
    expect(barras(paginas.flatMap((p) => p.elementos)).filter((b) => b.includes("-"))).toHaveLength(20);
  });
});

describe("vale de material calcado de RPS", () => {
  const base = { ManufacturingOrder_CodManufacturingOrder: "0233881", ManufacturingOrder_InternalCode: "AR.26.05479", ManufacturingOrder_Description: "", ManufacturingOrder_Quantity: 1, Article_CodArticle: "CAMTELTOL", MOTask_CodMOTask: "02" };
  test("solo lo reservado, con su serie como código de barras", () => {
    const filas: Fila[] = [
      { ...base, MOMaterial_CodMOMaterial: "1", StockReserve_Quantity: 12, Stock_Series: "1324091976", Article2_CodArticle: "ACRILI2979P120", Article2_Description: "LONA ACRILICA", MeasureUnit_Abreviature: "ML" },
      { ...base, MOTask_CodMOTask: "09", MOMaterial_CodMOMaterial: null, StockReserve_Quantity: null, Stock_Series: null, Article2_CodArticle: null, Article2_Description: null, MeasureUnit_Abreviature: null },
    ];
    const [hoja, ...resto] = maquetar(PLANTILLA_VALE, filas, hoy);
    expect(resto).toHaveLength(0);
    expect(textos(hoja.elementos)).toContain("MATERIALES RESERVADOS OF 0233881, pedido AR.26.05479");
    expect(textos(hoja.elementos)).toContain("12,00 ML");
    expect(barras(hoja.elementos)).toEqual(["1324091976"]);
  });
});
