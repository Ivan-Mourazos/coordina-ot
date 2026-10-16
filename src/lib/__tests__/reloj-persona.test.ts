import { expect, test } from "vitest";
import { relojesPorOperario } from "../../components/LiveBadge";
import type { Pedido } from "../types";

// Un compañero revisando tres pedidos a la vez: la tarjeta y las filas
// decían solo el primero, y su reloj contaba solo la parte de esa OF.
test("suma por persona lo de todas las OF de su reloj y cuenta sus pedidos", () => {
  const vivo = (previoSeg: number) => ({ operarioId: "adrian", rol: "revisar" as const, desde: "2026-10-16T08:00:00.000Z", previoSeg, parte: 1 / 3 });
  const pedido = (id: string, ofs: number[]) =>
    ({ id, ofs: ofs.map((previo, i) => ({ id: `${id}-${i}`, fichandoAhora: [vivo(previo)] })) }) as unknown as Pedido;
  const m = relojesPorOperario([pedido("A", [60, 120]), pedido("B", [30]), { id: "C", ofs: [{ id: "c" }] } as unknown as Pedido]);
  const r = m.get("adrian")!;
  expect(r.previoSeg).toBe(210);
  expect(r.parte).toBeCloseTo(1);
  expect(r.pedidos).toBe(2);
  expect(m.size).toBe(1);
});
