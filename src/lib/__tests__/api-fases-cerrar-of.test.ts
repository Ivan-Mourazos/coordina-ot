import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// OLANET se simula por completo: se comprueba el ORDEN (corte → drenado → 3)
// y que no se escribe cuando no debe, nunca la conexión real.
const fasesDeOFs = vi.fn();
const finalizarFase = vi.fn();
// Lo que usa el worker al vaciar la cola. Por defecto `insertarBono` falla
// (OLANET no contesta): así un tramo encolado se queda pendiente, que es lo
// que prueban los tests del corte. `llamadas` guarda el ORDEN de todo.
const insertarBono = vi.fn();
const moverFase = vi.fn();
const llamadas: string[] = [];
vi.mock("@/lib/server/olanet", () => ({
  fasesDeOFs: (ofs: string[]) => fasesDeOFs(ofs),
  finalizarFase: (o: unknown) => { llamadas.push("finalizarFase"); return finalizarFase(o); },
  insertarBono: (b: unknown) => { llamadas.push("insertarBono"); return insertarBono(b); },
  moverFase: (o: unknown) => { llamadas.push("moverFase"); return moverFase(o); },
  buscarIdBoletin: async () => "900",
  estadoDeFase: async () => 2,
}));
vi.mock("@/lib/server/operarios", () => ({
  COD_RPS_POR_OPERARIO: { ivan: "195", tamara: "180" },
  // Lo usa `encolarFichaje` al derivar las líneas de tiempo; sin él, el corte
  // no encolaría nada y el test del orden no probaría lo que dice.
  MAQUINA_POR_OPERARIO: {},
  seccionDeOperario: () => "ot",
}));

let dir: string;
let ruta: typeof import("../../app/api/fases/cerrar-of/route");
let estadoDb: typeof import("../server/estado-db");
let fichajeDb: typeof import("../server/fichaje-db");
let outbox: typeof import("../server/olanet-outbox");
let dataMod: typeof import("../data");

// Un pedido con DOS OF: la que se cierra y otra que sigue pendiente, para que
// "es la última que queda" no dispare de más.
const PEDIDO_DOS_OF = {
  id: "AR.26.04351", codigo: "AR.26.04351", cliente: "MAHOU", situacion: "procesado" as const,
  fechaSolicitud: "2026-09-01", fechaPlanificacion: "2026-09-01", fechaEntrega: "2026-09-20",
  prioridad: 2 as const, accent: "ninguno" as const, lineas: 1, croquis: false,
  ofs: [
    { id: "0232086:9", codigo: "0232086", descripcion: "Toldo cofre", familia: "TOLDO" as const, piezas: 1,
      autorId: "ivan", revisorId: null, estado: "aprobada" as const, fichandoRol: null,
      tiempoEstimadoMin: 0, tiempoPlanteoMin: 30, tiempoRevisionMin: 0 },
    { id: "0232087:9", codigo: "0232087", descripcion: "Pérgola", familia: "TOLDO" as const, piezas: 1,
      autorId: "ivan", revisorId: null, estado: "en_curso" as const, fichandoRol: null,
      tiempoEstimadoMin: 0, tiempoPlanteoMin: 0, tiempoRevisionMin: 0 },
  ],
};

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-cerrar-of-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.DATASOURCE = "mock";
});
afterAll(() => {
  delete process.env.DATASOURCE;
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows/WAL: best effort */ }
});

