import { describe, expect, test } from "vitest";
import { agruparEntregas, filtrarEntregas, sumarDias, type FiltrosEntregasBelen, type PedidoEntregaBelen } from "../entregas-belen";

const filtros: FiltrosEntregasBelen = { texto: "", desde: "", hasta: "", situacion: "", orden: "fechaEntrega", descendente: false };
const pedidos: PedidoEntregaBelen[] = [
  { codigo: "AR.26.00003", cliente: "Álvarez", ciudad: "Lugo", fechaEntrega: null, situacion: "fabrica", ofs: 2 },
  { codigo: "AR.26.00002", cliente: "Pérez", ciudad: "León", fechaEntrega: "2026-11-12", situacion: "salir", ofs: 10 },
  { codigo: "AR.26.00001", cliente: "Álvarez", ciudad: "León", fechaEntrega: "2026-11-10", situacion: "fabrica", ofs: 1 },
];

test("ordena todas las entregas y deja sin fecha al final en ambos sentidos", () => {
  expect(filtrarEntregas(pedidos, filtros).map((p) => p.codigo)).toEqual(["AR.26.00001", "AR.26.00002", "AR.26.00003"]);
  expect(filtrarEntregas(pedidos, { ...filtros, descendente: true }).map((p) => p.codigo)).toEqual(["AR.26.00002", "AR.26.00001", "AR.26.00003"]);
  expect(pedidos[0].fechaEntrega).toBe(null);
});

test("combina texto sin acentos, situación e intervalo inclusivo", () => {
  const r = filtrarEntregas(pedidos, { ...filtros, texto: "alvarez leon", situacion: "fabrica", desde: "2026-11-10", hasta: "2026-11-10" });
  expect(r.map((p) => p.codigo)).toEqual(["AR.26.00001"]);
  expect(filtrarEntregas(pedidos, { ...filtros, desde: "2026-11-13" })).toEqual([]);
});

test("ordena cantidades como números", () => {
  expect(filtrarEntregas(pedidos, { ...filtros, orden: "ofs" }).map((p) => p.ofs)).toEqual([1, 2, 10]);
});

describe("grupos por día de entrega", () => {
  const p = (codigo: string, fechaEntrega: string | null): PedidoEntregaBelen =>
    ({ codigo, cliente: null, ciudad: null, fechaEntrega, situacion: "fabrica", ofs: 1 });
  // Martes 10/11/2026: mañana es miércoles y la semana acaba el domingo 15.
  const hoy = "2026-11-10";

  test("atrasados, hoy, mañana, resto de la semana, más adelante y sin fecha", () => {
    const g = agruparEntregas(
      [p("A", "2010-03-01"), p("B", "2026-11-09"), p("C", hoy), p("D", "2026-11-11"), p("E", "2026-11-15"), p("F", "2026-11-16"), p("G", null)],
      hoy,
    );
    expect(g.map((x) => [x.id, x.pedidos.map((y) => y.codigo).join("")])).toEqual([
      ["atrasados", "AB"], ["hoy", "C"], ["manana", "D"], ["semana", "E"], ["despues", "F"], ["sinFecha", "G"],
    ]);
  });

  test("no deja grupos vacíos", () => {
    expect(agruparEntregas([p("A", "2026-12-01")], hoy).map((x) => x.id)).toEqual(["despues"]);
  });

  test("un domingo, mañana ya es otra semana", () => {
    const g = agruparEntregas([p("A", "2026-11-16"), p("B", "2026-11-17")], "2026-11-15");
    expect(g.map((x) => x.id)).toEqual(["manana", "despues"]);
  });

  test("sumar días cruza meses y años", () => {
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
});
