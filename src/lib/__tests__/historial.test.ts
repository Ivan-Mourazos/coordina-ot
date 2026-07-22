import { expect, test } from "vitest";
import { construirFiltros, filaAItem, CODIGO_PEDIDO_RE } from "../historial";

test("sin filtros no genera cláusulas ni params", () => {
  const r = construirFiltros({ page: 0 });
  expect(r.clausulas).toEqual([]);
  expect(r.params).toEqual([]);
});

test("q genera cláusula LIKE parametrizada sobre pedido y cliente", () => {
  const r = construirFiltros({ page: 0, q: "MAHOU" });
  expect(r.clausulas).toHaveLength(1);
  expect(r.clausulas[0]).toMatch(/p\.pedido LIKE @q OR cli\.Description LIKE @q/);
  expect(r.params).toContainEqual({ nombre: "q", valor: "%MAHOU%" });
});

test("desde/hasta generan cláusulas de rango parametrizadas", () => {
  const r = construirFiltros({ page: 0, desde: "2026-01-01", hasta: "2026-02-01" });
  expect(r.params).toContainEqual({ nombre: "desde", valor: "2026-01-01" });
  expect(r.params).toContainEqual({ nombre: "hasta", valor: "2026-02-01" });
  expect(r.clausulas.some((c) => c.includes("p.finalizada >= @desde"))).toBe(true);
  expect(r.clausulas.some((c) => c.includes("p.finalizada < @hasta"))).toBe(true);
});

test("q vacío o solo espacios se ignora", () => {
  expect(construirFiltros({ page: 0, q: "   " }).clausulas).toEqual([]);
});

test("filaAItem normaliza fecha a ISO y recorta el pedido", () => {
  const item = filaAItem({
    pedido: " AR.26.03453 ", finalizada: new Date("2026-07-22T13:04:06.887Z"),
    cliente: "MAHOU, S.A.", n_of: 13,
  });
  expect(item).toEqual({
    pedido: "AR.26.03453", cliente: "MAHOU, S.A.",
    finalizada: "2026-07-22T13:04:06.887Z", nOf: 13,
  });
});

test("CODIGO_PEDIDO_RE acepta AR/BE/SA y rechaza basura", () => {
  expect(CODIGO_PEDIDO_RE.test("AR.26.03453")).toBe(true);
  expect(CODIGO_PEDIDO_RE.test("BE.25.01165")).toBe(true);
  expect(CODIGO_PEDIDO_RE.test("'; DROP TABLE x --")).toBe(false);
});
