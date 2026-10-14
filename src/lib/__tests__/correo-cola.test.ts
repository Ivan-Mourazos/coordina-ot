import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Planteamientos } from "../server/planteamiento-pdf";
import type { Correo } from "../server/graph-correo";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-correo-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.COORDINA_PLANTEAMIENTOS_COPIAS = path.join(dir, "copias");
  process.env.DATASOURCE = "mock";
});
afterAll(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
});

let cola: typeof import("../server/correo-cola");
let worker: typeof import("../server/correo-worker");
let graph: typeof import("../server/graph-correo");

beforeEach(async () => {
  vi.resetModules();
  process.env.CORREO_PLANTEAMIENTO = "activo";
  process.env.GRAPH_TENANT_ID = "t";
  process.env.GRAPH_CLIENT_ID = "c";
  process.env.GRAPH_CLIENT_SECRET = "s";
  for (const v of ["CORREO_PARA", "CORREO_ENSAYO_PARA", "CORREO_REMITENTE", "CORREO_RESPONDER_A"]) delete process.env[v];
  const { getDb } = await import("../server/estado-db");
  getDb().exec("DELETE FROM planteamiento_correo");
  cola = await import("../server/correo-cola");
  worker = await import("../server/correo-worker");
  graph = await import("../server/graph-correo");
});

const T0 = new Date("2026-10-14T09:00:00Z");
const EXISTE = path.join(__dirname, "planteamiento.test.ts");
const DATOS = {
  pedido: "AR.26.05016",
  cliente: "Bar Central",
  ofs: [{ codigo: "0232968", descripcion: "TOLDO PUNTO RECTO", planteoMin: 30, autor: "Tamara", revisionMin: 0, revisor: null }],
  pasadoPor: "Iván Sánchez",
};
const planteamientos = (...f: Array<[string, string, boolean]>): Planteamientos => ({
  aviso: null,
  ficheros: f.map(([nombre, ruta, todoA4]) => ({ nombre, ruta, origen: "planteamientos" as const, paginas: 1, todoA4 })),
});
const copias = () => readdirSync(process.env.COORDINA_PLANTEAMIENTOS_COPIAS!).filter((n) => n.startsWith("correo-")).length;

describe("modo y destinatarios", () => {
  it("apagado por defecto; activo a OT y Producción; ensayo solo a Iván", () => {
    delete process.env.CORREO_PLANTEAMIENTO;
    expect(cola.modoCorreo()).toBe("off");
    expect(cola.destinatariosCorreo("activo")).toEqual(["of.tecnica@toldosgomez.com", "produccion@toldosgomez.com"]);
    expect(cola.destinatariosCorreo("ensayo")).toEqual(["ivan.sanchez@toldosgomez.com"]);
    expect(cola.destinatariosCorreo("off")).toEqual([]);
  });
});

describe("al pasar el pedido", () => {
  it("adjunta solo los de PVC (-10 en adelante) y congela lo que toca", async () => {
    const r = await cola.prepararCorreo(DATOS, "ivan", T0, async () =>
      planteamientos(["AR2605016-1.pdf", EXISTE, false], ["AR2605016-10.pdf", EXISTE, true]));
    expect(r).toEqual({ encolado: true, aviso: null });
    const [f] = cola.leerCorreosDe("AR.26.05016");
    expect(f).toMatchObject({
      estado: "pendiente",
      ficheros: ["AR2605016-10.pdf"],
      para: ["of.tecnica@toldosgomez.com", "produccion@toldosgomez.com"],
      asunto: "Planteamiento AR.26.05016 · Bar Central",
      modo: "activo",
      pasadoPor: "ivan",
    });
  });

  it("sin planteamiento no hay correo: se anota con el motivo", async () => {
    const r = await cola.prepararCorreo(DATOS, "ivan", T0, async () => ({ ficheros: [], aviso: "No puedo leer la carpeta Planteamientos" }));
    expect(r.encolado).toBe(false);
    expect(cola.leerCorreosDe("AR.26.05016")[0]).toMatchObject({ estado: "sin_planteamiento", error: "No puedo leer la carpeta Planteamientos" });
  });

  it("un PDF que no se deja copiar se queda fuera; si no queda ninguno de los adjuntos, descartado; nunca lanza", async () => {
    await cola.prepararCorreo(DATOS, "ivan", T0, async () =>
      planteamientos(["AR2605016-11.pdf", path.join(dir, "no-existe.pdf"), true], ["AR2605016-10.pdf", EXISTE, true]));
    expect(cola.leerCorreosDe("AR.26.05016")[0]).toMatchObject({ estado: "pendiente", ficheros: ["AR2605016-10.pdf"] });
    expect(cola.leerCorreosDe("AR.26.05016")[0].error).toContain("AR2605016-11.pdf");

    await cola.prepararCorreo({ ...DATOS, pedido: "AR.26.05017" }, "ivan", T0, async () =>
      planteamientos(["AR2605017-10.pdf", path.join(dir, "no-existe.pdf"), true]));
    expect(cola.leerCorreosDe("AR.26.05017")[0].estado).toBe("descartado");
  });

  it("en ensayo va solo a Iván", async () => {
    process.env.CORREO_PLANTEAMIENTO = "ensayo";
    await cola.prepararCorreo(DATOS, "ivan", T0, async () => planteamientos(["AR2605016-10.pdf", EXISTE, true]));
    expect(cola.leerCorreosDe("AR.26.05016")[0]).toMatchObject({ para: ["ivan.sanchez@toldosgomez.com"], modo: "ensayo" });
  });
});

