import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { NoConformidad } from "../no-conformidad";
import { pendientesDe, rectificadosDeSeccion, type MarcaRectificado, type Rectificado } from "../rectificados";

const nc = (cambios: Partial<NoConformidad>): NoConformidad => ({
  codigo: "NC010195",
  fecha: "2026-11-01",
  pedido: "AR.26.05085",
  rectificativo: "AR.26.05338",
  proceso1: null,
  proceso2: null,
  origen: "INCIDENCIA",
  descripcion: "POR RECTIFICAR MEDIDAS A TELAS TOLDO.",
  comentarios: "",
  cerrada: false,
  causas: [],
  defectos: [{ numero: 1, tipo: null, descripcion: "MEDIDAS CORRECTAS 314,5 CM / 460 CM" }],
  tareasDe: ["ot", "diseno"],
  familias: [],
  ...cambios,
});

const leerNcPeriodo = vi.fn(async () => [nc({})]);
vi.mock("../server/nc-db", () => ({
  leerNcPeriodo: () => leerNcPeriodo(),
  clientesDePedidos: async () => new Map([["AR.26.05085", "RADIO TV CRESPO, S.L."]]),
}));

let dir: string;
let route: typeof import("../../app/api/rectificados/route");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-rectificados-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  route = await import("../../app/api/rectificados/route");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

const sinMarcas = new Map<string, MarcaRectificado>();
const marca: MarcaRectificado = { resultado: "corregido", quien: "ivan", nombre: "Iván", en: "2026-11-02T08:00:00.000Z" };

test("entra por las tareas del pedido original, aunque la NC no traiga proceso ni causas", () => {
  const filas = rectificadosDeSeccion([nc({})], "ot", sinMarcas, new Map([["AR.26.05085", "CRESPO"]]));
  expect(filas).toHaveLength(1);
  expect(filas[0]).toMatchObject({ pedido: "AR.26.05085", rectificativo: "AR.26.05338", cliente: "CRESPO" });
});

test("no entran los de otra sección, los anteriores al corte ni los que no tienen rectificativo", () => {
  const todas = [
    nc({ codigo: "A", tareasDe: ["impresion"] }),
    nc({ codigo: "B", fecha: "2026-10-31" }),
    nc({ codigo: "C", rectificativo: null }),
    nc({ codigo: "D", pedido: null }),
  ];
  expect(rectificadosDeSeccion(todas, "ot", sinMarcas, new Map())).toEqual([]);
});

test("cada sección lleva su marca y lo pendiente va primero", () => {
  const todas = [nc({ codigo: "NC1", fecha: "2026-11-02" }), nc({ codigo: "NC2", fecha: "2026-11-01" })];
  const filas = rectificadosDeSeccion(todas, "ot", new Map([["NC1", marca]]), new Map());
  expect(filas.map((f) => f.nc)).toEqual(["NC2", "NC1"]);
  expect(pendientesDe(filas)).toBe(1);
});

async function lista(seccion = "ot"): Promise<Rectificado[]> {
  const res = await route.GET(new Request(`http://x/api/rectificados?seccion=${seccion}`));
  return ((await res.json()) as { rectificados: Rectificado[] }).rectificados;
}

const pedir = (metodo: "POST" | "DELETE", cuerpo: unknown) =>
  route[metodo](new Request("http://x/api/rectificados", { method: metodo, body: JSON.stringify(cuerpo) }));

test("marcar por sección y deshacer", async () => {
  const quien = "ivan";
  const res = await pedir("POST", { nc: "NC010195", seccion: "ot", resultado: "ya_estaba", operarioId: quien });
  expect(res.status).toBe(200);

  expect((await lista("ot"))[0].marca).toMatchObject({ resultado: "ya_estaba" });
  expect((await lista("diseno"))[0].marca).toBeNull();

  await pedir("DELETE", { nc: "NC010195", seccion: "ot", operarioId: quien });
  expect((await lista("ot"))[0].marca).toBeNull();
});

test("rechaza resultado, NC o sección que no valen", async () => {
  const base = { nc: "NC010195", seccion: "ot", resultado: "corregido", operarioId: "ivan" };
  expect((await pedir("POST", { ...base, resultado: "toString" })).status).toBe(400);
  expect((await pedir("POST", { ...base, nc: "x' OR 1" })).status).toBe(400);
  expect((await pedir("POST", { ...base, seccion: "impresion" })).status).toBe(400);
  expect((await route.GET(new Request("http://x/api/rectificados?seccion=impresion"))).status).toBe(400);
});
