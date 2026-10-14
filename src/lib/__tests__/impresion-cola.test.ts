import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Planteamientos } from "../server/planteamiento-pdf";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-impresion-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.COORDINA_PLANTEAMIENTOS_COPIAS = path.join(dir, "copias");
  process.env.DATASOURCE = "mock";
});
afterAll(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
});

let cola: typeof import("../server/impresion-cola");
let worker: typeof import("../server/impresion-worker");

beforeEach(async () => {
  vi.resetModules();
  process.env.IMPRESION_PRODUCCION = "activo";
  const { getDb } = await import("../server/estado-db");
  getDb().exec("DELETE FROM planteamiento_impresion");
  cola = await import("../server/impresion-cola");
  worker = await import("../server/impresion-worker");
});

const T0 = new Date("2026-10-13T11:00:00Z");
const pdfDe = (nombre: string, todoA4: boolean): Planteamientos => ({
  aviso: null,
  ficheros: [{ nombre, ruta: path.join(__dirname, "planteamiento.test.ts"), origen: "planteamientos", paginas: 1, todoA4 }],
});

describe("modo y destino", () => {
  it("apagado por defecto; ensayo va a la de OT", async () => {
    delete process.env.IMPRESION_PRODUCCION;
    expect(cola.modoImpresion()).toBe("off");
    expect(cola.impresoraDestino("ensayo")).toBe("ipp://192.168.4.249/ipp");
    expect(cola.impresoraDestino("activo")).toBe("ipp://192.168.4.245/ipp");
    expect(cola.impresoraDestino("off")).toBeNull();
  });
});

describe("al pasar el pedido", () => {
  it("todo A4: copia y encola", async () => {
    const r = await cola.prepararImpresion("AR.26.05016", "ivan", T0, async () => pdfDe("AR2605016-10.pdf", true));
    expect(r).toEqual({ encolados: 1, manuales: [], aviso: null });
    const [f] = cola.leerImpresionesDe("AR.26.05016");
    expect(f).toMatchObject({ estado: "pendiente", fichero: "AR2605016-10.pdf", pasadoPor: "ivan" });
  });

  it("alguna página no A4: manual, no se encola", async () => {
    const r = await cola.prepararImpresion("AR.26.05099", "ivan", T0, async () => pdfDe("AR2605099-10.pdf", false));
    expect(r.manuales).toEqual(["AR2605099-10.pdf"]);
    expect(cola.leerImpresionesDe("AR.26.05099")[0].estado).toBe("manual");
  });

  it("si una copia falla: se descarta con el motivo, las demás se encolan y no lanza", async () => {
    const buenos = pdfDe("BUENO.pdf", true).ficheros[0];
    const roto = { ...buenos, nombre: "ROTO.pdf", ruta: path.join(dir, "no-existe.pdf") };
    const r = await cola.prepararImpresion("AR.26.07000", "ivan", T0, async () => ({ aviso: null, ficheros: [roto, buenos] }));
    expect(r.encolados).toBe(1);
    const filas = cola.leerImpresionesDe("AR.26.07000");
    expect(filas.find((f) => f.fichero === "ROTO.pdf")).toMatchObject({ estado: "descartado" });
    expect(filas.find((f) => f.fichero === "ROTO.pdf")!.error).toBeTruthy();
    expect(filas.find((f) => f.fichero === "BUENO.pdf")).toMatchObject({ estado: "pendiente" });
    expect(cola.pendientesParaEnviar(T0).every((p) => p.copia)).toBe(true);
  });

  it("sin planteamiento: se anota con el motivo", async () => {
    await cola.prepararImpresion("AR.26.00001", "ivan", T0, async () => ({ ficheros: [], aviso: "No puedo leer la carpeta Planteamientos" }));
    expect(cola.leerImpresionesDe("AR.26.00001")[0]).toMatchObject({ estado: "sin_planteamiento", error: "No puedo leer la carpeta Planteamientos" });
  });
});

