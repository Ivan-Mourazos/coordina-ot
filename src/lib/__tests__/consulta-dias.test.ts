import { expect, test } from "vitest";
import type { PedidoConsulta } from "../consulta";
import { agruparPedidosPorDia } from "../consulta-dias";

const p = (codigo: string, dia: string | null): PedidoConsulta => ({
  codigo,
  cliente: null,
  negocio: null,
  ciudadEntrega: null,
  situacion: "fabrica",
  fechaEntrega: dia,
  fechaEntregado: null,
  dia,
  fueraDePlazo: false,
  familias: [],
  donde: [],
});

test("una tarjeta por día en el orden en que llegan, con el total del día entero", () => {
  const dias = agruparPedidosPorDia(
    [p("A", "2026-09-15"), p("B", "2026-09-15"), p("C", "2026-09-16"), p("D", null)],
    { hoy: new Date(2026, 8, 15), totales: { "2026-09-15": 5, "2026-09-16": 1, "sin-fecha": 1 } },
  );
  expect(dias.map((d) => [d.clave, d.pedidos.map((x) => x.codigo), d.total])).toEqual([
    ["2026-09-15", ["A", "B"], 5],
    ["2026-09-16", ["C"], 1],
    ["sin-fecha", ["D"], 1],
  ]);
  expect(dias[0].titulo.startsWith("Hoy, ")).toBe(true);
  expect(dias[0].titulo).toContain("15/09/26");
  expect(dias[1].titulo).toContain("16/09/26");
  expect(dias[2].titulo).toBe("Sin fecha");
});

test("sin total del servidor para ese día, cuenta lo cargado", () => {
  const dias = agruparPedidosPorDia([p("A", "2026-10-01")], { hoy: new Date(2026, 8, 15), totales: {} });
  expect(dias[0].total).toBe(1);
});
