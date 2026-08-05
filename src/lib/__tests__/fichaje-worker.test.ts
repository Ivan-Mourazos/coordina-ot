import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { abierto, type Intervalo } from "../fichaje";

// El cierre por inactividad no habla con OLANET, pero al cerrar un intervalo
// encola sus bonos: se sustituye el acceso a SQL Server para no necesitarlo.
vi.mock("../server/olanet", () => ({
  insertarBono: async () => {},
  moverFase: async () => {},
  buscarIdBoletin: async () => "1",
  sincronizarFichajeEnCurso: async () => {},
}));

let dir: string;
let fichajeWorker: typeof import("../server/fichaje-worker");
let fichajeDb: typeof import("../server/fichaje-db");
let outbox: typeof import("../server/olanet-outbox");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-cierre-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  fichajeDb = await import("../server/fichaje-db");
  outbox = await import("../server/olanet-outbox");
  fichajeWorker = await import("../server/fichaje-worker");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

const iv = (inicio: string, fin: string | null, ofIds: string[], operarioId: string): Intervalo => ({
  inicio,
  fin,
  ofIds,
  rol: "plantear",
  operarioId,
});

describe("cerrarFichajesSinLatido", () => {
  // "angel" no se ha usado en ningún test anterior con encolarFichaje: su
  // watermark está limpio, así que el bono que genera este cierre se deriva
  // entero (no interfiere con otros describes de este fichero).
  it("cierra con la hora del ÚLTIMO LATIDO (no con `ahora`) y lo encola igual que cualquier otro cierre", () => {
    const inicio = "2026-08-04T10:00:00Z";
    fichajeDb.guardarFichaje("angel", {
      intervalos: [iv(inicio, null, ["0231100:1"], "angel")],
    });
    // guardarFichaje ya deja un latido "recién ahora" (hora real del test);
    // para simular una pestaña muerta hace falta uno viejo de verdad.
    const latidoViejo = new Date(Date.now() - 6 * 60_000).toISOString();
    fichajeDb.registrarLatido("angel", latidoViejo);

    fichajeWorker.cerrarFichajesSinLatido();

    const f = fichajeDb.leerFichaje("angel");
    expect(abierto(f)).toBeNull(); // ya no queda nada corriendo
    const cerrado = f.intervalos.find((i) => i.inicio === inicio)!;
    expect(cerrado.fin).toBe(latidoViejo); // la hora del latido, NUNCA la de "ahora"

    // Las filas tipo "bono" de la cola guardan el operarioId como CÓDIGO RPS
    // (f.operario, "146" para angel), no como id del tablero — así lo hace
    // olanet-outbox.ts para cualquier otro cierre, así que se busca por eso.
    const bono = outbox
      .leerCola()
      .find((p) => p.tipo === "bono" && p.datos.of === "0231100");
    expect(bono).toBeDefined();
  });

  it("no toca nada si el latido es reciente (la pestaña sigue viva)", () => {
    const inicio = new Date().toISOString();
    // Operario sin código RPS a propósito: aísla este test de cualquier otro
    // (encolarFichaje/watermark) sin afectar el resultado que se comprueba.
    fichajeDb.guardarFichaje("silvia", {
      intervalos: [iv(inicio, null, ["0231103:1"], "silvia")],
    });
    // guardarFichaje ya dejó el latido "ahora mismo": sigue vivo.
    fichajeWorker.cerrarFichajesSinLatido();
    expect(abierto(fichajeDb.leerFichaje("silvia"))).not.toBeNull();
  });

  it("deja un aviso pendiente para que el operario se entere al volver, y se consume una sola vez", () => {
    const inicio = "2026-08-04T11:00:00Z";
    fichajeDb.guardarFichaje("raquel", {
      intervalos: [iv(inicio, null, ["0231104:1"], "raquel")],
    });
    const latidoViejo = new Date(Date.now() - 6 * 60_000).toISOString();
    fichajeDb.registrarLatido("raquel", latidoViejo);

    fichajeWorker.cerrarFichajesSinLatido();

    const esperado = { ofIds: ["0231104:1"], fin: latidoViejo };
    expect(fichajeDb.leerAvisoCierre("raquel")).toEqual(esperado);
    // Sigue ahí hasta que el cliente acuse: leerlo no lo consume.
    expect(fichajeDb.leerAvisoCierre("raquel")).toEqual(esperado);
    fichajeDb.marcarAvisoCierreVisto("raquel");
    expect(fichajeDb.leerAvisoCierre("raquel")).toBeNull();
  });

  it("no hace nada si no hay ningún fichaje abierto", () => {
    expect(() => fichajeWorker.cerrarFichajesSinLatido()).not.toThrow();
  });
});
