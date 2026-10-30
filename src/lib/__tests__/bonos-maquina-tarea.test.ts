import { expect, test } from "vitest";
import { bonosDe, MAQUINA_OT } from "../bonos";
import type { Intervalo } from "../fichaje";
import { maquinaDeFichaje, nombresDeMaquinaEnBonos } from "../secciones";

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

test("un GRUPO de RPS no sirve de máquina: el bono sale con la máquina real", () => {
  // David (IT), 30/10/2026: la tarea puede asignarse a un grupo (OTEC-A), pero
  // el fichaje va siempre a una máquina, y con el grupo falla la exportación.
  const bonos = bonosDe([tramo(["0232346:2", "0232347:3"], "ivan")], CODIGOS, POR_PERSONA,
    new Map([["0232346:2", "OTEC-A"], ["0232347:3", "DGRA-A"]]));
  expect(bonos.map((b) => b.maquina)).toEqual(["A-OTEC", "A-DGRA"]);
});

test("el grupo se reconoce con las mayúsculas que traiga RPS", () => {
  expect(maquinaDeFichaje("otec-a")).toBe("A-OTEC");
  expect(maquinaDeFichaje(" DGRA-A ")).toBe("A-DGRA");
});

test("una máquina de verdad no se toca", () => {
  expect(maquinaDeFichaje("P-PCUS")).toBe("P-PCUS");
  expect(maquinaDeFichaje("A-OTEC")).toBe("A-OTEC");
});

test("los bonos ya escritos con el grupo se siguen encontrando", () => {
  // Sin esto, un tramo de antes del arreglo no se sellaría nunca y su tiempo
  // se contaría dos veces, aquí y en RPS.
  expect(nombresDeMaquinaEnBonos("A-OTEC")).toEqual(["A-OTEC", "OTEC-A"]);
  expect(nombresDeMaquinaEnBonos("P-PCUS")).toEqual(["P-PCUS"]);
});

test("y sin ninguna de las dos, la de Oficina Técnica, como antes de que hubiera secciones", () => {
  const bonos = bonosDe([tramo(["0232035:5", "x"], "ivan")], { ivan: "195" }, {}, new Map());
  expect(bonos[0].maquina).toBe(MAQUINA_OT);
});