describe("el trabajador", () => {
  it("manda el correo congelado con sus adjuntos, lo marca enviado y borra las copias", async () => {
    await cola.prepararCorreo(DATOS, "ivan", T0, async () => planteamientos(["AR2605016-10.pdf", EXISTE, true]));
    const antes = copias();
    const enviados: Correo[] = [];
    const enviar = vi.fn(async (c: Correo) => { enviados.push(c); });
    expect(await worker.vueltaCorreo(T0, enviar)).toBe(1);
    expect(enviados[0]).toMatchObject({
      de: "coordina@toldosgomez.com",
      para: ["of.tecnica@toldosgomez.com", "produccion@toldosgomez.com"],
      responderA: "of.tecnica@toldosgomez.com",
      asunto: "Planteamiento AR.26.05016 · Bar Central",
    });
    expect(enviados[0].texto).toContain("Pedido AR.26.05016 · Bar Central");
    expect(enviados[0].texto).toContain("OF 0232968 · TOLDO PUNTO RECTO");
    // Sale en HTML (negritas y tamaños); el texto queda de respaldo.
    expect(enviados[0].html).toContain("<b>OF 0232968</b> · TOLDO PUNTO RECTO");
    expect(enviados[0].html).toContain("PLANTEAMIENTO");
    expect(enviados[0].adjuntos[0].nombre).toBe("AR2605016-10.pdf");
    expect(enviados[0].adjuntos[0].bytes.length).toBeGreaterThan(0);
    expect(cola.leerCorreosDe("AR.26.05016")[0].estado).toBe("enviado");
    expect(copias()).toBe(antes - 1);
  });

  it("con varios planteamientos (-10, -11, -12) van todos adjuntos en el mismo correo", async () => {
    await cola.prepararCorreo(DATOS, "ivan", T0, async () => planteamientos(
      ["AR2605016-10.pdf", EXISTE, true], ["AR.26.05016-11.pdf", EXISTE, true], ["AR2605016-12.pdf", EXISTE, false]));
    const enviados: Correo[] = [];
    await worker.vueltaCorreo(T0, vi.fn(async (c: Correo) => { enviados.push(c); }));
    expect(enviados).toHaveLength(1);
    expect(enviados[0].adjuntos.map((a) => a.nombre)).toEqual(["AR2605016-10.pdf", "AR.26.05016-11.pdf", "AR2605016-12.pdf"]);
    expect(enviados[0].texto).toContain("Adjuntos: AR2605016-10.pdf, AR.26.05016-11.pdf, AR2605016-12.pdf");
  });

  it("solo toldos (-1): correo sin adjuntos que avisa de lo impreso", async () => {
    process.env.IMPRESION_PRODUCCION = "activo";
    try {
      await cola.prepararCorreo(DATOS, "ivan", T0, async () => planteamientos(["AR2605016-1.pdf", EXISTE, true]));
      const enviados: Correo[] = [];
      expect(await worker.vueltaCorreo(T0, vi.fn(async (c: Correo) => { enviados.push(c); }))).toBe(1);
      expect(enviados[0].adjuntos).toEqual([]);
      expect(enviados[0].asunto).toBe("Impreso AR.26.05016 · Bar Central");
      expect(enviados[0].texto).toContain("Impreso en Producción: AR2605016-1.pdf");
      expect(enviados[0].texto).not.toContain("Adjunto");
      // Lleva lo mismo que el de PVC: pedido, cada OF con sus tiempos y quién lo pasó.
      expect(enviados[0].texto).toContain("Pedido AR.26.05016 · Bar Central");
      expect(enviados[0].texto).toContain("OF 0232968 · TOLDO PUNTO RECTO\n   Planteo 30 min (Tamara) · Sin revisión");
      expect(enviados[0].texto).toContain("Pasado a Producción por: Iván Sánchez");
    } finally {
      delete process.env.IMPRESION_PRODUCCION;
    }
  });

  it("rechazo que no se arregla reintentando: descartado y sigue con el siguiente", async () => {
    await cola.prepararCorreo(DATOS, "ivan", T0, async () => planteamientos(["AR2605016-10.pdf", EXISTE, true]));
    await cola.prepararCorreo({ ...DATOS, pedido: "AR.26.05017" }, "ivan", T0, async () => planteamientos(["AR2605017-10.pdf", EXISTE, true]));
    let n = 0;
    const enviar = vi.fn(async () => {
      n += 1;
      if (n === 1) throw new graph.ErrorGraph("Microsoft no aceptó el correo: Access is denied", false);
    });
    expect(await worker.vueltaCorreo(T0, enviar)).toBe(1);
    expect(cola.leerCorreosDe("AR.26.05016")[0]).toMatchObject({ estado: "descartado", error: "Microsoft no aceptó el correo: Access is denied" });
    expect(cola.leerCorreosDe("AR.26.05017")[0].estado).toBe("enviado");
  });

  it("fallo reintentable: espera cada vez más y para la vuelta", async () => {
    await cola.prepararCorreo(DATOS, "ivan", T0, async () => planteamientos(["AR2605016-10.pdf", EXISTE, true]));
    const falla = vi.fn(async () => { throw new graph.ErrorGraph("Microsoft no responde (fetch failed)", true); });
    await worker.vueltaCorreo(T0, falla);
    expect(cola.leerCorreosDe("AR.26.05016")[0]).toMatchObject({ estado: "pendiente", intentos: 1 });
    await worker.vueltaCorreo(new Date(T0.getTime() + 10_000), falla);
    expect(falla).toHaveBeenCalledTimes(1);
    await worker.vueltaCorreo(new Date(T0.getTime() + 31_000), falla);
    expect(falla).toHaveBeenCalledTimes(2);
  });

  it("si falta una copia, descartado con el motivo y sigue", async () => {
    await cola.prepararCorreo(DATOS, "ivan", T0, async () => planteamientos(["AR2605016-10.pdf", EXISTE, true]));
    const d = process.env.COORDINA_PLANTEAMIENTOS_COPIAS!;
    for (const n of readdirSync(d).filter((x) => x.startsWith("correo-"))) unlinkSync(path.join(d, n));
    const enviar = vi.fn(async () => {});
    expect(await worker.vueltaCorreo(T0, enviar)).toBe(0);
    expect(enviar).not.toHaveBeenCalled();
    expect(cola.leerCorreosDe("AR.26.05016")[0]).toMatchObject({ estado: "descartado" });
  });

  it("sin credenciales de Microsoft no intenta nada; en off tampoco", async () => {
    await cola.prepararCorreo(DATOS, "ivan", T0, async () => planteamientos(["AR2605016-10.pdf", EXISTE, true]));
    delete process.env.GRAPH_CLIENT_SECRET;
    const enviar = vi.fn(async () => {});
    expect(await worker.vueltaCorreo(T0, enviar)).toBe(0);
    process.env.GRAPH_CLIENT_SECRET = "s";
    process.env.CORREO_PLANTEAMIENTO = "off";
    expect(await worker.vueltaCorreo(T0, enviar)).toBe(0);
    expect(enviar).not.toHaveBeenCalled();
  });
});

