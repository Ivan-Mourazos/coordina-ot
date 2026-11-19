// src/lib/__tests__/visita-correo.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Correo } from "../server/graph-correo";
import type { EntradaVisita } from "../visita";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-visita-correo-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.DATASOURCE = "mock";
});
afterAll(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

let cola: typeof import("../server/visita-correo-cola");
let worker: typeof import("../server/visita-correo-worker");
let servicio: typeof import("../server/pedir-visita");
let graph: typeof import("../server/graph-correo");
let getDb: typeof import("../server/estado-db").getDb;

beforeEach(async () => {
  vi.resetModules();
  process.env.CORREO_VISITA = "activo";
  process.env.CORREO_VISITA_PARA = "instalaciones@x.com";
  process.env.CORREO_VISITA_CC = "of.tecnica@x.com, produccion@x.com";
  process.env.GRAPH_TENANT_ID = "t";
  process.env.GRAPH_CLIENT_ID = "c";
  process.env.GRAPH_CLIENT_SECRET = "s";
  delete process.env.CORREO_ENSAYO_PARA;
  ({ getDb } = await import("../server/estado-db"));
  getDb().exec("DELETE FROM visita_correo; DELETE FROM nota_pedido; DELETE FROM visita_nombre;");
  cola = await import("../server/visita-correo-cola");
  worker = await import("../server/visita-correo-worker");
  servicio = await import("../server/pedir-visita");
  graph = await import("../server/graph-correo");
});

const T0 = new Date("2026-11-19T09:00:00Z");
const NOMBRES: Record<string, string> = { tamara: "Tamara Rey", alberto: "Alberto Gil" };
const nombreDe = (id: string) => NOMBRES[id] ?? null;
const ENTRADA: EntradaVisita = {
  pedido: "AR.26.05448", cliente: "Belts Vigo", solicitada: "2026-11-27", prioridad: 3,
  ofs: [{ codigo: "26/10234", descripcion: "Toldo cofre 5×3" }], viene: "Juan Castro",
  cuando: { tipo: "dia", fecha: "2026-11-25" }, motivo: null, atienden: ["tamara", "alberto"],
  noEstamos: [{ fecha: "2026-12-02", quien: ["tamara"] }, { fecha: "2026-12-03", quien: ["tamara"] }],
};

describe("modo y destinatarios", () => {
  it("activo: Instalaciones y copias del .env", () => {
    expect(cola.destinatariosVisita("activo")).toEqual({ para: ["instalaciones@x.com"], cc: ["of.tecnica@x.com", "produccion@x.com"] });
  });
  it("ensayo: todo a CORREO_ENSAYO_PARA, sin copias", () => {
    process.env.CORREO_ENSAYO_PARA = "ivan@x.com";
    expect(cola.destinatariosVisita("ensayo")).toEqual({ para: ["ivan@x.com"], cc: [] });
  });
  it("disponible solo con modo, credenciales y a quién mandar", () => {
    expect(cola.visitaDisponible()).toBe(true);
    process.env.CORREO_VISITA = "off";
    expect(cola.visitaDisponible()).toBe(false);
    process.env.CORREO_VISITA = "activo";
    delete process.env.CORREO_VISITA_PARA;
    expect(cola.visitaDisponible()).toBe(false);
    process.env.CORREO_VISITA_PARA = "instalaciones@x.com";
    delete process.env.GRAPH_CLIENT_SECRET;
    expect(cola.visitaDisponible()).toBe(false);
  });
});

describe("pedirVisita", () => {
  it("deja la nota para todos y encola el correo congelado", () => {
    const { notaId, correoId } = servicio.pedirVisita(ENTRADA, { id: "tamara", nombre: "Tamara Rey" }, T0, nombreDe);
    const nota = getDb().prepare("SELECT pedido, operario_id, texto, padre_id FROM nota_pedido WHERE id = ?").get(notaId) as Record<string, unknown>;
    expect(nota).toMatchObject({ pedido: "AR.26.05448", operario_id: "tamara", padre_id: null });
    expect(nota.texto).toBe("Visita solicitada a Instalaciones: Juan Castro con Tamara y Alberto, preferible mié 25/11. OF 26/10234.");
    const [c] = cola.visitasParaEnviar(T0);
    expect(c.id).toBe(correoId);
    expect(c.para).toEqual(["instalaciones@x.com"]);
    expect(c.asunto).toBe("Visita AR.26.05448");
    expect(c.html).toContain("<table");
    expect(c.cuerpo).toContain("2/12 al 3/12 · Tamara");
    expect(c.cuerpo).toContain("Pedido desde Coordina por Tamara.");
  });
  it("recuerda el nombre de quien viene", async () => {
    servicio.pedirVisita(ENTRADA, { id: "tamara", nombre: "Tamara Rey" }, T0, nombreDe);
    const { nombresVisita } = await import("../server/visitas-db");
    expect(nombresVisita()).toEqual(["Juan Castro"]);
  });
  it("quien atiende tiene que existir", () => {
    expect(() => servicio.pedirVisita({ ...ENTRADA, atienden: ["fantasma"] }, { id: "tamara", nombre: "Tamara Rey" }, T0, nombreDe))
      .toThrow(/atiende/);
  });
});

describe("worker", () => {
  it("manda lo pendiente y lo marca enviado", async () => {
    servicio.pedirVisita(ENTRADA, { id: "tamara", nombre: "Tamara Rey" }, T0, nombreDe);
    const enviados: Correo[] = [];
    expect(await worker.vueltaVisita(T0, async (c) => { enviados.push(c); })).toBe(1);
    expect(enviados[0].cc).toEqual(["of.tecnica@x.com", "produccion@x.com"]);
    expect(enviados[0].html).toContain("<b>Juan Castro</b>");
    expect(cola.visitasParaEnviar(T0)).toHaveLength(0);
  });
  it("fallo reintentable: espera y no descarta", async () => {
    servicio.pedirVisita(ENTRADA, { id: "tamara", nombre: "Tamara Rey" }, T0, nombreDe);
    await worker.vueltaVisita(T0, async () => { throw new graph.ErrorGraph("timeout", true); });
    expect(cola.visitasParaEnviar(T0)).toHaveLength(0);
    expect(cola.visitasParaEnviar(new Date(T0.getTime() + 24 * 3600_000))).toHaveLength(1);
  });
  it("descartado: responde en el hilo de la nota", async () => {
    const { notaId } = servicio.pedirVisita(ENTRADA, { id: "tamara", nombre: "Tamara Rey" }, T0, nombreDe);
    await worker.vueltaVisita(T0, async () => { throw new graph.ErrorGraph("sin permiso", false); });
    const resp = getDb().prepare("SELECT texto FROM nota_pedido WHERE padre_id = ?").all(notaId) as Array<{ texto: string }>;
    expect(resp).toHaveLength(1);
    expect(resp[0].texto).toMatch(/no se pudo enviar/i);
  });
});
