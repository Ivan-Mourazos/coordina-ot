import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { claveParte } from "../planteamiento";
import type { Planteamientos } from "../server/planteamiento-pdf";

let dir: string;
let cola: typeof import("../server/impresion-cola");
let worker: typeof import("../server/impresion-worker");
let getDb: typeof import("../server/estado-db").getDb;
let rutaPdf: string;

const A4: [number, number] = [595.28, 841.89];
const A5_HORIZONTAL: [number, number] = [595.28, 419.53];
const T0 = new Date("2026-11-04T09:00:00Z");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-reparto-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.COORDINA_PLANTEAMIENTOS_COPIAS = path.join(dir, "copias");
  // Un planteamiento como los de verdad: A4, un A5 apaisado y otro A4.
  const doc = await PDFDocument.create();
  doc.addPage(A4);
  doc.addPage(A5_HORIZONTAL);
  doc.addPage(A4);
  rutaPdf = path.join(dir, "AR2605333-10.pdf");
  writeFileSync(rutaPdf, await doc.save());
  ({ getDb } = await import("../server/estado-db"));
  cola = await import("../server/impresion-cola");
  worker = await import("../server/impresion-worker");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

beforeEach(() => {
  getDb().exec("DELETE FROM planteamiento_impresion");
  process.env.IMPRESORA_ENSAYO_DEPARTAMENTO = "OT";
  process.env.IMPRESORA_ENSAYO_DEPARTAMENTO_CLAVE = "abcd";
  process.env.IMPRESION_PRODUCCION = "activo";
});

const buscar = async (): Promise<Planteamientos> => ({
  aviso: null,
  ficheros: [{
    nombre: "AR2605333-10.pdf", ruta: rutaPdf, origen: "planteamientos", paginas: 3, todoA4: false,
    tamanos: [{ papel: "A4", horizontal: false }, { papel: "A5", horizontal: true }, { papel: "A4", horizontal: false }],
  }],
});

const paginasDe = async (ruta: string) => {
  const d = await PDFDocument.load(readFileSync(ruta));
  return d.getPages().map((p) => ({ ...p.getSize(), giro: p.getRotation().angle }));
};

const copiaDe = (id: number) =>
  (getDb().prepare("SELECT copia FROM planteamiento_impresion WHERE id = ?").get(id) as { copia: string }).copia;

test("el A4 va a Producción y el A5 a OT, cada uno con sus páginas", async () => {
  const r = await cola.prepararImpresion("AR.26.05333", "ivan", T0, buscar);
  expect(r).toEqual({ encolados: 2, manuales: [], aviso: null });
  const filas = cola.leerImpresionesDe("AR.26.05333").reverse();
  expect(filas.map((f) => [f.destino, f.papel, f.paginasSel, f.paginas, f.estado])).toEqual([
    ["produccion", "A4", "1, 3", 2, "pendiente"],
    ["ot", "A5", "2", 1, "pendiente"],
  ]);
  expect((await paginasDe(copiaDe(filas[0].id))).length).toBe(2);
  expect(await paginasDe(copiaDe(filas[1].id))).toEqual([{ width: 595.28, height: 419.53, giro: 0 }]);
});

test("el A5 se gira si se pide vertical, y se puede dejar a mano", async () => {
  await cola.prepararImpresion("AR.26.05333", "ivan", T0, buscar, undefined, {
    orientaciones: { [claveParte("AR2605333-10.pdf", "A5")]: "vertical" },
    aMano: [],
  });
  const a5 = cola.leerImpresionesDe("AR.26.05333").find((f) => f.papel === "A5")!;
  expect((await paginasDe(copiaDe(a5.id)))[0].giro).toBe(90);

  getDb().exec("DELETE FROM planteamiento_impresion");
  const r = await cola.prepararImpresion("AR.26.05333", "ivan", T0, buscar, undefined, {
    orientaciones: {},
    aMano: [claveParte("AR2605333-10.pdf", "A5")],
  });
  expect(r.encolados).toBe(1);
  expect(cola.leerImpresionesDe("AR.26.05333").find((f) => f.papel === "A5")?.estado).toBe("manual");
});

test("sin código de departamento, el A5 no se manda solo: queda a mano como antes", async () => {
  delete process.env.IMPRESORA_ENSAYO_DEPARTAMENTO;
  const r = await cola.prepararImpresion("AR.26.05333", "ivan", T0, buscar);
  expect(r).toMatchObject({ encolados: 1, manuales: ["AR2605333-10.pdf"] });
});

test("reimprimir una sola parte", async () => {
  const r = await cola.prepararImpresion("AR.26.05333", "ivan", T0, buscar, undefined, undefined, { fichero: "AR2605333-10.pdf", papel: "A5" });
  expect(r.encolados).toBe(1);
  expect(cola.leerImpresionesDe("AR.26.05333").map((f) => f.papel)).toEqual(["A5"]);
});

test("el trabajador manda cada parte a su impresora con su papel, y el A5 con el código de OT", async () => {
  await cola.prepararImpresion("AR.26.05333", "ivan", T0, buscar);
  const mandados: Array<{ uri: string; nombre: string; papel?: string; departamento: boolean }> = [];
  const n = await worker.vueltaImpresion(T0, async (uri, _pdf, t) => {
    mandados.push({ uri, nombre: t.nombre, papel: t.papel, departamento: Boolean(t.departamento) });
    return { trabajo: null };
  });
  expect(n).toBe(2);
  expect(mandados).toEqual([
    { uri: "ipp://192.168.4.245/ipp", nombre: "Planteamiento AR.26.05333", papel: "A4", departamento: false },
    { uri: "ipp://192.168.4.249/ipp", nombre: "Planteamiento AR.26.05333 (A5)", papel: "A5", departamento: true },
  ]);
});

test("si Producción no responde, el A5 sale igual por la de OT", async () => {
  await cola.prepararImpresion("AR.26.05333", "ivan", T0, buscar);
  const n = await worker.vueltaImpresion(T0, async (uri) => {
    if (uri.includes("245")) throw new Error("La impresora no responde");
    return { trabajo: null };
  });
  expect(n).toBe(1);
  const filas = cola.leerImpresionesDe("AR.26.05333");
  expect(filas.find((f) => f.papel === "A5")?.estado).toBe("enviado");
  expect(filas.find((f) => f.papel === "A4")?.estado).toBe("pendiente");
});
