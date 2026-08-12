import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fichar, pausar, FICHAJE_VACIO } from "../fichaje";

let dir: string;
let db: typeof import("../server/fichaje-db");
let outbox: typeof import("../server/olanet-outbox");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-fdb-"));
  // Debe fijarse ANTES de importar: estado-db lee COORDINA_DB_PATH al cargar.
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  db = await import("../server/fichaje-db");
  outbox = await import("../server/olanet-outbox");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows: better-sqlite3 mantiene el handle del fichero WAL abierto
    // (globalThis.__coordinaDb se cachea a propósito para reuso en HMR), así
    // que borrar el directorio temporal puede dar EPERM aquí. Limpieza best
    // effort: el SO recicla el temp dir igualmente; no afecta a las aserciones.
  }
});

test("round-trip: guarda y lee el fichaje de un operario", () => {
  const t0 = "2026-07-22T08:00:00.000Z";
  const t1 = "2026-07-22T08:10:00.000Z";
  let f = fichar(FICHAJE_VACIO, ["OF-1"], "plantear", "op-1", t0);
  f = pausar(f, t1); // un intervalo cerrado de 10 min
  db.guardarFichaje("op-1", f);

  const leido = db.leerFichaje("op-1");
  expect(leido.intervalos).toHaveLength(1);
  expect(leido.intervalos[0]).toMatchObject({
    ofIds: ["OF-1"], rol: "plantear", operarioId: "op-1", inicio: t0, fin: t1,
  });
});

test("guardarFichaje reemplaza los intervalos previos de ese operario", () => {
  const f1 = fichar(FICHAJE_VACIO, ["OF-1"], "plantear", "op-2", "2026-07-22T09:00:00.000Z");
  db.guardarFichaje("op-2", f1);
  const f2 = fichar(FICHAJE_VACIO, ["OF-9"], "revisar", "op-2", "2026-07-22T10:00:00.000Z");
  db.guardarFichaje("op-2", f2);

  const leido = db.leerFichaje("op-2");
  expect(leido.intervalos).toHaveLength(1);
  expect(leido.intervalos[0].ofIds).toEqual(["OF-9"]);
  expect(leido.intervalos[0].fin).toBeNull(); // sigue abierto
});

test("leerTodosIntervalos junta a todos los operarios", () => {
  db.guardarFichaje("op-3", fichar(FICHAJE_VACIO, ["OF-5"], "plantear", "op-3", "2026-07-22T11:00:00.000Z"));
  const todos = db.leerTodosIntervalos();
  const ops = new Set(todos.map((i) => i.operarioId));
  expect(ops.has("op-3")).toBe(true);
});

test("conserva el orden de un historial multi-intervalo con el último abierto", () => {
  let f = fichar(FICHAJE_VACIO, ["OF-1"], "plantear", "op-4", "2026-07-22T08:00:00.000Z");
  f = pausar(f, "2026-07-22T08:10:00.000Z"); // cerrado 1
  f = fichar(f, ["OF-2"], "plantear", "op-4", "2026-07-22T08:20:00.000Z");
  f = pausar(f, "2026-07-22T08:25:00.000Z"); // cerrado 2
  f = fichar(f, ["OF-3"], "revisar", "op-4", "2026-07-22T08:30:00.000Z"); // abierto
  db.guardarFichaje("op-4", f);

  const leido = db.leerFichaje("op-4");
  expect(leido.intervalos).toHaveLength(3);
  expect(leido.intervalos.map((i) => i.ofIds[0])).toEqual(["OF-1", "OF-2", "OF-3"]);
  expect(leido.intervalos[2].fin).toBeNull(); // el último sigue abierto
});

test("guardado incremental: la historia previa no se pierde al crecer la lista", () => {
  // Simula la secuencia real de POSTs: la lista crece y solo cambia su cola.
  let f = fichar(FICHAJE_VACIO, ["OF-A"], "plantear", "op-5", "2026-07-22T08:00:00.000Z");
  db.guardarFichaje("op-5", f); // 1 abierto
  f = pausar(f, "2026-07-22T08:30:00.000Z");
  db.guardarFichaje("op-5", f); // el mismo, ya cerrado
  f = fichar(f, ["OF-B"], "revisar", "op-5", "2026-07-22T09:00:00.000Z");
  db.guardarFichaje("op-5", f); // + uno nuevo abierto

  const leido = db.leerFichaje("op-5");
  expect(leido.intervalos).toHaveLength(2);
  // El primero conserva su cierre: el upsert lo actualizó, no lo duplicó.
  expect(leido.intervalos[0]).toMatchObject({
    ofIds: ["OF-A"], rol: "plantear", fin: "2026-07-22T08:30:00.000Z",
  });
  expect(leido.intervalos[1]).toMatchObject({ ofIds: ["OF-B"], rol: "revisar", fin: null });
});

