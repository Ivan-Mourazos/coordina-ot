import { expect, test } from "vitest";
import { bonosDe, MAQUINA_OT } from "../bonos";
import type { Intervalo } from "../fichaje";

// ─── La máquina de un bono es la del CENTRO donde se hizo el trabajo ─────────
// No la del departamento de quien lo hizo. Comprobado en `sch_RPS_bonos` el
// 17/09/2026: Manuel (22) tiene bonos con doce máquinas distintas según qué
// estuviera haciendo — A-DGRA, P-HPLA, P-JETI, P-IDUV…
//
// La web escribía una fija por PERSONA, la de su sección, y eso solo acierta
// mientras esa sección tenga un único recurso. Dejó de acertar el día que
// Diseño ganó el plóter de corte.

const CODIGOS = { ivan: "195", smith: "48" };
const POR_PERSONA = { ivan: "A-OTEC", smith: "A-DGRA" };

const tramo = (ofIds: string[], operarioId = "smith"): Intervalo => ({
  inicio: "2026-09-17T08:00:00.000Z",
  fin: "2026-09-17T09:00:00.000Z",
  ofIds,
  rol: "plantear",
  operarioId,
});

test("manda la máquina de la tarea, no la de la sección de quien ficha", () => {
  const bonos = bonosDe([tramo(["0232035:5"])], CODIGOS, POR_PERSONA,
    new Map([["0232035:5", "P-PCUS"]]));
  expect(bonos).toHaveLength(1);
  expect(bonos[0].maquina).toBe("P-PCUS");
});

test("un tramo repartido entre dos OF escribe cada bono en SU máquina", () => {
  // Es el caso que hace imposible guardar la máquina en el intervalo: una
  // persona puede tener el reloj corriendo sobre una tarea de diseño y un
  // corte a la vez, y sus dos bonos van a sitios distintos.
  const bonos = bonosDe([tramo(["0232035:5", "0232036:11"])], CODIGOS, POR_PERSONA,
    new Map([["0232035:5", "A-DGRA"], ["0232036:11", "P-PCUS"]]));
  expect(bonos.map((b) => [b.of, b.maquina])).toEqual([
    ["0232035", "A-DGRA"],
    ["0232036", "P-PCUS"],
  ]);
});

test("sin máquina conocida se queda la de la persona: un bono sin máquina pierde su tiempo", () => {
  // Las OF que llegaron antes de que existiera la tabla no están en el mapa.
  // Escribirlas como se escribían siempre es peor que no escribirlas.
  const bonos = bonosDe([tramo(["0232035:5"])], CODIGOS, POR_PERSONA, new Map());
  expect(bonos[0].maquina).toBe("A-DGRA");
});

test("y sin ninguna de las dos, la de Oficina Técnica, como antes de que hubiera secciones", () => {
  const bonos = bonosDe([tramo(["0232035:5", "x"], "ivan")], { ivan: "195" }, {}, new Map());
  expect(bonos[0].maquina).toBe(MAQUINA_OT);
});
