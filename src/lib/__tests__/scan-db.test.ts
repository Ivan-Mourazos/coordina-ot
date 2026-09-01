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
  db.anotarVistazo("AR.1", { mtimeMs: 1000, huella: "h1000" }, "2026-08-24T09:05:00.000Z");
  db.anotarVistazo("AR.1", { mtimeMs: 2000, huella: "h2000" }, "2026-08-24T09:10:00.000Z");
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
  expect(db.anotarVistazo("AR.1", { mtimeMs: 1000, huella: "h1000" }, "2026-08-24T09:05:00.000Z")).toBe(false);
  expect(db.pedidosCambiados()).toEqual(new Set());
});

test("un parte más nuevo estrena aviso, y una sola vez", () => {
  db.registrarPedidos(["AR.1"], "2026-08-24T09:00:00.000Z");
  db.anotarVistazo("AR.1", { mtimeMs: 1000, huella: "h1000" }, "2026-08-24T09:05:00.000Z");
  // Estrena: aquí es donde el vigilante escribe la nota del hilo.
  expect(db.anotarVistazo("AR.1", { mtimeMs: 2000, huella: "h2000" }, "2026-08-24T10:00:00.000Z")).toBe(true);
  // Vuelve a mirar y sigue igual: NO se repite la nota.
  expect(db.anotarVistazo("AR.1", { mtimeMs: 2000, huella: "h2000" }, "2026-08-24T10:30:00.000Z")).toBe(false);
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
  db.anotarVistazo("AR.1", { mtimeMs: 1000, huella: "h1000" }, "2026-08-24T09:05:00.000Z");
  expect(db.anotarVistazo("AR.1", { mtimeMs: 2000, huella: "h2000" }, "2026-08-24T10:00:00.000Z")).toBe(true);
  expect(db.anotarVistazo("AR.1", { mtimeMs: 3000, huella: "h3000" }, "2026-08-24T11:00:00.000Z")).toBe(true);
  expect(db.pedidosCambiados()).toEqual(new Set(["AR.1"]));

  // Y sin fichero nuevo sigue sin repetirse: lo que estrena nota es que el
  // parte cambie, no que se pase por él.
  expect(db.anotarVistazo("AR.1", { mtimeMs: 3000, huella: "h3000" }, "2026-08-24T11:30:00.000Z")).toBe(false);
});

test("tras dar por visto, un escaneo posterior vuelve a avisar", () => {
  db.registrarPedidos(["AR.1"], "2026-08-24T09:00:00.000Z");
  db.anotarVistazo("AR.1", { mtimeMs: 1000, huella: "h1000" }, "2026-08-24T09:05:00.000Z");
  db.anotarVistazo("AR.1", { mtimeMs: 2000, huella: "h2000" }, "2026-08-24T10:00:00.000Z");
  expect(db.marcarVisto("AR.1", "2026-08-24T10:15:00.000Z")).toBe(true);
  expect(db.pedidosCambiados()).toEqual(new Set());
  expect(db.anotarVistazo("AR.1", { mtimeMs: 3000, huella: "h3000" }, "2026-08-24T12:00:00.000Z")).toBe(true);
  expect(db.pedidosCambiados()).toEqual(new Set(["AR.1"]));
});

test("restaurar una copia vieja del share SÍ avisa", () => {
  // Antes se comparaban mtimes y un fichero que "rejuvenecía" se ignoraba.
  // Comparando contenido eso cambia, y para bien: si en el share vuelve a
  // haber el parte de antes, quien lo lea NO está leyendo el que leyó ayer, y
  // tiene que saberlo. Es un cambio como cualquier otro.
  db.registrarPedidos(["AR.1"], "2026-08-24T09:00:00.000Z");
  db.anotarVistazo("AR.1", { mtimeMs: 2000, huella: "nueva" }, "2026-08-24T09:05:00.000Z");
  expect(
    db.anotarVistazo("AR.1", { mtimeMs: 1000, huella: "vieja" }, "2026-08-24T10:00:00.000Z"),
  ).toBe(true);
  expect(db.pedidosCambiados()).toEqual(new Set(["AR.1"]));
});

test("sin PDF no se toca la referencia, solo se apunta que se miró", () => {
  // El share caído no puede hacer que, al volver, el fichero de siempre
  // parezca recién escaneado.
  db.registrarPedidos(["AR.1"], "2026-08-24T09:00:00.000Z");
  db.anotarVistazo("AR.1", { mtimeMs: 1000, huella: "h1000" }, "2026-08-24T09:05:00.000Z");
  expect(db.anotarVistazo("AR.1", { mtimeMs: null, huella: null }, "2026-08-24T10:00:00.000Z")).toBe(false);
  expect(db.anotarVistazo("AR.1", { mtimeMs: 1000, huella: "h1000" }, "2026-08-24T11:00:00.000Z")).toBe(false);
  expect(db.pedidosCambiados()).toEqual(new Set());
});

test("anotar sobre un pedido que no se vigila no hace nada", () => {
  expect(db.anotarVistazo("AR.NO.EXISTE", { mtimeMs: 1000, huella: "h1000" }, "2026-08-24T09:00:00.000Z")).toBe(false);
});

