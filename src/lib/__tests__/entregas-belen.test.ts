import { expect, test } from "vitest";
import { filtrarEntregas, type FiltrosEntregasBelen, type PedidoEntregaBelen } from "../entregas-belen";

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