test("guardado incremental: guardar dos veces lo mismo no duplica filas", () => {
  let f = fichar(FICHAJE_VACIO, ["OF-C"], "plantear", "op-6", "2026-07-22T10:00:00.000Z");
  f = pausar(f, "2026-07-22T10:15:00.000Z");
  db.guardarFichaje("op-6", f);
  db.guardarFichaje("op-6", f);
  expect(db.leerFichaje("op-6").intervalos).toHaveLength(1);
});

test("guardarFichaje registra latido: un intervalo recién abierto nunca se queda sin latido", () => {
  const f = fichar(FICHAJE_VACIO, ["OF-G"], "plantear", "op-8", "2026-07-22T13:00:00.000Z");
  db.guardarFichaje("op-8", f);
  expect(db.leerUltimoLatido("op-8")).not.toBeNull();
});

test("registrarLatido/leerUltimoLatido: round-trip, y null si nunca se registró", () => {
  expect(db.leerUltimoLatido("op-sin-latido")).toBeNull();
  db.registrarLatido("op-9", "2026-07-22T14:00:00.000Z");
  expect(db.leerUltimoLatido("op-9")).toBe("2026-07-22T14:00:00.000Z");
  db.registrarLatido("op-9", "2026-07-22T14:05:00.000Z"); // upsert, no duplica
  expect(db.leerUltimoLatido("op-9")).toBe("2026-07-22T14:05:00.000Z");
});

test("el aviso de cierre sobrevive a leerlo: solo lo borra el acuse del cliente", () => {
  expect(db.leerAvisoCierre("op-10")).toBeNull();
  db.registrarAvisoCierre("op-10", ["OF-H"], "2026-07-22T15:00:00.000Z");
  const esperado = { ofIds: ["OF-H"], fin: "2026-07-22T15:00:00.000Z" };
  expect(db.leerAvisoCierre("op-10")).toEqual(esperado);
  // Leerlo NO lo consume: si se borrara aquí, bastaría con que la respuesta se
  // perdiera para que el técnico nunca se enterase de que le cerraron el fichaje.
  expect(db.leerAvisoCierre("op-10")).toEqual(esperado);

  db.marcarAvisoCierreVisto("op-10");
  expect(db.leerAvisoCierre("op-10")).toBeNull();
});

test("si llegan menos intervalos de los guardados, se reescribe entero", () => {
  let f = fichar(FICHAJE_VACIO, ["OF-D"], "plantear", "op-7", "2026-07-22T11:00:00.000Z");
  f = pausar(f, "2026-07-22T11:10:00.000Z");
  f = fichar(f, ["OF-E"], "plantear", "op-7", "2026-07-22T11:20:00.000Z");
  db.guardarFichaje("op-7", f); // 2 intervalos

  const corto = fichar(FICHAJE_VACIO, ["OF-F"], "revisar", "op-7", "2026-07-22T12:00:00.000Z");
  db.guardarFichaje("op-7", corto);

  const leido = db.leerFichaje("op-7");
  expect(leido.intervalos).toHaveLength(1);
  expect(leido.intervalos[0].ofIds).toEqual(["OF-F"]);
});

test("cortarFichajeDeOF cierra el fichaje de OTRO operario y respeta el resto de OFs", () => {
  // Tamara ficha dos OFs a la vez; se traspasa solo una.
  const f = fichar(FICHAJE_VACIO, ["OF-T1", "OF-T2"], "plantear", "tamara", "2026-08-05T09:00:00.000Z");
  db.guardarFichaje("tamara", f);

  const afectados = db.cortarFichajeDeOF("OF-T1", "2026-08-05T09:30:00.000Z");
  expect(afectados).toEqual(["tamara"]);

  const guardado = db.leerFichaje("tamara");
  // El tramo compartido se cierra a las 09:30 y se abre otro solo con OF-T2:
  // si se borrase el intervalo, se perdería el tiempo de la que sigue siendo suya.
  expect(guardado.intervalos).toHaveLength(2);
  expect(guardado.intervalos[0].fin).toBe("2026-08-05T09:30:00.000Z");
  expect(guardado.intervalos[0].ofIds).toEqual(["OF-T1", "OF-T2"]);
  expect(guardado.intervalos[1].fin).toBeNull();
  expect(guardado.intervalos[1].ofIds).toEqual(["OF-T2"]);
});

test("cortarFichajeDeOF con la única OF del intervalo deja el fichaje parado", () => {
  const f = fichar(FICHAJE_VACIO, ["OF-U1"], "revisar", "jaime", "2026-08-05T10:00:00.000Z");
  db.guardarFichaje("jaime", f);

  expect(db.cortarFichajeDeOF("OF-U1", "2026-08-05T10:20:00.000Z")).toEqual(["jaime"]);
  const guardado = db.leerFichaje("jaime");
  expect(guardado.intervalos).toHaveLength(1);
  expect(guardado.intervalos[0].fin).toBe("2026-08-05T10:20:00.000Z");
});

