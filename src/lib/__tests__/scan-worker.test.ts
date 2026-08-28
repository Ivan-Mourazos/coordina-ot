import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// El vigilante mira ficheros de verdad, así que el share se simula con una
// carpeta temporal: `RPS_PEDIDOS_PDF_DIR*` se lee al importar `pdf-pedido`, y
// por eso se fija ANTES del import dinámico.
let dir: string;
let share: string;
let worker: typeof import("../server/scan-worker");
let scanDb: typeof import("../server/scan-db");
let notasDb: typeof import("../server/notas-db");
let estado: typeof import("../server/estado-db");

/** Deja un PDF en el sitio donde lo buscaría la app, con el mtime que se pida. */
function ponerParte(codigo: string, mtimeMs: number) {
  const carpeta = path.join(share, "2026");
  mkdirSync(carpeta, { recursive: true });
  const f = path.join(carpeta, `${codigo}.pdf`);
  writeFileSync(f, "pdf de mentira");
  const seg = mtimeMs / 1000;
  utimesSync(f, seg, seg);
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-scanw-"));
  share = path.join(dir, "share");
  mkdirSync(share, { recursive: true });
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.RPS_PEDIDOS_PDF_DIR = share;
  process.env.RPS_PEDIDOS_PDF_DIR_WIN = share;
  estado = await import("../server/estado-db");
  scanDb = await import("../server/scan-db");
  notasDb = await import("../server/notas-db");
  worker = await import("../server/scan-worker");
});

