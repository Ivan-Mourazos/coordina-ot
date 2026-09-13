import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Los números de cada sección son suyos: el "1 de cada 3 vuelve" de Oficina
// Técnica no puede llevar dentro las devoluciones de Diseño Gráfico, porque
// entonces no dice nada de ninguno de los dos equipos.
//
// El registro NO guarda la sección: se deduce del operario que firma el
// movimiento. Estos tests son los que sujetan esa decisión.

let dir: string;
let db: typeof import("../server/estado-db");
let fdb: typeof import("../server/fichaje-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-msec-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  db = await import("../server/estado-db");
  fdb = await import("../server/fichaje-db");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

beforeEach(() => {
  db.getDb().prepare("DELETE FROM acciones_log").run();
  db.getDb().prepare("DELETE FROM fichaje_intervalo").run();
});

/** Una revisión y su devolución, a nombre de quien sea. */
function vuelta(operarioId: string | null, ofId: string, dia: string) {
  const ins = db
    .getDb()
    .prepare("INSERT INTO acciones_log (ts, operario_id, motivo, detalle) VALUES (?, ?, ?, ?)");
  const det = (obs: string | null) => JSON.stringify({ cambiosOF: [{ ofId, observacion: obs }] });
  ins.run(`${dia}T09:00:00.000Z`, operarioId, "empezar_revision", det(null));
  ins.run(`${dia}T10:00:00.000Z`, operarioId, "devolver", det("[1] la cota"));
}

test("cada sección cuenta lo suyo y NADA de la otra", () => {
  vuelta("jaime", "of1", "2026-09-02"); // Oficina Técnica
  vuelta("tamara", "of2", "2026-09-02"); // Oficina Técnica
  vuelta("carron", "of3", "2026-09-02"); // Diseño Gráfico

  const ot = db.leerMovimientosMetricas(undefined, undefined, "ot");
  const diseno = db.leerMovimientosMetricas(undefined, undefined, "diseno");

  expect(ot.filter((m) => m.motivo === "devolver")).toHaveLength(2);
  expect(diseno.filter((m) => m.motivo === "devolver")).toHaveLength(1);
  // Y lo que importa de verdad: ninguna ve movimientos de la otra.
  expect(ot.every((m) => m.operarioId !== "carron")).toBe(true);
  expect(diseno.every((m) => m.operarioId === "carron")).toBe(true);
});

test("el histórico se reparte solo, sin migrar nada", () => {
  // Antes de que Diseño Gráfico entrara en la web, TODO lo registrado era de
  // Oficina Técnica. Como la sección se deduce del operario, el histórico cae
  // donde le toca sin tocar una sola fila.
  vuelta("jaime", "of1", "2026-08-10");
  vuelta("alberto", "of2", "2026-08-11");

  expect(db.leerMovimientosMetricas(undefined, undefined, "ot")).toHaveLength(4);
  expect(db.leerMovimientosMetricas(undefined, undefined, "diseno")).toHaveLength(0);
});

test("los movimientos sin autor cuentan en la sección de siempre", () => {
  // Los hay en el histórico. Perderlos descuadraría los totales de OT por un
  // detalle de cómo se registraron hace meses.
  vuelta(null, "of1", "2026-08-10");

  expect(db.leerMovimientosMetricas(undefined, undefined, "ot")).toHaveLength(2);
  expect(db.leerMovimientosMetricas(undefined, undefined, "diseno")).toHaveLength(0);
});

test("sin pedir sección se devuelve todo, como antes", () => {
  vuelta("jaime", "of1", "2026-09-02");
  vuelta("carron", "of2", "2026-09-02");
  expect(db.leerMovimientosMetricas()).toHaveLength(4);
});

test("el filtro de fechas sigue valiendo dentro de una sección", () => {
  vuelta("carron", "of1", "2026-08-10");
  vuelta("carron", "of2", "2026-09-02");
  const soloSept = db.leerMovimientosMetricas("2026-09-01T00:00:00.000Z", undefined, "diseno");
  expect(soloSept).toHaveLength(2);
  expect(soloSept.every((m) => m.at.startsWith("2026-09"))).toBe(true);
});

test("el trabajo dado por bueno sin revisión llega a las métricas", () => {
  // `aprobar_sin_revision` estaba fuera de la consulta: la acción existe desde
  // hace meses, la trata el cálculo, y los movimientos nunca llegaban. Todo el
  // trabajo que no lleva revisión —ASSA ABLOY y demás— salía de los números
  // como si no se hubiera hecho.
  const ins = db
    .getDb()
    .prepare("INSERT INTO acciones_log (ts, operario_id, motivo, detalle) VALUES (?, ?, ?, ?)");
  const det = JSON.stringify({ cambiosOF: [{ ofId: "of9", observacion: null }] });
  ins.run("2026-09-03T09:00:00.000Z", "jaime", "aprobar_sin_revision", det);

  const ot = db.leerMovimientosMetricas(undefined, undefined, "ot");
  expect(ot.filter((m) => m.motivo === "aprobar_sin_revision")).toHaveLength(1);
});

/** Un tramo de fichaje ya cerrado, tal cual lo guarda el motor. */
function fichaje(operarioId: string, ofIds: string[], inicio: string, fin: string, traspasado = false) {
  db.getDb()
    .prepare(
      `INSERT INTO fichaje_intervalo (operario_id, of_ids, rol, inicio, fin, updated_at, traspasado_at)
       VALUES (?, ?, 'revisar', ?, ?, ?, ?)`,
    )
    .run(operarioId, JSON.stringify(ofIds), inicio, fin, fin, traspasado ? fin : null);
}

test("el fichaje de las métricas lo trae TODO, traspasado o no", () => {
  // A diferencia del tablero, aquí no se están sumando minutos para RPS: se
  // está midiendo cuánto costó nuestro trabajo. Un tramo que ya subió a RPS
  // pasó igual, y dejarlo fuera vaciaría el histórico en cuanto el fichaje se
  // ponga en activo.
  fichaje("jaime", ["of1"], "2026-09-02T09:00:00.000Z", "2026-09-02T09:30:00.000Z");
  fichaje("jaime", ["of2"], "2026-09-02T10:00:00.000Z", "2026-09-02T10:30:00.000Z", true);

  expect(fdb.leerIntervalosMetricas(undefined, undefined, "ot")).toHaveLength(2);
});

test("cada sección mide su propio fichaje", () => {
  fichaje("jaime", ["of1"], "2026-09-02T09:00:00.000Z", "2026-09-02T09:30:00.000Z");
  fichaje("carron", ["of3"], "2026-09-02T09:00:00.000Z", "2026-09-02T09:30:00.000Z");

  expect(fdb.leerIntervalosMetricas(undefined, undefined, "ot")).toHaveLength(1);
  const diseno = fdb.leerIntervalosMetricas(undefined, undefined, "diseno");
  expect(diseno).toHaveLength(1);
  expect(diseno[0].operarioId).toBe("carron");
});

test("un fichaje que cruza el principio del periodo entra, no se pierde su parte", () => {
  // El tramo empezó antes del corte y acabó dentro. Dejándolo fuera, el trabajo
  // de ese repaso saldría a cero justo en el primer día del periodo.
  fichaje("jaime", ["of1"], "2026-08-31T23:00:00.000Z", "2026-09-01T01:00:00.000Z");

  expect(fdb.leerIntervalosMetricas("2026-09-01T00:00:00.000Z", undefined, "ot")).toHaveLength(1);
});

test("el fichaje de fuera del periodo no entra", () => {
  fichaje("jaime", ["of1"], "2026-07-10T09:00:00.000Z", "2026-07-10T09:30:00.000Z");

  expect(fdb.leerIntervalosMetricas("2026-09-01T00:00:00.000Z", undefined, "ot")).toHaveLength(0);
});
