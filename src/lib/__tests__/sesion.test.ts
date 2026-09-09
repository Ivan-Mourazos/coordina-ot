import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let s: typeof import("../server/sesion");
let estado: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-sesion-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.COORDINA_SESION_SECRET = "secreto-de-pruebas-no-usar-en-produccion";
  // Se fija a mano y no se hereda de la máquina: si no, la suite daría un
  // resultado en el portátil y otro en el servidor.
  process.env.COORDINA_LOGIN = "off";
  s = await import("../server/sesion");
  estado = await import("../server/estado-db");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

/** Una petición con la cookie que se le diga (o sin ninguna). */
const con = (cookie?: string) =>
  new Request("http://x/api/estado", {
    method: "POST",
    headers: cookie ? { cookie } : {},
  });

test("una cookie firmada aquí se reconoce, con el nombre y los roles al día", () => {
  const req = con(`coordina_sesion=${s.firmarSesion("angel")}`);
  expect(s.quienEs(req)).toEqual({
    id: "angel",
    nombre: "Ángel",
    roles: ["tecnico", "supervisor"],
  });
});

test("sin cookie no hay nadie", () => {
  expect(s.quienEs(con())).toBeNull();
});

test("una cookie manipulada no vale, aunque nombre a alguien real", () => {
  // El agujero de hoy: el navegador dice quién eres y el servidor se lo cree.
  // Cambiar el id a mano tiene que romper la firma.
  const valida = s.firmarSesion("tamara");
  const trucada = valida.replace("tamara", "angel");
  expect(s.quienEs(con(`coordina_sesion=${trucada}`))).toBeNull();
  // Y una inventada del todo, tampoco.
  expect(s.quienEs(con("coordina_sesion=angel.1.loquesea"))).toBeNull();
});

test("una cookie firmada con OTRO secreto no vale", () => {
  // Es lo que hace que cambiar COORDINA_SESION_SECRET eche a todo el mundo.
  const antes = process.env.COORDINA_SESION_SECRET;
  const galleta = s.firmarSesion("tamara");
  process.env.COORDINA_SESION_SECRET = "otro-secreto";
  expect(s.quienEs(con(`coordina_sesion=${galleta}`))).toBeNull();
  process.env.COORDINA_SESION_SECRET = antes;
});

test("la cookie convive con otras del mismo dominio", () => {
  // El navegador manda todas juntas en una línea; leer la primera a secas
  // fallaría en cuanto haya otra delante.
  const req = con(`tema=oscuro; coordina_sesion=${s.firmarSesion("ivan")}; otra=1`);
  expect(s.quienEs(req)?.id).toBe("ivan");
});

test("desactivar a alguien corta su sesión ABIERTA, sin esperar a que salga", () => {
  // Por eso la persona se relee de la base en cada petición en vez de fiarse
  // de lo que diga la cookie: una baja tiene que dejar de escribir hoy.
  const galleta = s.firmarSesion("smith");
  expect(s.quienEs(con(`coordina_sesion=${galleta}`))?.id).toBe("smith");
  estado.getDb().prepare("UPDATE persona SET activo = 0 WHERE id = 'smith'").run();
  expect(s.quienEs(con(`coordina_sesion=${galleta}`))).toBeNull();
  estado.getDb().prepare("UPDATE persona SET activo = 1 WHERE id = 'smith'").run();
});

test("exigir devuelve un 401 sin sesión, aunque el cuerpo traiga un operarioId", () => {
  const r = s.exigir(con(), "tecnico");
  expect(r).toBeInstanceOf(Response);
  expect((r as Response).status).toBe(401);
});

test("exigir devuelve un 403 al supervisor que intenta escribir", () => {
  // Cris no plantea ni aprueba. Es lo que hará pequeña la fase 2: cuando se
  // abra la consulta sin login, los endpoints de escritura ya la rechazan.
  estado.getDb().prepare("UPDATE persona SET activo = 1 WHERE id = 'cris'").run();
  const r = s.exigir(con(`coordina_sesion=${s.firmarSesion("cris")}`), "tecnico");
  expect((r as Response).status).toBe(403);
  estado.getDb().prepare("UPDATE persona SET activo = 0 WHERE id = 'cris'").run();
});

test("exigir sin rol solo pide tener sesión", () => {
  const r = s.exigir(con(`coordina_sesion=${s.firmarSesion("angel")}`));
  expect(r).not.toBeInstanceOf(Response);
  expect((r as { id: string }).id).toBe("angel");
});

