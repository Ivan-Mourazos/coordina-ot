import { expect, test } from "vitest";
import { agruparCentros } from "../server/publico-db";
import { ctesFinalizacionHistorial } from "../server/historial-finalizacion-sql";

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

test("pendiente_total del índice solo cuenta tareas con un centro de trabajo asignado", () => {
  // Fija la regla contra el SQL real y no contra un resumen: una tarea sin
  // fila en CPRMOResourceMachine (pseudo-tareas de RPS como "0 · Materiales"
  // o una nota tecleada como tarea) no puede tener la culpa de dejar un
  // pedido pendiente para siempre, porque nunca cierra en OLANET.
  const sql = ctesFinalizacionHistorial("ot");
  expect(sql).toContain("Centros AS");
  expect(sql).toContain("SELECT DISTINCT IDMOTask FROM dbo.CPRMOResourceMachine");
  expect(sql).toContain("CASE WHEN c.IDMOTask IS NOT NULL THEN 1 ELSE 0 END AS tiene_centro");
  expect(sql).toContain("MAX(CASE WHEN tiene_centro=1 THEN 1-terminada ELSE 0 END) AS pendiente_total");
  // pendiente_seccion y tiene_seccion no se tocan: siguen mirando solo
  // de_seccion, sin pasar por tiene_centro.
  expect(sql).toContain("MAX(CASE WHEN de_seccion=1 THEN 1-terminada ELSE 0 END) AS pendiente_seccion");
});
