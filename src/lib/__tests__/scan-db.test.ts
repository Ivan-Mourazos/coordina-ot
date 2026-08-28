import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let db: typeof import("../server/scan-db");
let estado: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-scan-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  estado = await import("../server/estado-db");
  db = await import("../server/scan-db");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

beforeEach(() => {
  estado.getDb().prepare("DELETE FROM pedido_scan").run();
});

test("un pedido registrado entra en la lista de vigilados", () => {
  db.registrarPedidos(["AR.26.01829"], "2026-08-24T09:00:00.000Z");
  expect(db.pedidosParaRevisar(10)).toEqual(["AR.26.01829"]);
});

test("registrar dos veces NO pisa lo que ya se sabía", () => {
  // Es el caso real: getTablero registra los mismos pedidos cada 30 s. Si el
  // segundo registro borrase las marcas, el aviso no se apagaría jamás.
  db.registrarPedidos(["AR.1"], "2026-08-24T09:00:00.000Z");
  db.anotarMtime("AR.1", 1000, "2026-08-24T09:05:00.000Z");
  db.anotarMtime("AR.1", 2000, "2026-08-24T09:10:00.000Z");
  db.registrarPedidos(["AR.1"], "2026-08-24T09:15:00.000Z");
  expect(db.pedidosCambiados()).toEqual(new Set(["AR.1"]));
});

test("registrar una lista vacía no revienta", () => {
  expect(() => db.registrarPedidos([])).not.toThrow();
});

test("el PRIMER vistazo fija la referencia y no avisa", () => {
  // El día del despliegue se registran de golpe los pedidos vivos: si el primer
  // vistazo contara como cambio, saltarían todos los avisos a la vez.
  db.registrarPedidos(["AR.1"], "2026-08-24T09:00:00.000Z");
  expect(db.anotarMtime("AR.1", 1000, "2026-08-24T09:05:00.000Z")).toBe(false);
  expect(db.pedidosCambiados()).toEqual(new Set());
});

test("un parte más nuevo estrena aviso, y una sola vez", () => {
  db.registrarPedidos(["AR.1"], "2026-08-24T09:00:00.000Z");
  db.anotarMtime("AR.1", 1000, "2026-08-24T09:05:00.000Z");
  // Estrena: aquí es donde el vigilante escribe la nota del hilo.
  expect(db.anotarMtime("AR.1", 2000, "2026-08-24T10:00:00.000Z")).toBe(true);
  // Vuelve a mirar y sigue igual: NO se repite la nota.
  expect(db.anotarMtime("AR.1", 2000, "2026-08-24T10:30:00.000Z")).toBe(false);
  expect(db.pedidosCambiados()).toEqual(new Set(["AR.1"]));
});

test("re-escanear OTRA vez con el aviso ya puesto SÍ estrena nota nueva", () => {
  // Antes devolvía false aquí, y el efecto era que la nota del hilo —el
  // registro permanente que se pidió— se quedaba solo con la fecha del PRIMER
  // escaneo. Los siguientes desaparecían sin dejar rastro mientras nadie diera
  // el aviso por visto.
  //
  // Que son dos noticias distintas ya lo daba por hecho el propio texto de la
  // nota, que lleva la hora justamente para poder distinguir dos escaneos del
  // mismo día (ver `textoNotaReescaneo`).
  //
  // El distintivo del tablero no cambia: sigue encendido una sola vez, porque
  // lo pinta `pedidosCambiados()` contra `mtime_visto`. Lo que se arregla es
  // el hilo, no el aviso.
  db.registrarPedidos(["AR.1"], "2026-08-24T09:00:00.000Z");
  db.anotarMtime("AR.1", 1000, "2026-08-24T09:05:00.000Z");
  expect(db.anotarMtime("AR.1", 2000, "2026-08-24T10:00:00.000Z")).toBe(true);
  expect(db.anotarMtime("AR.1", 3000, "2026-08-24T11:00:00.000Z")).toBe(true);
  expect(db.pedidosCambiados()).toEqual(new Set(["AR.1"]));

  // Y sin fichero nuevo sigue sin repetirse: lo que estrena nota es que el
  // parte cambie, no que se pase por él.
  expect(db.anotarMtime("AR.1", 3000, "2026-08-24T11:30:00.000Z")).toBe(false);
});

