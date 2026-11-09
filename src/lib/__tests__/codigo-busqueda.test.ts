import { describe, expect, test } from "vitest";
import { interpretarBusqueda } from "../codigo-busqueda";

const exacto = (...exactos: string[]) => ({ tipo: "pedido", exactos, prefijos: [] });

describe("interpretarBusqueda", () => {
  test.each([
    "AR.26.05448", "ar.26.05448", "26.05448", "AR2605448", "ar2605448", "2605448", "ar 26 05448", "AR-26-05448",
  ])("«%s» es el pedido AR.26.05448", (escrito) => {
    expect(interpretarBusqueda(escrito, 2026)).toEqual(exacto("AR.26.05448"));
  });

  test("el número solo prueba este año y los tres anteriores", () => {
    expect(interpretarBusqueda("5448", 2026)).toEqual(
      exacto("AR.26.05448", "AR.25.05448", "AR.24.05448", "AR.23.05448"),
    );
    expect(interpretarBusqueda("05448", 2026)).toEqual(interpretarBusqueda("5448", 2026));
  });

  test("a medio escribir busca por cómo empieza", () => {
    expect(interpretarBusqueda("26.054", 2026)).toEqual({
      tipo: "pedido", exactos: ["AR.26.00054"], prefijos: ["AR.26.054"],
    });
    expect(interpretarBusqueda("AR26054", 2026)).toEqual({ tipo: "pedido", exactos: [], prefijos: ["AR.26.054"] });
    expect(interpretarBusqueda("260544", 2026)).toEqual({ tipo: "pedido", exactos: [], prefijos: ["AR.26.0544"] });
  });

  test("respeta otra serie si se escribe", () => {
    expect(interpretarBusqueda("QU.25.01234", 2026)).toEqual(exacto("QU.25.01234"));
  });

  test("siete cifras con un cero delante son una OF", () => {
    expect(interpretarBusqueda("0232470", 2026)).toEqual({ tipo: "of", codigo: "0232470" });
  });

  test("lo demás es el cliente", () => {
    expect(interpretarBusqueda("  talleres cal ", 2026)).toEqual({ tipo: "texto", texto: "talleres cal" });
    expect(interpretarBusqueda("mahou", 2026)).toEqual({ tipo: "texto", texto: "mahou" });
  });
});
