# Login de operarios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que CoordinaOT sepa quién escribe: cada persona entra con un PIN y el servidor saca la identidad de la sesión en vez de creerse el `operarioId` que manda el navegador.

**Architecture:** Una tabla `persona` en el SQLite de la app (migración 7) guarda quién puede entrar, con qué PIN cifrado y con qué roles. Al acertar el PIN el servidor deja una cookie firmada (HMAC-SHA256, httpOnly) con el id. Un único ayudante, `exigir(req, rol)`, resuelve la identidad leyendo la cookie de la cabecera `Cookie` de la `Request` y releyendo la persona de la base en cada petición; los diez endpoints de escritura lo llaman y dejan de mirar el cuerpo. En el navegador, la rejilla de caras que ya existe pide el PIN después de elegirse, y "Cambiar" pasa a ser "Salir".

**Tech Stack:** Next.js 16.2.9 (App Router, route handlers), React 19, TypeScript, better-sqlite3, vitest. Criptografía con `node:crypto` (`scrypt`, `createHmac`, `timingSafeEqual`) — **sin dependencias nuevas**.

## Global Constraints

- **Idioma del código:** comentarios y nombres en castellano, como todo el repositorio. Los comentarios explican POR QUÉ, no QUÉ.
- **Nada de acentos graves dentro de plantillas SQL:** rompen el literal de plantilla. En los comentarios de esos ficheros, nombrar las cosas sin comillas.
- **`Rol` YA EXISTE** en `src/lib/types.ts` (línea 200) y significa `"plantear" | "revisar"`. El rol de acceso se llama **`RolAcceso`** (`"tecnico" | "supervisor"`). No renombrar el existente.
- **Los ids de persona NO cambian:** `alberto`, `jaime`, `tamara`, `adrian`, `ivan`, `angel`, `carron`, `manuel`, `smith`. Todo lo guardado (fichajes, autorías, notas, causas, marcas) apunta a ellos.
- **El PIN nunca viaja de vuelta** ni aparece en ninguna respuesta, log o mensaje de error.
- **Las bajas se desactivan (`activo = 0`), no se borran:** el histórico enseña "planteó Jaime" y necesita la fila.
- **`COORDINA_SESION_SECRET` es obligatoria.** Si falta, la app no arranca. Arrancar "sin seguridad pero funcionando" es peor que no arrancar.
- **Los tests corren con `pnpm test`** (vitest). Cada tarea deja la suite ENTERA en verde, no solo sus tests.
- **Cada commit que note el equipo lleva línea `Novedad:`** en primera columna (ver AGENTS.md). Los refactors internos NO la llevan; aquí solo la llevan las tareas 5 y 6.
- Las rutas se prueban con `Request` a pelo (ver `src/lib/__tests__/api-fases.test.ts`), así que **la sesión se lee de `req.headers.get("cookie")`**, nunca de `next/headers`.

## Decisiones que la spec dejaba abiertas

Tres huecos de la spec que este plan cierra. Si alguna no convence, se cambia AQUÍ antes de empezar.

1. **`pin_hash` es NULLABLE.** La spec dice que los PIN los aporta Iván y que la migración no lleva ninguno escrito. Sembrar las filas sin PIN y que cada uno teclee el suyo (dos veces) la primera vez resuelve las dos cosas sin traspaso de datos previo al despliegue. La convención "tu PIN es tu extensión" vive en la cabeza del equipo, no en la base.
2. **Resetear un PIN lo pone a NULL**, no "vuelve a ser el de la extensión". Para poder restaurar la extensión habría que guardarla en claro, que es justo lo que la spec quiere evitar. Con NULL, la persona lo vuelve a elegir en su siguiente entrada — y volverá a teclear su extensión.
3. **Cris, Carlos y Esteban entran en la tabla con `activo = 0`.** El rol `supervisor` se crea y se hace cumplir (los endpoints de escritura lo rechazan), y Ángel lo lleva junto al de técnico — que es quien lo necesita hoy, para resetear PINs. Pero las fases 2 y 3 están aplazadas: un supervisor puro que entrase hoy no tendría NADA que mirar. Se activan el día que exista su pantalla. **Consecuencia:** el enlace "Entrar con otro usuario" que la spec preveía para ellos tampoco se construye — sería una puerta a un cuarto vacío. Se añade junto a lo que van a mirar.

Añadido que la spec no pedía y este plan incluye, por tratarse de un PIN de cuatro dígitos: **freno a la fuerza bruta** (5 intentos fallidos por persona → 60 s de espera). Sin él, las 10 000 combinaciones se prueban en segundos. Son unas quince líneas, en memoria.

## Estructura de ficheros

**Nuevos:**

| Fichero | Responsabilidad |
|---|---|
| `src/lib/personas.ts` | Tipos compartidos cliente/servidor: `RolAcceso`, `PersonaPublica`. Nada de servidor dentro. |
| `src/lib/server/personas-db.ts` | La tabla `persona`: leerla, verificar un PIN, ponerlo, resetearlo. La ÚNICA que sabe de hashes. |
| `src/lib/server/sesion.ts` | Firmar y verificar la cookie, y el ayudante `exigir(req, rol)` que usan las rutas. |
| `src/app/api/sesion/route.ts` | GET (quién soy), POST (entrar), DELETE (salir). |
| `src/app/api/personas/route.ts` | GET (la rejilla del login), PATCH (un supervisor resetea un PIN). |
| `src/components/LoginGate.tsx` | La pantalla: rejilla de caras + teclado de PIN + alta de PIN la primera vez. |

**Modificados:**

| Fichero | Cambio |
|---|---|
| `src/lib/server/estado-db.ts` | Migración 7: crea y siembra `persona`. |
| Los diez `route.ts` de escritura | Sacan la identidad de la sesión; ignoran el `operarioId` del cuerpo. |
| `src/components/Board.tsx` | La identidad viene del servidor, no de `localStorage`. `LoginGate` en vez de `IdentityGate`. |
| `src/components/Herramientas.tsx` | "Cambiar" → "Salir", y el botón de resetear PIN para supervisores. |
| `src/lib/causas-cliente.ts`, `src/lib/marcas-cliente.ts` | Dejan de mandar `operarioId`. |
| `.env.example` | `COORDINA_SESION_SECRET`. |

`src/components/IdentityGate.tsx` **se borra al final de la Task 5**, cuando ya no lo usa nadie. Su `porSeccion()` no se puede reutilizar tal cual porque trabaja sobre `Operario` y `LoginGate` trabaja sobre `PersonaPublica`; el `agrupar()` del componente nuevo aplica el MISMO criterio (orden de `SECCIONES`, sin rótulos vacíos) y sustituye al viejo, no convive con él.

---

### Task 1: La tabla de personas

**Files:**
- Create: `src/lib/personas.ts`
- Create: `src/lib/server/personas-db.ts`
- Modify: `src/lib/server/estado-db.ts:336-370` (añadir la migración 7 al array `MIGRACIONES`)
- Test: `src/lib/__tests__/personas-db.test.ts`

**Interfaces:**
- Consumes: `getDb()` de `@/lib/server/estado-db` (ya exportado, línea 1094); `SeccionId` de `@/lib/secciones`.
- Produces:
  - `type RolAcceso = "tecnico" | "supervisor"`
  - `interface PersonaPublica { id: string; nombre: string; roles: RolAcceso[]; seccion: SeccionId | null; sinPin: boolean }`
  - `PIN_LARGO = 4`
  - `leerPersona(id: string): PersonaPublica | null` (solo activas)
  - `leerPersonas(rol?: RolAcceso): PersonaPublica[]` (solo activas, en el orden de `OPERARIOS`)
  - `comprobarPin(id: string, pin: string): boolean`
  - `ponerPin(id: string, pin: string): boolean`
  - `resetearPin(id: string): boolean`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/__tests__/personas-db.test.ts`:

```ts
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
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm vitest run src/lib/__tests__/personas-db.test.ts`
Expected: FAIL — `Cannot find module '../server/personas-db'`

- [ ] **Step 3: Crear los tipos compartidos**

Crear `src/lib/personas.ts`:

```ts
import type { SeccionId } from "./secciones";

// ─── Quién puede entrar, y a qué ─────────────────────────────────────────────
// Vive FUERA de lib/server para que lo pueda importar el navegador: la pantalla
// del login y la cabecera necesitan el tipo, y arrastrar el módulo de la base
// hasta el cliente metería better-sqlite3 en el bundle.
//
// OJO: `Rol` (lib/types.ts) es otra cosa —plantear o revisar, lo que se hace en
// una OF—. Esto es a qué tiene acceso una persona. Se llaman distinto a
// propósito: son dos ejes que no se cruzan.

/** Roles ACUMULABLES, no uno por persona: Ángel revisa Y supervisa, así que
 *  lleva los dos. De ahí que una persona tenga una lista y no un valor. */
export type RolAcceso = "tecnico" | "supervisor";

export const ROLES_ACCESO: readonly RolAcceso[] = ["tecnico", "supervisor"];

export function esRolAcceso(v: unknown): v is RolAcceso {
  return v === "tecnico" || v === "supervisor";
}

/** Lo que se puede contar de una persona sin comprometer nada.
 *
 *  El hash del PIN NO está aquí, y no es un olvido: este objeto viaja al
 *  navegador (la rejilla del login lo necesita para pintar los nombres) y lo
 *  único que hace falta saber del PIN es si lo tiene puesto o no. */