test("tras dar por visto, un escaneo posterior vuelve a avisar", () => {
  db.registrarPedidos(["AR.1"], "2026-08-24T09:00:00.000Z");
  db.anotarMtime("AR.1", 1000, "2026-08-24T09:05:00.000Z");
  db.anotarMtime("AR.1", 2000, "2026-08-24T10:00:00.000Z");
  expect(db.marcarVisto("AR.1", "2026-08-24T10:15:00.000Z")).toBe(true);
  expect(db.pedidosCambiados()).toEqual(new Set());
  expect(db.anotarMtime("AR.1", 3000, "2026-08-24T12:00:00.000Z")).toBe(true);
  expect(db.pedidosCambiados()).toEqual(new Set(["AR.1"]));
});

test("un mtime MENOR no avisa: el fichero no rejuvenece", () => {
  // Pasa al restaurar una copia de seguridad del share.
  db.registrarPedidos(["AR.1"], "2026-08-24T09:00:00.000Z");
  db.anotarMtime("AR.1", 2000, "2026-08-24T09:05:00.000Z");
  expect(db.anotarMtime("AR.1", 1000, "2026-08-24T10:00:00.000Z")).toBe(false);
  expect(db.pedidosCambiados()).toEqual(new Set());
});

test("sin PDF no se toca la referencia, solo se apunta que se miró", () => {
  // El share caído no puede hacer que, al volver, el fichero de siempre
  // parezca recién escaneado.
  db.registrarPedidos(["AR.1"], "2026-08-24T09:00:00.000Z");
  db.anotarMtime("AR.1", 1000, "2026-08-24T09:05:00.000Z");
  expect(db.anotarMtime("AR.1", null, "2026-08-24T10:00:00.000Z")).toBe(false);
  expect(db.anotarMtime("AR.1", 1000, "2026-08-24T11:00:00.000Z")).toBe(false);
  expect(db.pedidosCambiados()).toEqual(new Set());
});

test("anotar sobre un pedido que no se vigila no hace nada", () => {
  expect(db.anotarMtime("AR.NO.EXISTE", 1000, "2026-08-24T09:00:00.000Z")).toBe(false);
});

test("dar por visto un pedido sin PDF mirado devuelve false", () => {
  db.registrarPedidos(["AR.1"], "2026-08-24T09:00:00.000Z");
  expect(db.marcarVisto("AR.1", "2026-08-24T09:30:00.000Z")).toBe(false);
});

test("al que nunca se miró le toca antes que al ya revisado", () => {
  db.registrarPedidos(["AR.1", "AR.2"], "2026-08-24T09:00:00.000Z");
  db.anotarMtime("AR.1", 1000, "2026-08-24T09:05:00.000Z");
  expect(db.pedidosParaRevisar(1)).toEqual(["AR.2"]);
});

test("entre revisados, el más antiguo va primero", () => {
  db.registrarPedidos(["AR.1", "AR.2"], "2026-08-24T09:00:00.000Z");
  db.anotarMtime("AR.1", 1000, "2026-08-24T10:00:00.000Z");
  db.anotarMtime("AR.2", 1000, "2026-08-24T09:30:00.000Z");
  expect(db.pedidosParaRevisar(2)).toEqual(["AR.2", "AR.1"]);
});

test("el tope de la lista se respeta", () => {
  db.registrarPedidos(["AR.1", "AR.2", "AR.3"], "2026-08-24T09:00:00.000Z");
  expect(db.pedidosParaRevisar(2)).toHaveLength(2);
});
