import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PEDIDOS } from "../mock";

const { tableroMock, finalizarMock } = vi.hoisted(() => ({ tableroMock: vi.fn(), finalizarMock: vi.fn() }));
vi.mock("../data", () => ({ getTablero: tableroMock }));
vi.mock("../server/olanet-outbox", () => ({ encolarFinalizacion: finalizarMock }));

// Mock de cortarFichajeDeOF para poder simular fallos en el test
const cortarFichajeMock = vi.fn<(ofId: string, ahora: string) => string[]>();

// Importación lazy de la función real para usarla en el mock por defecto
let cortarFichajeReal: (ofId: string, ahora: string) => string[];

vi.mock("../server/fichaje-db", async () => {
  const actual = await vi.importActual<typeof import("../server/fichaje-db")>("../server/fichaje-db");
  cortarFichajeReal = actual.cortarFichajeDeOF;
  return {
    ...actual,
    cortarFichajeDeOF: cortarFichajeMock,
  };
});

let dir: string;
let route: typeof import("../../app/api/estado/route");
let fichajeDb: typeof import("../server/fichaje-db");
let fichaje: typeof import("../fichaje");
let estadoDb: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-api-estado-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  route = await import("../../app/api/estado/route");
  fichajeDb = await import("../server/fichaje-db");
  fichaje = await import("../fichaje");
  estadoDb = await import("../server/estado-db");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

beforeEach(() => {
  tableroMock.mockReset();
  finalizarMock.mockReset();
  cortarFichajeMock
    .mockReset()
    .mockImplementation((ofId, ahora) => cortarFichajeReal(ofId, ahora));
});

test("el servidor rechaza pasar un pedido que sigue por revisar aunque el cliente mande aprobado", async () => {
  const pedido = { ...PEDIDOS[0], id: "P-no-pasar", ofs: [{ ...PEDIDOS[0].ofs[0], id: "of-no-pasar", estado: "por_revisar" }] };
  tableroMock.mockResolvedValue({ operarios: [], pedidos: [pedido] });
  const res = await route.POST(new Request("http://x/api/estado", { method: "POST", body: JSON.stringify({
    operarioId: "ivan", seccion: "ot", motivo: "completar", completarPedidoId: pedido.id,
    cambiosOF: [{ ofId: "of-no-pasar", autorId: "ivan", revisorId: "jaime", estado: "aprobada", observacion: null }],
    ofIdsPedido: [],
  }) }));
  expect(res.status).toBe(409);
  expect(estadoDb.leerOverlay("ot").pedidosCompletados.has(pedido.id)).toBe(false);
  expect(estadoDb.leerOverlay("ot").ofs.has("of-no-pasar")).toBe(false);
  expect(finalizarMock).not.toHaveBeenCalled();
  expect(cortarFichajeMock).not.toHaveBeenCalled();
});

test("aprobar solo no pasa el pedido y el paso explícito finaliza únicamente sus OF reales", async () => {
  const ofId = "of-aprobar-y-pasar";
  const id = "P-aprobar-y-pasar";
  const aprobacion = await route.POST(new Request("http://x/api/estado", { method: "POST", body: JSON.stringify({
    operarioId: "jaime", seccion: "ot", motivo: "aprobar",
    cambiosOF: [{ ofId, autorId: "ivan", revisorId: "jaime", estado: "aprobada", observacion: null }],
  }) }));
  expect(aprobacion.status).toBe(200);
  expect(estadoDb.leerOverlay("ot").pedidosCompletados.has(id)).toBe(false);
  expect(finalizarMock).not.toHaveBeenCalled();
  tableroMock.mockResolvedValue({ operarios: [], pedidos: [{ ...PEDIDOS[0], id, ofs: [{ ...PEDIDOS[0].ofs[0], id: ofId, estado: "por_revisar", ajenaOT: false, detenida: false }] }] });
  const revisor = await route.POST(new Request("http://x/api/estado", { method: "POST", body: JSON.stringify({
    operarioId: "jaime", seccion: "ot", motivo: "completar", completarPedidoId: id,
  }) }));
  expect(revisor.status).toBe(403);
  expect(estadoDb.leerOverlay("ot").pedidosCompletados.has(id)).toBe(false);
  expect(finalizarMock).not.toHaveBeenCalled();
  expect(cortarFichajeMock).not.toHaveBeenCalled();
  const res = await route.POST(new Request("http://x/api/estado", { method: "POST", body: JSON.stringify({
    operarioId: "ivan", seccion: "ot", motivo: "completar", completarPedidoId: id,
    ofIdsPedido: ["operacion-ajena"], cortarFichajeDe: ["operacion-ajena"],
  }) }));
  expect(res.status).toBe(200);
  expect(finalizarMock).toHaveBeenCalledWith([ofId], "ivan");
  expect(cortarFichajeMock).toHaveBeenCalledWith(ofId, expect.any(String));
  expect(cortarFichajeMock).not.toHaveBeenCalledWith("operacion-ajena", expect.anything());
  expect(estadoDb.leerOverlay("ot").pedidosCompletados.has(id)).toBe(true);
  expect(estadoDb.leerOverlay("diseno").pedidosCompletados.has(id)).toBe(false);
});

