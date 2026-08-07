import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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
  cortarFichajeMock
    .mockReset()
    .mockImplementation((ofId, ahora) => cortarFichajeReal(ofId, ahora));
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

  const res = await route.POST(
    new Request("http://x/api/estado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operarioId: "carlos",
        motivo: "traspaso-fallido",
        cambiosOF: [
          { ofId: "of-y", autorId: "carlos", revisorId: null, estado: "en_curso", observacion: null },
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
    expect.objectContaining({ ofId: "of-y", autorId: "carlos" }),
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