afterAll(() => {
  worker.pararVigilanciaDePartes();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

beforeEach(() => {
  estado.getDb().prepare("DELETE FROM pedido_scan").run();
  estado.getDb().prepare("DELETE FROM nota_pedido").run();
});

const T1 = Date.UTC(2026, 7, 20, 10, 0, 0);
const T2 = Date.UTC(2026, 7, 24, 11, 4, 0);

test("el primer vistazo fija la referencia y NO deja nota", () => {
  ponerParte("AR.26.01829", T1);
  scanDb.registrarPedidos(["AR.26.01829"]);
  return worker.revisarUnaTanda().then((n) => {
    expect(n).toBe(0);
    expect(notasDb.leerNotas("AR.26.01829")).toEqual([]);
    expect(scanDb.pedidosCambiados()).toEqual(new Set());
  });
});

test("re-escanear deja UNA nota permanente y enciende el aviso", async () => {
  ponerParte("AR.26.01829", T1);
  scanDb.registrarPedidos(["AR.26.01829"]);
  await worker.revisarUnaTanda();

  ponerParte("AR.26.01829", T2);
  expect(await worker.revisarUnaTanda()).toBe(1);

  const notas = notasDb.leerNotas("AR.26.01829");
  expect(notas).toHaveLength(1);
  expect(notas[0].operarioId).toBe("sistema");
  expect(notas[0].texto).toContain("vuelto a escanear");
  expect(scanDb.pedidosCambiados()).toEqual(new Set(["AR.26.01829"]));

  // Vuelve a pasar sin que el fichero cambie: ni nota nueva ni aviso repetido.
  expect(await worker.revisarUnaTanda()).toBe(0);
  expect(notasDb.leerNotas("AR.26.01829")).toHaveLength(1);
});

test("la nota lleva la fecha del escaneo, no la de ahora", async () => {
  ponerParte("AR.26.01829", T1);
  scanDb.registrarPedidos(["AR.26.01829"]);
  await worker.revisarUnaTanda();
  ponerParte("AR.26.01829", T2);
  await worker.revisarUnaTanda();

  const d = new Date(T2);
  const esperado = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  expect(notasDb.leerNotas("AR.26.01829")[0].texto).toContain(esperado);
});

test("un pedido sin parte escaneado no avisa ni deja nota", async () => {
  scanDb.registrarPedidos(["AR.26.09999"]);
  expect(await worker.revisarUnaTanda()).toBe(0);
  expect(notasDb.leerNotas("AR.26.09999")).toEqual([]);
});

test("el trabajo interno no tiene parte: se mira y se deja en paz", async () => {
  // El código sintético de una OF suelta no pasa el patrón de pedido de venta,
  // así que `rutaPdfPedido` devuelve null y no se toca el disco.
  scanDb.registrarPedidos(["OF 0231158"]);
  expect(await worker.revisarUnaTanda()).toBe(0);
  expect(notasDb.leerNotas("OF 0231158")).toEqual([]);
});

test("el share que desaparece NO se lee como un re-escaneo al volver", async () => {
  ponerParte("AR.26.01829", T1);
  scanDb.registrarPedidos(["AR.26.01829"]);
  await worker.revisarUnaTanda();

  // Se cae el share: el fichero deja de verse.
  rmSync(path.join(share, "2026", "AR.26.01829.pdf"));
  expect(await worker.revisarUnaTanda()).toBe(0);

  // Vuelve, con el MISMO mtime de siempre. No es una novedad.
  ponerParte("AR.26.01829", T1);
  expect(await worker.revisarUnaTanda()).toBe(0);
  expect(notasDb.leerNotas("AR.26.01829")).toEqual([]);
});

test("la tanda respeta su tope y va rotando por los no revisados", async () => {
  ponerParte("AR.26.00001", T1);
  ponerParte("AR.26.00002", T1);
  ponerParte("AR.26.00003", T1);
  scanDb.registrarPedidos(["AR.26.00001", "AR.26.00002", "AR.26.00003"]);
  await worker.revisarUnaTanda(2);
  // Quedó uno sin mirar, y es el primero de la cola siguiente.
  expect(scanDb.pedidosParaRevisar(1)).toEqual(["AR.26.00003"]);
});

test("arrancar dos veces deja un solo temporizador", () => {
  worker.arrancarVigilanciaDePartes();
  expect(() => worker.arrancarVigilanciaDePartes()).not.toThrow();
  worker.pararVigilanciaDePartes();
});

test("un pedido sin parte cuenta como mirado y no atasca la cola", async () => {
  // Trabajo interno (sin parte que escanear) y un pedido cuyo parte todavía no
  // está: ninguno de los dos deja mtime, pero los dos se han mirado.
  scanDb.registrarPedidos(["OF 0231158", "AR.26.09999"]);
  ponerParte("AR.26.00001", T1);
  scanDb.registrarPedidos(["AR.26.00001"]);

  await worker.revisarUnaTanda(2);

  // Si los dos primeros se quedaran sin marcar, volverían a encabezar la cola
  // cada minuto y al tercero no le llegaría el turno nunca.
  expect(scanDb.pedidosParaRevisar(1)).toEqual(["AR.26.00001"]);
});

test("un segundo re-escaneo, con el aviso todavía sin ver, deja su propia nota", async () => {
  const T3 = Date.UTC(2026, 7, 25, 9, 30, 0);
  ponerParte("AR.26.01829", T1);
  scanDb.registrarPedidos(["AR.26.01829"]);
  await worker.revisarUnaTanda();

  ponerParte("AR.26.01829", T2);
  expect(await worker.revisarUnaTanda()).toBe(1);

  // Nadie ha dado por visto el aviso y vuelven a escanear el parte. Es una
  // segunda noticia: el registro permanente tiene que llevar las dos fechas,
  // que para eso la nota lleva la hora.
  ponerParte("AR.26.01829", T3);
  expect(await worker.revisarUnaTanda()).toBe(1);

  const notas = notasDb.leerNotas("AR.26.01829");
  expect(notas).toHaveLength(2);
  const d = new Date(T3);
  expect(notas[1].texto).toContain(`${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`);

  // Y sin cambio de fichero sigue sin repetirse.
  expect(await worker.revisarUnaTanda()).toBe(0);
  expect(notasDb.leerNotas("AR.26.01829")).toHaveLength(2);
});
