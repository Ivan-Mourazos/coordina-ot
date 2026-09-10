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
