import { describe, expect, test } from "vitest";
import { esRangoFecha, interpretarBusqueda, limitesRango } from "../codigo-busqueda";

const exacto = (...exactos: string[]) => ({ tipo: "pedido", exactos, prefijos: [] });
const enLasTres = (resto: string) => ["AR", "SA", "BE"].map((s) => `${s}.${resto}`);

describe("interpretarBusqueda", () => {
  test.each(["AR.26.05448", "ar.26.05448", "AR2605448", "ar2605448", "ar 26 05448", "AR-26-05448"])(
    "«%s» es el pedido AR.26.05448",
    (escrito) => {
      expect(interpretarBusqueda(escrito, 2026)).toEqual(exacto("AR.26.05448"));
    },
  );

  test.each(["26.05448", "2605448", "26 05448"])("«%s» sin serie mira las tres delegaciones", (escrito) => {
    expect(interpretarBusqueda(escrito, 2026)).toEqual(exacto(...enLasTres("26.05448")));
  });

  test("el número solo prueba este año y los tres anteriores, en cada delegación", () => {
    expect(interpretarBusqueda("1140", 2026)).toEqual(
      exacto(
        "AR.26.01140", "AR.25.01140", "AR.24.01140", "AR.23.01140",
        "SA.26.01140", "SA.25.01140", "SA.24.01140", "SA.23.01140",
        "BE.26.01140", "BE.25.01140", "BE.24.01140", "BE.23.01140",
      ),
    );
    expect(interpretarBusqueda("01140", 2026)).toEqual(interpretarBusqueda("1140", 2026));
  });

  test("a medio escribir busca por cómo empieza", () => {
    expect(interpretarBusqueda("26.054", 2026)).toEqual({
      tipo: "pedido", exactos: enLasTres("26.00054"), prefijos: enLasTres("26.054"),
    });
    expect(interpretarBusqueda("AR26054", 2026)).toEqual({ tipo: "pedido", exactos: [], prefijos: ["AR.26.054"] });
    expect(interpretarBusqueda("260544", 2026)).toEqual({ tipo: "pedido", exactos: [], prefijos: enLasTres("26.0544") });
  });

  test("respeta otra serie si se escribe", () => {
    expect(interpretarBusqueda("QU.25.01234", 2026)).toEqual(exacto("QU.25.01234"));
    expect(interpretarBusqueda("BE.26.01140", 2026)).toEqual(exacto("BE.26.01140"));
    expect(interpretarBusqueda("sa 26 1140", 2026)).toEqual({
      tipo: "pedido", exactos: ["SA.26.01140"], prefijos: ["SA.26.1140"],
    });
  });

  test("siete cifras con un cero delante son una OF", () => {
    expect(interpretarBusqueda("0232470", 2026)).toEqual({ tipo: "of", codigo: "0232470" });
  });

  test("lo demás es el cliente", () => {
    expect(interpretarBusqueda("  talleres cal ", 2026)).toEqual({ tipo: "texto", texto: "talleres cal" });
    expect(interpretarBusqueda("mahou", 2026)).toEqual({ tipo: "texto", texto: "mahou" });
  });
});

describe("limitesRango", () => {
  const hoy = new Date(2026, 10, 18);
  test("cuenta hacia atrás desde hoy", () => {
    expect(limitesRango("mes", hoy)).toEqual({ desde: new Date(2026, 9, 18), hasta: null });
    expect(limitesRango("trimestre", hoy)).toEqual({ desde: new Date(2026, 7, 18), hasta: null });
    expect(limitesRango("anio", hoy)).toEqual({ desde: new Date(2025, 10, 18), hasta: null });
  });
  test("«Hace más de un año» corta por arriba", () => {
    expect(limitesRango("antiguos", hoy)).toEqual({ desde: null, hasta: new Date(2025, 10, 18) });
  });
  test("sin rango no limita", () => {
    expect(limitesRango("todo", hoy)).toEqual({ desde: null, hasta: null });
  });
  test("solo acepta los rangos conocidos", () => {
    expect(esRangoFecha("mes")).toBe(true);
    expect(esRangoFecha("semana")).toBe(false);
    expect(esRangoFecha(null)).toBe(false);
  });
});