describe("el trabajador", () => {
  it("manda lo pendiente, lo marca enviado y borra la copia", async () => {
    await cola.prepararImpresion("AR.26.05016", "ivan", T0, async () => pdfDe("AR2605016-10.pdf", true));
    // Otras pruebas comparten la carpeta de copias: se cuenta antes y después.
    const copias = () => readdirSync(process.env.COORDINA_PLANTEAMIENTOS_COPIAS!).length;
    const antes = copias();
    expect(antes).toBeGreaterThan(0);
    const imprimir = vi.fn<(...a: unknown[]) => Promise<{ trabajo: number | null }>>(async () => ({ trabajo: 77 }));
    expect(await worker.vueltaImpresion(T0, imprimir)).toBe(1);
    expect(imprimir.mock.calls[0][0]).toBe("ipp://192.168.4.245/ipp");
    const [f] = cola.leerImpresionesDe("AR.26.05016");
    expect(f).toMatchObject({ estado: "enviado", impresora: "ipp://192.168.4.245/ipp", modo: "activo" });
    expect(copias()).toBe(antes - 1);
  });

  it("si la copia ya no existe: se descarta y la vuelta sigue con la siguiente", async () => {
    await cola.prepararImpresion("AR.26.07001", "ivan", T0, async () => pdfDe("A.pdf", true));
    await cola.prepararImpresion("AR.26.07002", "ivan", T0, async () => pdfDe("B.pdf", true));
    const { getDb } = await import("../server/estado-db");
    const primera = getDb().prepare("SELECT copia FROM planteamiento_impresion WHERE pedido_id = 'AR.26.07001'").get() as { copia: string };
    rmSync(primera.copia, { force: true });
    const imprimir = vi.fn<(...a: unknown[]) => Promise<{ trabajo: number | null }>>(async () => ({ trabajo: 5 }));
    expect(await worker.vueltaImpresion(T0, imprimir)).toBe(1);
    expect(imprimir).toHaveBeenCalledTimes(1);
    expect(cola.leerImpresionesDe("AR.26.07001")[0]).toMatchObject({ estado: "descartado" });
    expect(cola.leerImpresionesDe("AR.26.07001")[0].error).toMatch(/copia/i);
    expect(cola.leerImpresionesDe("AR.26.07002")[0]).toMatchObject({ estado: "enviado" });
  });

  it("en ensayo anota el modo", async () => {
    await cola.prepararImpresion("AR.26.05016", "ivan", T0, async () => pdfDe("AR2605016-10.pdf", true));
    process.env.IMPRESION_PRODUCCION = "ensayo";
    await worker.vueltaImpresion(T0, vi.fn(async () => ({ trabajo: 1 })));
    expect(cola.leerImpresionesDe("AR.26.05016")[0]).toMatchObject({ estado: "enviado", modo: "ensayo" });
  });

  it("si falla, espera cada vez más antes de reintentar", async () => {
    await cola.prepararImpresion("AR.26.05016", "ivan", T0, async () => pdfDe("AR2605016-10.pdf", true));
    const falla = vi.fn(async () => { throw new Error("La impresora no responde (ECONNREFUSED)"); });
    await worker.vueltaImpresion(T0, falla);
    expect(cola.leerImpresionesDe("AR.26.05016")[0]).toMatchObject({ estado: "pendiente", intentos: 1, error: "La impresora no responde (ECONNREFUSED)" });
    // Antes de la espera no se reintenta…
    await worker.vueltaImpresion(new Date(T0.getTime() + 10_000), falla);
    expect(falla).toHaveBeenCalledTimes(1);
    // …y pasada, sí.
    await worker.vueltaImpresion(new Date(T0.getTime() + 31_000), falla);
    expect(falla).toHaveBeenCalledTimes(2);
  });

  it("en off no manda nada", async () => {
    await cola.prepararImpresion("AR.26.05016", "ivan", T0, async () => pdfDe("AR2605016-10.pdf", true));
    process.env.IMPRESION_PRODUCCION = "off";
    const imprimir = vi.fn(async () => ({ trabajo: 1 }));
    expect(await worker.vueltaImpresion(T0, imprimir)).toBe(0);
    expect(imprimir).not.toHaveBeenCalled();
  });
});

