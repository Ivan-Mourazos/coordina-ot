import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// ─── /api/causas y la desviación de identidad() ─────────────────────────────
// Esta ruta NO usa identidad() a propósito: el autor de una causa es opcional
// en este dominio (ver el comentario grande al principio de route.ts). Sin
// este fichero, la única red que sostiene esa decisión es un comentario, y el
// próximo que lea "aquí falta identidad()" y la meta rompe "Añadir un punto"
// con el login apagado sin que ningún test se entere.

let dir: string;
let s: typeof import("../server/sesion");
let causasRuta: typeof import("../../app/api/causas/route");
let db: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-api-causas-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.COORDINA_SESION_SECRET = "secreto-de-pruebas";
  process.env.COORDINA_LOGIN = "off";
  s = await import("../server/sesion");
  causasRuta = await import("../../app/api/causas/route");
  db = await import("../server/estado-db");
});

afterEach(() => {
  process.env.COORDINA_LOGIN = "off";
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

const post = (body: unknown, cookie?: string) =>
  causasRuta.POST(
    new Request("http://x/api/causas", {
      method: "POST",
      headers: cookie ? { cookie } : {},
      body: JSON.stringify(body),
    }),
  );

const patch = (body: unknown, cookie?: string) =>
  causasRuta.PATCH(
    new Request("http://x/api/causas", {
      method: "PATCH",
      headers: cookie ? { cookie } : {},
      body: JSON.stringify(body),
    }),
  );

/** Quién quedó como autor de la causa, directo de la fila: la respuesta de la
 *  API no lo lleva (CausaDevolucion no expone `creada_por`), así que hay que
 *  ir a la base para comprobar a nombre de quién quedó. */
function creadaPor(id: number): string | null {
  const fila = db
    .getDb()
    .prepare("SELECT creada_por AS creadaPor FROM causa_devolucion WHERE id = ?")
    .get(id) as { creadaPor: string | null };
  return fila.creadaPor;
}

// Etiquetas propias y distintas de las sembradas al primer día (ver
// CAUSAS_DE_ANGEL en estado-db.ts): si coincidieran, `crearCausaDevolucion`
// devolvería la fila YA existente sin tocar su `creada_por`, y las
// comprobaciones de autoría de aquí abajo estarían leyendo la semilla, no lo
// que puso este test.

test("apagado, operarioId: null crea la causa igual — es el caso que protege la desviación", async () => {
  const res = await post({ etiqueta: "Falta pintar el bastidor", operarioId: null });
  expect(res.status).toBe(200);
  const j = (await res.json()) as { causa: { id: number; etiqueta: string } };
  expect(j.causa.etiqueta).toBe("Falta pintar el bastidor");
  expect(creadaPor(j.causa.id)).toBeNull();
});

test("encendido y sin cookie, POST no entra: hace falta sesión de técnico", async () => {
  process.env.COORDINA_LOGIN = "activo";
  const res = await post({ etiqueta: "Causa sin sesión detrás" });
  expect(res.status).toBe(401);
});

test("encendido con cookie de técnico, la causa queda a nombre de quien dice la cookie, no de Ángel", async () => {
  process.env.COORDINA_LOGIN = "activo";
  const res = await post(
    { etiqueta: "Costuras torcidas en la esquina", operarioId: "angel" },
    `coordina_sesion=${s.firmarSesion("tamara")}`,
  );
  expect(res.status).toBe(200);
  const j = (await res.json()) as { causa: { id: number } };
  expect(creadaPor(j.causa.id)).toBe("tamara");
});

test("apagado, PATCH sin operarioId (lo que manda el cliente real) no falla por identidad", async () => {
  process.env.COORDINA_LOGIN = "off";
  const creada = await post({ etiqueta: "Remaches flojos en la base", operarioId: null });
  const { causa } = (await creada.json()) as { causa: { id: number } };

  const res = await patch({ id: causa.id, retirada: true });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
