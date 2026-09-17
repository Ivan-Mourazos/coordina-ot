import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

// ─── La migración 9 sobre una base como la de producción ─────────────────────
// La siembra de personas (migración 7) es un INSERT OR IGNORE, y producción la
// pasó hace tiempo: cambiar la lista de supervisores en el código NO le cambia
// el rol a nadie allí. Por eso hace falta la migración, y por eso se prueba
// sobre una base ya sellada y con las filas puestas, no sobre una recién
// creada — donde pasaría igual sin migración ninguna y la prueba no diría nada.

let dir: string;
let ruta: string;
let estado: typeof import("../server/estado-db");

/** Una base como la del servidor: la tabla `persona` con su gente dentro y el
 *  `user_version` sellado en la 8, que es hasta donde llegó. */
function baseComoProduccion(): void {
  const db = new Database(ruta);
  db.exec(`CREATE TABLE persona (
    id       TEXT PRIMARY KEY,
    nombre   TEXT NOT NULL,
    pin_hash TEXT,
    roles    TEXT NOT NULL,
    seccion  TEXT,
    activo   INTEGER NOT NULL DEFAULT 1
  )`);
  const ins = db.prepare(
    `INSERT INTO persona (id, nombre, pin_hash, roles, seccion, activo)
     VALUES (?, ?, NULL, ?, 'ot', 1)`,
  );
  ins.run("ivan", "Iván", "tecnico");
  ins.run("angel", "Ángel", "tecnico,supervisor");
  ins.run("jaime", "Jaime", "tecnico");
  db.pragma("user_version = 8");
  db.close();
}

const rolesDe = (id: string): string =>
  (estado.getDb().prepare("SELECT roles FROM persona WHERE id = ?").get(id) as { roles: string })
    .roles;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-supervisor-"));
  ruta = path.join(dir, "test.db");
  process.env.COORDINA_DB_PATH = ruta;
  baseComoProduccion();
  // Abrir la base es lo que dispara las migraciones que falten.
  estado = await import("../server/estado-db");
  estado.getDb();
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

test("al arrancar, Iván pasa a supervisor sin tocar la base a mano", () => {
  // Si esto fallara, el día de encender el login habría que abrir SQLite con
  // el equipo esperando para que alguien pueda resetear un PIN.
  expect(rolesDe("ivan")).toBe("tecnico,supervisor");
  // El número sube cada vez que se añade una migración nueva detrás (ver
  // MIGRACIONES en estado-db.ts); lo que importa aquí es que la base llegue
  // hasta la última, no cuántas hay.
  expect(estado.getDb().pragma("user_version", { simple: true })).toBe(10);
});

test("a quien ya lo tenía no se le duplica, y a los demás no se les da", () => {
  expect(rolesDe("angel")).toBe("tecnico,supervisor");
  expect(rolesDe("jaime")).toBe("tecnico");
});

test("pasarla dos veces deja lo mismo: añade el rol que falta, no reescribe", () => {
  // Una base que se quedó a medias vuelve a intentarlo sola en el arranque
  // siguiente (ver `migrar`), así que la migración TIENE que poder repetirse.
  estado.getDb().pragma("user_version = 8");
  // El handle vive en globalThis para sobrevivir al HMR: sin soltarlo, volver a
  // importar el módulo reutilizaría la conexión y no pasaría por `abrir`.
  delete (globalThis as { __coordinaDb?: unknown }).__coordinaDb;
  vi.resetModules();

  return import("../server/estado-db").then((otra) => {
    otra.getDb();
    const roles = (
      otra.getDb().prepare("SELECT roles FROM persona WHERE id = 'ivan'").get() as {
        roles: string;
      }
    ).roles;
    expect(roles).toBe("tecnico,supervisor");
  });
});

test("la fila que no existe no revienta la migración", () => {
  // `SUPERVISORES` es una lista del código y la tabla es de la base: el día que
  // no cuadren —una baja, una instalación a medio sembrar— la migración tiene
  // que pasar de largo, no tumbar el arranque entero de la web.
  estado.getDb().prepare("DELETE FROM persona WHERE id = 'ivan'").run();
  estado.getDb().pragma("user_version = 8");
  delete (globalThis as { __coordinaDb?: unknown }).__coordinaDb;
  vi.resetModules();

  return import("../server/estado-db").then((otra) => {
    expect(() => otra.getDb()).not.toThrow();
    expect(otra.getDb().pragma("user_version", { simple: true })).toBe(10);
  });
});
