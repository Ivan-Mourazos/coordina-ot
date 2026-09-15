import { expect, test } from "vitest";
import type { BaseHistorial } from "../historial-indice";
import { pedidoConsulta } from "../consulta";

const b = (p: Partial<BaseHistorial>): BaseHistorial => ({
  pedido: "SA.26.00927",
  fechaPedido: Date.UTC(2026, 8, 1),
  nOf: 1,
  tieneSeccion: false,
  pendienteSeccion: false,
  pendienteTotal: false,
  fechaEntrega: Date.UTC(2026, 8, 11),
  pendienteEntrega: false,
  trabajoAbierto: false,
  fechaEntregado: Date.UTC(2026, 8, 14),
  finalizada: null,
  ...p,
});

const info = {
  cliente: "CLIENTE",
  negocio: null,
  ciudadEntrega: "SANTIAGO",
  familias: ["TOLDO"],
  ordenes: "",
  textos: "",
};

test("entregado: la fecha de salida es la del albarán, no la solicitada, y nunca fuera de plazo", () => {
  // SA.26.00927: se pidió para el 11/09 y su albarán es del 14/09. Con la
  // solicitada, la fila habría dicho que salió a tiempo.
  const p = pedidoConsulta(b({}), info, [], "2026-09-15");
  expect(p).toMatchObject({
    situacion: "entregado",
    fechaEntrega: "2026-09-11",
    fechaEntregado: "2026-09-14",
    dia: "2026-09-14",
    fueraDePlazo: false,
    ciudadEntrega: "SANTIAGO",
  });
});

test("la fila lleva EXACTAMENTE estas claves: lo que no está aquí no sale de casa", () => {
  // La lista blanca de la lista, como `publico-detalle.test.ts` lo es del
  // detalle: un campo nuevo en el índice no puede colarse en la respuesta solo
  // porque alguien lo añada arriba.
  const p = pedidoConsulta(b({}), info, [], "2026-09-15");
  expect(Object.keys(p).sort()).toEqual(
    [
      "ciudadEntrega",
      "cliente",
      "codigo",
      "dia",
      "donde",
      "familias",
      "fechaEntrega",
      "fechaEntregado",
      "fueraDePlazo",
      "negocio",
      "situacion",
    ].sort(),
  );
});

test("sin entregar: el día es la entrega solicitada, y fuera de plazo si ya pasó", () => {
  // Con una fecha de albarán de una entrega parcial: no puede salir en la
  // fila, o diría que ya salió.
  const p = pedidoConsulta(
    b({ pendienteEntrega: true, trabajoAbierto: true, fechaEntregado: Date.UTC(2026, 8, 1) }),
    info,
    [],
    "2026-09-15",
  );
  expect(p).toMatchObject({ situacion: "fabrica", fechaEntregado: null, dia: "2026-09-11", fueraDePlazo: true });
});
