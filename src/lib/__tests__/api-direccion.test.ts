import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Dirección lo ve todo y no escribe nada. La pantalla esconde los botones,
// pero quien lo garantiza es el servidor: toda escritura pide `tecnico`.

let dir: string;
let s: typeof import("../server/sesion");
let estado: typeof import("../../app/api/estado/route");
let fichaje: typeof import("../../app/api/fichaje/route");
let notas: typeof import("../../app/api/notas/route");
let causas: typeof import("../../app/api/causas/route");
let db: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-direccion-api-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.COORDINA_SESION_SECRET = "secreto-de-pruebas";
  process.env.COORDINA_LOGIN = "activo";
  s = await import("../server/sesion");
  estado = await import("../../app/api/estado/route");
  fichaje = await import("../../app/api/fichaje/route");
  notas = await import("../../app/api/notas/route");
  causas = await import("../../app/api/causas/route");
  db = await import("../server/estado-db");
  db.getDb(); // base nueva: siembra (7) + migración 11 → Carlos activo con `direccion`
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

const carlos = () => ({ cookie: `${s.COOKIE}=${s.firmarSesion("carlos")}` });

const peticion = (url: string, method: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: carlos(),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

test("la sesión de Carlos es válida y es de Dirección", () => {
  const yo = s.quienEs(new Request("http://x/", { headers: carlos() }));
  expect(yo?.roles).toEqual(["direccion"]);
});

test("cambiar el estado de una OF: 403", async () => {
  const res = await estado.POST(
    peticion("http://x/api/estado", "POST", {
      motivo: "aprobar",
      cambiosOF: [
        { ofId: "of-dir-1", autorId: "alberto", revisorId: "tamara", estado: "aprobada", observacion: null },
      ],
    }),
  );
  expect(res.status).toBe(403);
});

test("fichar: 403", async () => {
  const res = await fichaje.POST(peticion("http://x/api/fichaje", "POST", { ofIds: ["of-dir-1"], rol: "plantear" }));
  expect(res.status).toBe(403);
});

test("escribir una nota: 403", async () => {
  const res = await notas.POST(peticion("http://x/api/notas", "POST", { pedido: "AR.26.00001", texto: "hola" }));
  expect(res.status).toBe(403);
});

test("leer notas y causas: 200", async () => {
  const n = await notas.GET(peticion("http://x/api/notas?pedido=AR.26.00001", "GET"));
  expect(n.status).toBe(200);
  const c = await causas.GET(peticion("http://x/api/causas", "GET"));
  expect(c.status).toBe(200);
});