test("cortarFichajeDeOF no toca a quien no la está fichando", () => {
  const f = fichar(FICHAJE_VACIO, ["OF-V1"], "plantear", "adrian", "2026-08-05T11:00:00.000Z");
  db.guardarFichaje("adrian", f);

  expect(db.cortarFichajeDeOF("OF-QUE-NADIE-FICHA", "2026-08-05T11:10:00.000Z")).toEqual([]);
  expect(db.leerFichaje("adrian").intervalos[0].fin).toBeNull();
});

// Defecto 1 (Critical): si la OF traspasada era la única abierta de ese
// operario, el tramo se cerraba en SQLite pero nunca se encolaba hacia
// OLANET. Como cerrarFichajesSinLatido solo vigila intervalos ABIERTOS, si el
// operario no vuelve a fichar ese tiempo no sube nunca. El id de OF usa el
// formato "orden:numope" (ver partirOfId en lib/bonos.ts) y "angel" es un
// operario real de COD_RPS_POR_OPERARIO: sin esa forma bonosDe/eventosFaseDe
// no producen ninguna fila y el test no distinguiría el defecto de un dato
// mal formado.
test("cortarFichajeDeOF encola el tramo cerrado hacia OLANET", () => {
  const antes = outbox.leerPendientes().length;
  const f = fichar(FICHAJE_VACIO, ["0230700:5"], "plantear", "angel", "2026-08-05T12:00:00.000Z");
  db.guardarFichaje("angel", f);

  db.cortarFichajeDeOF("0230700:5", "2026-08-05T12:30:00.000Z");

  // Nota: en la cola los eventos "bono" llevan el CÓDIGO RPS del operario en
  // operarioId (así los deriva bonosDe), no el id del tablero — por eso se
  // localiza por el número de OF, igual que hace olanet-worker.test.ts.
  const pendientes = outbox.leerPendientes();
  expect(pendientes.length).toBeGreaterThan(antes);
  const bono = pendientes.find((p) => p.tipo === "bono" && p.datos.of === "0230700");
  expect(bono).toBeDefined();
});

// Defecto 2 (Important): guardarFichaje registra un latido porque, en el
// resto de caminos, guardar prueba que la pestaña del operario está viva.
// Aquí el guardado lo provoca OTRA persona al traspasar la OF, y "ivan" (el
// afectado) puede tener el navegador cerrado. Si se le registrase un latido,
// tendría una prueba de vida que no ha dado y cerrarFichajesSinLatido
// tardaría hasta 5 min más en cerrar una sesión ya muerta.
test("cortarFichajeDeOF no fabrica un latido del operario cortado", () => {
  const f = fichar(FICHAJE_VACIO, ["0230800:2"], "plantear", "ivan", "2026-08-05T13:00:00.000Z");
  db.guardarFichaje("ivan", f); // este SÍ es un guardado del propio ivan: registra latido
  const latidoTrasFichar = db.leerUltimoLatido("ivan");
  expect(latidoTrasFichar).not.toBeNull();

  db.cortarFichajeDeOF("0230800:2", "2026-08-05T13:10:00.000Z");

  expect(db.leerUltimoLatido("ivan")).toBe(latidoTrasFichar);
});

// Preparación para cuando el fichaje suba de verdad a RPS (modo `activo`): un
// tramo ya traspasado lo cuenta RPS, así que deja de contarlo CoordinaOT. Si
// siguiera sumándose aquí, el mismo trabajo aparecería dos veces.
test("un tramo traspasado deja de contar, pero no se pierde del fichaje", () => {
  const t0 = "2026-08-06T08:00:00.000Z";
  let f = fichar(FICHAJE_VACIO, ["0230900:5"], "plantear", "tamara", t0);
  f = pausar(f, "2026-08-06T08:20:00.000Z");
  db.guardarFichaje("tamara", f);

  const suyos = () =>
    db.leerTodosIntervalos().filter((iv) => iv.operarioId === "tamara");
  expect(suyos()).toHaveLength(1);

  expect(db.marcarTraspasados([{ operarioId: "tamara", inicio: t0 }])).toBe(1);
  expect(suyos()).toHaveLength(0);

  // El motor de fichaje sigue viéndolo: es su histórico, y la marca de la cola
  // (olanet_watermark) cuenta posiciones sobre esa lista completa.
  expect(db.leerFichaje("tamara").intervalos).toHaveLength(1);

  // Sellar dos veces no cuenta doble ni revive nada.
  expect(db.marcarTraspasados([{ operarioId: "tamara", inicio: t0 }])).toBe(0);
});