describe("departamento de la impresora y comprobación", () => {
  const conDepartamento = async (modo: string, clave: string | null) => {
    process.env.IMPRESION_PRODUCCION = modo;
    process.env.IMPRESORA_ENSAYO_DEPARTAMENTO = "66";
    if (clave) process.env.IMPRESORA_ENSAYO_DEPARTAMENTO_CLAVE = clave;
    try {
      await cola.prepararImpresion("AR.26.05016", "ivan", T0, async () => pdfDe("AR2605016-10.pdf", true));
      const imprimir = vi.fn<(...a: unknown[]) => Promise<{ trabajo: number | null }>>(async () => ({ trabajo: null }));
      expect(await worker.vueltaImpresion(T0, imprimir)).toBe(1);
      return imprimir.mock.calls[0];
    } finally {
      process.env.IMPRESION_PRODUCCION = "activo";
      delete process.env.IMPRESORA_ENSAYO_DEPARTAMENTO;
      delete process.env.IMPRESORA_ENSAYO_DEPARTAMENTO_CLAVE;
    }
  };

  it("en ensayo (la de OT, de color) el trabajo lleva el departamento", async () => {
    const [uri, , t] = await conDepartamento("ensayo", "ABCDEF");
    expect(uri).toBe("ipp://192.168.4.249/ipp");
    expect(t).toMatchObject({ usuario: "CoordinaOT", departamento: { codigo: "66", claveCifrada: "ABCDEF" } });
  });

  it("en activo (Producción, sin control de copias) no lleva departamento: va por IPP", async () => {
    const [uri, , t] = await conDepartamento("activo", "ABCDEF");
    expect(uri).toBe("ipp://192.168.4.245/ipp");
    expect(t).not.toHaveProperty("departamento");
  });

  it("sin clave del departamento no se manda departamento", async () => {
    const [, , t] = await conDepartamento("ensayo", null);
    expect(t).not.toHaveProperty("departamento");
  });

  it("si la impresora aborta el trabajo, no se da por impreso", async () => {
    await cola.prepararImpresion("AR.26.05016", "ivan", T0, async () => pdfDe("AR2605016-10.pdf", true));
    const imprimir = vi.fn<(...a: unknown[]) => Promise<{ trabajo: number | null }>>(async () => ({ trabajo: 8597 }));
    const comprobar = vi.fn(async () => 8);
    expect(await worker.vueltaImpresion(T0, imprimir, comprobar)).toBe(0);
    expect(comprobar.mock.calls[0]).toEqual(["ipp://192.168.4.245/ipp", 8597, expect.objectContaining({ usuario: "CoordinaOT" })]);
    const [f] = cola.leerImpresionesDe("AR.26.05016");
    expect(f.estado).toBe("descartado");
    expect(f.error).toMatch(/abortó/);
  });

  it("si termina o sigue en cola, sí cuenta como enviado", async () => {
    await cola.prepararImpresion("AR.26.05016", "ivan", T0, async () => pdfDe("AR2605016-10.pdf", true));
    expect(await worker.vueltaImpresion(T0, vi.fn<(...a: unknown[]) => Promise<{ trabajo: number | null }>>(async () => ({ trabajo: 1 })), vi.fn(async () => 9))).toBe(1);
    expect(cola.leerImpresionesDe("AR.26.05016")[0].estado).toBe("enviado");
  });
});

describe("lo elegido a mano al pasar", () => {
  it("solo se encola lo elegido", async () => {
    const r = await cola.prepararImpresion("AR.26.05016", "ivan", T0, async () => ({
      aviso: null,
      ficheros: [...pdfDe("AR2605016-1.pdf", true).ficheros, ...pdfDe("AR2605016-10.pdf", true).ficheros],
    }), new Set(["AR2605016-10.pdf"]));
    expect(r.encolados).toBe(1);
    expect(cola.leerImpresionesDe("AR.26.05016").map((f) => f.fichero)).toEqual(["AR2605016-10.pdf"]);
  });

  it("si no se eligió ninguno de los que hay, no se anota «sin planteamiento»", async () => {
    await cola.prepararImpresion("AR.26.05016", "ivan", T0, async () => pdfDe("AR2605016-1.pdf", true), new Set(["otro.pdf"]));
    expect(cola.leerImpresionesDe("AR.26.05016")).toEqual([]);
  });
});