test("traspasar una OF corta el fichaje que otro tenía sobre ella", async () => {
  const f = fichaje.fichar(
    fichaje.FICHAJE_VACIO,
    ["of-x"],
    "plantear",
    "tamara",
    "2026-08-05T08:00:00.000Z",
  );
  fichajeDb.guardarFichaje("tamara", f);

  const res = await route.POST(
    new Request("http://x/api/estado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operarioId: "ivan",
        motivo: "traspaso",
        cambiosOF: [
          { ofId: "of-x", autorId: "ivan", revisorId: null, estado: "en_curso", observacion: null },
        ],
        cortarFichajeDe: ["of-x"],
      }),
    }),
  );
  expect(res.status).toBe(200);

  // Tamara ya no ficha algo que no es suyo, y su tiempo queda guardado.
  const suyo = fichajeDb.leerFichaje("tamara");
  expect(suyo.intervalos.every((i) => i.fin !== null)).toBe(true);
});

test("si el corte de fichaje falla, la mutación se guardó igual (respuesta 200)", async () => {
  // Simular que cortarFichajeDeOF lanza una excepción
  cortarFichajeMock.mockImplementationOnce(() => {
    throw new Error("error al cortar fichaje");
  });

  // "carlos" era el id de este test, pero es un supervisor DESACTIVADO (ver
  // la siembra en estado-db.ts): identidad() ya no lo acepta apagado, porque
  // firmar una acción a nombre de alguien que no está deja un registro
  // apuntando a la nada. Pasa a "jaime", que sí es una persona activa.
  const res = await route.POST(
    new Request("http://x/api/estado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operarioId: "jaime",
        motivo: "traspaso-fallido",
        cambiosOF: [
          { ofId: "of-y", autorId: "jaime", revisorId: null, estado: "en_curso", observacion: null },
        ],
        cortarFichajeDe: ["of-y"],
      }),
    }),
  );

  // La respuesta debe ser 200 aunque el corte falle: el efecto secundario
  // (corte de fichaje) es no-crítico porque cerrarFichajesSinLatido hará
  // la limpieza de todas formas dentro de la tolerancia del latido.
  expect(res.status).toBe(200);

  // La mutación debe estar guardada: POST guarda ANTES de intentar el corte.
  const acciones = estadoDb.leerAccionesDesde("1970-01-01T00:00:00.000Z");
  const traspaso = acciones.find((a) => a.motivo === "traspaso-fallido");
  expect(traspaso).toBeDefined();
  expect(traspaso?.cambiosOF).toEqual([
    expect.objectContaining({ ofId: "of-y", autorId: "jaime" }),
  ]);
});

test("rechaza un cambio que deje a la misma persona de autor y de revisor", async () => {
  const res = await route.POST(
    new Request("http://x/api/estado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operarioId: "angel",
        motivo: "asignar",
        cambiosOF: [
          {
            ofId: "of-z",
            autorId: "tamara",
            revisorId: "tamara",
            estado: "por_revisar",
            observacion: null,
          },
        ],
      }),
    }),
  );
  // Regla dura del dominio: el revisor nunca puede ser el autor de la misma
  // OF. El cliente ya lo impide por varias vías; esta es la última red, para
  // que un camino que se olvide no llegue a guardar un estado imposible.
  expect(res.status).toBe(400);

  const acciones = estadoDb.leerAccionesDesde("1970-01-01T00:00:00.000Z");
  expect(acciones.some((a) => a.cambiosOF.some((c) => c.ofId === "of-z"))).toBe(false);
});

const postEstado = (body: unknown) =>
  route.POST(new Request("http://x/api/estado", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));