test("la cookie sale httpOnly, SameSite=Lax y para todo el sitio", () => {
  // httpOnly es el punto: sin ella, el JavaScript de la página puede leerla y
  // cambiarla desde la consola, que es exactamente el agujero que se cierra.
  const c = s.cabeceraDeSesion("ivan");
  expect(c).toContain("HttpOnly");
  expect(c).toContain("SameSite=Lax");
  expect(c).toContain("Path=/");
  // Y NO lleva Secure: la web va por HTTP en la red interna, y con Secure el
  // navegador no la guardaría y nadie podría entrar.
  expect(c).not.toContain("Secure");
});

test("salir manda una cookie ya caducada", () => {
  expect(s.cabeceraDeSalida()).toContain("Max-Age=0");
});

test("sin COORDINA_SESION_SECRET no se firma nada: revienta", () => {
  // Arrancar sin secreto sería peor que no arrancar: la cookie se podría
  // falsificar y el login no serviría de nada.
  const antes = process.env.COORDINA_SESION_SECRET;
  delete process.env.COORDINA_SESION_SECRET;
  expect(() => s.firmarSesion("ivan")).toThrow(/COORDINA_SESION_SECRET/);
  process.env.COORDINA_SESION_SECRET = antes;
});

// ── El interruptor ─────────────────────────────────────────────────────────
// El login se despliega APAGADO. Con él apagado, `identidad` tiene que
// comportarse exactamente como el servidor de hoy, o el equipo se queda fuera
// de su herramienta de trabajo el día del despliegue.

test("apagado, la identidad sale del cuerpo, como hasta ahora", () => {
  process.env.COORDINA_LOGIN = "off";
  const r = s.identidad(con(), "tamara", "tecnico");
  expect(r).not.toBeInstanceOf(Response);
  expect((r as { id: string; nombre: string }).nombre).toBe("Tamara");
});

test("apagado, un operarioId que no existe se rechaza igual que hoy", () => {
  // Hoy el servidor no comprueba nada, pero tampoco puede firmar una acción a
  // nombre de alguien que no está: quedaría un registro apuntando a la nada.
  process.env.COORDINA_LOGIN = "off";
  expect((s.identidad(con(), "fulano", "tecnico") as Response).status).toBe(400);
  expect((s.identidad(con(), "", "tecnico") as Response).status).toBe(400);
  expect((s.identidad(con(), 42, "tecnico") as Response).status).toBe(400);
});

test("apagado, si HAY cookie válida manda el cuerpo y no ella", () => {
  // El caso de la cookie superviviente: alguien entró con el login encendido,
  // se apaga el interruptor y su cookie sigue ahí un año entero. Apagado el
  // tablero deja cambiarse de identidad libremente, así que si la cookie
  // ganara, la pantalla diría un nombre y la acción se firmaría con otro, sin
  // ningún aviso. Apagado no hay pantalla de login —la identidad la elige el
  // tablero—, así que ignorar la cookie no deja a nadie fuera.
  process.env.COORDINA_LOGIN = "off";
  const r = s.identidad(con(`coordina_sesion=${s.firmarSesion("ivan")}`), "tamara", "tecnico");
  expect((r as { id: string }).id).toBe("tamara");
});

test("encendido, el cuerpo se ignora del todo", () => {
  // Es el agujero que se viene a cerrar: da igual lo que mande el navegador.
  process.env.COORDINA_LOGIN = "activo";
  expect((s.identidad(con(), "angel", "tecnico") as Response).status).toBe(401);
  const r = s.identidad(con(`coordina_sesion=${s.firmarSesion("tamara")}`), "angel", "tecnico");
  expect((r as { id: string }).id).toBe("tamara");
});

test("apagado, un supervisor tampoco escribe", () => {
  // El rol se hace cumplir esté el login como esté: si no, encenderlo cambiaría
  // quién puede hacer qué, y eso hay que verlo ANTES de encenderlo.
  process.env.COORDINA_LOGIN = "off";
  estado.getDb().prepare("UPDATE persona SET activo = 1 WHERE id = 'cris'").run();
  expect((s.identidad(con(), "cris", "tecnico") as Response).status).toBe(403);
  estado.getDb().prepare("UPDATE persona SET activo = 0 WHERE id = 'cris'").run();
});

test("loginActivo solo es cierto con el valor exacto", () => {
  // Un typo en la variable del servidor NO debe encender el login a medias.
  for (const v of ["off", "", "Activo", "1", "true", undefined]) {
    if (v === undefined) delete process.env.COORDINA_LOGIN;
    else process.env.COORDINA_LOGIN = v;
    expect(s.loginActivo(), `con ${JSON.stringify(v)}`).toBe(false);
  }
  process.env.COORDINA_LOGIN = "activo";
  expect(s.loginActivo()).toBe(true);
});

afterEach(() => {
  // Sin esto, el último test que lo deja en "activo" cambiaría el significado
  // de cualquier caso que se añada después.
  process.env.COORDINA_LOGIN = "off";
});
