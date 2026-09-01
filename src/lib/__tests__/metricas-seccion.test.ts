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

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-msec-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  db = await import("../server/estado-db");
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
