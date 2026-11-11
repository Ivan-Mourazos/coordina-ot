import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { PedidoLinea } from "../../components/PedidoLinea";
import { bordePrioridad } from "../estado";
import { resumirOf } from "../integracion";
import { OPERARIOS, PEDIDOS } from "../mock";
import { prioridadesDeOfs } from "../server/prioridades";
import type { Prioridad } from "../types";

const noop = () => {};

function pinta(prioridad: Prioridad) {
  const pedido = { ...PEDIDOS[0], prioridad };
  const ofs = pedido.ofs.map((o) => ({ ...o, ajenaOT: false, detenida: false }));
  return renderToStaticMarkup(
    createElement(PedidoLinea, {
      facet: { pedido: { ...pedido, ofs }, locationId: "ivan", ofs },
      fase: "planteando" as const,
      onOpen: noop,
      onFichar: noop,
      onDesficharVarias: noop,
      completarPedido: noop,
      operarios: OPERARIOS,
    }),
  );
}

test("el borde dice la prioridad: urgente lleno, normal y poca apagados", () => {
  expect(bordePrioridad(3)).toBe("var(--color-red-600)");
  expect(bordePrioridad(2)).toContain("#d39a1c");
  expect(bordePrioridad(2)).toContain("color-mix");
  expect(bordePrioridad(1)).toContain("#6b7280");
});

test("la fila del panel lleva el color de su prioridad en el borde, no el de la fase", () => {
  // React escribe el `style` en minúsculas y sin espacios tras los dos puntos.
  expect(pinta(3)).toContain("border-left-color:var(--color-red-600)");
  expect(pinta(2)).toContain("#d39a1c");
  expect(pinta(1)).toContain("#6b7280");
  expect(pinta(2)).not.toContain("#059669");
});

test("la integración pasa la prioridad del pedido de cada OF si la sabe", () => {
  const fila = { orden: "0230194", estado: "aprobada", observacion: null, updatedAt: "2026-09-29T08:00:00Z", revisorId: "jaime", autorId: "ivan", seccion: "ot" };
  expect(resumirOf("0230194", [fila], 3)).toMatchObject({ estado: "aprobada", prioridad: 3 });
  expect(resumirOf("0230194", [fila])).not.toHaveProperty("prioridad");
  expect(resumirOf("0230199", [], 2)).toMatchObject({ estado: "sin_estado", prioridad: 2 });
});

test("la prioridad de cada OF sale del tablero que ya está en memoria", () => {
  const tablero = {
    operarios: [],
    pedidos: [
      { ...PEDIDOS[0], prioridad: 3 as Prioridad, ofs: [{ ...PEDIDOS[0].ofs[0], codigo: "0230194" }] },
      { ...PEDIDOS[1], prioridad: 1 as Prioridad, ofs: [{ ...PEDIDOS[1].ofs[0], codigo: "0230195" }] },
    ],
  };
  const mapa = prioridadesDeOfs([tablero], ["0230194", "0230195", "0230999"]);
  expect(mapa.get("0230194")).toBe(3);
  expect(mapa.get("0230195")).toBe(1);
  expect(mapa.has("0230999")).toBe(false);
});
