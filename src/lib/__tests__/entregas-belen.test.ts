import { describe, expect, test } from "vitest";
import { agruparEntregas, filtrarEntregas, sumarDias, type FiltrosEntregasBelen, type PedidoEntregaBelen } from "../entregas-belen";

const filtros: FiltrosEntregasBelen = { texto: "", delegacion: "", desde: "", hasta: "", orden: "fechaEntrega", descendente: false };
const of = (codigo: string, ofCod: string, extra: Partial<PedidoEntregaBelen> = {}): PedidoEntregaBelen => ({
  codigo, of: ofCod, cliente: null, prioridad: 2, articulo: null, articuloDescripcion: null,
  formaEntrega: null, rotulacion: null, fechaEntrega: null, ...extra,
});
const pedidos: PedidoEntregaBelen[] = [
  of("AR.26.00003", "0003", { cliente: "Álvarez", rotulacion: "MAHOU" }),
  of("AR.26.00002", "0002", { cliente: "Pérez", fechaEntrega: "2026-11-12", prioridad: 1 }),
  of("AR.26.00001", "0001", { cliente: "Álvarez", fechaEntrega: "2026-11-10", articulo: "1 × CAMTELTOL" }),
];

test("ordena por fecha y deja sin fecha al final en ambos sentidos", () => {
  expect(filtrarEntregas(pedidos, filtros).map((p) => p.of)).toEqual(["0001", "0002", "0003"]);
  expect(filtrarEntregas(pedidos, { ...filtros, descendente: true }).map((p) => p.of)).toEqual(["0002", "0001", "0003"]);
});

test("busca sin tildes en pedido, OF, cliente, artículo y rotulación, e intervalo inclusivo", () => {
  expect(filtrarEntregas(pedidos, { ...filtros, texto: "alvarez camteltol", desde: "2026-11-10", hasta: "2026-11-10" }).map((p) => p.of)).toEqual(["0001"]);
  expect(filtrarEntregas(pedidos, { ...filtros, texto: "mahou" }).map((p) => p.of)).toEqual(["0003"]);
  expect(filtrarEntregas(pedidos, { ...filtros, desde: "2026-11-13" })).toEqual([]);
});

test("filtra por delegación con la serie del pedido", () => {
  const conSa = [...pedidos, of("SA.26.00009", "0009")];
  expect(filtrarEntregas(conSa, { ...filtros, delegacion: "SA" }).map((p) => p.codigo)).toEqual(["SA.26.00009"]);
  expect(filtrarEntregas(conSa, { ...filtros, delegacion: "AR" })).toHaveLength(3);
  expect(filtrarEntregas(conSa, filtros)).toHaveLength(4);
});

test("ordena la prioridad como número y desempata por prioridad, pedido y OF", () => {
  expect(filtrarEntregas(pedidos, { ...filtros, orden: "prioridad" }).map((p) => p.of)).toEqual(["0002", "0001", "0003"]);
  const mismoDia = [of("AR.2", "0020", { fechaEntrega: "2026-11-12", prioridad: 2 }), of("AR.1", "0010", { fechaEntrega: "2026-11-12", prioridad: 1 })];
  expect(filtrarEntregas(mismoDia, filtros).map((p) => p.of)).toEqual(["0010", "0020"]);
});

describe("grupos por día de entrega", () => {
  const p = (codigo: string, fechaEntrega: string | null): PedidoEntregaBelen => of(codigo, codigo, { fechaEntrega });
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
