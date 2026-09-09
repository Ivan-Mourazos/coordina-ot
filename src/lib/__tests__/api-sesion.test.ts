import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let sesion: typeof import("../../app/api/sesion/route");
let personasRuta: typeof import("../../app/api/personas/route");
let personas: typeof import("../server/personas-db");
let freno: typeof import("../server/freno");
let s: typeof import("../server/sesion");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-api-sesion-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.COORDINA_SESION_SECRET = "secreto-de-pruebas";
  sesion = await import("../../app/api/sesion/route");
  personasRuta = await import("../../app/api/personas/route");
  personas = await import("../server/personas-db");
  freno = await import("../server/freno");
  s = await import("../server/sesion");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

const entrar = (body: unknown, cookie?: string) =>
  sesion.POST(
    new Request("http://x/api/sesion", {
      method: "POST",
      headers: cookie ? { cookie } : {},
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  freno.olvidarFallos();
});

test("la lista del login sale SIN sesión: es lo primero que se ve", async () => {
  // Si pidiera sesión, nadie podría ver su propia cara para entrar.
  const res = personasRuta.GET();
  const j = (await res.json()) as { personas: Array<{ id: string }> };
  expect(j.personas.map((p) => p.id)).toContain("tamara");
});

test("la lista NO lleva hashes ni nada del PIN", async () => {
  const res = personasRuta.GET();
  const crudo = JSON.stringify(await res.json());
  expect(crudo).not.toContain("pin_hash");
  expect(crudo).not.toContain("scrypt");
});

test("la primera vez se elige PIN, y hay que teclearlo dos veces igual", async () => {
  // Tecleado una sola vez, una errata deja a esa persona fuera de su
  // herramienta de trabajo hasta que un supervisor se lo resetee.
  const mal = await entrar({ id: "tamara", pin: "1704", pinRepetido: "1705" });
  expect(mal.status).toBe(400);
  expect(personas.leerPersona("tamara")?.sinPin).toBe(true);

  const bien = await entrar({ id: "tamara", pin: "1704", pinRepetido: "1704" });
  expect(bien.status).toBe(200);
  expect(await bien.json()).toEqual({ yo: { id: "tamara", nombre: "Tamara", roles: ["tecnico"] } });
  expect(bien.headers.get("set-cookie")).toContain("coordina_sesion=");
});

test("sin COORDINA_SESION_SECRET, el POST falla ANTES de guardar el PIN elegido", async () => {
  // El bloqueante de la revisión: sin este corte, ponerPin ya habría guardado
  // el PIN y LUEGO reventaría al firmar la cookie, dejando a la persona sin
  // PIN que reintroducir. Se usa "smith" y se le resetea el PIN antes, para no
  // depender de qué haya hecho un test anterior con "tamara".
  personas.resetearPin("smith");
  const antes = process.env.COORDINA_SESION_SECRET;
  delete process.env.COORDINA_SESION_SECRET;
  try {
    const res = await entrar({ id: "smith", pin: "2222", pinRepetido: "2222" });
    expect(res.status).toBe(500);
    const j = (await res.json()) as { error?: string };
    expect(j.error).toBeTruthy();
    expect(j.error).not.toContain("COORDINA_SESION_SECRET"); // el motivo real no se enseña
    // Lo que importa: el PIN que acababa de elegir NO se ha guardado. Puesto
    // el secreto, puede reintentarlo desde cero.
    expect(personas.leerPersona("smith")?.sinPin).toBe(true);
  } finally {
    process.env.COORDINA_SESION_SECRET = antes;
  }
});

test("con el PIN ya puesto se entra tecleándolo una vez", async () => {
  const res = await entrar({ id: "tamara", pin: "1704" });
  expect(res.status).toBe(200);
});

test("el PIN equivocado no entra, y no dice si falló el nombre o el PIN", async () => {
  // Decir cuál de los dos falló regala media respuesta a quien prueba.
  const res = await entrar({ id: "tamara", pin: "9999" });
  expect(res.status).toBe(401);
  const j = (await res.json()) as { error: string };
  expect(j.error).toBe("No es correcto");
  expect(res.headers.get("set-cookie")).toBeNull();
});

test("un nombre que no existe da EXACTAMENTE la misma respuesta", async () => {
  const res = await entrar({ id: "fulano", pin: "9999" });
  expect(res.status).toBe(401);
  expect((await res.json()) as { error: string }).toEqual({ error: "No es correcto" });
});

test("un id inexistente gasta el mismo scrypt que un PIN equivocado", async () => {
  // No se mide tiempo (saldría intermitente): se comprueba, de forma
  // estructural, que el camino del id inexistente SÍ pasa por el trabajo de
  // descarte. Es la parte comprobable de "tarda lo mismo".
  const espia = vi.spyOn(personas, "gastarComprobacion");
  try {
    await entrar({ id: "fulano", pin: "9999" });
    expect(espia).toHaveBeenCalledTimes(1);
  } finally {
    espia.mockRestore();
  }
});

test("a los cinco fallos se para un minuto", async () => {
  // Un PIN de cuatro dígitos son 10 000 combinaciones: sin freno se prueban
  // enteras en segundos.
  for (let i = 0; i < 5; i++) await entrar({ id: "tamara", pin: "0000" });
  const res = await entrar({ id: "tamara", pin: "1704" });
  expect(res.status).toBe(429);
  // Y el freno es por PERSONA: al de al lado no le afecta.
  expect((await entrar({ id: "ivan", pin: "0000" })).status).toBe(401);
});

test("acertar borra la cuenta de fallos", async () => {
  for (let i = 0; i < 4; i++) await entrar({ id: "tamara", pin: "0000" });
  expect((await entrar({ id: "tamara", pin: "1704" })).status).toBe(200);
  for (let i = 0; i < 4; i++) await entrar({ id: "tamara", pin: "0000" });
  expect((await entrar({ id: "tamara", pin: "1704" })).status).toBe(200);
});

test("GET /api/sesion dice quién eres, y null si no eres nadie", async () => {
  const sin = await sesion.GET(new Request("http://x/api/sesion"));
  expect(await sin.json()).toEqual({ yo: null });

  const con = await sesion.GET(
    new Request("http://x/api/sesion", {
      headers: { cookie: `coordina_sesion=${s.firmarSesion("ivan")}` },
    }),
  );
  expect((await con.json()) as { yo: { id: string } }).toEqual({
    yo: { id: "ivan", nombre: "Iván", roles: ["tecnico"] },
  });
});

test("salir caduca la cookie", async () => {
  const res = await sesion.DELETE(
    new Request("http://x/api/sesion", {
      method: "DELETE",
      headers: { cookie: `coordina_sesion=${s.firmarSesion("ivan")}` },
    }),
  );
  expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
});

test("resetear un PIN lo puede hacer un supervisor, y nadie más", async () => {
  const pide = (cookie?: string) =>
    personasRuta.PATCH(
      new Request("http://x/api/personas", {
        method: "PATCH",
        headers: cookie ? { cookie } : {},
        body: JSON.stringify({ id: "tamara" }),
      }),
    );

  expect((await pide()).status).toBe(401);
  // Un técnico a secas, no: resetearle el PIN a otro es entrar en su nombre.
  expect((await pide(`coordina_sesion=${s.firmarSesion("ivan")}`)).status).toBe(403);
  expect(personas.leerPersona("tamara")?.sinPin).toBe(false);

  expect((await pide(`coordina_sesion=${s.firmarSesion("angel")}`)).status).toBe(200);
  expect(personas.leerPersona("tamara")?.sinPin).toBe(true);
});