describe("reenviar", () => {
  it("el de toldos, sin adjuntos, también se puede reenviar", async () => {
    await cola.prepararCorreo(DATOS, "ivan", T0, async () => planteamientos(["AR2605016-1.pdf", EXISTE, true]));
    await worker.vueltaCorreo(T0, vi.fn(async () => {}));
    expect(await cola.reenviarUltimo("AR.26.05016", "ivan", T0, async () => ({ ficheros: [], aviso: null }))).toBe(true);
    expect(cola.leerCorreosDe("AR.26.05016")[0]).toMatchObject({ estado: "pendiente", ficheros: [] });
  });

  it("vuelve a encolar el último correo con el mismo asunto y PDF", async () => {
    await cola.prepararCorreo(DATOS, "ivan", T0, async () => planteamientos(["AR2605016-10.pdf", EXISTE, true]));
    await worker.vueltaCorreo(T0, vi.fn(async () => {}));
    const ok = await cola.reenviarUltimo("AR.26.05016", "tamara", T0, async () => planteamientos(["AR2605016-10.pdf", EXISTE, true]));
    expect(ok).toBe(true);
    const [nuevo, viejo] = cola.leerCorreosDe("AR.26.05016");
    expect(nuevo).toMatchObject({ estado: "pendiente", asunto: viejo.asunto, ficheros: ["AR2605016-10.pdf"], pasadoPor: "tamara" });
  });

  it("el reenvío sale en HTML como el original", async () => {
    await cola.prepararCorreo(DATOS, "ivan", T0, async () => planteamientos(["AR2605016-10.pdf", EXISTE, true]));
    await worker.vueltaCorreo(T0, vi.fn(async () => {}));
    await cola.reenviarUltimo("AR.26.05016", "ivan", T0, async () => planteamientos(["AR2605016-10.pdf", EXISTE, true]));
    const enviados: Correo[] = [];
    await worker.vueltaCorreo(T0, vi.fn(async (c: Correo) => { enviados.push(c); }));
    expect(enviados[0].html).toContain("<b>OF 0232968</b>");
  });

  it("sin correo previo no hay nada que reenviar", async () => {
    expect(await cola.reenviarUltimo("AR.26.09999", "ivan", T0, async () => ({ ficheros: [], aviso: null }))).toBe(false);
  });
});
