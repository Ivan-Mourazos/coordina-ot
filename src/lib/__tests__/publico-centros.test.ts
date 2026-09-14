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

// El test que fijaba la regla de pendiente_total contra literales del SQL
// (toContain) se quitó: cinco expect(sql).toContain(...) no podían fallar
// por un error de lógica (p.ej. un JOIN mal hecho entre Centros y Tareas)
// mientras el texto siguiera presente en algún sitio del SQL. La cubre
// ahora scripts/verificar-historial-centros.test.ts, que ejecuta el SQL
// real contra tablas temporales y comprueba el resultado.
