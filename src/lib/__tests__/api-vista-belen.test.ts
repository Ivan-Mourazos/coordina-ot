import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// La cuenta de Belén (rol `produccion`, migración 16) lee su pantalla y no
// escribe nada: como Dirección, toda escritura pide `tecnico`.

let dir: string;
let s: typeof import("../server/sesion");
let estado: typeof import("../../app/api/estado/route");
let fichaje: typeof import("../../app/api/fichaje/route");
let notas: typeof import("../../app/api/notas/route");
let vista: typeof import("../../app/api/vista-belen/route");
let db: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-belen-api-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.COORDINA_SESION_SECRET = "secreto-de-pruebas";
  process.env.COORDINA_LOGIN = "activo";
  s = await import("../server/sesion");
  estado = await import("../../app/api/estado/route");
  fichaje = await import("../../app/api/fichaje/route");
  notas = await import("../../app/api/notas/route");
  vista = await import("../../app/api/vista-belen/route");
  db = await import("../server/estado-db");
  db.getDb();
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

const belen = () => ({ cookie: `${s.COOKIE}=${s.firmarSesion("belen")}` });
const peticion = (url: string, method: string, body?: unknown, cabeceras = belen()) =>
  new Request(url, { method, headers: cabeceras, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

test("la migración da de alta a Belén, activa, sin PIN y solo con produccion", () => {
  const fila = db.getDb().prepare("SELECT roles, activo, pin_hash FROM persona WHERE id = 'belen'").get();
  expect(fila).toEqual({ roles: "produccion", activo: 1, pin_hash: null });
  const yo = s.quienEs(new Request("http://x/", { headers: belen() }));
  expect(yo?.roles).toEqual(["produccion"]);
});

test("cambiar el estado de una OF: 403", async () => {
  const res = await estado.POST(
    peticion("http://x/api/estado", "POST", {
      motivo: "aprobar",
      cambiosOF: [{ ofId: "of-b-1", autorId: "alberto", revisorId: "tamara", estado: "aprobada", observacion: null }],
    }),
  );
  expect(res.status).toBe(403);
});

test("fichar: 403", async () => {
  const res = await fichaje.POST(peticion("http://x/api/fichaje", "POST", { ofIds: ["of-b-1"], rol: "plantear" }));
  expect(res.status).toBe(403);
});

// ─── Notas: Belén habla con OT (10/11/2026) ──────────────────────────────────
const ivan = () => ({ cookie: `${s.COOKIE}=${s.firmarSesion("ivan")}` });
const carlos = () => ({ cookie: `${s.COOKIE}=${s.firmarSesion("carlos")}` });

test("Belén escribe una nota y sale con su nombre", async () => {
  const res = await notas.POST(peticion("http://x/api/notas", "POST", { pedido: "AR.26.00002", texto: "¿Cuándo sale?", publica: true }));
  expect(res.status).toBe(200);
  const { nota } = (await res.json()) as { nota: { operarioId: string } };
  expect(nota.operarioId).toBe("belen");
});

test("lee las «para todos» y las suyas, nunca las internas de OT", async () => {
  await notas.POST(peticion("http://x/api/notas", "POST", { pedido: "AR.26.00002", texto: "interna de OT" }, ivan()));
  await notas.POST(peticion("http://x/api/notas", "POST", { pedido: "AR.26.00002", texto: "sale el jueves", publica: true }, ivan()));
  await notas.POST(peticion("http://x/api/notas", "POST", { pedido: "AR.26.00002", texto: "privada de Belén" }));

  const suya = await notas.GET(peticion("http://x/api/notas?pedido=AR.26.00002", "GET"));
  const textos = ((await suya.json()) as { notas: { texto: string; autor?: string }[] }).notas.map((n) => n.texto);
  expect(textos).toEqual(["¿Cuándo sale?", "sale el jueves", "privada de Belén"]);

  // OT lo ve todo, y la de Belén con su nombre.
  const deOT = await notas.GET(peticion("http://x/api/notas?pedido=AR.26.00002", "GET", undefined, ivan()));
  const todas = ((await deOT.json()) as { notas: { texto: string; autor?: string }[] }).notas;
  expect(todas.map((n) => n.texto)).toContain("interna de OT");
  expect(todas.find((n) => n.texto === "¿Cuándo sale?")?.autor).toBe("Belén");
});

test("no puede editar ni borrar las notas de otro", async () => {
  const deOT = await notas.GET(peticion("http://x/api/notas?pedido=AR.26.00002", "GET", undefined, ivan()));
  const ajena = ((await deOT.json()) as { notas: { id: number; texto: string }[] }).notas.find((n) => n.texto === "sale el jueves")!;
  const editar = await notas.PATCH(peticion("http://x/api/notas", "PATCH", { id: ajena.id, texto: "cambiada" }));
  expect(editar.status).toBe(403);
  const borrar = await notas.DELETE(peticion("http://x/api/notas", "DELETE", { id: ajena.id }));
  expect(borrar.status).toBe(403);
});

test("Dirección sigue sin escribir notas", async () => {
  const res = await notas.POST(peticion("http://x/api/notas", "POST", { pedido: "AR.26.00002", texto: "hola" }, carlos()));
  expect(res.status).toBe(403);
});

test("su pantalla: con sesión 200, sin sesión 401", async () => {
  const con = await vista.GET(peticion("http://x/api/vista-belen?pedido=AR.26.04716", "GET"));
  expect(con.status).toBe(200);
  const { pedido } = (await con.json()) as { pedido: { ofs: unknown[] } | null };
  expect(pedido?.ofs.length).toBeGreaterThan(0);
  const sin = await vista.GET(new Request("http://x/api/vista-belen?pedido=AR.26.04716"));
  expect(sin.status).toBe(401);
});

test("el buscador también abre pedidos SA (solo las pestañas son AR)", async () => {
  const res = await vista.GET(peticion("http://x/api/vista-belen?pedido=SA.25.00477", "GET"));
  expect(((await res.json()) as { pedido: unknown }).pedido).not.toBeNull();
});

test("lista desconocida: 400", async () => {
  const res = await vista.GET(peticion("http://x/api/vista-belen?lista=otra", "GET"));
  expect(res.status).toBe(400);
});