export interface PersonaPublica {
  id: string;
  nombre: string;
  roles: RolAcceso[];
  /** Solo la usan los técnicos: de ella sale su lista de trabajo. */
  seccion: SeccionId | null;
  /** Todavía no ha elegido PIN (recién dada de alta, o se lo resetearon). La
   *  pantalla lo pide DOS veces en ese caso, en vez de una. */
  sinPin: boolean;
}
```

- [ ] **Step 4: Crear la tabla y su migración**

Añadir a `src/lib/server/estado-db.ts`, justo ANTES del cierre del array `MIGRACIONES` (línea 370, tras la entrada `version: 6`):

```ts
  // Las personas dejan de ser una constante del código y pasan a la base. El
  // motivo no es el login en sí: es que Cris, Carlos y Esteban tienen que poder
  // entrar sin aparecer en el tablero como si plantearan toldos, y una lista en
  // el código no distingue "sale en el tablero" de "puede entrar".
  //
  // Sin PIN ninguno. Los reales no se escriben aquí —quedarían en el historial
  // de git para siempre— y tampoco se piden por adelantado: cada uno teclea el
  // suyo la primera vez que entra. Ver ponerPin en server/personas-db.ts.
  { version: 7, nombre: "personas", aplicar: personas },
```

Y añadir la función, junto a las otras migraciones del mismo fichero (después de `causasPorFamilia`, sobre la línea 515):

```ts
/** Crea la tabla de personas y siembra a quien ya existe.
 *
 *  Los ids son LOS DE SIEMPRE (los de mock.ts): fichajes, autorías, notas,
 *  causas y marcas de revisión apuntan a ellos, así que inventar otros dejaría
 *  el histórico entero señalando a gente que no existe.
 *
 *  Se puede repetir sin estropear nada: las filas se insertan con OR IGNORE, de
 *  modo que un PIN ya elegido no se borra si esto vuelve a pasar. */
