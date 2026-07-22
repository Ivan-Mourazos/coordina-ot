import { expect, test } from "vitest";
import { construirFiltros, filaAItem, CODIGO_PEDIDO_RE, cabeceraADetalle } from "../historial";
import { FAMILIA_KEYWORDS } from "../historial";

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

test("cabeceraADetalle arma el detalle con fechas ISO, scanUrl y prioridad saneada", () => {
  const d = cabeceraADetalle(
    {
      pedido: " AR.26.03365 ", cliente: "MAHOU, S.A.", negocio: "NOVA",
      ciudad: "Coruña", comentario: "sin prisa",
      solicitada: new Date("2026-06-01T00:00:00.000Z"), prioridad: 9, piezas: 4,
    },
    [{ codigo: "0230262", descripcion: "TOLDO", tiempoImputadoMin: 12, quien: ["Alberto"] }],
    "2026-07-22T13:00:00.000Z",
    ["TOLDO"],
  );
  expect(d.codigo).toBe("AR.26.03365");
  expect(d.scanUrl).toBe("/api/pedidos/AR.26.03365.pdf");
  expect(d.prioridad).toBe(1); // 9 fuera de rango → 1
  expect(d.fechaSolicitud).toBe("2026-06-01");
  expect(d.fechaFinalizacion).toBe("2026-07-22T13:00:00.000Z");
  expect(d.piezas).toBe(4);
  expect(d.familias).toEqual(["TOLDO"]);
  expect(d.ofs).toHaveLength(1);
});

test("cabeceraADetalle tolera nulos (fecha, piezas, cliente)", () => {
  const d = cabeceraADetalle(
    { pedido: "AR.26.00001", cliente: null, negocio: null, ciudad: null, comentario: null, solicitada: null, prioridad: null, piezas: null },
    [], null, [],
  );
  expect(d.cliente).toBeNull();
  expect(d.fechaSolicitud).toBeNull();
  expect(d.fechaFinalizacion).toBeNull();
  expect(d.piezas).toBe(0);
  expect(d.prioridad).toBe(1);
});

test("FAMILIA_KEYWORDS tiene las 7 familias con sus keywords", () => {
  expect(Object.keys(FAMILIA_KEYWORDS).sort()).toEqual(
    ["CARPA", "LONA", "REMOLQUE", "REPARACION", "SUMINISTRO", "TAPIZADO", "TOLDO"],
  );
  expect(FAMILIA_KEYWORDS.LONA).toEqual(["LONA", "ROLLO"]);
});

test("filtro familia genera EXISTS parametrizado con las keywords de esa familia", () => {
  const r = construirFiltros({ page: 0, familia: "LONA" });
  expect(r.clausulas.some((c) => c.includes("EXISTS"))).toBe(true);
  expect(r.clausulas.some((c) => c.includes("mo2.Description LIKE @fam0"))).toBe(true);
  expect(r.clausulas.some((c) => c.includes("mo2.Description LIKE @fam1"))).toBe(true);
  expect(r.params).toContainEqual({ nombre: "fam0", valor: "%LONA%" });
  expect(r.params).toContainEqual({ nombre: "fam1", valor: "%ROLLO%" });
});

test("filtro familia desconocida se ignora", () => {
  expect(construirFiltros({ page: 0, familia: "XXX" }).clausulas).toEqual([]);
});

test("filtro cliente genera igualdad exacta parametrizada", () => {
  const r = construirFiltros({ page: 0, cliente: "MAHOU, S.A." });
  expect(r.clausulas).toContain("cli.Description = @cliente");
  expect(r.params).toContainEqual({ nombre: "cliente", valor: "MAHOU, S.A." });
});
