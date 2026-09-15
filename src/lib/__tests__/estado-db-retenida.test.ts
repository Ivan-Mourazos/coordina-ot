import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let db: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-retenida-"));
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

test("guardarMutacion escribe y borra la marca cerradaRps en of_overlay", () => {
  db.guardarMutacion({
    operarioId: "ivan",
    motivo: "cerrar_en_rps",
    cambiosOF: [{
      ofId: "0232086:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null,
      cerradaRps: { at: "2026-09-15T11:42:00.000Z", por: "ivan", modo: "activo" },
    }],
  });
  expect(db.leerOverlay("ot").ofs.get("0232086:9")?.cerradaRps).toEqual({ at: "2026-09-15T11:42:00.000Z", por: "ivan", modo: "activo" });

  db.guardarMutacion({
    operarioId: "tamara",
    motivo: "volver_a_plantear",
    cambiosOF: [{
      ofId: "0232086:9", autorId: "ivan", revisorId: null, estado: "en_curso", observacion: null,
      cerradaRps: null,
    }],
  });
  expect(db.leerOverlay("ot").ofs.get("0232086:9")?.cerradaRps).toBeUndefined();
});

test("un CambioOF sin cerradaRps (compatibilidad) no toca la marca existente", () => {
  db.guardarMutacion({
    operarioId: "ivan",
    motivo: "cerrar_en_rps",
    cambiosOF: [{
      ofId: "0232090:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null,
      cerradaRps: { at: "2026-09-15T12:00:00.000Z", por: "ivan", modo: "ensayo" },
    }],
  });
  // Antigua llamada, sin el campo: escribe NULL (sin marca). Es el
  // comportamiento correcto para cualquier acción normal, que siempre manda
  // el snapshot COMPLETO de la OF — si de verdad quería conservar la marca,
  // tenía que incluirla, igual que con autorId o estado.
  db.guardarMutacion({
    operarioId: "ivan",
    motivo: "asignar",
    cambiosOF: [{ ofId: "0232090:9", autorId: "jaime", revisorId: null, estado: "en_curso", observacion: null }],
  });
  expect(db.leerOverlay("ot").ofs.get("0232090:9")?.cerradaRps).toBeUndefined();
});

test("of_retenida: se marca, se lee por sección y se borra", () => {
  db.guardarMutacion({
    operarioId: "ivan",
    motivo: "cerrar_en_rps",
    seccion: "ot",
    cambiosOF: [{ ofId: "0232086:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null, cerradaRps: { at: "x", por: "ivan", modo: "activo" } }],
    ofRetenida: { ofId: "0232086:9", pedido: "AR.26.04351", motivo: "cerrada", por: "ivan", at: "2026-09-15T11:42:00.000Z" },
  });
  expect(db.leerOfsRetenidas("ot")).toEqual([
    { ofId: "0232086:9", pedido: "AR.26.04351", motivo: "cerrada", por: "ivan", at: "2026-09-15T11:42:00.000Z" },
  ]);
  expect(db.leerOfsRetenidas("diseno")).toEqual([]);

  db.guardarMutacion({
    operarioId: "tamara",
    motivo: "volver_a_plantear",
    cambiosOF: [{ ofId: "0232086:9", autorId: "ivan", revisorId: null, estado: "en_curso", observacion: null, cerradaRps: null }],
    quitarRetenida: ["0232086:9"],
  });
  expect(db.leerOfsRetenidas("ot")).toEqual([]);
});

test("of_retenida: varias filas de golpe, y pasar el pedido borra las de su sección", () => {
  db.guardarMutacion({
    operarioId: "tamara",
    motivo: "recuperar_pedido",
    seccion: "ot",
    ofRetenida: [
      { ofId: "0232200:2", pedido: "AR.26.05000", motivo: "recuperada", por: "tamara", at: "2026-09-15T09:00:00.000Z" },
      { ofId: "0232201:5", pedido: "AR.26.05000", motivo: "del_pedido", por: "tamara", at: "2026-09-15T09:00:00.000Z" },
    ],
  });
  expect(db.leerOfsRetenidas("ot").filter((r) => r.pedido === "AR.26.05000")).toHaveLength(2);

  db.guardarMutacion({
    operarioId: "tamara",
    motivo: "completar",
    completarPedidoId: "AR.26.05000",
    seccion: "ot",
    ofIdsPedido: ["0232200:2", "0232201:5"],
  });
  expect(db.leerOfsRetenidas("ot").filter((r) => r.pedido === "AR.26.05000")).toEqual([]);
});

test("cerrar en RPS cierra la revisión: se borra lo comprobado de esa OF", () => {
  db.marcarPuntoRevision(["0232099:9"], 1, "ok", "tamara");
  expect(db.leerMarcasRevision(["0232099:9"])["0232099:9"]).toBeDefined();
  db.guardarMutacion({
    operarioId: "ivan",
    motivo: "cerrar_en_rps",
    cambiosOF: [{
      ofId: "0232099:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null,
      cerradaRps: { at: "2026-09-15T11:42:00.000Z", por: "ivan", modo: "activo" },
    }],
  });
  expect(db.leerMarcasRevision(["0232099:9"])).toEqual({});
});