beforeEach(async () => {
  vi.clearAllMocks();
  // EL RELOJ, CONGELADO A MEDIODÍA. Estas pruebas montan tramos de fichaje
  // relativos a "ahora" ("de hace 60 a hace 30 minutos"), y un bono de OLANET
  // lleva la FECHA en su clave: un tramo que cruza la medianoche se parte en
  // dos, uno por día. Corriendo la suite a las 00:30 ese tramo empezaba el día
  // anterior y salían dos bonos donde la prueba espera uno — fallaba una hora
  // cada noche y pasaba el resto del día.
  //
  // Solo se finge `Date`: con los temporizadores falsos enteros, el `await` de
  // la ruta se quedaría esperando a que alguien adelante el reloj.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-16T12:00:00"));
  // Se importan AQUÍ y no una vez en beforeAll: `resetModules` (afterEach)
  // hace que la ruta cargue módulos nuevos, y un espía puesto sobre el
  // `getTablero` de la carga anterior no lo vería nunca.
  estadoDb = await import("../server/estado-db");
  fichajeDb = await import("../server/fichaje-db");
  outbox = await import("../server/olanet-outbox");
  dataMod = await import("../data");
  delete process.env.FICHAJE_OLANET;
  estadoDb.getDb().exec("DELETE FROM of_overlay; DELETE FROM of_retenida; DELETE FROM olanet_pendiente; DELETE FROM fichaje_intervalo;");
  vi.spyOn(dataMod, "getTablero").mockResolvedValue({ operarios: [], pedidos: [PEDIDO_DOS_OF] });
  fasesDeOFs.mockResolvedValue([{ idBoletin: "900", of: "0232086", fase: "9", descripcion: "FINALIZAR", maquina: "A-OTEC", estado: 2 }]);
  finalizarFase.mockResolvedValue({ ok: true, yaEstaba: false, idBoletin: "900" });
  insertarBono.mockRejectedValue(new Error("OLANET no contesta"));
  moverFase.mockResolvedValue(undefined);
  llamadas.length = 0;
  ruta = await import("../../app/api/fases/cerrar-of/route");
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

const post = (body: unknown) =>
  ruta.POST(new Request("http://x/api/fases/cerrar-of", { method: "POST", body: JSON.stringify(body) }));

test("solo el autor puede cerrarla; otro técnico recibe 403", async () => {
  const res = await post({ ofId: "0232086:9", operarioId: "tamara" });
  expect(res.status).toBe(403);
  expect(finalizarFase).not.toHaveBeenCalled();
});

test("sin código de RPS es 400, y ni se llega a leer el tablero", async () => {
  const res = await post({ ofId: "0232086:9", operarioId: "sincodigo" });
  expect(res.status).toBe(400);
});

test("una OF detenida no se puede cerrar", async () => {
  vi.spyOn(dataMod, "getTablero").mockResolvedValue({
    operarios: [],
    pedidos: [{ ...PEDIDO_DOS_OF, ofs: [{ ...PEDIDO_DOS_OF.ofs[0], detenida: true }, PEDIDO_DOS_OF.ofs[1]] }],
  });
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(409);
  expect(finalizarFase).not.toHaveBeenCalled();
});

test("si es la ÚLTIMA OF que queda del pedido, no se ofrece: toca pasar el pedido", async () => {
  vi.spyOn(dataMod, "getTablero").mockResolvedValue({
    operarios: [],
    pedidos: [{ ...PEDIDO_DOS_OF, ofs: [PEDIDO_DOS_OF.ofs[0], { ...PEDIDO_DOS_OF.ofs[1], estado: "aprobada" }] }],
  });
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(409);
  expect(finalizarFase).not.toHaveBeenCalled();
});

test("el corte del fichaje va ANTES que el 3, y con un tramo que no entra no se cierra nada", async () => {
  // Un intervalo abierto de Iván sobre esta OF: el corte lo cierra y lo
  // encola, y como el mock del envío no vacía la cola de verdad, el tramo
  // queda pendiente y la ruta tiene que rechazar el cierre. En `activo`: en
  // sombra la cola no se drena nunca y la ruta, a propósito, ni la mira.
  process.env.FICHAJE_OLANET = "activo";
  fichajeDb.guardarFichaje("ivan", { intervalos: [{ inicio: "2026-09-15T10:00:00.000Z", fin: null, ofIds: ["0232086:9"], rol: "plantear", operarioId: "ivan" }] });
  outbox.encolarFichaje("ivan", [{ inicio: "2026-09-15T10:00:00.000Z", fin: null, ofIds: ["0232086:9"], rol: "plantear", operarioId: "ivan" }]);

  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(409);
  expect(finalizarFase).not.toHaveBeenCalled();
  // El reloj SÍ se ha parado, aunque el cierre no haya entrado.
  const abiertos = fichajeDb.leerFichaje("ivan").intervalos.filter((iv) => iv.fin === null);
  expect(abiertos).toHaveLength(0);
  expect(estadoDb.leerOverlay("ot").ofs.get("0232086:9")?.cerradaRps).toBeUndefined();
});

test("escribe el 3, marca la OF y la retiene, en modo activo", async () => {
  process.env.FICHAJE_OLANET = "activo";
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(200);
  const d = await res.json();
  expect(d.ok).toBe(true);
  expect(d.modo).toBe("activo");
  expect(finalizarFase).toHaveBeenCalledWith(expect.objectContaining({ idBoletin: "900", operarioRps: "195" }));

  const overlay = estadoDb.leerOverlay("ot");
  expect(overlay.ofs.get("0232086:9")?.estado).toBe("aprobada");
  expect(overlay.ofs.get("0232086:9")?.cerradaRps).toEqual(expect.objectContaining({ por: "ivan", modo: "activo" }));
  expect(estadoDb.leerOfsRetenidas("ot")).toEqual([
    expect.objectContaining({ ofId: "0232086:9", pedido: "AR.26.04351", motivo: "cerrada", por: "ivan" }),
  ]);
});

test("con la operación ya en 3 (finalizables no la trae), contesta yaEstaba y marca igual", async () => {
  process.env.FICHAJE_OLANET = "activo";
  fasesDeOFs.mockResolvedValue([{ idBoletin: "900", of: "0232086", fase: "9", descripcion: "FINALIZAR", maquina: "A-OTEC", estado: 3 }]);
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(200);
  expect(finalizarFase).not.toHaveBeenCalled();
  expect(estadoDb.leerOverlay("ot").ofs.get("0232086:9")?.cerradaRps).toBeDefined();
});

test("operación eliminada (4): 409, no se marca", async () => {
  process.env.FICHAJE_OLANET = "activo";
  fasesDeOFs.mockResolvedValue([{ idBoletin: "900", of: "0232086", fase: "9", descripcion: "FINALIZAR", maquina: "A-OTEC", estado: 4 }]);
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(409);
  expect(finalizarFase).not.toHaveBeenCalled();
  expect(estadoDb.leerOverlay("ot").ofs.get("0232086:9")?.cerradaRps).toBeUndefined();
});

test("la trampa 2/02: se cierran las dos de mi sección, la marca depende de la de la fila", async () => {
  process.env.FICHAJE_OLANET = "activo";
  fasesDeOFs.mockResolvedValue([
    { idBoletin: "900", of: "0232086", fase: "9", descripcion: "FINALIZAR", maquina: "A-OTEC", estado: 2 },
    { idBoletin: "901", of: "0232086", fase: "09", descripcion: "FINALIZAR bis", maquina: "A-OTEC", estado: 1 },
  ]);
  finalizarFase.mockImplementation(async (o: { idBoletin: string }) =>
    o.idBoletin === "900" ? { ok: true, yaEstaba: false, idBoletin: "900" } : { ok: false, status: 409, error: "Esa fase no se puede finalizar desde aquí" });
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  // La de la fila (900, fase "9") entró: se marca, aunque la gemela fallara.
  expect(res.status).toBe(200);
  expect(finalizarFase).toHaveBeenCalledTimes(2);
  expect(estadoDb.leerOverlay("ot").ofs.get("0232086:9")?.cerradaRps).toBeDefined();
});

test("la trampa 2/02 con la gemela PRIMERO y fallando: la de la fila entró, se marca", async () => {
  // Así lo devuelve OLANET de verdad: `ORDER BY Orden, Fase` como texto pone
  // "09" delante de "9". Comparando por claveFase la ruta cogía la gemela.
  process.env.FICHAJE_OLANET = "activo";
  fasesDeOFs.mockResolvedValue([
    { idBoletin: "901", of: "0232086", fase: "09", descripcion: "FINALIZAR bis", maquina: "A-OTEC", estado: 1 },
    { idBoletin: "900", of: "0232086", fase: "9", descripcion: "FINALIZAR", maquina: "A-OTEC", estado: 2 },
  ]);
  finalizarFase.mockImplementation(async (o: { idBoletin: string }) =>
    o.idBoletin === "900" ? { ok: true, yaEstaba: false, idBoletin: "900" } : { ok: false, status: 409, error: "Esa fase no se puede finalizar desde aquí" });
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(200);
  expect(finalizarFase).toHaveBeenCalledTimes(2);
  expect(estadoDb.leerOverlay("ot").ofs.get("0232086:9")?.cerradaRps).toBeDefined();
});

test("la trampa 2/02 al revés: entra la gemela pero falla la de la fila, 409 y sin marca", async () => {
  process.env.FICHAJE_OLANET = "activo";
  fasesDeOFs.mockResolvedValue([
    { idBoletin: "901", of: "0232086", fase: "09", descripcion: "FINALIZAR bis", maquina: "A-OTEC", estado: 1 },
    { idBoletin: "900", of: "0232086", fase: "9", descripcion: "FINALIZAR", maquina: "A-OTEC", estado: 2 },
  ]);
  finalizarFase.mockImplementation(async (o: { idBoletin: string }) =>
    o.idBoletin === "901" ? { ok: true, yaEstaba: false, idBoletin: "901" } : { ok: false, status: 409, error: "Esa fase no se puede finalizar desde aquí" });
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  // Que la de la fila no entre es un conflicto con lo que hay en RPS: 409. Un
  // OLANET caído no llega aquí —`finalizarFase` lanza— y sale por el catch.
  expect(res.status).toBe(409);
  expect(finalizarFase).toHaveBeenCalledTimes(2);
  expect(estadoDb.leerOverlay("ot").ofs.get("0232086:9")?.cerradaRps).toBeUndefined();
});

test("si el tramo recién cortado no entra en la cola, no se escribe el 3 y se dice por qué", async () => {
  // Sin esto la cola se veía vacía (el tramo nunca llegó a entrar) y el cierre
  // se escribía en RPS sin ese tiempo.
  process.env.FICHAJE_OLANET = "activo";
  fichajeDb.guardarFichaje("ivan", { intervalos: [{ inicio: "2026-09-15T10:00:00.000Z", fin: null, ofIds: ["0232086:9"], rol: "plantear", operarioId: "ivan" }] });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(outbox, "encolarFichajeOLanzar").mockImplementation(() => {
    throw new Error("database is locked");
  });

  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(409);
  expect((await res.json()).error).toMatch(/tiempo/i);
  expect(finalizarFase).not.toHaveBeenCalled();
  expect(fichajeDb.leerFichaje("ivan").intervalos.filter((iv) => iv.fin === null)).toHaveLength(0);
  expect(estadoDb.leerOverlay("ot").ofs.get("0232086:9")?.cerradaRps).toBeUndefined();
});

// Horas relativas a ahora: el corte cierra con el reloj del servidor, y un
// tramo que "acabara" antes de empezar no daría línea de tiempo.
const haceMin = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const deLaOF = () => outbox.leerCola().filter((p) => p.datos.of === "0232086");

test("reintento tras «tramo sin encolar»: el tramo entra y se envía ANTES del cierre", async () => {
  process.env.FICHAJE_OLANET = "activo";
  fichajeDb.guardarFichaje("ivan", { intervalos: [{ inicio: haceMin(30), fin: null, ofIds: ["0232086:9"], rol: "plantear", operarioId: "ivan" }] });
  vi.spyOn(console, "error").mockImplementation(() => {});

  // 1.º intento: guardar el tramo en la cola falla → 409, nada escrito.
  const falla = vi.spyOn(outbox, "encolarFichajeOLanzar").mockImplementation(() => {
    throw new Error("database is locked");
  });
  expect((await post({ ofId: "0232086:9", operarioId: "ivan" })).status).toBe(409);
  expect(finalizarFase).not.toHaveBeenCalled();
  expect(deLaOF()).toHaveLength(0);
  falla.mockRestore();

  // 2.º intento, con la cola ya funcionando y OLANET contestando. El reloj
  // ya está parado: el corte no encuentra nada, y aun así el tramo tiene que
  // llegar a OLANET antes que el 3.
  insertarBono.mockResolvedValue(undefined);
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(200);
  const bono = llamadas.indexOf("insertarBono");
  const cierre = llamadas.indexOf("finalizarFase");
  expect(bono).toBeGreaterThanOrEqual(0);
  expect(cierre).toBeGreaterThan(bono);
  expect(llamadas.lastIndexOf("moverFase")).toBeLessThan(cierre);
  expect(deLaOF().filter((p) => p.tipo === "bono").every((p) => p.enviadoAt !== null)).toBe(true);
});

test("reintentar dos veces no duplica el tramo en la cola", async () => {
  process.env.FICHAJE_OLANET = "activo";
  // Un tramo cerrado que nunca llegó a la cola (el fallo de un intento anterior).
  fichajeDb.guardarFichaje("ivan", { intervalos: [{ inicio: haceMin(60), fin: haceMin(30), ofIds: ["0232086:9"], rol: "plantear", operarioId: "ivan" }] });
  vi.spyOn(console, "error").mockImplementation(() => {});

  // OLANET no contesta: los dos intentos acaban en 409 con el tramo pendiente.
  expect((await post({ ofId: "0232086:9", operarioId: "ivan" })).status).toBe(409);
  const tras1 = deLaOF();
  expect(tras1.filter((p) => p.tipo === "bono")).toHaveLength(1);
  expect(tras1.filter((p) => p.tipo === "fase")).toHaveLength(2); // iniciada + interrumpida

  expect((await post({ ofId: "0232086:9", operarioId: "ivan" })).status).toBe(409);
  expect(deLaOF()).toHaveLength(tras1.length);
  expect(finalizarFase).not.toHaveBeenCalled();
});

test("si el reencolado de los tramos cerrados falla, 409 y no se escribe el cierre", async () => {
  process.env.FICHAJE_OLANET = "activo";
  fichajeDb.guardarFichaje("ivan", { intervalos: [{ inicio: haceMin(60), fin: haceMin(30), ofIds: ["0232086:9"], rol: "plantear", operarioId: "ivan" }] });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(outbox, "encolarTramosDeOF").mockImplementation(() => {
    throw new Error("database is locked");
  });
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(409);
  expect((await res.json()).error).toMatch(/tiempo/i);
  expect(finalizarFase).not.toHaveBeenCalled();
  expect(estadoDb.leerOverlay("ot").ofs.get("0232086:9")?.cerradaRps).toBeUndefined();
});

test("en sombra y ensayo no se llama a finalizarFase, se marca igual con el modo", async () => {
  for (const modo of ["sombra", "ensayo"]) {
    estadoDb.getDb().exec("DELETE FROM of_overlay; DELETE FROM of_retenida;");
    process.env.FICHAJE_OLANET = modo === "sombra" ? "" : modo;
    const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
    expect(res.status).toBe(200);
    expect(finalizarFase).not.toHaveBeenCalled();
    expect(estadoDb.leerOverlay("ot").ofs.get("0232086:9")?.cerradaRps).toEqual(expect.objectContaining({ modo: modo === "sombra" ? "sombra" : "ensayo" }));
  }
});

// ─── Arreglos de la revisión final de la Task 5 ──────────────────────────────

const cerrar = () => post({ ofId: "0232086:9", operarioId: "ivan" });
const marcaDe = () => estadoDb.leerOverlay("ot").ofs.get("0232086:9")?.cerradaRps;

test("C1: un tramo DESCARTADO tras 5 fallos nunca deja cerrar: 409 que pide revisarlo", async () => {
  process.env.FICHAJE_OLANET = "activo";
  vi.spyOn(console, "error").mockImplementation(() => {});
  fichajeDb.guardarFichaje("ivan", { intervalos: [{ inicio: haceMin(60), fin: haceMin(30), ofIds: ["0232086:9"], rol: "plantear", operarioId: "ivan" }] });
  const estados: number[] = [];
  for (let i = 0; i < 6; i++) estados.push((await cerrar()).status);
  expect(estados).toEqual([409, 409, 409, 409, 409, 409]);
  expect(finalizarFase).not.toHaveBeenCalled();
  // El bono se ha descartado de verdad: si no, el test no probaría el hueco.
  expect(deLaOF().find((p) => p.tipo === "bono")?.error).toMatch(/^DESCARTADO/);
  const d = await (await cerrar()).json();
  expect(d.error).toMatch(/revis/i);
  expect(d.error).not.toMatch(/unos minutos/);
  expect(marcaDe()).toBeUndefined();
});

test("C1: lo descartado en ENSAYO (movimientos que no se escriben a propósito) no bloquea", async () => {
  process.env.FICHAJE_OLANET = "activo";
  outbox.encolarTramosDeOF("0232086:9", [{ inicio: haceMin(60), fin: haceMin(30), ofIds: ["0232086:9"], rol: "plantear", operarioId: "ivan" }]);
  for (const p of deLaOF()) {
    if (p.tipo === "fase") outbox.descartar(p.id, "ensayo: no se mueve la fase");
    else outbox.marcarEnviados([p.id]);
  }
  expect((await cerrar()).status).toBe(200);
  expect(finalizarFase).toHaveBeenCalled();
});

test("C2: con más de 500 eventos de otras OF por delante, la comprobación ve los de esta", async () => {
  process.env.FICHAJE_OLANET = "activo";
  vi.spyOn(console, "error").mockImplementation(() => {});
  outbox.encolarTramosDeOF("0999999:9", [{ inicio: haceMin(120), fin: haceMin(100), ofIds: ["0999999:9"], rol: "plantear", operarioId: "tamara" }]);
  outbox.encolarFinalizacion(Array.from({ length: 600 }, (_, i) => `${1000000 + i}:9`), "tamara");
  fichajeDb.guardarFichaje("ivan", { intervalos: [{ inicio: haceMin(60), fin: haceMin(30), ofIds: ["0232086:9"], rol: "plantear", operarioId: "ivan" }] });
  const res = await cerrar();
  expect(res.status).toBe(409);
  expect(finalizarFase).not.toHaveBeenCalled();
});

test("I1: la operación de la fila sin finalizar pero de otra máquina: 409 y sin marca", async () => {
  process.env.FICHAJE_OLANET = "activo";
  fasesDeOFs.mockResolvedValue([{ idBoletin: "900", of: "0232086", fase: "9", descripcion: "F", maquina: "A-MONT", estado: 2 }]);
  const res = await cerrar();
  expect(res.status).toBe(409);
  expect(finalizarFase).not.toHaveBeenCalled();
  expect(marcaDe()).toBeUndefined();
});

test("I2: si entra tiempo de la OF durante el cierre, no se escribe el 3", async () => {
  process.env.FICHAJE_OLANET = "activo";
  fasesDeOFs.mockImplementation(async () => {
    // Llega por fuera de la ruta de fichaje (el candado no lo para): la
    // comprobación de justo antes del 3 tiene que verlo.
    outbox.encolarFichaje("tamara", [{ inicio: new Date().toISOString(), fin: null, ofIds: ["0232086:9"], rol: "plantear", operarioId: "tamara" }]);
    return [{ idBoletin: "900", of: "0232086", fase: "9", descripcion: "F", maquina: "A-OTEC", estado: 2 }];
  });
  const res = await cerrar();
  expect(res.status).toBe(409);
  expect(finalizarFase).not.toHaveBeenCalled();
  expect(marcaDe()).toBeUndefined();
});

test("I2: un intervalo abierto sobre la OF que aparece durante el cierre también lo para", async () => {
  process.env.FICHAJE_OLANET = "activo";
  fasesDeOFs.mockImplementation(async () => {
    fichajeDb.guardarFichaje("tamara", { intervalos: [{ inicio: new Date().toISOString(), fin: null, ofIds: ["0232086:9"], rol: "plantear", operarioId: "tamara" }] });
    return [{ idBoletin: "900", of: "0232086", fase: "9", descripcion: "F", maquina: "A-OTEC", estado: 2 }];
  });
  expect((await cerrar()).status).toBe(409);
  expect(finalizarFase).not.toHaveBeenCalled();
});

test("I2: empezar a fichar esa OF mientras se cierra se rechaza con un motivo claro", async () => {
  process.env.FICHAJE_OLANET = "activo";
  const fichaje = await import("../../app/api/fichaje/route");
  let aMitad: Response | null = null;
  fasesDeOFs.mockImplementation(async () => {
    aMitad = await fichaje.POST(new Request("http://x/api/fichaje", {
      method: "POST", body: JSON.stringify({ operarioId: "tamara", ofIds: ["0232086:9"], rol: "plantear" }),
    }));
    return [{ idBoletin: "900", of: "0232086", fase: "9", descripcion: "F", maquina: "A-OTEC", estado: 2 }];
  });
  const res = await cerrar();
  expect(aMitad!.status).toBe(409);
  expect((await aMitad!.json()).error).toMatch(/terminada en RPS/);
  expect(fichajeDb.leerFichaje("tamara").intervalos.filter((iv) => iv.fin === null)).toHaveLength(0);
  expect(res.status).toBe(200);
  // Acabado el cierre, el candado se suelta: fichar sigue funcionando.
  const despues = await fichaje.POST(new Request("http://x/api/fichaje", {
    method: "POST", body: JSON.stringify({ operarioId: "tamara", ofIds: ["0232087:9"], rol: "plantear" }),
  }));
  expect(despues.status).toBe(200);
});

test("I2: dos pulsaciones a la vez: la segunda se rechaza y el 3 se escribe una vez", async () => {
  process.env.FICHAJE_OLANET = "activo";
  const [a, b] = await Promise.all([cerrar(), cerrar()]);
  expect([a.status, b.status].sort()).toEqual([200, 409]);
  expect(finalizarFase).toHaveBeenCalledTimes(1);
});

test("M2: la respuesta dice si la de la fila ya estaba terminada", async () => {
  process.env.FICHAJE_OLANET = "activo";
  fasesDeOFs.mockResolvedValue([{ idBoletin: "900", of: "0232086", fase: "9", descripcion: "F", maquina: "A-OTEC", estado: 3 }]);
  const d = await (await cerrar()).json();
  expect(d).toEqual(expect.objectContaining({ ok: true, yaEstaba: true, gemelasSinEscribir: [] }));
});

test("M2: la respuesta dice qué gemela no pudo escribirse", async () => {
  process.env.FICHAJE_OLANET = "activo";
  fasesDeOFs.mockResolvedValue([
    { idBoletin: "901", of: "0232086", fase: "09", descripcion: "bis", maquina: "A-OTEC", estado: 1 },
    { idBoletin: "900", of: "0232086", fase: "9", descripcion: "F", maquina: "A-OTEC", estado: 2 },
  ]);
  finalizarFase.mockImplementation(async (o: { idBoletin: string }) =>
    o.idBoletin === "900" ? { ok: true, yaEstaba: false, idBoletin: "900" } : { ok: false, status: 409, error: "Esa fase no se puede finalizar desde aquí" });
  const d = await (await cerrar()).json();
  expect(d).toEqual(expect.objectContaining({ ok: true, yaEstaba: false, faseFila: "9", gemelasSinEscribir: ["09"] }));
});

// La marca optimista del navegador se pinta con lo que devuelve la ruta. Si
// el `at` no viene, la web pone el reloj del navegador y la línea del cajón
// («0232086 — Iván Sánchez, 15/09/26 11:42») cambia de hora al refrescar,
// porque lo guardado es la hora del SERVIDOR.
test("la respuesta trae el `at` que se guardó, no uno que tenga que inventar la web", async () => {
  process.env.FICHAJE_OLANET = "activo";
  const d = await (await cerrar()).json();
  expect(typeof d.at).toBe("string");
  expect(d.at).toBe(marcaDe()?.at);
});

test("«Confirmado con Iván» punto 4: la gemela que no entró se guarda en la marca", async () => {
  process.env.FICHAJE_OLANET = "activo";
  fasesDeOFs.mockResolvedValue([
    { idBoletin: "901", of: "0232086", fase: "09", descripcion: "bis", maquina: "A-OTEC", estado: 1 },
    { idBoletin: "900", of: "0232086", fase: "9", descripcion: "F", maquina: "A-OTEC", estado: 2 },
  ]);
  finalizarFase.mockImplementation(async (o: { idBoletin: string }) =>
    o.idBoletin === "900" ? { ok: true, yaEstaba: false, idBoletin: "900" } : { ok: false, status: 409, error: "Esa fase no se puede finalizar desde aquí" });
  expect((await cerrar()).status).toBe(200);
  expect(marcaDe()).toEqual(expect.objectContaining({ gemelaSinEscribir: "09" }));
});

test("sin trampa (una sola operación), la marca no lleva gemelaSinEscribir", async () => {
  process.env.FICHAJE_OLANET = "activo";
  expect((await cerrar()).status).toBe(200);
  expect(marcaDe()?.gemelaSinEscribir).toBeUndefined();
});

test("el 409 de tiempo descartado dice `descartado: true`, para que la web ofrezca «Reintentar envío»", async () => {
  process.env.FICHAJE_OLANET = "activo";
  vi.spyOn(console, "error").mockImplementation(() => {});
  fichajeDb.guardarFichaje("ivan", { intervalos: [{ inicio: haceMin(60), fin: haceMin(30), ofIds: ["0232086:9"], rol: "plantear", operarioId: "ivan" }] });
  for (let i = 0; i < 6; i++) await cerrar();
  const d = await (await cerrar()).json();
  expect(d.descartado).toBe(true);
});

// Un MOVIMIENTO DE OPERACIÓN descartado (el 1 o el 2 que la cola no pudo
// escribir) no es tiempo que RPS haya rechazado. Contarlo como tal daba el
// aviso de otra cosa —"RPS rechazó tiempo fichado en esta OF"— y encendía
// «Reintentar envío», que reencola y el drenado vuelve a descartar por lo
// mismo: un bucle sin salida. Lleva su propio aviso y ningún botón.
test("un movimiento de operación descartado da SU aviso, no el del tiempo, y sin «Reintentar envío»", async () => {
  process.env.FICHAJE_OLANET = "activo";
  outbox.encolarTramosDeOF("0232086:9", [{ inicio: haceMin(60), fin: haceMin(30), ofIds: ["0232086:9"], rol: "plantear", operarioId: "ivan" }]);
  // El tiempo SÍ llegó; lo que se quedó fuera es el movimiento de operación.
  for (const p of deLaOF()) {
    if (p.tipo === "fase") outbox.descartar(p.id, "OLANET no tiene la fase 0232086/9");
    else outbox.marcarEnviados([p.id]);
  }
  const res = await cerrar();
  expect(res.status).toBe(409);
  const d = await res.json();
  expect(d.error).toMatch(/no reconoce esta operación/i);
  expect(d.error).not.toMatch(/rechazó tiempo/i);
  // Sin `descartado` no sale «Reintentar envío», que aquí no arreglaría nada.
  expect(d.descartado).toBeUndefined();
  expect(finalizarFase).not.toHaveBeenCalled();
  expect(marcaDe()).toBeUndefined();
});

test("el 409 de tiempo simplemente pendiente NO lleva `descartado`", async () => {
  process.env.FICHAJE_OLANET = "activo";
  fichajeDb.guardarFichaje("ivan", { intervalos: [{ inicio: "2026-09-15T10:00:00.000Z", fin: null, ofIds: ["0232086:9"], rol: "plantear", operarioId: "ivan" }] });
  outbox.encolarFichaje("ivan", [{ inicio: "2026-09-15T10:00:00.000Z", fin: null, ofIds: ["0232086:9"], rol: "plantear", operarioId: "ivan" }]);
  const d = await (await cerrar()).json();
  expect(d.descartado).toBeUndefined();
});

// Cuando OLANET se cae de verdad, `finalizarFase` LANZA: no devuelve ningún
// `{ ok: false, status: 503 }` —`ResultadoFinalizarFase` solo admite 403, 404
// y 409—, así que el 503 sale del `catch` de la ruta. Mockear ese 503
// imposible probaba una rama que no podía darse, y el test no podía fallar
// aunque alguien rompiera el `catch`.
test("M3: si OLANET se cae al escribir la de la fila, 503 y sin marca", async () => {
  process.env.FICHAJE_OLANET = "activo";
  vi.spyOn(console, "warn").mockImplementation(() => {});
  finalizarFase.mockRejectedValue(new Error("ECONNREFUSED 192.168.0.124:54325"));
  const res = await cerrar();
  expect(res.status).toBe(503);
  expect((await res.json()).error).toMatch(/No se ha podido escribir en RPS/);
  expect(marcaDe()).toBeUndefined();
});

// La caché del tablero solo existe con RPS de verdad: se simula ese modo (el
// tablero sigue saliendo del espía de `getTablero`, y la invalidación también
// se sustituye, así que no se abre ninguna conexión).
test("M7: tras un cierre correcto se invalida la caché del tablero de la sección", async () => {
  process.env.FICHAJE_OLANET = "activo";
  process.env.DATASOURCE = "rps";
  try {
    const rps = await import("../server/rps");
    const invalidar = vi.spyOn(rps, "invalidarCacheTablero").mockImplementation(() => {});
    expect((await cerrar()).status).toBe(200);
    expect(invalidar).toHaveBeenCalledWith("ot");
  } finally {
    process.env.DATASOURCE = "mock";
  }
});

test("M7: si el cierre falla no se invalida nada", async () => {
  process.env.FICHAJE_OLANET = "activo";
  process.env.DATASOURCE = "rps";
  try {
    const rps = await import("../server/rps");
    const invalidar = vi.spyOn(rps, "invalidarCacheTablero").mockImplementation(() => {});
    finalizarFase.mockResolvedValue({ ok: false, status: 409, error: "no" });
    expect((await cerrar()).status).toBe(409);
    expect(invalidar).not.toHaveBeenCalled();
  } finally {
    process.env.DATASOURCE = "mock";
  }
});