test("dar por visto un pedido sin PDF mirado devuelve false", () => {
  db.registrarPedidos(["AR.1"], "2026-08-24T09:00:00.000Z");
  expect(db.marcarVisto("AR.1", "2026-08-24T09:30:00.000Z")).toBe(false);
});

test("al que nunca se miró le toca antes que al ya revisado", () => {
  db.registrarPedidos(["AR.1", "AR.2"], "2026-08-24T09:00:00.000Z");
  db.anotarVistazo("AR.1", { mtimeMs: 1000, huella: "h1000" }, "2026-08-24T09:05:00.000Z");
  expect(db.pedidosParaRevisar(1)).toEqual(["AR.2"]);
});

test("entre revisados, el más antiguo va primero", () => {
  db.registrarPedidos(["AR.1", "AR.2"], "2026-08-24T09:00:00.000Z");
  db.anotarVistazo("AR.1", { mtimeMs: 1000, huella: "h1000" }, "2026-08-24T10:00:00.000Z");
  db.anotarVistazo("AR.2", { mtimeMs: 1000, huella: "h1000" }, "2026-08-24T09:30:00.000Z");
  expect(db.pedidosParaRevisar(2)).toEqual(["AR.2", "AR.1"]);
});

test("el tope de la lista se respeta", () => {
  db.registrarPedidos(["AR.1", "AR.2", "AR.3"], "2026-08-24T09:00:00.000Z");
  expect(db.pedidosParaRevisar(2)).toHaveLength(2);
});

test("el share re-copiando el MISMO parte no avisa ni escribe nota", () => {
  // El caso real (AR.26.03891, 1/9/2026). El share tiene un proceso que
  // re-copia los partes cada media hora, y copiar rehace el mtime aunque el
  // fichero sea idéntico: nueve falsas alarmas en una mañana, nueve notas en
  // el hilo y la campana encendida sin que nadie hubiera tocado el parte.
  db.registrarPedidos(["AR.1"], "2026-09-01T06:00:00.000Z");
  db.anotarVistazo("AR.1", { mtimeMs: 1000, huella: "mismo" }, "2026-09-01T06:30:00.000Z");

  for (const mtime of [2000, 3000, 4000, 5000]) {
    expect(
      db.anotarVistazo("AR.1", { mtimeMs: mtime, huella: "mismo" }, "2026-09-01T07:00:00.000Z"),
    ).toBe(false);
  }
  expect(db.pedidosCambiados()).toEqual(new Set());
});

test("con el aviso puesto, re-copiar el mismo fichero NO lo apaga", () => {
  // La trampa de arreglar esto por las bravas: si al ver "contenido igual" se
  // diera el parte por visto, la copia de las 12:30 apagaría el aviso legítimo
  // del escaneo de las 12:00 antes de que nadie lo leyera.
  db.registrarPedidos(["AR.1"], "2026-09-01T06:00:00.000Z");
  db.anotarVistazo("AR.1", { mtimeMs: 1000, huella: "vieja" }, "2026-09-01T06:30:00.000Z");
  expect(
    db.anotarVistazo("AR.1", { mtimeMs: 2000, huella: "nueva" }, "2026-09-01T10:00:00.000Z"),
  ).toBe(true);

  // El share la re-copia sin tocarla: el aviso sigue encendido.
  db.anotarVistazo("AR.1", { mtimeMs: 3000, huella: "nueva" }, "2026-09-01T10:30:00.000Z");
  expect(db.pedidosCambiados()).toEqual(new Set(["AR.1"]));
});

test("sin huella no se mueve la referencia: un fichero ilegible no es noticia", () => {
  // El mtime cambió pero el PDF no se pudo leer (share a medias, VPN dormida).
  // No se sabe si hay noticia, así que no se inventa ninguna.
  db.registrarPedidos(["AR.1"], "2026-09-01T06:00:00.000Z");
  db.anotarVistazo("AR.1", { mtimeMs: 1000, huella: "vieja" }, "2026-09-01T06:30:00.000Z");
  expect(
    db.anotarVistazo("AR.1", { mtimeMs: 2000, huella: null }, "2026-09-01T07:00:00.000Z"),
  ).toBe(false);
  expect(db.pedidosCambiados()).toEqual(new Set());

  // Y cuando por fin se lee, la noticia sale entera.
  expect(
    db.anotarVistazo("AR.1", { mtimeMs: 2000, huella: "nueva" }, "2026-09-01T07:30:00.000Z"),
  ).toBe(true);
});

test("mtimeConocido dice si hace falta volver a leer el fichero", () => {
  db.registrarPedidos(["AR.1"], "2026-09-01T06:00:00.000Z");
  expect(db.mtimeConocido("AR.1")).toBeNull();
  db.anotarVistazo("AR.1", { mtimeMs: 1000, huella: "x" }, "2026-09-01T06:30:00.000Z");
  expect(db.mtimeConocido("AR.1")).toBe(1000);
  expect(db.mtimeConocido("AR.NO.EXISTE")).toBeNull();
});