test("quitarRetenida llega a guardarMutacion", async () => {
  estadoDb.guardarMutacion({
    operarioId: "ivan", motivo: "cerrar_en_rps", seccion: "ot",
    cambiosOF: [{ ofId: "0232086:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null, cerradaRps: { at: "x", por: "ivan", modo: "activo" } }],
    ofRetenida: { ofId: "0232086:9", pedido: "AR.26.04351", motivo: "cerrada", por: "ivan", at: "x" },
  });
  const res = await postEstado({
    motivo: "volver_a_plantear", operarioId: "ivan", seccion: "ot",
    cambiosOF: [{ ofId: "0232086:9", autorId: "ivan", revisorId: null, estado: "en_curso", observacion: null, cerradaRps: null }],
    quitarRetenida: ["0232086:9"],
  });
  expect(res.status).toBe(200);
  expect(estadoDb.leerOfsRetenidas("ot")).toEqual([]);
  expect(estadoDb.leerOverlay("ot").ofs.get("0232086:9")?.cerradaRps).toBeUndefined();
});

// «Dar por terminada en RPS» solo se guarda por POST /api/fases/cerrar-of, que
// corta el reloj y escribe en RPS antes de marcar. Si /api/estado aceptara la
// marca, la OF quedaría apartada como cerrada sin que RPS se enterase.
test("/api/estado no deja dar por terminada una OF en RPS: ni con el motivo ni colando la marca", async () => {
  const conMotivo = await postEstado({
    motivo: "cerrar_en_rps", operarioId: "ivan", seccion: "ot",
    cambiosOF: [{ ofId: "0232100:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null, cerradaRps: { at: "x", por: "ivan", modo: "activo" } }],
  });
  expect(conMotivo.status).toBe(400);
  expect(estadoDb.leerOverlay("ot").ofs.has("0232100:9")).toBe(false);

  // Por el camino de siempre (p. ej. "aprobar_sin_revision") con la marca
  // puesta a mano: se guarda el cambio de estado, pero la marca NO.
  const colada = await postEstado({
    motivo: "aprobar_sin_revision", operarioId: "ivan", seccion: "ot",
    cambiosOF: [{ ofId: "0232101:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null, cerradaRps: { at: "x", por: "ivan", modo: "activo" } }],
  });
  expect(colada.status).toBe(200);
  expect(estadoDb.leerOverlay("ot").ofs.get("0232101:9")?.estado).toBe("aprobada");
  expect(estadoDb.leerOverlay("ot").ofs.get("0232101:9")?.cerradaRps).toBeUndefined();
});

test("/api/estado conserva la marca guardada en las demás acciones, aunque el cliente no la mande o la mande distinta", async () => {
  const marca = { at: "2026-09-15T11:42:00.000Z", por: "ivan", modo: "activo" as const };
  estadoDb.guardarMutacion({
    operarioId: "ivan", motivo: "cerrar_en_rps", seccion: "ot",
    cambiosOF: [{ ofId: "0232102:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null, cerradaRps: marca }],
  });
  // Un navegador sin refrescar reparte el pedido entero: su snapshot no sabe
  // de la marca. No puede borrarla; solo "Volver a plantear" la quita.
  await postEstado({
    motivo: "asignar", operarioId: "ivan", seccion: "ot",
    cambiosOF: [{ ofId: "0232102:9", autorId: "jaime", revisorId: null, estado: "aprobada", observacion: null, cerradaRps: null }],
  });
  expect(estadoDb.leerOverlay("ot").ofs.get("0232102:9")?.cerradaRps).toEqual(marca);
  await postEstado({
    motivo: "asignar", operarioId: "ivan", seccion: "ot",
    cambiosOF: [{ ofId: "0232102:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null, cerradaRps: { at: "otra", por: "tamara", modo: "sombra" } }],
  });
  expect(estadoDb.leerOverlay("ot").ofs.get("0232102:9")?.cerradaRps).toEqual(marca);
});

test("Fallo I-B: quitar autor a un pedido con una OF cerrada en RPS la deja intacta y no rompe las demás", async () => {
  const marca = { at: "2026-09-15T11:00:00.000Z", por: "ivan", modo: "activo" as const };
  estadoDb.guardarMutacion({
    operarioId: "ivan", motivo: "cerrar_en_rps", seccion: "ot",
    cambiosOF: [{ ofId: "0232200:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null, cerradaRps: marca }],
  });
  estadoDb.guardarMutacion({
    operarioId: "ivan", motivo: "asignar", seccion: "ot",
    cambiosOF: [{ ofId: "0232201:9", autorId: "ivan", revisorId: null, estado: "en_curso", observacion: null }],
  });

  // "Quitar autor" (Board.tsx moverOFs) manda TODAS las OF del pedido de un
  // golpe, la cerrada incluida: sin la guarda, esta la dejaría en "pendiente"
  // sin marca dueña de ninguna acción (ni fichar, ni "Dar por terminada" —ya
  // tiene marca—, ni "Volver a plantear" —exige "aprobada"—).
  const res = await postEstado({
    motivo: "asignar", operarioId: "ivan", seccion: "ot",
    cambiosOF: [
      { ofId: "0232200:9", autorId: null, revisorId: null, estado: "pendiente", observacion: null },
      { ofId: "0232201:9", autorId: null, revisorId: null, estado: "pendiente", observacion: null },
    ],
    cortarFichajeDe: ["0232200:9", "0232201:9"],
  });
  expect(res.status).toBe(200);

  const overlay = estadoDb.leerOverlay("ot").ofs;
  // La cerrada no se ha movido: sigue aprobada, con su autor y su marca.
  expect(overlay.get("0232200:9")).toMatchObject({ estado: "aprobada", autorId: "ivan" });
  expect(overlay.get("0232200:9")?.cerradaRps).toEqual(marca);
  // La otra sí vuelve a la bandeja, como pide "quitar autor": el lote entero
  // no se tumba por la cerrada de en medio.
  expect(overlay.get("0232201:9")).toMatchObject({ estado: "pendiente", autorId: null });
});

test("quitarRetenida se ignora si el motivo no es «volver_a_plantear»", async () => {
  estadoDb.guardarMutacion({
    operarioId: "ivan", motivo: "cerrar_en_rps", seccion: "ot",
    cambiosOF: [{ ofId: "0232202:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null, cerradaRps: { at: "x", por: "ivan", modo: "activo" } }],
    ofRetenida: { ofId: "0232202:9", pedido: "AR.26.99999", motivo: "cerrada", por: "ivan", at: "x" },
  });
  const res = await postEstado({
    motivo: "asignar", operarioId: "ivan", seccion: "ot",
    cambiosOF: [{ ofId: "0232203:9", autorId: "ivan", revisorId: null, estado: "en_curso", observacion: null }],
    quitarRetenida: ["0232202:9"],
  });
  expect(res.status).toBe(200);
  // Solo "Volver a plantear" puede sacar una OF de `of_retenida`; colarlo con
  // cualquier otro motivo le haría perder su sitio en el tablero en cuanto
  // RPS deje de traerla, sin que de verdad se haya vuelto a plantear nada.
  expect(estadoDb.leerOfsRetenidas("ot").some((r) => r.ofId === "0232202:9")).toBe(true);
});

// Una OF retenida "del_pedido" (no se marcó al recuperar el pedido, así que
// siguió aprobada y terminada en RPS) SÍ manda su 3 al pasar el pedido.
//
// Saltárselo por el motivo de la fila era una optimización, y estaba mal: una
// OF `aprobada` sin marca de cerrada es FICHABLE (fichaje.ts, `esFichable`).
// En cuanto alguien le echa tiempo, la cola emite su 1 al abrir y su 2 al
// parar, y la operación se queda en 2 —empezada— para Producción. Si al pasar
// el pedido nadie manda el 3, esa operación no se cierra nunca: es justo el
// arrastre de operaciones abiertas que la spec viene a eliminar
// (`fase-pendiente.ts`, las 125 fases sin cerrar de 2020-2024).
//
// Mandarlo siempre no duplica nada: `enviarUno` (olanet-worker.ts) relee el
// estado de la fase y no reescribe un 3 sobre un 3. Cuesta una consulta por OF.
test("al pasar el pedido se encola el 3 de una OF 'del_pedido' en la que alguien volvió a fichar", async () => {
  const id = "P-del-pedido-refichada";
  estadoDb.guardarMutacion({
    operarioId: "ivan", motivo: "recuperar_pedido", seccion: "ot",
    ofRetenida: { ofId: "of-del-pedido", pedido: id, motivo: "del_pedido", por: "ivan", at: "x" },
  });
  // Alguien le echa tiempo después de recuperar el pedido: la operación queda
  // en 2 en RPS, y sin el 3 se quedaría abierta para Producción para siempre.
  fichajeDb.guardarFichaje("tamara", {
    intervalos: [{ inicio: "2026-09-15T10:00:00.000Z", fin: null, ofIds: ["of-del-pedido"], rol: "plantear", operarioId: "tamara" }],
  });
  const pedido = {
    ...PEDIDOS[0], id, codigo: id,
    ofs: [
      { ...PEDIDOS[0].ofs[0], id: "of-del-pedido", autorId: "ivan", estado: "aprobada", ajenaOT: false, detenida: false },
      { ...PEDIDOS[0].ofs[0], id: "of-recuperada", autorId: "ivan", estado: "aprobada", ajenaOT: false, detenida: false },
    ],
  };
  tableroMock.mockResolvedValue({ operarios: [], pedidos: [pedido] });
  const res = await postEstado({
    operarioId: "ivan", seccion: "ot", motivo: "completar", completarPedidoId: id,
  });
  expect(res.status).toBe(200);
  expect(finalizarMock).toHaveBeenCalledWith(["of-del-pedido", "of-recuperada"], "ivan");
  expect(estadoDb.leerOverlay("ot").pedidosCompletados.has(id)).toBe(true);
});

// Step 4 de la Tarea 9 (spec §2, "Al pasar el pedido no se reenvía el cierre"):
// una OF cerrada de verdad ("activo") no manda otra vez su 3; una cerrada en
// sombra o ensayo sí, porque en OLANET nunca llegó a escribirse.
test("al pasar el pedido no se reencola el 3 de una OF ya cerrada en activo, pero sí la de una cerrada en ensayo", async () => {
  const id = "P-cerradas-rps";
  const marcaActivo = { at: "x", por: "ivan", modo: "activo" as const };
  const marcaEnsayo = { at: "x", por: "ivan", modo: "ensayo" as const };
  estadoDb.guardarMutacion({
    operarioId: "ivan", motivo: "cerrar_en_rps", seccion: "ot",
    cambiosOF: [{ ofId: "0232086:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null, cerradaRps: marcaActivo }],
    ofRetenida: { ofId: "0232086:9", pedido: id, motivo: "cerrada", por: "ivan", at: "x" },
  });
  estadoDb.guardarMutacion({
    operarioId: "ivan", motivo: "cerrar_en_rps", seccion: "ot",
    cambiosOF: [{ ofId: "0232087:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null, cerradaRps: marcaEnsayo }],
    ofRetenida: { ofId: "0232087:9", pedido: id, motivo: "cerrada", por: "ivan", at: "x" },
  });
  const pedido = {
    ...PEDIDOS[0], id, codigo: id,
    ofs: [
      { ...PEDIDOS[0].ofs[0], id: "0232086:9", autorId: "ivan", estado: "aprobada", ajenaOT: false, detenida: false },
      { ...PEDIDOS[0].ofs[0], id: "0232087:9", autorId: "ivan", estado: "aprobada", ajenaOT: false, detenida: false },
    ],
  };
  tableroMock.mockResolvedValue({ operarios: [], pedidos: [pedido] });
  const res = await postEstado({
    operarioId: "ivan", seccion: "ot", motivo: "completar", completarPedidoId: id,
  });
  expect(res.status).toBe(200);
  // Las dos siguen en "OF que se pasaron" (evita que el overlay reabra el
  // pedido), pero solo se encola el 3 de la que nunca llegó a escribirse.
  expect(finalizarMock).toHaveBeenCalledWith(["0232087:9"], "ivan");
});

// Decisión de Iván (Task 14): una OF en revisión SIEMPRE tiene revisor, o
// vuelve al panel de su autor — nunca se queda en tierra de nadie. La pantalla
// ya lo exige (PedirRevisor.tsx no deja confirmar sin elegir uno); esta es la
// última red, para que un camino que se salte la pantalla no cuele el hueco.
test("rechaza pasar una OF a revisión sin revisor nombrado", async () => {
  const res = await postEstado({
    operarioId: "ivan",
    motivo: "terminar_planteo",
    cambiosOF: [
      { ofId: "of-sin-revisor", autorId: "ivan", revisorId: null, estado: "por_revisar", observacion: null },
    ],
  });
  expect(res.status).toBe(400);
  const acciones = estadoDb.leerAccionesDesde("1970-01-01T00:00:00.000Z");
  expect(acciones.some((a) => a.cambiosOF.some((c) => c.ofId === "of-sin-revisor"))).toBe(false);
});

test("con revisor nombrado, pasar a revisión sí se guarda", async () => {
  const res = await postEstado({
    operarioId: "ivan",
    motivo: "terminar_planteo",
    cambiosOF: [
      { ofId: "of-con-revisor", autorId: "ivan", revisorId: "jaime", estado: "por_revisar", observacion: null },
    ],
  });
  expect(res.status).toBe(200);
  expect(estadoDb.leerOverlay("ot").ofs.get("of-con-revisor")?.estado).toBe("por_revisar");
});

test("sin autor, el mismo id en revisor no bloquea (ambos nulos es válido)", async () => {
  const res = await route.POST(
    new Request("http://x/api/estado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operarioId: "angel",
        motivo: "asignar",
        cambiosOF: [
          { ofId: "of-w", autorId: null, revisorId: null, estado: "pendiente", observacion: null },
        ],
      }),
    }),
  );
  expect(res.status).toBe(200);
});
