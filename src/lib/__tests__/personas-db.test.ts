import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let db: typeof import("../server/personas-db");
let estado: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-personas-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  db = await import("../server/personas-db");
  estado = await import("../server/estado-db");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

test("la migración siembra a los nueve técnicos con SUS ids de siempre", () => {
  // Los ids son los que ya están escritos en fichajes, autorías y notas. Si la
  // migración inventara otros, el histórico entero se quedaría apuntando a
  // personas que no existen.
  expect(db.leerPersonas("tecnico").map((p) => p.id)).toEqual([
    "alberto", "jaime", "tamara", "adrian", "ivan", "angel",
    "carron", "manuel", "smith",
  ]);
});

test("Ángel lleva los dos roles, porque hace las dos cosas", () => {
  expect(db.leerPersona("angel")?.roles).toEqual(["tecnico", "supervisor"]);
  expect(db.leerPersonas("supervisor").map((p) => p.id)).toContain("angel");
});

test("los supervisores puros nacen desactivados y no salen en ninguna lista", () => {
  // Sus pantallas (fases 2 y 3) están aplazadas: si entraran hoy no tendrían
  // nada que mirar. La fila existe para no tener que migrar el día que se abran.
  expect(db.leerPersonas().map((p) => p.id)).not.toContain("esteban");
  expect(db.leerPersona("esteban")).toBeNull();
});

test("cada técnico nace con su sección, que es de dónde sale su lista", () => {
  expect(db.leerPersona("tamara")?.seccion).toBe("ot");
  expect(db.leerPersona("carron")?.seccion).toBe("diseno");
});

test("una persona recién sembrada no tiene PIN, y eso se ve desde fuera", () => {
  // La pantalla lo necesita para pedirlo dos veces en vez de una.
  expect(db.leerPersona("tamara")?.sinPin).toBe(true);
  // Y sin PIN puesto NADA abre: ni el vacío, ni un acierto de casualidad.
  expect(db.comprobarPin("tamara", "1234")).toBe(false);
  expect(db.comprobarPin("tamara", "")).toBe(false);
});

test("el PIN se guarda cifrado: en la base no hay ninguno legible", () => {
  expect(db.ponerPin("tamara", "1704")).toBe(true);
  const fila = estado
    .getDb()
    .prepare("SELECT pin_hash FROM persona WHERE id = 'tamara'")
    .get() as { pin_hash: string };
  expect(fila.pin_hash).not.toContain("1704");
  expect(fila.pin_hash.startsWith("scrypt$")).toBe(true);
});

test("el PIN correcto abre y el equivocado no", () => {
  expect(db.comprobarPin("tamara", "1704")).toBe(true);
  expect(db.comprobarPin("tamara", "1705")).toBe(false);
  expect(db.leerPersona("tamara")?.sinPin).toBe(false);
});

test("solo se aceptan cuatro dígitos", () => {
  // Sin esta guarda entraría cualquier cosa por el sitio del PIN, y la
  // pantalla —que solo sabe teclear números— no podría volver a abrirla nunca.
  expect(db.ponerPin("jaime", "12")).toBe(false);
  expect(db.ponerPin("jaime", "abcd")).toBe(false);
  expect(db.ponerPin("jaime", "12345")).toBe(false);
  expect(db.leerPersona("jaime")?.sinPin).toBe(true);
});

test("dos personas con el mismo PIN no comparten hash", () => {
  // Cada uno con su sal: si no, ver dos hashes iguales en la base delataría
  // que esas dos personas tienen el mismo PIN.
  db.ponerPin("jaime", "1704");
  const filas = estado
    .getDb()
    .prepare("SELECT pin_hash FROM persona WHERE id IN ('jaime','tamara')")
    .all() as Array<{ pin_hash: string }>;
  expect(filas[0].pin_hash).not.toBe(filas[1].pin_hash);
});

test("resetear deja a la persona SIN pin, no con uno conocido", () => {
  // Devolverlo a un valor por defecto sería peor que no resetear: ese valor lo
  // sabría todo el mundo. Sin PIN, lo vuelve a elegir ella al entrar.
  expect(db.resetearPin("tamara")).toBe(true);
  expect(db.leerPersona("tamara")?.sinPin).toBe(true);
  expect(db.comprobarPin("tamara", "1704")).toBe(false);
});

test("una persona que no existe no abre nada y no revienta", () => {
  expect(db.comprobarPin("fulano", "1234")).toBe(false);
  expect(db.ponerPin("fulano", "1234")).toBe(false);
  expect(db.resetearPin("fulano")).toBe(false);
  expect(db.leerPersona("fulano")).toBeNull();
});

test("una baja deja de entrar, pero su FILA se queda con su nombre", () => {
  // El histórico está lleno de "planteó Jaime". Borrar la fila dejaría a la web
  // sin saber quién fue. (Los nombres del tablero salen de OPERARIOS, no de
  // aquí; esto asegura que tampoco se pierde el dato de la base.)
  estado.getDb().prepare("UPDATE persona SET activo = 0 WHERE id = 'smith'").run();
  expect(db.leerPersona("smith")).toBeNull();
  expect(db.leerPersonas().map((p) => p.id)).not.toContain("smith");
  const fila = estado
    .getDb()
    .prepare("SELECT nombre FROM persona WHERE id = 'smith'")
    .get() as { nombre: string };
  expect(fila.nombre).toBe("Smith");
  estado.getDb().prepare("UPDATE persona SET activo = 1 WHERE id = 'smith'").run();
});
