import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { puedeEscribirNotas } from "../personas";

// La cuenta de Belén (rol `produccion`, migración 16) lee su pantalla y no
// escribe nada: como Dirección, toda escritura pide `tecnico`.

let dir: string;
let s: typeof import("../server/sesion");
let estado: typeof import("../../app/api/estado/route");
let fichaje: typeof import("../../app/api/fichaje/route");
let notas: typeof import("../../app/api/notas/route");
let recientes: typeof import("../../app/api/notas-recientes/route");
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
  recientes = await import("../../app/api/notas-recientes/route");
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

const belen = () => ({ cookie: `${s.COOKIE}=${s.firmarSesion("belen-alamancos")}` });
const peticion = (url: string, method: string, body?: unknown, cabeceras = belen()) =>
  new Request(url, { method, headers: cabeceras, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

test("la migración da de alta a Belén, activa, sin PIN y solo con produccion", () => {
  const fila = db.getDb().prepare("SELECT roles, activo, pin_hash FROM persona WHERE id = 'belen-alamancos'").get();
  expect(fila).toEqual({ roles: "produccion", activo: 1, pin_hash: null });
  const yo = s.quienEs(new Request("http://x/", { headers: belen() }));
  expect(yo?.roles).toEqual(["produccion"]);
});

test("la migración da de alta a Cristina Rivas igual que a Belén", () => {
  const fila = db.getDb().prepare("SELECT nombre, roles, activo, pin_hash FROM persona WHERE id = 'cristina-rivas'").get();
  expect(fila).toEqual({ nombre: "Cristina Rivas", roles: "produccion", activo: 1, pin_hash: null });
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

type NotaApi = { id: number; texto: string; autor?: string };
const textosDe = async (res: Response) => ((await res.json()) as { notas: NotaApi[] }).notas;

test("Belén escribe una nota y sale con su nombre", async () => {
  const res = await notas.POST(peticion("http://x/api/notas", "POST", { pedido: "AR.26.00002", texto: "¿Cuándo sale?" }));
  expect(res.status).toBe(200);
  const { nota } = (await res.json()) as { nota: { operarioId: string } };
  expect(nota.operarioId).toBe("belen-alamancos");
  const deOT = await textosDe(await notas.GET(peticion("http://x/api/notas?pedido=AR.26.00002", "GET", undefined, ivan())));
  expect(deOT.find((n) => n.texto === "¿Cuándo sale?")?.autor).toBe("Belén Alamancos");
});

test("una nota «solo para OT» no la ve Belén; una para todos, sí", async () => {
  await notas.POST(peticion("http://x/api/notas", "POST", { pedido: "AR.26.00002", texto: "solo OT", para: [{ tipo: "seccion", id: "ot" }] }, ivan()));
  await notas.POST(peticion("http://x/api/notas", "POST", { pedido: "AR.26.00002", texto: "sale el jueves" }, ivan()));

  const deBelen = (await textosDe(await notas.GET(peticion("http://x/api/notas?pedido=AR.26.00002", "GET")))).map((n) => n.texto);
  expect(deBelen).toContain("sale el jueves");
  expect(deBelen).not.toContain("solo OT");

  const deIvan = (await textosDe(await notas.GET(peticion("http://x/api/notas?pedido=AR.26.00002", "GET", undefined, ivan())))).map((n) => n.texto);
  expect(deIvan).toContain("solo OT");
});

test("una nota restringida que no ve: editarla o borrarla es 404", async () => {
  const deIvan = await textosDe(await notas.GET(peticion("http://x/api/notas?pedido=AR.26.00002", "GET", undefined, ivan())));
  const oculta = deIvan.find((n) => n.texto === "solo OT")!;
  expect((await notas.PATCH(peticion("http://x/api/notas", "PATCH", { id: oculta.id, texto: "x" }))).status).toBe(404);
  expect((await notas.DELETE(peticion("http://x/api/notas", "DELETE", { id: oculta.id }))).status).toBe(404);
});

test("no puede editar ni borrar las notas de otro que sí ve", async () => {
  const deIvan = await textosDe(await notas.GET(peticion("http://x/api/notas?pedido=AR.26.00002", "GET", undefined, ivan())));
  const ajena = deIvan.find((n) => n.texto === "sale el jueves")!;
  expect((await notas.PATCH(peticion("http://x/api/notas", "PATCH", { id: ajena.id, texto: "cambiada" }))).status).toBe(403);
  expect((await notas.DELETE(peticion("http://x/api/notas", "DELETE", { id: ajena.id }))).status).toBe(403);
});

test("Belén menciona a Iván: le avisa a él y no a Carlos", async () => {
  await notas.POST(peticion("http://x/api/notas", "POST", { pedido: "AR.26.00003", texto: "@[persona:ivan] ¿lo miras?" }));
  const avisosDe = async (cabeceras: { cookie: string }) =>
    ((await (await recientes.GET(new Request("http://x/api/notas-recientes", { headers: cabeceras }))).json()) as { avisos: NotaApi[] }).avisos.map((n) => n.texto);
  expect(await avisosDe(ivan())).toContain("@[persona:ivan] ¿lo miras?");
  expect(await avisosDe(carlos())).not.toContain("@[persona:ivan] ¿lo miras?");
  // A quien la escribe no le avisa su propia nota.
  expect(await avisosDe(belen())).toEqual([]);
});

test("«para» con una persona que no existe: 400", async () => {
  const res = await notas.POST(peticion("http://x/api/notas", "POST", { pedido: "AR.26.00003", texto: "x", para: [{ tipo: "persona", id: "fantasma" }] }));
  expect(res.status).toBe(400);
});

test("Dirección también escribe notas (16/11/2026)", async () => {
  const res = await notas.POST(peticion("http://x/api/notas", "POST", { pedido: "AR.26.00002", texto: "hola" }, carlos()));
  expect(res.ok).toBe(true);
  // Y no por ser Carlos también de Producción: Dirección a secas, igual.
  expect(puedeEscribirNotas(["direccion"])).toBe(true);
  expect(puedeEscribirNotas(["supervisor"])).toBe(false);
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
