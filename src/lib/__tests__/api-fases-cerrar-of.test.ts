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
afterEach(() => vi.resetModules());

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
    o.idBoletin === "900" ? { ok: true, yaEstaba: false, idBoletin: "900" } : { ok: false, status: 503, error: "no responde" });
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
    o.idBoletin === "900" ? { ok: true, yaEstaba: false, idBoletin: "900" } : { ok: false, status: 503, error: "no responde" });
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
    o.idBoletin === "901" ? { ok: true, yaEstaba: false, idBoletin: "901" } : { ok: false, status: 503, error: "no responde" });
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
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
