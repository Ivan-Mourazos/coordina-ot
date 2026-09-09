import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// El agujero que se cierra aquí: hasta hoy, una petición que dijera
// "operarioId: angel" aprobaba en nombre de Ángel viniera de donde viniera.

let dir: string;
let s: typeof import("../server/sesion");
let estado: typeof import("../../app/api/estado/route");
let marcas: typeof import("../../app/api/revision/marcas/route");
let db: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-guardas-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.COORDINA_SESION_SECRET = "secreto-de-pruebas";
  // ENCENDIDO: este fichero prueba el login funcionando. Que se despliegue
  // apagado no puede querer decir que nadie compruebe nunca lo que hace al
  // encenderlo — el interruptor se prueba al final del fichero.
  process.env.COORDINA_LOGIN = "activo";
  s = await import("../server/sesion");
  estado = await import("../../app/api/estado/route");
  marcas = await import("../../app/api/revision/marcas/route");
  db = await import("../server/estado-db");
});

afterEach(() => {
  process.env.COORDINA_LOGIN = "activo";
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

const mutacion = {
  motivo: "aprobar",
  cambiosOF: [
    { ofId: "of-guardas-1", autorId: "alberto", revisorId: "tamara", estado: "aprobada", observacion: null },
  ],
};

const post = (body: unknown, cookie?: string) =>
  estado.POST(
    new Request("http://x/api/estado", {
      method: "POST",
      headers: cookie ? { cookie } : {},
      body: JSON.stringify(body),
    }),
  );

test("sin sesión NO se escribe, aunque el cuerpo traiga un operarioId real", async () => {
  const res = await post({ ...mutacion, operarioId: "angel" });
  expect(res.status).toBe(401);
  // Y no ha quedado nada guardado: no es solo que conteste 401.
  expect(db.leerAccionesDesde("1970-01-01T00:00:00.000Z")).toHaveLength(0);
});

test("con sesión de supervisor tampoco: es solo lectura", async () => {
  db.getDb().prepare("UPDATE persona SET activo = 1 WHERE id = 'cris'").run();
  const res = await post(mutacion, `coordina_sesion=${s.firmarSesion("cris")}`);
  expect(res.status).toBe(403);
  db.getDb().prepare("UPDATE persona SET activo = 0 WHERE id = 'cris'").run();
});

test("la acción se firma con quien dice la SESIÓN, no con lo que mande el cuerpo", async () => {
  // El caso de verdad: la petición intenta firmar como Ángel y la manda Tamara.
  const res = await post(
    { ...mutacion, operarioId: "angel" },
    `coordina_sesion=${s.firmarSesion("tamara")}`,
  );
  expect(res.status).toBe(200);
  const acciones = db.leerAccionesDesde("1970-01-01T00:00:00.000Z");
  expect(acciones).toHaveLength(1);
  expect(acciones[0].operarioId).toBe("tamara");
});

test("lo mismo en las marcas de revisión: manda la sesión", async () => {
  const res = await marcas.PUT(
    new Request("http://x/api/revision/marcas", {
      method: "PUT",
      headers: { cookie: `coordina_sesion=${s.firmarSesion("tamara")}` },
      body: JSON.stringify({ ofIds: ["of-guardas-1"], puntoId: 1, estado: "bien", operarioId: "angel" }),
    }),
  );
  expect(res.status).toBe(200);
  const fila = db
    .getDb()
    .prepare("SELECT operario_id FROM marca_revision WHERE of_id = 'of-guardas-1'")
    .get() as { operario_id: string };
  expect(fila.operario_id).toBe("tamara");
});

test("una lectura tampoco sale sin sesión", async () => {
  const res = await marcas.GET(new Request("http://x/api/revision/marcas?ofIds=of-guardas-1"));
  expect(res.status).toBe(401);
});

// ── Con el interruptor apagado ─────────────────────────────────────────────
// Es como se va a desplegar, así que es lo que de verdad hay que asegurar: el
// día del despliegue, nadie del equipo puede notar nada.

test("apagado, se escribe con el operarioId del cuerpo, como hasta ahora", async () => {
  process.env.COORDINA_LOGIN = "off";
  const res = await post({
    ...mutacion,
    cambiosOF: [{ ...mutacion.cambiosOF[0], ofId: "of-guardas-off" }],
    operarioId: "alberto",
  });
  expect(res.status).toBe(200);
  const acciones = db.leerAccionesDesde("1970-01-01T00:00:00.000Z");
  expect(acciones[0].operarioId).toBe("alberto");
});

test("apagado, las lecturas siguen abiertas: si no, la ficha saldría en blanco", async () => {
  process.env.COORDINA_LOGIN = "off";
  const res = await marcas.GET(new Request("http://x/api/revision/marcas?ofIds=of-guardas-1"));
  expect(res.status).toBe(200);
});
