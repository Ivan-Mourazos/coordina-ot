import { expect, test } from "vitest";
import { agruparCentros } from "../server/publico-db";

test("un centro escrito de dos maneras es un solo centro", () => {
  // En RPS el mismo centro aparece con el código al derecho y al revés
  // (A-ROTU y ROTU-A, OTEC-A y A-OTEC) con la MISMA descripción. Agrupando
  // por código, "Rotulaciones Arzúa" salía dos veces en la misma línea.
  const mapa = agruparCentros([
    { pedido: "AR.26.00001", centro: "ROTULACIONES ARZUA" },
    { pedido: "AR.26.00001", centro: "ROTULACIONES ARZUA" },
    { pedido: "AR.26.00001", centro: "CORTE AUTOMÁTICO PARQUE EMPRESARIAL" },
  ]);
  expect(mapa.get("AR.26.00001")).toEqual([
    "CORTE AUTOMÁTICO PARQUE EMPRESARIAL",
    "ROTULACIONES ARZUA",
  ]);
});

test("filas sin pedido o sin centro no rompen el agrupado", () => {
  const mapa = agruparCentros([
    { pedido: null, centro: "CALDERERIA" },
    { pedido: "AR.26.00002", centro: null },
    { pedido: "AR.26.00002", centro: "  CALDERERIA  " },
  ]);
  expect(mapa.get("AR.26.00002")).toEqual(["CALDERERIA"]);
});