function personas(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS persona (
      id       TEXT PRIMARY KEY,
      nombre   TEXT NOT NULL,
      -- NULL = todavía no ha elegido PIN. No es lo mismo que cadena vacía:
      -- con NULL no abre nada, y la pantalla se lo pide dos veces.
      pin_hash TEXT,
      -- Lista separada por comas: una persona puede llevar varios.
      roles    TEXT NOT NULL,
      seccion  TEXT,
      -- Las bajas se DESACTIVAN. Borrar la fila dejaría al historial sin saber
      -- quién planteó lo de hace dos años.
      activo   INTEGER NOT NULL DEFAULT 1
    );
  `);

  const ins = db.prepare(
    `INSERT OR IGNORE INTO persona (id, nombre, pin_hash, roles, seccion, activo)
     VALUES (?, ?, NULL, ?, ?, ?)`,
  );

  // Oficina Técnica y Diseño Gráfico, en el orden en que salen en el tablero.
  const tecnicos: Array<[string, string, string]> = [
    ["alberto", "Alberto", "ot"],
    ["jaime", "Jaime", "ot"],
    ["tamara", "Tamara", "ot"],
    ["adrian", "Adrián", "ot"],
    ["ivan", "Iván", "ot"],
    ["angel", "Ángel", "ot"],
    ["carron", "Carrón", "diseno"],
    ["manuel", "Manuel", "diseno"],
    ["smith", "Smith", "diseno"],
  ];
  for (const [id, nombre, seccion] of tecnicos) {
    // Ángel supervisa además de revisar, y es quien resetea PINs mientras las
    // pantallas de supervisión sigan aplazadas.
    const roles = id === "angel" ? "tecnico,supervisor" : "tecnico";
    ins.run(id, nombre, roles, seccion, 1);
  }

  // DESACTIVADOS a propósito. La vista de supervisión (fase 3) está aplazada:
  // si entraran hoy no tendrían nada que mirar. La fila se siembra ya para que
  // el día que se abra no haya que migrar nada, solo poner activo = 1.
  for (const [id, nombre] of [["cris", "Cris"], ["carlos", "Carlos"], ["esteban", "Esteban"]]) {
    ins.run(id, nombre, "supervisor", null, 0);
  }
}
```

- [ ] **Step 5: Crear el módulo de personas**

Crear `src/lib/server/personas-db.ts`:

```ts
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { esRolAcceso, type PersonaPublica, type RolAcceso } from "../personas";
import type { SeccionId } from "../secciones";
import { getDb } from "./estado-db";

// ─── Quién puede entrar, y con qué PIN ───────────────────────────────────────
// SOLO servidor. Es el único sitio que sabe cómo se guarda un PIN; el resto de
// la aplicación pregunta "¿es este el suyo?" y recibe un sí o un no.
//
// El PIN es el de la extensión del teléfono, decidido por el equipo. Se avisó de
// que una extensión no es un secreto —la sabe toda la casa—, así que como llave
// sirve para "que no fiche otro por mí", no para probar quién revisó. Se acepta
// porque hoy no hay NADA y lo que se busca es separar quién escribe de quién
// solo mira, no blindar la web.
//
// Aun así se guarda CIFRADO: no cuesta nada y evita que en la base quede una
// lista legible de los PIN de todos, que es lo que la haría peligrosa de copiar.

/** Cuatro dígitos: es lo que tiene una extensión y es lo que sabe teclear la
 *  pantalla. Cambiarlo obliga a cambiar el teclado del login. */
export const PIN_LARGO = 4;

const PIN_RE = new RegExp(`^\\d{${PIN_LARGO}}$`);

/** scrypt con los parámetros por defecto de Node (N=16384): unos 60 ms por
 *  comprobación en el servidor. Es lento a propósito —hace inviable probar las
 *  10 000 combinaciones— y no se nota en un login que se hace una vez al día. */
function cifrar(pin: string): string {
  const sal = randomBytes(16);
  const hash = scryptSync(pin, sal, 32);
  return `scrypt$${sal.toString("base64")}$${hash.toString("base64")}`;
}

/** Comparación en tiempo CONSTANTE. Con un `===` normal, lo que tarda en
 *  responder delata cuántos bytes del hash se acertaron. */
function coincide(pin: string, guardado: string): boolean {
  const partes = guardado.split("$");
  if (partes.length !== 3 || partes[0] !== "scrypt") return false;
  try {
    const esperado = Buffer.from(partes[2], "base64");
    const calculado = scryptSync(pin, Buffer.from(partes[1], "base64"), esperado.length);
    return timingSafeEqual(esperado, calculado);
  } catch {
    // Hash corrupto en la base: no abre. Nunca lanza, porque esto está en el
    // camino del login y un 500 aquí dejaría al equipo fuera de su herramienta.
    return false;
  }
}

interface Fila {
  id: string;
  nombre: string;
  pin_hash: string | null;
  roles: string;
  seccion: string | null;
  activo: number;
}

function aPublica(f: Fila): PersonaPublica {
  return {
    id: f.id,
    nombre: f.nombre,
    roles: f.roles.split(",").map((r) => r.trim()).filter(esRolAcceso),
    seccion: (f.seccion as SeccionId | null) ?? null,
    sinPin: f.pin_hash === null,
  };
}

/** Una persona ACTIVA, o null. Las desactivadas devuelven null a propósito:
 *  esta función decide quién entra, y una baja no entra. Para pintar su nombre
 *  en el historial no se usa esto — eso sale del registro, que guarda el id. */
export function leerPersona(id: string): PersonaPublica | null {
  const f = getDb()
    .prepare("SELECT * FROM persona WHERE id = ? AND activo = 1")
    .get(id) as Fila | undefined;
  return f ? aPublica(f) : null;
}

/** Las personas activas, opcionalmente solo las de un rol.
 *
 *  El orden es el de inserción (rowid), que es el del tablero: alfabético
 *  pondría a Ángel el primero y la rejilla del login dejaría de parecerse a la
 *  de siempre. */
export function leerPersonas(rol?: RolAcceso): PersonaPublica[] {
  const filas = getDb()
    .prepare("SELECT * FROM persona WHERE activo = 1 ORDER BY rowid")
    .all() as Fila[];
  const todas = filas.map(aPublica);
  return rol ? todas.filter((p) => p.roles.includes(rol)) : todas;
}

/** ¿Es este el PIN de esta persona? Sin PIN puesto siempre es que no: una
 *  persona a la que le acaban de resetear el PIN no debe abrir con nada. */
export function comprobarPin(id: string, pin: string): boolean {
  const f = getDb()
    .prepare("SELECT pin_hash FROM persona WHERE id = ? AND activo = 1")
    .get(id) as { pin_hash: string | null } | undefined;
  if (!f || f.pin_hash === null) return false;
  return coincide(pin, f.pin_hash);
}

/** Pone (o cambia) el PIN. `false` si no vale el formato o la persona no existe.
 *
 *  El formato se valida AQUÍ y no solo en la pantalla: por la ruta entra lo que
 *  mande cualquiera, y un PIN de tres letras dejaría a esa persona sin poder
 *  volver a entrar con el teclado numérico. */
export function ponerPin(id: string, pin: string): boolean {
  if (!PIN_RE.test(pin)) return false;
  return (
    getDb()
      .prepare("UPDATE persona SET pin_hash = ? WHERE id = ? AND activo = 1")
      .run(cifrar(pin), id).changes > 0
  );
}

/** Lo deja SIN PIN, para que lo vuelva a elegir su dueño.
 *
 *  No se restaura ningún valor por defecto: uno que supiera todo el mundo sería
 *  peor que no resetear. Quien lo pierde vuelve a teclear su extensión la
 *  siguiente vez que entra. */
export function resetearPin(id: string): boolean {
  return (
    getDb()
      .prepare("UPDATE persona SET pin_hash = NULL WHERE id = ? AND activo = 1")
      .run(id).changes > 0
  );
}
```

- [ ] **Step 6: Ejecutar los tests y verificar que pasan**

Run: `pnpm vitest run src/lib/__tests__/personas-db.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 7: Ejecutar la suite entera**

Run: `pnpm test`
Expected: PASS. La migración 7 corre sobre las bases temporales de todos los tests que abren `estado-db`; si alguno falla, es que la migración no es idempotente o el `CREATE TABLE` choca con algo. Arreglar antes de seguir.

- [ ] **Step 8: Commit**

```bash
git add src/lib/personas.ts src/lib/server/personas-db.ts src/lib/server/estado-db.ts src/lib/__tests__/personas-db.test.ts
git commit -m "feat(login): las personas y sus roles pasan a la base

Migración 7. Los ids son los de siempre, así que nada de lo guardado
—fichajes, autorías, notas, causas— cambia de dueño. Sin PIN ninguno:
los reales no se escriben en el código."
```

---

### Task 2: La sesión y el ayudante de las rutas

**Files:**
- Create: `src/lib/server/sesion.ts`
- Test: `src/lib/__tests__/sesion.test.ts`

**Interfaces:**
- Consumes: `leerPersona()` de `./personas-db`; `RolAcceso` de `../personas`.
- Produces:
  - `interface Sesion { id: string; nombre: string; roles: RolAcceso[] }`
  - `firmarSesion(id: string): string` — el valor de la cookie
  - `quienEs(req: Request): Sesion | null`
  - `exigir(req: Request, rol?: RolAcceso): Sesion | NextResponse` — lo que llaman las rutas
  - `cabeceraDeSesion(id: string): string` / `cabeceraDeSalida(): string` — el `Set-Cookie`
  - `COOKIE = "coordina_sesion"`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/__tests__/sesion.test.ts`:

```ts
import { afterAll, beforeAll, expect, test } from "vitest";
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
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm vitest run src/lib/__tests__/sesion.test.ts`
Expected: FAIL — `Cannot find module '../server/sesion'`

- [ ] **Step 3: Escribir el módulo de sesión**

Crear `src/lib/server/sesion.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { RolAcceso } from "../personas";
import { leerPersona } from "./personas-db";

// ─── La sesión ───────────────────────────────────────────────────────────────
// Una cookie FIRMADA con el id de quien entró. Firmada y no cifrada: el id no
// es un secreto (sale en el tablero), lo que hace falta es que nadie pueda
// ponerse otro.
//
// httpOnly porque sin ella el JavaScript de la propia página puede leerla y
// cambiarla desde la consola del navegador, que es exactamente el agujero que
// esto viene a cerrar.
//
// SIN CADUCIDAD, por decisión del equipo: se entra una vez y ese navegador
// recuerda hasta pulsar Salir. Caducar cada día son cuatro dígitos más por
// persona y mañana; caducar por inactividad echa a quien lleva dos horas
// planteando un toldo sin tocar la web, que es cuando más molesta.
//
// La sesión se lee de la CABECERA de la Request y no de next/headers a
// propósito: así las rutas se pueden probar con una Request a pelo, como ya
// hacen los tests de /api/fases.

export const COOKIE = "coordina_sesion";

/** Un año. No es caducidad de sesión —eso no lo hay— sino el tope que impone el
 *  navegador a cualquier cookie: sin Max-Age se borraría al cerrarlo, y el
 *  equipo tendría que volver a entrar cada mañana. */
const MAX_AGE = 60 * 60 * 24 * 365;

function secreto(): string {
  const v = process.env.COORDINA_SESION_SECRET;
  if (!v)
    throw new Error(
      "Falta COORDINA_SESION_SECRET en .env.local (copia .env.example). Sin secreto " +
        "la cookie de sesión se puede falsificar y el login no serviría de nada.",
    );
  return v;
}

const firma = (payload: string): string =>
  createHmac("sha256", secreto()).update(payload).digest("base64url");

/** El valor de la cookie: id, cuándo se emitió y la firma de las dos cosas.
 *
 *  La marca de tiempo no se usa para caducar. Está para que dos entradas
 *  seguidas de la misma persona den cookies distintas, y para poder añadir
 *  caducidad más adelante sin cambiar el formato. */
export function firmarSesion(id: string): string {
  const payload = `${id}.${Date.now()}`;
  return `${payload}.${firma(payload)}`;
}

export interface Sesion {
  id: string;
  nombre: string;
  roles: RolAcceso[];
}

/** Saca la cookie de la cabecera. El navegador las manda todas en una línea
 *  separadas por "; ", así que hay que buscar la nuestra, no leer la primera. */
function galleta(req: Request): string | null {
  const crudo = req.headers.get("cookie");
  if (!crudo) return null;
  for (const trozo of crudo.split(";")) {
    const i = trozo.indexOf("=");
    if (i < 0) continue;
    if (trozo.slice(0, i).trim() === COOKIE) return trozo.slice(i + 1).trim();
  }
  return null;
}

/** Quién manda esta petición, o null.
 *
 *  La persona se RELEE de la base cada vez en lugar de fiarse de lo que diga la
 *  cookie. Cuesta una lectura de SQLite y a cambio desactivar a alguien le
 *  corta el paso en el acto, sin esperar a que cierre sesión, y un cambio de
 *  rol se nota igual de rápido. */
export function quienEs(req: Request): Sesion | null {
  const valor = galleta(req);
  if (!valor) return null;

  const corte = valor.lastIndexOf(".");
  if (corte < 0) return null;
  const payload = valor.slice(0, corte);
  const mandada = valor.slice(corte + 1);

  // Comparación en tiempo constante: con un === normal, lo que tarda en
  // responder delata cuántos caracteres de la firma se acertaron.
  let esperada: string;
  try {
    esperada = firma(payload);
  } catch {
    // Sin secreto configurado no hay sesión válida posible. No se lanza aquí
    // porque esto corre en CADA petición: el que revienta es el que firma.
    return null;
  }
  const a = Buffer.from(mandada);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const id = payload.slice(0, payload.lastIndexOf("."));
  const persona = leerPersona(id);
  if (!persona) return null;
  return { id: persona.id, nombre: persona.nombre, roles: persona.roles };
}

/** Lo que llaman las rutas. Devuelve la sesión, o la respuesta con la que hay
 *  que cortar.
 *
 *  UNA sola función para las once rutas: repetir la comprobación en cada una
 *  garantiza que a la doceava se le olvide.
 *
 *  Uso:
 *      const yo = exigir(req, "tecnico");
 *      if (yo instanceof NextResponse) return yo;
 *      // a partir de aquí, yo.id es quien de verdad manda esto
 */
export function exigir(req: Request, rol?: RolAcceso): Sesion | NextResponse {
  const yo = quienEs(req);
  if (!yo)
    return NextResponse.json(
      { error: "Hay que entrar para hacer esto" },
      { status: 401 },
    );
  if (rol && !yo.roles.includes(rol))
    return NextResponse.json(
      { error: "Esta cuenta es de solo lectura" },
      { status: 403 },
    );
  return yo;
}

/** El Set-Cookie de entrar.
 *
 *  Sin Secure: la web va por HTTP en la red interna (192.168.0.90:4300) y con
 *  Secure el navegador no guardaría la cookie — nadie podría entrar. Ponerlo el
 *  día que haya HTTPS.
 *
 *  SameSite=Lax basta: no hay ningún sitio externo que enlace aquí, y Strict
 *  rompería la vuelta desde las otras herramientas del menú. */
export function cabeceraDeSesion(id: string): string {
  return `${COOKIE}=${firmarSesion(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

/** El Set-Cookie de salir: la misma cookie, vacía y ya caducada. */
export function cabeceraDeSalida(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `pnpm vitest run src/lib/__tests__/sesion.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Ejecutar la suite entera**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/sesion.ts src/lib/__tests__/sesion.test.ts
git commit -m "feat(login): cookie de sesión firmada y guarda única para las rutas

Firmada con COORDINA_SESION_SECRET y httpOnly, para que no se pueda
cambiar desde la consola del navegador. La persona se relee de la base
en cada petición: desactivar a alguien le corta el paso en el acto."
```

---

### Task 3: Entrar, salir y la lista del login

**Files:**
- Create: `src/lib/server/freno.ts`
- Create: `src/app/api/sesion/route.ts`
- Create: `src/app/api/personas/route.ts`
- Modify: `.env.example` (al final)
- Test: `src/lib/__tests__/api-sesion.test.ts`

> El freno a la fuerza bruta va en su propio módulo y **no** en `route.ts`: un
> route handler solo debe exportar los verbos y su configuración, y los tests
> necesitan poder reiniciarlo entre casos.

**Interfaces:**
- Consumes: `comprobarPin`, `ponerPin`, `resetearPin`, `leerPersonas`, `leerPersona` de `@/lib/server/personas-db`; `exigir`, `quienEs`, `cabeceraDeSesion`, `cabeceraDeSalida` de `@/lib/server/sesion`.
- Produces (de `freno.ts`): `frenado(id: string): boolean`, `apuntarFallo(id: string): void`, `olvidarFallos(id?: string): void`, `TOPE_FALLOS = 5`, `ESPERA_MS = 60_000`.
- Produces (contrato HTTP que consume la Task 5):
  - `GET /api/personas` → `{ personas: PersonaPublica[] }` — **sin sesión**, es la rejilla del login
  - `PATCH /api/personas` `{ id }` → `{ ok: true }` — rol `supervisor`
  - `GET /api/sesion` → `{ yo: Sesion | null }`
  - `POST /api/sesion` `{ id, pin, pinRepetido? }` → `{ yo: Sesion }` + `Set-Cookie` | 401 | 429
  - `DELETE /api/sesion` → `{ ok: true }` + `Set-Cookie` de salida

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/__tests__/api-sesion.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
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
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm vitest run src/lib/__tests__/api-sesion.test.ts`
Expected: FAIL — `Cannot find module '../../app/api/sesion/route'`

- [ ] **Step 3: Escribir el freno**

Crear `src/lib/server/freno.ts`:

```ts
// ─── Freno a la fuerza bruta del PIN ─────────────────────────────────────────
// Un PIN de cuatro dígitos son 10 000 combinaciones: sin esto se prueban
// enteras en segundos con un bucle. Cinco fallos y un minuto de espera lo
// vuelve inviable —más de tres días para recorrerlas— sin molestar a nadie que
// se equivoque al teclear.
//
// EN MEMORIA a propósito: hay un solo proceso (PM2), y que un reinicio limpie
// la cuenta de fallos no le importa a nadie. Guardarlo en la base sería una
// escritura por cada intento fallido para el mismo efecto.
//
// Va en su propio módulo y no dentro de la ruta porque un route handler solo
// debe exportar sus verbos, y los tests necesitan poder reiniciar el contador.

export const TOPE_FALLOS = 5;
export const ESPERA_MS = 60_000;

const fallos = new Map<string, { veces: number; hasta: number }>();

/** ¿Está esta persona esperando su minuto? */
export function frenado(id: string): boolean {
  const f = fallos.get(id);
  return f !== undefined && f.veces >= TOPE_FALLOS && Date.now() < f.hasta;
}

/** Un intento fallido más. La cuenta se reinicia sola si el último fallo fue
 *  hace más de la espera: cinco erratas repartidas por la mañana no son un
 *  ataque, y encerrar a quien teclea mal de vez en cuando sobra. */
export function apuntarFallo(id: string): void {
  const f = fallos.get(id);
  const veces = f && Date.now() < f.hasta ? f.veces + 1 : 1;
  fallos.set(id, { veces, hasta: Date.now() + ESPERA_MS });
}

/** Borrón y cuenta nueva. Sin `id`, para todos (lo usan los tests). */
export function olvidarFallos(id?: string): void {
  if (id === undefined) fallos.clear();
  else fallos.delete(id);
}
```

- [ ] **Step 4: Escribir /api/sesion**

Crear `src/app/api/sesion/route.ts`:

```ts
import { NextResponse } from "next/server";
import { apuntarFallo, frenado, olvidarFallos } from "@/lib/server/freno";
import { comprobarPin, leerPersona, ponerPin } from "@/lib/server/personas-db";
import { cabeceraDeSalida, cabeceraDeSesion, quienEs } from "@/lib/server/sesion";

// ─── /api/sesion ─────────────────────────────────────────────────────────────
// Entrar, salir y saber quién eres. Los tres verbos en un fichero, como hace
// /api/fichaje: son la misma cosa vista de tres maneras.
//
// El PIN entra por aquí y NO sale nunca: ni en la respuesta, ni en un log, ni
// en un mensaje de error.

export const dynamic = "force-dynamic";

/** La MISMA respuesta para un PIN equivocado y para un nombre que no existe.
 *
 *  Distinguirlos regala media respuesta: sabiendo qué ids valen, solo queda
 *  probar cuatro dígitos. */
const noEsCorrecto = () => NextResponse.json({ error: "No es correcto" }, { status: 401 });

/** GET: quién eres. Lo pide el tablero al arrancar, antes de pintar nada. */
export async function GET(req: Request) {
  return NextResponse.json(
    { yo: quienEs(req) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** POST: entrar.
 *
 *  Con `pinRepetido` cuando la persona todavía no tiene PIN: lo elige ahí
 *  mismo, tecleándolo dos veces. Una errata en un alta de un solo intento la
 *  dejaría fuera de su herramienta de trabajo hasta que alguien se lo resetee. */
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    const crudo: unknown = await req.json();
    if (typeof crudo !== "object" || crudo === null) throw new Error("no es objeto");
    b = crudo as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const id = typeof b.id === "string" ? b.id.trim() : "";
  const pin = typeof b.pin === "string" ? b.pin : "";
  if (!id || !pin) return noEsCorrecto();

  if (frenado(id))
    return NextResponse.json(
      { error: "Demasiados intentos. Espera un minuto." },
      { status: 429 },
    );

  const persona = leerPersona(id);
  if (!persona) {
    // Se apunta el fallo igual que si existiera: si no, el tiempo de respuesta
    // diría qué ids son reales.
    apuntarFallo(id);
    return noEsCorrecto();
  }

  if (persona.sinPin) {
    const repetido = typeof b.pinRepetido === "string" ? b.pinRepetido : null;
    if (repetido === null)
      // No es un error del que teclea: es que la pantalla tiene que pedirlo dos
      // veces. Se dice aparte para que sepa cambiar de modo.
      return NextResponse.json({ error: "Elige tu PIN", sinPin: true }, { status: 409 });
    if (repetido !== pin)
      return NextResponse.json({ error: "Los dos PIN no coinciden" }, { status: 400 });
    if (!ponerPin(id, pin))
      return NextResponse.json({ error: "El PIN son cuatro números" }, { status: 400 });
  } else if (!comprobarPin(id, pin)) {
    apuntarFallo(id);
    return noEsCorrecto();
  }

  olvidarFallos(id);
  const yo = leerPersona(id)!;
  return NextResponse.json(
    { yo: { id: yo.id, nombre: yo.nombre, roles: yo.roles } },
    { headers: { "Set-Cookie": cabeceraDeSesion(id), "Cache-Control": "no-store" } },
  );
}

/** DELETE: salir. No comprueba nada —salir sin sesión no es un error— y siempre
 *  manda la cookie caducada: si el navegador tenía una rota, así se la quita. */
export async function DELETE() {
  return NextResponse.json({ ok: true }, { headers: { "Set-Cookie": cabeceraDeSalida() } });
}
```

- [ ] **Step 5: Escribir /api/personas**

Crear `src/app/api/personas/route.ts`:

```ts
import { NextResponse } from "next/server";
import { leerPersonas, resetearPin } from "@/lib/server/personas-db";
import { exigir } from "@/lib/server/sesion";

// ─── /api/personas ───────────────────────────────────────────────────────────
// La lista de quién puede entrar (para pintar la rejilla del login) y el reseteo
// de un PIN olvidado.
//
// El GET va SIN sesión a propósito: es lo primero que se ve al abrir la web, y
// pedir sesión para ver tu propia cara sería la pescadilla. Lo que sale son
// nombres y secciones — lo mismo que ya enseñaba el tablero a cualquiera que
// entrase, y nada del PIN.

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { personas: leerPersonas() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** PATCH: un supervisor resetea el PIN de alguien.
 *
 *  Lo deja SIN PIN, y su dueño elige uno nuevo la próxima vez que entra. Un
 *  técnico no puede: resetearle el PIN a otro y entrar en su nombre es lo mismo.
 *
 *  Cualquier supervisor puede resetear el de cualquiera, incluido el de otro
 *  supervisor. Con cuatro personas en ese papel, montar una jerarquía para esto
 *  sería inventarse un problema. */
export async function PATCH(req: Request) {
  const yo = exigir(req, "supervisor");
  if (yo instanceof NextResponse) return yo;

  let id = "";
  try {
    const b: unknown = await req.json();
    if (typeof b === "object" && b !== null) {
      const v = (b as Record<string, unknown>).id;
      if (typeof v === "string") id = v.trim();
    }
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });

  if (!resetearPin(id))
    return NextResponse.json({ error: "Esa persona no existe" }, { status: 404 });
  console.info(`[sesion] ${yo.id} reseteó el PIN de ${id}`);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Documentar la variable de entorno**

Añadir al final de `.env.example`:

```
# ── Sesión (login de operarios) ─────────────────────────────────────────────
# Con lo que se FIRMA la cookie de sesión. Cualquier cadena larga y aleatoria
# vale; genera una con:  node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
#
# Es OBLIGATORIA: sin ella la app no arranca. Arrancar "sin seguridad pero
# funcionando" sería peor que no arrancar, porque la cookie se podría falsificar
# y cualquiera entraría como quien quisiera.
#
# Cambiarla cierra TODAS las sesiones abiertas. Es justo lo que se quiere el día
# que haga falta echar a todo el mundo de golpe.
COORDINA_SESION_SECRET=
```

- [ ] **Step 7: Ejecutar los tests y verificar que pasan**

Run: `pnpm vitest run src/lib/__tests__/api-sesion.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 8: Ejecutar la suite entera**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/server/freno.ts src/app/api/sesion src/app/api/personas .env.example src/lib/__tests__/api-sesion.test.ts
git commit -m "feat(login): entrar, salir y resetear un PIN olvidado

Un PIN equivocado y un nombre que no existe dan la MISMA respuesta, para
no regalar qué ids son reales. Cinco fallos frenan un minuto: cuatro
dígitos son 10 000 combinaciones y sin freno se prueban en segundos."
```

---

### Task 4: El servidor deja de fiarse del cliente

Es el grueso del trabajo, más que la pantalla del PIN. Once rutas de escritura que hoy aceptan el `operarioId` que les manda el navegador.

**Files:**
- Modify: `src/app/api/estado/route.ts:44-70`
- Modify: `src/app/api/fichaje/route.ts:36-77`
- Modify: `src/app/api/fichaje/latido/route.ts:30-35`
- Modify: `src/app/api/fichaje/aviso-visto/route.ts:30-34`
- Modify: `src/app/api/notas/route.ts:75-113`
- Modify: `src/app/api/avisos/route.ts:19-57`
- Modify: `src/app/api/causas/route.ts:53-135`
- Modify: `src/app/api/fases/route.ts:60-62`
- Modify: `src/app/api/pedido-scan/route.ts:23`
- Modify: `src/app/api/revision/marcas/route.ts:55`
- Test: `src/lib/__tests__/api-guardas.test.ts` (nuevo)
- Test: `src/lib/__tests__/api-estado.test.ts`, `api-avisos.test.ts`, `api-fichaje.test.ts`, `api-fichaje-latido.test.ts`, `api-notas.test.ts`, `api-fases.test.ts` (adaptar: ahora hace falta cookie)

**Interfaces:**
- Consumes: `exigir(req, rol?)` de `@/lib/server/sesion` (Task 2).
- Produces: ningún endpoint acepta ya `operarioId` en el cuerpo ni en la query. Los clientes de la Task 5 dejan de mandarlo.

**El patrón, idéntico en las once.** Al principio del handler, antes de leer el cuerpo:

```ts
const yo = exigir(req, "tecnico");
if (yo instanceof NextResponse) return yo;
```

y después, donde antes se leía `body.operarioId`, se usa `yo.id`. El campo del cuerpo **se ignora**, no se compara: compararlo tentaría a "si coincide, adelante", que es el agujero otra vez.

**Quién pide qué:**

| Ruta | Verbos | Rol |
|---|---|---|
| `/api/estado` | POST | `tecnico` |
| `/api/fichaje` | GET, POST | `tecnico` |
| `/api/fichaje/latido` | POST | `tecnico` |
| `/api/fichaje/aviso-visto` | POST | `tecnico` |
| `/api/notas` | POST, PUT, DELETE | `tecnico` |
| `/api/avisos` | GET, POST | `tecnico` |
| `/api/causas` | POST, PATCH | `tecnico` |
| `/api/fases` | POST | `tecnico` |
| `/api/pedido-scan` | POST | `tecnico` |
| `/api/revision/marcas` | PUT | `tecnico` |

`/api/causas` GET, `/api/revision/marcas` GET y `/api/fases` GET **solo piden sesión** (`exigir(req)` sin rol): son lecturas, y el día que se abra la consulta sin login (fase 2) habrá que decidir si un invitado las ve. Hoy, con sesión.

`/api/fichaje` GET y `/api/avisos` GET dejan de leer `?operarioId=`: son *tu* fichaje y *tus* avisos, y con la sesión ya se sabe de quién.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/__tests__/api-guardas.test.ts`. Es el test que fija LO QUE IMPORTA de esta tarea:

```ts
import { afterAll, beforeAll, expect, test } from "vitest";
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
  s = await import("../server/sesion");
  estado = await import("../../app/api/estado/route");
  marcas = await import("../../app/api/revision/marcas/route");
  db = await import("../server/estado-db");
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
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm vitest run src/lib/__tests__/api-guardas.test.ts`
Expected: FAIL — el primer test da 200 en vez de 401 (hoy cualquiera escribe).

- [ ] **Step 3: Poner la guarda en /api/estado**

En `src/app/api/estado/route.ts`, sustituir la cabecera del POST (línea 44) y el `operarioId` (línea 63):

```ts
export async function POST(req: Request) {
  // La identidad sale de la SESIÓN. Hasta esta versión venía en el cuerpo, y
  // eso quería decir que cualquiera en la red podía aprobar o devolver firmando
  // con el nombre de otro. El campo operarioId del cuerpo se ignora: compararlo
  // con la sesión tentaría a dejar pasar los que coincidan, que es el mismo
  // agujero con un paso más.
  const yo = exigir(req, "tecnico");
  if (yo instanceof NextResponse) return yo;

  let body: Body;
```

y

```ts
  const operarioId = yo.id;
```

Quitar `operarioId` de la interfaz `Body` (línea 13) y añadir el import:

```ts
import { exigir } from "@/lib/server/sesion";
```

- [ ] **Step 4: Poner la guarda en las otras diez rutas**

El mismo patrón. En cada una: añadir el import de `exigir`, meter las dos líneas al principio de cada handler, sustituir la lectura del cuerpo/query por `yo.id`, y **borrar** la validación de "Falta operarioId" (ya no puede faltar) y el campo de la interfaz del cuerpo.

`src/app/api/fichaje/route.ts` — GET y POST:

```ts
export async function GET(req: Request) {
  const yo = exigir(req, "tecnico");
  if (yo instanceof NextResponse) return yo;
  return NextResponse.json(
    { fichaje: leerFichaje(yo.id), avisoCierre: leerAvisoCierre(yo.id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
```

`src/app/api/fichaje/latido/route.ts`:

```ts
export async function POST(req: Request) {
  const yo = exigir(req, "tecnico");
  if (yo instanceof NextResponse) return yo;
  registrarLatido(yo.id, new Date().toISOString());
  return NextResponse.json({ ok: true });
}
```

`src/app/api/fichaje/aviso-visto/route.ts`:

```ts
export async function POST(req: Request) {
  const yo = exigir(req, "tecnico");
  if (yo instanceof NextResponse) return yo;
  marcarAvisoCierreVisto(yo.id);
  return NextResponse.json({ ok: true });
}
```

`src/app/api/avisos/route.ts` — el GET pierde el parámetro de la URL:

```ts
export async function GET(req: Request) {
  const yo = exigir(req, "tecnico");
  if (yo instanceof NextResponse) return yo;

  const desde = new Date(Date.now() - VENTANA_AVISOS_DIAS * 86_400_000).toISOString();
  const avisos = avisosPara(leerAccionesDesde(desde), yo.id, leerAvisosVistos(yo.id));
  return NextResponse.json({ avisos }, { headers: { "Cache-Control": "no-store" } });
}
```

`src/app/api/notas/route.ts` — en POST, PUT y DELETE, sustituir `const operarioId = clave(b.operarioId);` y su `if (!operarioId) …` por la guarda. La comprobación de propiedad en el SQL de editar y borrar **se queda**: ahora sí para al que quiera saltárselo, no solo al accidente.

`src/app/api/causas/route.ts` — POST y PATCH piden `tecnico`; el GET, solo sesión.

`src/app/api/fases/route.ts` — el POST pierde el `operarioId` del cuerpo y su validación; el GET pide solo sesión.

`src/app/api/pedido-scan/route.ts` — no leía `operarioId` (apaga el aviso para todos), pero **escribe**: pide `tecnico`. Actualizar de paso el comentario de la cabecera, que dice "por eso no lleva operarioId".

`src/app/api/revision/marcas/route.ts` — el PUT usa `yo.id`; el GET pide solo sesión.

- [ ] **Step 5: Adaptar los tests que ya existen**

Seis ficheros de test llaman a estas rutas sin cookie y ahora recibirán 401. En cada uno, añadir arriba:

```ts
process.env.COORDINA_SESION_SECRET = "secreto-de-pruebas";
```

y una ayuda que meta la cookie en cada petición:

```ts
/** Cabeceras de una petición de Tamara. Antes no hacía falta: la identidad iba
 *  en el cuerpo y el servidor se la creía. */
const comoTamara = { cookie: `coordina_sesion=${firmarSesion("tamara")}` };
```

Ficheros: `api-estado.test.ts`, `api-avisos.test.ts`, `api-fichaje.test.ts`, `api-fichaje-latido.test.ts`, `api-notas.test.ts`, `api-fases.test.ts`.

Los tests que comprobaban "sin operarioId da 400" cambian de sentido: ese caso ya no existe (el campo no se lee). **Sustituirlos** por su equivalente de verdad —"sin sesión da 401"— en vez de borrarlos.

`api-fases.test.ts` tiene un `vi.mock("@/lib/server/operarios")` con `COD_RPS_POR_OPERARIO`; la persona de la sesión tiene que estar en ese mapa simulado o el POST dará el 400 de "no tiene código de operario en RPS".

- [ ] **Step 6: Ejecutar los tests y verificar que pasan**

Run: `pnpm vitest run src/lib/__tests__/api-guardas.test.ts`
Expected: PASS, 5 tests.

Run: `pnpm test`
Expected: PASS. Si alguno de los seis adaptados sigue rojo, es que le falta la cookie en alguna petición.

- [ ] **Step 7: Verificar a mano que no queda ningún hueco**

Run: `git grep -n "operarioId" src/app/api/`
Expected: **sin resultados**. Si sale alguno, es un endpoint que se quedó fiándose del cliente.

- [ ] **Step 8: Commit**

```bash
git add src/app/api src/lib/__tests__
git commit -m "feat(login): el servidor saca la identidad de la sesión, no del cuerpo

Once rutas aceptaban el operarioId que mandaba el navegador: cualquiera
en la red podía fichar como otro o aprobar en su nombre. Ahora sale de
la cookie firmada y el campo del cuerpo se ignora. Escribir es de
tecnico; un supervisor recibe 403."
```

---

### Task 5: La pantalla del PIN

**Files:**
- Create: `src/components/LoginGate.tsx`
- Delete: `src/components/IdentityGate.tsx` (en el Step 4, cuando ya no lo use nadie)
- Modify: `src/components/Board.tsx` (líneas 26, 79, 172-178, 275-292, 1793-1797, y las llamadas con `operarioId` de 355, 990, 1061, 1282, 1386, 1454, 1967, 1991)
- Modify: `src/components/Herramientas.tsx:104-161`
- Modify: `src/components/NotasPedido.tsx:190,265,311`
- Modify: `src/lib/causas-cliente.ts:43-50`
- Modify: `src/lib/marcas-cliente.ts:37-78`

**Interfaces:**
- Consumes: `GET/POST/DELETE /api/sesion` y `GET /api/personas` (Task 3); `PersonaPublica` y `RolAcceso` de `@/lib/personas`; `OPERARIOS` de `@/lib/mock` (solo para el color y las iniciales).
- Produces: `interface Yo { id: string; nombre: string; roles: RolAcceso[] }` y `<LoginGate onEntrado={(yo: Yo) => void} />`. `Yo` se declara en el cliente y no se importa de `sesion.ts`: ese módulo arrastra `personas-db` y con él `better-sqlite3`, que no puede entrar en el bundle del navegador.

- [ ] **Step 1: Escribir LoginGate**

Crear `src/components/LoginGate.tsx`. Reutiliza la rejilla de caras que el equipo ya conoce y pide el PIN DESPUÉS de elegirse:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { PersonaPublica, RolAcceso } from "@/lib/personas";
import { SECCIONES, SECCION_POR_DEFECTO, type SeccionId } from "@/lib/secciones";
import { OPERARIOS } from "@/lib/mock";
import { Logo } from "./Logo";

// ─── La pantalla de entrar ───────────────────────────────────────────────────
// La rejilla de caras se queda: funciona y el equipo la conoce de memoria. Lo
// nuevo es que después de elegirse hay que teclear cuatro dígitos.
//
// Quien todavía no tiene PIN lo elige aquí, tecleándolo DOS veces. Con una
// sola, una errata deja a esa persona fuera de su herramienta de trabajo hasta
// que un supervisor se lo resetee.

export interface Yo {
  id: string;
  nombre: string;
  roles: RolAcceso[];
}

/** El color y las iniciales de cada uno. Se quedan en el código y no en la
 *  base: son presentación, no identidad, y cambiarlos no debería ser una
 *  migración. El que no esté en el mapa sale en gris con su inicial. */
const APARIENCIA = new Map(OPERARIOS.map((o) => [o.id, { iniciales: o.iniciales, color: o.color }]));

const pinta = (p: PersonaPublica) =>
  APARIENCIA.get(p.id) ?? { iniciales: p.nombre.slice(0, 2).toUpperCase(), color: "#5a6472" };

const PIN_LARGO = 4;

export function LoginGate({ onEntrado }: { onEntrado: (yo: Yo) => void }) {
  const [personas, setPersonas] = useState<PersonaPublica[] | null>(null);
  const [quien, setQuien] = useState<PersonaPublica | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/personas", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { personas: PersonaPublica[] }) => {
        if (vivo) setPersonas(j.personas);
      })
      .catch(() => {
        if (vivo) setPersonas([]);
      });
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="w-full max-w-xl text-center">
        <div className="mb-6 flex justify-center">
          <Logo height={110} />
        </div>
        {quien ? (
          <TecladoPin
            persona={quien}
            onVolver={() => setQuien(null)}
            onEntrado={onEntrado}
          />
        ) : (
          <Rejilla personas={personas} onElegir={setQuien} />
        )}
      </div>
    </div>
  );
}

function Rejilla({
  personas,
  onElegir,
}: {
  personas: PersonaPublica[] | null;
  onElegir: (p: PersonaPublica) => void;
}) {
  if (personas === null)
    return <p className="text-sm text-text-muted">Cargando…</p>;
  if (personas.length === 0)
    return (
      <p className="text-sm text-text-muted">
        No se pudo cargar la lista. Recarga la página.
      </p>
    );

  // Solo los TÉCNICOS salen en la rejilla: son las caras del tablero, y un
  // supervisor puro ahí sobra.
  //
  // La spec preveía un enlace discreto ("Entrar con otro usuario") para que
  // ellos entrasen con nombre y PIN escritos. NO se construye todavía: hoy los
  // tres supervisores puros están desactivados —sus pantallas son las fases 2
  // y 3, aplazadas— y Ángel, que es el único con ese rol en activo, entra por
  // la rejilla como el técnico que también es. Un enlace a una pantalla donde
  // nadie puede entrar es una puerta a un cuarto vacío. Se añade el día que se
  // activen, junto a lo que van a mirar.
  const tecnicos = personas.filter((p) => p.roles.includes("tecnico"));
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold text-text">¿Quién eres?</h1>
      <p className="mb-6 text-sm text-text-muted">
        Elige tu nombre y teclea tu PIN.
      </p>
      <div className="flex flex-col gap-5">
        {agrupar(tecnicos).map(([seccion, suyos]) => (
          <section key={seccion}>
            <h2 className="mb-2 border-b border-border pb-1 text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
              {SECCIONES[seccion].nombre}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {suyos.map((p) => {
                const cara = pinta(p);
                return (
                  <button
                    key={p.id}
                    onClick={() => onElegir(p)}
                    className="glass-panel flex flex-col items-center gap-2 rounded-2xl p-4 transition-all hover:scale-[1.03] hover:border-brand-400"
                  >
                    <span
                      className="grid size-14 place-items-center rounded-full text-lg font-bold text-white shadow"
                      style={{ background: cara.color }}
                    >
                      {cara.iniciales}
                    </span>
                    <span className="text-sm font-semibold text-text">{p.nombre}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/** Agrupa por sección conservando el orden de SECCIONES y dejando fuera las que
 *  no tengan a nadie: un rótulo sobre una rejilla vacía solo hace pensar que
 *  falta gente por cargar.
 *
 *  Es el criterio que traía la pantalla anterior, ahora sobre PersonaPublica:
 *  quién puede entrar sale de la base, no del catálogo del tablero. */
function agrupar(personas: PersonaPublica[]): [SeccionId, PersonaPublica[]][] {
  return (Object.keys(SECCIONES) as SeccionId[])
    .map((id) => [id, personas.filter((p) => (p.seccion ?? SECCION_POR_DEFECTO) === id)] as [SeccionId, PersonaPublica[]])
    .filter(([, suyos]) => suyos.length > 0);
}

function TecladoPin({
  persona,
  onVolver,
  onEntrado,
}: {
  persona: PersonaPublica;
  onVolver: () => void;
  onEntrado: (yo: Yo) => void;
}) {
  const [pin, setPin] = useState("");
  const [repetido, setRepetido] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cara = pinta(persona);

  // Con PIN puesto se teclea uno; sin PIN, dos (lo está eligiendo).
  const segundoPaso = persona.sinPin && pin.length === PIN_LARGO;
  const actual = segundoPaso ? repetido : pin;
  const ponActual = segundoPaso ? setRepetido : setPin;

  async function entrar(pinFinal: string, repetidoFinal: string) {
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/sesion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: persona.id,
          pin: pinFinal,
          ...(persona.sinPin ? { pinRepetido: repetidoFinal } : {}),
        }),
      });
      if (r.ok) {
        const j = (await r.json()) as { yo: Yo };
        onEntrado(j.yo);
        return;
      }
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "No se pudo entrar");
    } catch {
      setError("No se pudo conectar");
    }
    // Se vacía SIEMPRE tras un fallo: dejar los dígitos puestos invita a
    // pulsar Entrar otra vez con lo mismo.
    setPin("");
    setRepetido("");
    setEnviando(false);
  }

  function pulsar(d: string) {
    if (enviando || actual.length >= PIN_LARGO) return;
    const nuevo = actual + d;
    ponActual(nuevo);
    if (nuevo.length < PIN_LARGO) return;
    // Al cuarto dígito se entra solo, sin pulsar nada más. Salvo en el alta,
    // donde falta la segunda vuelta.
    if (persona.sinPin && !segundoPaso) return;
    void entrar(segundoPaso ? pin : nuevo, segundoPaso ? nuevo : "");
  }

  return (
    <>
      <div className="mb-4 flex flex-col items-center gap-2">
        <span
          className="grid size-14 place-items-center rounded-full text-lg font-bold text-white shadow"
          style={{ background: cara.color }}
        >
          {cara.iniciales}
        </span>
        <p className="text-lg font-semibold text-text">{persona.nombre}</p>
        <p className="text-sm text-text-muted">
          {!persona.sinPin
            ? "Teclea tu PIN"
            : segundoPaso
              ? "Repítelo para confirmar"
              : "Elige tu PIN: los cuatro números de tu extensión"}
        </p>
      </div>

      {/* Los cuatro huecos. Se ven puntos, nunca los números: por encima del
          hombro se lee un PIN de cuatro cifras sin esfuerzo. */}
      <div className="mb-4 flex justify-center gap-3" aria-live="polite">
        {Array.from({ length: PIN_LARGO }, (_, i) => (
          <span
            key={i}
            className={`size-4 rounded-full border-2 ${
              i < actual.length ? "border-brand-400 bg-brand-400" : "border-border"
            }`}
          />
        ))}
      </div>

      {error && (
        <p role="alert" className="mb-3 text-sm font-semibold text-red-500">
          {error}
        </p>
      )}

      <div className="mx-auto grid w-56 grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            onClick={() => pulsar(d)}
            disabled={enviando}
            className="glass-panel rounded-xl py-3 text-lg font-semibold text-text hover:border-brand-400 disabled:opacity-50"
          >
            {d}
          </button>
        ))}
        <button
          onClick={onVolver}
          className="rounded-xl py-3 text-xs font-semibold text-text-muted hover:text-text"
        >
          No soy yo
        </button>
        <button
          onClick={() => pulsar("0")}
          disabled={enviando}
          className="glass-panel rounded-xl py-3 text-lg font-semibold text-text hover:border-brand-400 disabled:opacity-50"
        >
          0
        </button>
        <button
          onClick={() => ponActual(actual.slice(0, -1))}
          disabled={enviando}
          className="rounded-xl py-3 text-lg font-semibold text-text-muted hover:text-text disabled:opacity-50"
          aria-label="Borrar el último número"
        >
          ⌫
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Comprobar a mano que la pantalla entra**

Run: `pnpm dev` (con `COORDINA_SESION_SECRET` puesta en `.env.local`)

Abrir `http://localhost:3000`, elegir un nombre, teclear cuatro dígitos dos veces.
Expected: entra al tablero. Recargar: sigue dentro sin volver a pedir el PIN.

En las herramientas del navegador, pestaña Aplicación → Cookies: `coordina_sesion` con **HttpOnly marcado**. En la consola, `document.cookie` **no la enseña**. Ese es el punto de todo esto.

- [ ] **Step 3: Enganchar Board.tsx a la sesión**

> **Ojo con el nombre.** `Board.tsx:1813` ya tiene `const yo = TODOS_LOS_OPERARIOS.find(...)`: el **`Operario`** del tablero, con su color, sus iniciales y su sección, y lo usan decenas de líneas más abajo. La sesión es otra cosa. Para no romper nada, **la sesión se llama `sesion`** y el `yo` de siempre se queda como está, resolviéndose ahora desde `sesion.id`.

En `src/components/Board.tsx`:

1. Sustituir `leerIdentidadGuardada()` (líneas 172-178) y el estado `miId` (275) por la sesión del servidor:

```tsx
  // Quién eres lo dice el SERVIDOR, no el navegador. Antes vivía en
  // localStorage y se mandaba en cada petición, así que cualquiera podía
  // escribir en nombre de otro cambiándolo desde la consola.
  //
  // `undefined` = todavía no se ha preguntado; `null` = no hay sesión, toca
  // entrar. Distinguirlos evita que la pantalla del PIN parpadee un instante
  // en cada recarga de quien ya está dentro.
  const [sesion, setSesion] = useState<Yo | null | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    fetch("/api/sesion", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { yo: Yo | null }) => {
        if (vivo) setSesion(j.yo);
      })
      .catch(() => {
        if (vivo) setSesion(null);
      });
    return () => {
      vivo = false;
    };
  }, []);

  // Todo lo que ya usaba `miId` sigue igual: quién eres no ha cambiado de
  // significado, solo de dónde sale.
  const miId = sesion?.id ?? null;
```

2. Borrar `IDENTITY_KEY` (79) y `leerIdentidadGuardada` (172-178). `SECCION_KEY` **se queda**: qué lista se mira sigue siendo del navegador.

3. Cambiar la puerta (1793-1797):

```tsx
  if (sesion === undefined) {
    return (
      <div className="grid min-h-full place-items-center text-sm text-text-muted">
        Cargando…
      </div>
    );
  }

  if (!sesion) {
    return <LoginGate onEntrado={setSesion} />;
  }
```

Va donde estaba la puerta de `IdentityGate` (1793-1797), es decir DESPUÉS del `if (!mounted)` y ANTES del `if (SECCIONES[seccionActual].enObras)`. El orden importa: la sección en obras ofrece salir a la otra, y para eso hay que saber ya quién eres.

4. `setMiId` pasa a ser `salir()`, que es el único cambio de identidad que queda:

```tsx
  const salir = useCallback(async () => {
    await fetch("/api/sesion", { method: "DELETE" }).catch(() => {});
    setSesion(null);
    // La sección elegida es de la SESIÓN, no del navegador: si no, el siguiente
    // que entrase en este equipo se encontraría el tablero de otro equipo sin
    // saber por qué.
    setSeccionVista(null);
    try {
      localStorage.removeItem(SECCION_KEY);
    } catch {}
  }, []);
```

`solicitarCambioIdentidad` (1476-1483) pasa a `solicitarSalida`, con el mismo aviso de "tienes un fichaje corriendo": salir con el reloj en marcha deja ese tiempo a medias igual que lo dejaba cambiarse de nombre. El `ConfirmDialog` de la línea 2307 cambia el título a "Salir" y el mensaje a hablar de salir en vez de cambiar.

5. Quitar `operarioId` de las ocho llamadas (355, 990, 1061, 1282, 1386, 1454, 1967, 1991). Las dos de GET pierden el parámetro de la URL:

```tsx
      fetch("/api/avisos", { cache: "no-store" })
```
```tsx
      fetch("/api/fichaje", { cache: "no-store" })
```

- [ ] **Step 4: Salir, en el menú donde el equipo ya busca su nombre**

En `src/components/Herramientas.tsx`, la prop `onCambiarIdentidad` pasa a `onSalir: () => void` y la lista de técnicos desaparece del menú (líneas 129-161): ya no hay a quién cambiarse. El botón "Cambiar" pasa a "Salir":

```tsx
            <button
              onClick={onSalir}
              className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
            >
              Salir
            </button>
```

También sobran la prop `operarios` y el estado `cambiando`.

Con eso, `src/components/IdentityGate.tsx` se queda sin usar: **borrarlo**. Su `porSeccion()` no lo hereda nadie (`LoginGate` tiene su propio `agrupar()`, con el mismo criterio pero sobre `PersonaPublica`). Comprobarlo antes de borrar:

Run: `git grep -n "IdentityGate"`
Expected: solo el propio fichero. Si sale algo más, no borrarlo todavía.

- [ ] **Step 5: Los clientes dejan de mandar operarioId**

`src/lib/causas-cliente.ts` (43-50): quitar el parámetro `operarioId` de la firma y del cuerpo. Actualizar quien la llame.

`src/lib/marcas-cliente.ts` (37-78): igual con `useMarcasRevision(ofIds, operarioId)` → `useMarcasRevision(ofIds)`. Actualizar `RevisionView.tsx` y `Drawer.tsx`.

`src/components/NotasPedido.tsx` (190, 265, 311): quitar `operarioId: miId` de los tres cuerpos. La prop `miId` **se queda** si se usa para pintar (saber qué notas son tuyas).

- [ ] **Step 6: Comprobar el circuito entero a mano**

Run: `pnpm dev`

1. Entrar como Tamara. Fichar en una OF, escribir una nota, marcar un punto de la guía.
2. Menú → Salir. Vuelve la pantalla del PIN.
3. Entrar como Iván. La nota anterior **sigue firmada por Tamara**.
4. Con Iván dentro, en la consola del navegador:
   ```js
   await fetch("/api/notas", { method: "POST", headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ pedido: "AR.26.00001", operarioId: "tamara", texto: "prueba" }) });
   ```
   Expected: la nota se guarda **a nombre de Iván**, no de Tamara. Es el agujero cerrado, visto desde fuera.

- [ ] **Step 7: Lint y suite**

Run: `pnpm lint && pnpm test`
Expected: PASS las dos. Ojo con las reglas del proyecto: nada de `setState` dentro de un efecto salvo el de carga inicial, ni acceso a refs durante el render.

- [ ] **Step 8: Commit**

```bash
git add -A src/components src/lib/causas-cliente.ts src/lib/marcas-cliente.ts
git commit -m "feat(login): pantalla de PIN y salir

La rejilla de caras se queda y pide cuatro dígitos después de elegirse.
Quien todavía no tiene PIN lo elige tecleándolo dos veces. Cambiar de
nombre desaparece del menú: ahora se sale y entra el siguiente.

Novedad: nuevo | Ahora entras con un PIN
Detalle: Eliges tu nombre como siempre y tecleas los cuatro números de tu extensión. La primera vez te los pide dos veces, para que no se cuele una errata. Cuando termines, en el menú de arriba a la derecha tienes Salir.
Novedad: arreglado | Lo que escribías podía firmarlo otro
Detalle: Hasta ahora el nombre viajaba desde el navegador y se podía cambiar. Ahora lo pone el servidor: lo que fichas, apruebas o escribes queda a tu nombre y solo al tuyo."
```

---

### Task 6: Resetear un PIN olvidado, y el día del despliegue

**Files:**
- Create: `src/components/ResetPin.tsx`
- Modify: `src/components/Herramientas.tsx` (prop `roles` y el bloque, solo para supervisores)
- Modify: `src/components/Board.tsx` (pasar `roles={sesion.roles}` a `Herramientas`)
- Modify: `docs/superpowers/specs/2026-09-08-login-operarios-design.md` (nota de lo implementado)
- Create: `docs/despliegue-login.md`

**Interfaces:**
- Consumes: `PATCH /api/personas` y `GET /api/personas` (Task 3); `PersonaPublica` y `RolAcceso` de `@/lib/personas`; `sesion.roles` de la Task 5; `ConfirmDialog` de `./ConfirmDialog`.
- Produces: `<ResetPin />`. Nada que consuma otra tarea: es la última.

- [ ] **Step 1: El bloque de resetear, en su propio componente**

Crear `src/components/ResetPin.tsx`. Va aparte y no dentro de `Herramientas.tsx`: ese fichero ya lleva la identidad, la sección, el tema y el catálogo de herramientas, y esto es una pantalla que se mira dos veces al año.

```tsx
"use client";

import { useEffect, useState } from "react";
import type { PersonaPublica } from "@/lib/personas";
import { ConfirmDialog } from "./ConfirmDialog";

// ─── PIN olvidado ────────────────────────────────────────────────────────────
// Sin esto, cada olvido acaba en un UPDATE a mano en la base — y va a pasar:
// son cuatro dígitos que se teclean una vez al día y hay quien vuelve de dos
// semanas de vacaciones.
//
// Solo lo ve un supervisor. Resetearle el PIN a alguien y entrar en su nombre
// son la misma cosa, así que no es algo que pueda hacer un compañero.
//
// La lista se pide al MONTAR este bloque, que es cuando el supervisor ya abrió
// el menú: traerla con el tablero sería una vuelta más por algo que casi nadie
// mira.

export function ResetPin() {
  const [personas, setPersonas] = useState<PersonaPublica[]>([]);
  const [confirmando, setConfirmando] = useState<PersonaPublica | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = () =>
    fetch("/api/personas", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { personas: PersonaPublica[] }) => setPersonas(j.personas))
      .catch(() => setAviso("No se pudo cargar la lista"));

  useEffect(() => {
    void cargar();
    // Una sola vez: la lista de la casa no cambia mientras el menú está abierto.
  }, []);

  async function resetear(p: PersonaPublica) {
    setConfirmando(null);
    try {
      const r = await fetch("/api/personas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id }),
      });
      if (!r.ok) {
        setAviso("No se pudo reiniciar");
        return;
      }
      setAviso(`${p.nombre} elegirá un PIN nuevo al entrar`);
      await cargar();
    } catch {
      setAviso("No se pudo conectar");
    }
  }

  return (
    <div className="mt-2 border-t border-border pt-2">
      <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        PIN olvidado
      </p>
      <p className="mb-1.5 px-1 text-[10px] leading-tight text-text-muted">
        Se queda sin PIN y elige uno nuevo la próxima vez que entre.
      </p>
      {aviso && (
        <p role="status" className="mb-1.5 px-1 text-[10px] text-brand-600">
          {aviso}
        </p>
      )}
      {personas.map((p) => (
        <button
          key={p.id}
          onClick={() => setConfirmando(p)}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-text hover:bg-[var(--glass-highlight)]"
        >
          {p.nombre}
          {p.sinPin && <span className="ml-auto text-[10px] text-text-muted">sin PIN</span>}
        </button>
      ))}

      {/* Se confirma porque un clic sin querer deja a esa persona fuera de su
          herramienta de trabajo hasta que se dé cuenta y venga a decirlo. */}
      <ConfirmDialog
        abierto={confirmando !== null}
        titulo="Reiniciar el PIN"
        mensaje={
          `${confirmando?.nombre ?? ""} se queda sin PIN y tendrá que elegir uno nuevo ` +
          `la próxima vez que entre.\n\nSi está dentro ahora mismo, no se le echa: ` +
          `sigue trabajando hasta que salga.`
        }
        onConfirmar={() => confirmando && void resetear(confirmando)}
        onCancelar={() => setConfirmando(null)}
      />
    </div>
  );
}
```

Y en `src/components/Herramientas.tsx`, después del bloque de "quién eres" (donde en la Task 5 quedó el botón Salir), pintarlo solo si procede:

```tsx
          {roles.includes("supervisor") && <ResetPin />}
```

`Herramientas` recibe los roles en una prop NUEVA. No se meten dentro de la prop `yo` que ya tiene: esa es un `Operario` —el del tablero, con su color, sus iniciales y su sección— y a quién deja escribir la web es otra cosa.

```tsx
  /** Roles de acceso de quien está dentro. Ver lib/personas.ts; no confundir
   *  con `Rol` (plantear/revisar), que es lo que se hace en una OF. */
  roles: RolAcceso[];
```

`Board.tsx` la rellena con `roles={sesion.roles}` —la sesión de la Task 5—, nunca desde el `Operario` del tablero, que no sabe nada de accesos.

**Verificación del contrato:** el botón que se esconde NO es la protección. `PATCH /api/personas` exige el rol `supervisor` en el servidor (Task 3), y el test de la Task 3 lo comprueba con un técnico. Esconder el botón solo evita enseñar algo que no se puede usar.

- [ ] **Step 2: Comprobarlo a mano**

Run: `pnpm dev`

1. Entrar como Ángel (que lleva los dos roles). El bloque "PIN olvidado" está.
2. Entrar como Iván. **No está.**
3. Como Ángel, resetear el de Tamara. Salir, elegir Tamara: pide el PIN dos veces.

- [ ] **Step 3: Escribir la nota del despliegue**

Crear `docs/despliegue-login.md`:

```markdown
# El día que se despliega el login

**Todos los navegadores del equipo pierden su identidad guardada** y se
encuentran la pantalla del PIN. No es un fallo: la identidad ya no vive en el
navegador.

## Antes de subirlo

1. **Avisar al equipo el día anterior.** El mensaje es corto: "mañana la web te
   va a pedir un PIN; es tu extensión, y la primera vez te la pide dos veces".
2. **Poner `COORDINA_SESION_SECRET` en el `.env.local` del servidor.** Sin ella
   la app NO arranca:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
   Generarla EN el servidor y no reutilizar la de desarrollo.
3. **Tener a mano la lista de extensiones.** Quien no se acuerde de la suya se
   queda fuera de su herramienta de trabajo hasta que alguien se la diga.
4. **Backup de `data/coordina.db`** antes de arrancar: la migración 7 crea la
   tabla `persona`. Es la práctica de siempre (`pnpm backup`), aquí más.

## Después

- Comprobar que `PRAGMA user_version` en `data/coordina.db` dice **7**.
- Comprobar que la cookie `coordina_sesion` sale **HttpOnly** (Aplicación →
  Cookies en el navegador). Si `document.cookie` la enseña desde la consola,
  algo se hizo mal y el login no protege nada.
- Ángel es el único con rol de supervisor: si alguien se atasca, él le resetea
  el PIN desde el menú.

## Lo que NO entra en esta versión

La consulta sin login (fase 2) y la vista de supervisión de Cris, Carlos y
Esteban (fase 3). Sus filas están sembradas en la tabla con `activo = 0`; el día
que se abran, se activan y no hay que migrar nada.
```

- [ ] **Step 4: Apuntar en la spec lo que se desvió**

Añadir al final de `docs/superpowers/specs/2026-09-08-login-operarios-design.md`:

```markdown
## Lo que cambió al implementarlo

- **El PIN no se siembra: lo elige cada uno la primera vez**, tecleándolo dos
  veces. La spec decía que los PIN los aporta Iván y que la migración no lleva
  ninguno escrito; esto cumple las dos cosas sin traspaso de datos previo al
  despliegue. La convención "tu PIN es tu extensión" sigue en pie, en la cabeza
  del equipo y no en la base.
- **Resetear deja SIN PIN**, en vez de restaurar el de la extensión: para
  restaurarlo habría que guardarlo en claro, que es justo lo que se evitaba.
- **Cris, Carlos y Esteban se siembran DESACTIVADOS.** Las fases 2 y 3 están
  aplazadas y hoy no tendrían nada que mirar. Ángel lleva el rol de supervisor,
  que es quien lo necesita para resetear PINs.
- **Añadido un freno a la fuerza bruta** (5 fallos → 60 s). No estaba en la
  spec, pero un PIN de cuatro dígitos son 10 000 combinaciones y sin freno se
  prueban enteras en segundos.
- **El enlace "Entrar con otro usuario" no se construyó.** Era para que los
  supervisores entrasen sin salir en la rejilla, y hoy los tres supervisores
  puros están desactivados: sería una puerta a un cuarto vacío. Se añade el día
  que se abra la fase 3, junto a lo que van a mirar.
```

- [ ] **Step 5: Suite y lint**

Run: `pnpm lint && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/ResetPin.tsx src/components/Herramientas.tsx src/components/Board.tsx docs/
git commit -m "feat(login): un supervisor puede resetear un PIN olvidado

Sin esto, cada olvido acaba en un UPDATE a mano en la base. Lo deja sin
PIN y su dueño elige uno nuevo al entrar: restaurar un valor por defecto
que supiera todo el mundo sería peor que no resetear.

Novedad: nuevo | Si olvidas tu PIN, Ángel te lo puede reiniciar
Detalle: Te lo deja en blanco y eliges uno nuevo la próxima vez que entres. Está en el menú de arriba a la derecha."
```

---

## Cuando esté todo

Antes de desplegar, `pnpm novedades` recoge las líneas `Novedad:` de las tareas 5 y 6 y escribe la entrada en `src/lib/novedades-datos.json`. Con `--ver` enseña lo que haría sin tocar nada.

Después, seguir `docs/despliegue-login.md`.
