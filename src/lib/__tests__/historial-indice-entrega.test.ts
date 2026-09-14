import { expect, test } from "vitest";
import type { BaseHistorial } from "../historial-indice";

// Los dos campos nuevos del índice. El test es de TIPO y de forma: lo que
// se rompe si alguien los quita es la lista entera del invitado, y eso no
// puede depender de acordarse.
test("un pedido del índice lleva fecha de entrega y si queda algo por entregar", () => {
  const b: BaseHistorial = {
    pedido: "AR.26.00001",
    fechaPedido: Date.UTC(2026, 0, 10),
    nOf: 2,
    tieneSeccion: true,
    pendienteSeccion: false,
    pendienteTotal: false,
    finalizada: Date.UTC(2026, 0, 20),
    fechaEntrega: Date.UTC(2026, 1, 1),
    pendienteEntrega: true,
  };
  expect(b.fechaEntrega).toBe(Date.UTC(2026, 1, 1));
  expect(b.pendienteEntrega).toBe(true);
});

test("la entrega puede faltar: hay pedidos sin fecha solicitada", () => {
  const b: Pick<BaseHistorial, "fechaEntrega" | "pendienteEntrega"> = {
    fechaEntrega: null,
    pendienteEntrega: false,
  };
  expect(b.fechaEntrega).toBeNull();
});
