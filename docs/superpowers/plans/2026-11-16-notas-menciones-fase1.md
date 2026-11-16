# Notas: visibilidad, menciones y campana filtrada (fase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las notas son para todos por defecto, se pueden restringir a personas/secciones, admiten `@menciones`, y la campana solo avisa a quien va dirigida.

**Architecture:** Dos tablas nuevas (`nota_audiencia`, `nota_mencion`) y una columna `en_consulta_publica` en `nota_pedido` (migración 20). El filtro de quién ve qué vive en SQL en `notas-db.ts`, con un «quién soy» (`Lector`) que resuelve el servidor a partir de la sesión. Los avisos se calculan en el servidor (`leerAvisosNotas`) y el cliente (Board y AvisosBelen) solo pinta lo que recibe.

**Tech Stack:** Next.js (versión con cambios: leer `node_modules/next/dist/docs/` antes de tocar rutas), TypeScript, better-sqlite3, vitest, pnpm.

**Spec:** `docs/NOTAS-MENCIONES.md` (fuente de verdad; las fases 2 y 3 quedan FUERA de este plan: nada de `padre_id`, respuestas ni «resuelto»).

## Global Constraints

- Usar pnpm. Tests: `pnpm vitest run <ruta>`; tipos: `pnpm tsc --noEmit`; lint solo de los ficheros tocados: `pnpm eslint <ficheros>` (el lint global tiene 64 errores previos).
- Ninguna nota vieja gana ni pierde visibilidad (tabla de migración del spec).
- La consulta pública sin login solo enseña `en_consulta_publica = 1` Y sin audiencia restringida.
- El autor ve siempre su nota y nunca se avisa a sí mismo.
- Dirección no recibe avisos de sección salvo `@Dirección`.
- Secciones de una persona: `persona.seccion` + `tambienEn` (en `src/lib/server/operarios.ts`), nunca listas de nombres. `produccion`/`direccion` salen de los roles.
- Login apagado (`quienEs` = null): no hay filtro de audiencia (como hoy) y la campana no avisa de nada personal.
- Commits: sin `Novedad:` salvo en el último commit que deja la función usable (Task 6).
- No desplegar. Al acabar, dar a Iván el comando de despliegue.

## Ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/lib/nota-pedido.ts` | Tipos cliente: `Destino`, `NotaPedido` ampliada, tokens de mención (`extraerMenciones`, `trocearTexto`) |
| `src/lib/server/estado-db.ts` | Migración 20 `notas_audiencia` |
| `src/lib/server/lector-notas.ts` (nuevo) | `lectorDe(persona)`: id + destinos a los que pertenece |
| `src/lib/server/notas-db.ts` | Lectura filtrada, alta/edición con audiencia y menciones, `leerAvisosNotas` |
| `src/app/api/notas/route.ts` | Body nuevo (`para`, `enConsultaPublica`), 404 si no la ves |
| `src/app/api/notas-recientes/route.ts` | Devuelve `avisos` del lector, no todas las notas |
| `src/components/NotasPedido.tsx` | Selector «Para: todos / solo para…», casilla consulta pública, `@` autocompletar, etiquetas |
| `src/components/Board.tsx`, `src/components/vista-belen/AvisosBelen.tsx` | Campana con los avisos del servidor |

---

### Task 1: Tipos y tokens de mención (cliente, sin BD)

**Files:**
- Modify: `src/lib/nota-pedido.ts`
- Test: `src/lib/__tests__/nota-menciones.test.ts` (nuevo)

**Interfaces — Produces:**
```ts
export type DestinoSeccion = SeccionId | "produccion" | "direccion";
export type Destino = { tipo: "persona"; id: string } | { tipo: "seccion"; id: DestinoSeccion };
export const SECCIONES_MENCIONABLES: ReadonlyArray<{ id: DestinoSeccion; nombre: string }> = [
  { id: "ot", nombre: "Oficina Técnica" }, { id: "diseno", nombre: "Diseño" },
  { id: "impresion", nombre: "Impresión" }, { id: "produccion", nombre: "Producción" },
  { id: "direccion", nombre: "Dirección" },
];
export function tokenMencion(d: Destino): string;           // "@[persona:ivan]" | "@[seccion:produccion]"
export function extraerMenciones(texto: string): Destino[]; // únicos, en orden; ignora secciones desconocidas
export type Trozo = { tipo: "texto"; texto: string } | { tipo: "mencion"; destino: Destino };
export function trocearTexto(texto: string): Trozo[];
// NotaPedido gana: para: Destino[] (vacío = todos), enConsultaPublica: boolean, menciones: Destino[]
// `publica` se mantiene en el tipo hasta Task 4 (lo usa la UI actual) y se quita allí.
```

- [ ] **Step 1: Tests que fallan**

```ts
import { expect, test } from "vitest";
import { extraerMenciones, tokenMencion, trocearTexto } from "../nota-pedido";

test("token estable de persona y sección", () => {
  expect(tokenMencion({ tipo: "persona", id: "ivan" })).toBe("@[persona:ivan]");
  expect(tokenMencion({ tipo: "seccion", id: "produccion" })).toBe("@[seccion:produccion]");
});

test("extrae menciones únicas e ignora secciones inventadas", () => {
  const t = "ojo @[persona:ivan] y @[seccion:ot], otra vez @[persona:ivan] @[seccion:marketing]";
  expect(extraerMenciones(t)).toEqual([{ tipo: "persona", id: "ivan" }, { tipo: "seccion", id: "ot" }]);
});

test("trocea para pintar etiquetas", () => {
  expect(trocearTexto("hola @[seccion:diseno]!")).toEqual([
    { tipo: "texto", texto: "hola " },
    { tipo: "mencion", destino: { tipo: "seccion", id: "diseno" } },
    { tipo: "texto", texto: "!" },
  ]);
});

test("una @ suelta o un email no es mención", () => {
  expect(extraerMenciones("escribe a a@b.com o @alguien")).toEqual([]);
});
```

- [ ] **Step 2:** `pnpm vitest run src/lib/__tests__/nota-menciones.test.ts` → FAIL (no exportado).
- [ ] **Step 3: Implementar** con la regex `/@\[(persona|seccion):([a-z0-9-]+)\]/g`. En la sección, validar el id contra `SECCIONES_MENCIONABLES`. Las ids de persona son `[a-z0-9-]` (p. ej. `belen-alamancos`).
- [ ] **Step 4:** el mismo comando → PASS.
- [ ] **Step 5:** `git commit -m "feat(notas): tokens de mención y destinos"`

---

### Task 2: Migración 20 y lector

**Files:**
- Modify: `src/lib/server/estado-db.ts` (lista de migraciones; añadir `{ version: 20, nombre: "notas_audiencia", aplicar: notasAudiencia }`)
- Create: `src/lib/server/lector-notas.ts`
- Test: `src/lib/__tests__/migracion-notas-audiencia.test.ts` (nuevo). Subir a 20 el `user_version` esperado en los tests `migracion-*` que hoy dicen 19 (`grep -rln "toBe(19)" src/lib/__tests__`).

**Interfaces — Produces:**
```ts
// lector-notas.ts
export interface Lector { id: string; destinos: string[] } // "persona:ivan", "seccion:ot", "seccion:direccion"...
export function lectorDe(p: { id: string; roles: readonly RolAcceso[]; seccion: SeccionId | null }): Lector;
```
Regla de `lectorDe`: `persona:<id>` siempre; `seccion:<p.seccion>` si tiene; `seccion:<x>` por cada `tambienEn` de `operarios.ts` (buscar por id); `seccion:produccion` si tiene el rol; `seccion:direccion` si tiene el rol.

SQL de la migración:
```sql
ALTER TABLE nota_pedido ADD COLUMN en_consulta_publica INTEGER NOT NULL DEFAULT 0;
CREATE TABLE nota_audiencia (
  nota_id INTEGER NOT NULL REFERENCES nota_pedido(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('persona','seccion')),
  destino TEXT NOT NULL,
  PRIMARY KEY (nota_id, tipo, destino));
CREATE TABLE nota_mencion (
  nota_id INTEGER NOT NULL REFERENCES nota_pedido(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('persona','seccion')),
  destino TEXT NOT NULL,
  creado_at TEXT NOT NULL,
  PRIMARY KEY (nota_id, tipo, destino));
CREATE INDEX nota_mencion_destino ON nota_mencion(tipo, destino);
UPDATE nota_pedido SET en_consulta_publica = 1 WHERE publica = 1;
INSERT INTO nota_audiencia (nota_id, tipo, destino)
  SELECT n.id, 'seccion', s.d FROM nota_pedido n
  CROSS JOIN (SELECT 'ot' d UNION ALL SELECT 'diseno' UNION ALL SELECT 'impresion' UNION ALL SELECT 'direccion') s
  WHERE n.publica = 0;
```
No se crean `nota_mencion` para notas viejas (no tenían menciones).

- [ ] **Step 1: Test que falla.** Sellar la BD en 19 con el patrón de `migracion-nombres-completos.test.ts`, insertar una nota con `publica=0` y otra con `publica=1`, abrir con `getDb()` y comprobar:
  - `user_version` = 20;
  - la interna tiene 4 filas de audiencia (ot, diseno, impresion, direccion) y `en_consulta_publica=0`;
  - la pública tiene 0 filas de audiencia y `en_consulta_publica=1`.
  Test de `lectorDe`:
  - Manuel (`seccion: impresion` + `tambienEn` diseno) → `["persona:manuel","seccion:impresion","seccion:diseno"]`;
  - Carlos (direccion+produccion, sin sección) → `persona:carlos`, `seccion:produccion`, `seccion:direccion`.
- [ ] **Step 2:** `pnpm vitest run src/lib/__tests__/migracion-notas-audiencia.test.ts` → FAIL.
- [ ] **Step 3:** Implementar la migración y `lectorDe`.
- [ ] **Step 4:** `pnpm vitest run src/lib/__tests__` → PASS (con los `toBe(20)` actualizados).
- [ ] **Step 5:** `git commit -m "feat(notas): migración de audiencia y menciones"`

---

### Task 3: notas-db con audiencia, menciones y avisos

**Files:**
- Modify: `src/lib/server/notas-db.ts`
- Test: `src/lib/__tests__/notas-db.test.ts` (ampliar; adaptar las llamadas que cambian de firma)

**Interfaces — Consumes:** `Destino`, `extraerMenciones` (Task 1); `Lector` (Task 2).
**Produces:**
```ts
export function leerNotas(pedido: string, lector: Lector | null): NotaPedido[];
export function crearNota(pedido: string, operarioId: string, texto: string, ahora: Date,
  opc: { para: Destino[]; enConsultaPublica: boolean }): NotaPedido;
export function editarNota(id: number, operarioId: string, texto: string, ahora: Date,
  opc?: { para?: Destino[]; enConsultaPublica?: boolean }): NotaPedido | null;
export function puedeVer(id: number, lector: Lector | null): boolean;
export function leerAvisosNotas(lector: Lector, dias: number, ahora?: Date): NotaPedido[];
// leerNotasPublicas / contarNotasPublicas: en_consulta_publica=1 AND NOT EXISTS audiencia.
// leerNotasRecientes: se borra si al acabar Task 5 no lo usa nadie.
```
Cláusula de visibilidad (lector ≠ null), con `:yo` = id y `json_each(:destinos)` para la lista:
```sql
(n.operario_id = :yo
 OR NOT EXISTS (SELECT 1 FROM nota_audiencia a WHERE a.nota_id = n.id)
 OR EXISTS (SELECT 1 FROM nota_audiencia a WHERE a.nota_id = n.id
            AND (a.tipo || ':' || a.destino) IN (SELECT value FROM json_each(:destinos))))
```
Avisos = visibles + `n.operario_id <> :yo` + no borradas + en la ventana de días + (`EXISTS nota_mencion` que me toque OR `EXISTS nota_audiencia` que me toque). El instante del aviso es `max(creado_at de la mención, n.creado_at)`, para que una mención añadida al editar suene después.
Alta y edición:
- escriben la audiencia (borrar y reinsertar; solo el autor) y `INSERT OR IGNORE` de `extraerMenciones(texto)` con `creado_at = ahora`. Así las menciones viejas conservan su fecha y no vuelven a sonar;
- las menciones quitadas al editar se borran;
- `para` vacío = sin filas de audiencia;
- todo en una transacción.

- [ ] **Step 1: Tests que fallan** (en `notas-db.test.ts`, BD temporal como ya hace el fichero):

```ts
const ivan = { id: "ivan", destinos: ["persona:ivan", "seccion:ot", "seccion:direccion"] };
const belen = { id: "belen-alamancos", destinos: ["persona:belen-alamancos", "seccion:produccion"] };
const carron = { id: "carron", destinos: ["persona:carron", "seccion:diseno"] };

test("para todos la ve cualquiera; restringida solo su público y el autor", () => {
  db.crearNota("AR.1", "ivan", "general", T, { para: [], enConsultaPublica: false });
  db.crearNota("AR.1", "ivan", "solo prod", T, { para: [{ tipo: "seccion", id: "produccion" }], enConsultaPublica: false });
  expect(db.leerNotas("AR.1", belen).map((n) => n.texto)).toEqual(["general", "solo prod"]);
  expect(db.leerNotas("AR.1", carron).map((n) => n.texto)).toEqual(["general"]);
  expect(db.leerNotas("AR.1", ivan).map((n) => n.texto)).toEqual(["general", "solo prod"]);
});

test("avisa por mención, por público restringido, nunca al autor ni a nadie si no hay nada", () => {
  db.crearNota("AR.2", "carron", "nota suelta", T, { para: [], enConsultaPublica: false });
  db.crearNota("AR.2", "carron", "mira @[persona:ivan]", T, { para: [], enConsultaPublica: false });
  db.crearNota("AR.2", "carron", "para prod", T, { para: [{ tipo: "seccion", id: "produccion" }], enConsultaPublica: false });
  db.crearNota("AR.2", "carron", "ojo @[seccion:ot]", T, { para: [], enConsultaPublica: false });
  expect(db.leerAvisosNotas(ivan, 30, T).map((n) => n.texto).sort()).toEqual(["mira @[persona:ivan]", "ojo @[seccion:ot]"]);
  expect(db.leerAvisosNotas(belen, 30, T).map((n) => n.texto)).toEqual(["para prod"]);
  expect(db.leerAvisosNotas(carron, 30, T)).toEqual([]);
});

test("Dirección no recibe @Oficina Técnica si no es de OT", () => {
  const esteban = { id: "esteban", destinos: ["persona:esteban", "seccion:direccion"] };
  db.crearNota("AR.3", "carron", "ojo @[seccion:ot]", T, { para: [], enConsultaPublica: false });
  expect(db.leerAvisosNotas(esteban, 30, T)).toEqual([]);
});

test("editar solo avisa de las menciones nuevas", () => {
  const n = db.crearNota("AR.4", "carron", "hola @[persona:ivan]", T, { para: [], enConsultaPublica: false });
  const despues = new Date(T.getTime() + 60_000);
  db.editarNota(n.id, "carron", "hola @[persona:ivan] @[seccion:produccion]", despues);
  const fila = db.getDbParaTest().prepare("SELECT creado_at FROM nota_mencion WHERE nota_id = ? AND destino = 'ivan'").get(n.id);
  expect(fila).toEqual({ creado_at: T.toISOString() });
  expect(db.leerAvisosNotas(belen, 30, despues).map((x) => x.id)).toEqual([n.id]);
});

test("consulta pública: solo marcadas y sin restricción", () => {
  db.crearNota("AR.5", "ivan", "pública", T, { para: [], enConsultaPublica: true });
  db.crearNota("AR.5", "ivan", "no marcada", T, { para: [], enConsultaPublica: false });
  db.crearNota("AR.5", "ivan", "restringida", T, { para: [{ tipo: "seccion", id: "ot" }], enConsultaPublica: true });
  expect(db.leerNotasPublicas("AR.5").map((n) => n.texto)).toEqual(["pública"]);
});
```
(`getDbParaTest` = el acceso a la BD que ya use el fichero de tests; adaptarlo al nombre real.)
- [ ] **Step 2:** `pnpm vitest run src/lib/__tests__/notas-db.test.ts` → FAIL.
- [ ] **Step 3:** Implementar. `NotaPedido` devuelta con `para` (desde `nota_audiencia`) y `menciones` (desde `nota_mencion`). Mantener `publica = enConsultaPublica` en el objeto mientras la UI vieja lo lea.
- [ ] **Step 4:** el mismo comando → PASS; `pnpm tsc --noEmit` sin errores nuevos en `notas-db.ts`. Las rutas se arreglan en Task 4.
- [ ] **Step 5:** `git commit -m "feat(notas): audiencia y avisos filtrados en la base"`

---

### Task 4: API de notas

**Files:**
- Modify: `src/app/api/notas/route.ts`, `src/app/api/notas-recientes/route.ts`, y quien llame a `leerNotasPublicas`/`contarNotasPublicas` (`grep -rn "NotasPublicas" src/app`)
- Test: `src/lib/__tests__/api-vista-belen.test.ts`, `api-notas-recientes.test.ts` y los de `api-notas*` existentes

**Interfaces — Consumes:** Task 2 y Task 3.
**Contrato nuevo:**
- POST `{ pedido, texto, para?: Destino[], enConsultaPublica?: boolean }`. Validar cada `Destino`: una persona tiene que existir en `leerPersonas()`; una sección tiene que estar en `SECCIONES_MENCIONABLES`. Si no, 400. `publica` se ignora.
- PATCH igual que POST, más `id`.
- GET `?pedido=` → `leerNotas(pedido, lector)`, con `lector = sesión ? lectorDe(persona) : null`. Desaparece el `soloPara` por `veNotasInternas`.
- GET `/api/notas-recientes` → `{ avisos: NotaPedido[] }` = `leerAvisosNotas(lector, VENTANA_AVISOS_DIAS)`. Sin sesión (login apagado) → `{ avisos: [] }`.
- PATCH/DELETE de una nota que no ves → 404 (antes de mirar la autoría).

- [ ] **Step 1: Reescribir los tests de `api-vista-belen.test.ts` sobre notas.**
  - Fuera: «lee las «para todos» y las suyas…» y «Belén no puede dejar una nota «solo OT»».
  - Nuevos:
    - Iván crea `{ para: [{tipo:"seccion",id:"ot"}] }` → Belén no la ve, Iván sí;
    - Iván crea sin `para` → Belén la ve;
    - Belén escribe `@[persona:ivan]` → aparece en `/api/notas-recientes` de Iván y no en el de Carlos;
    - PATCH de Belén sobre una nota «solo ot» → 404;
    - `para` con persona inexistente → 400.
  - En `api-notas-recientes.test.ts`, mockear `leerAvisosNotas` en vez de `leerNotasRecientes` y comprobar que recibe el lector de la sesión.
- [ ] **Step 2:** `pnpm vitest run src/lib/__tests__/api-vista-belen.test.ts src/lib/__tests__/api-notas-recientes.test.ts` → FAIL.
- [ ] **Step 3:** Implementar en las rutas. `veNotasInternas` queda sin uso: borrarla de `personas.ts` si `grep` lo confirma. Quitar `publica` de `NotaPedido`.
- [ ] **Step 4:** `pnpm vitest run` (todo) → PASS. Los fallos de otros tests que usan `publica` se adaptan aquí.
- [ ] **Step 5:** `git commit -m "feat(notas): la API filtra por audiencia y da los avisos de cada uno"`

---

### Task 5: Campana con los avisos del servidor

**Files:**
- Modify: `src/components/Board.tsx` (estado `notasRecientes` en torno a la línea 598, bucle en torno a la 1212, comentario de la 1345), `src/components/vista-belen/AvisosBelen.tsx` (fetch en torno a la línea 40)
- Test: los tests existentes de `avisosPendientes` / `agruparAvisos` (`grep -rln "avisosPendientes\|notaNueva" src/lib/__tests__`)

- [ ] **Step 1:** Leer `d.avisos` en lugar de `d.notas` en los dos fetch. El bucle `notaNueva` de Board ya no filtra «de otros en mis pedidos»: cada aviso recibido es para mí. Sigue el descarte por `nota:<id>` en localStorage. Pedido fuera del tablero: el aviso sale igual, abre el pedido por código como hace AvisosBelen.
- [ ] **Step 2:** Ajustar el texto del aviso en `Notificaciones.tsx`:
  - «X te menciona en AR…» si la mención es a mí;
  - «X menciona a Producción…» si es a una sección;
  - «Nota para ti en AR…» si es por audiencia.
  - El motivo se calcula en cliente con `nota.menciones`/`nota.para` y mis destinos. Un helper puro `motivoAviso(nota, misDestinos)` en `src/lib/notificaciones.ts`, con test unitario.
- [ ] **Step 3:** `pnpm vitest run` → PASS; `pnpm tsc --noEmit`.
- [ ] **Step 4:** `git commit -m "feat(notas): la campana solo suena por lo que va contigo"`

---

### Task 6: Panel de notas: para quién, consulta pública y @

**Files:**
- Modify: `src/components/NotasPedido.tsx` (props `publicaPorDefecto`, `soloParaTodos` y `elegirPara` desaparecen; revisar quién las pasa con `grep -rn "NotasPedido" src/components`)
- Possibly create: `src/components/notas/SelectorPara.tsx`, `src/components/notas/CampoMencion.tsx`, si `NotasPedido.tsx` pasa de ~550 líneas

Comportamiento:
1. **«Para: Todos ▾»**. Al abrirlo:
   - lista de secciones (`SECCIONES_MENCIONABLES`) y personas activas (`/api/personas`) con casillas;
   - la selección pinta las etiquetas «Solo para: Producción, Iván Sánchez»;
   - por defecto, vacío = todos.
2. **Casilla «Visible en la consulta pública»**, desmarcada. Oculta cuando hay «Solo para…», porque restringida nunca es pública.
3. **`@` en el textarea**:
   - abre una lista filtrada por lo tecleado tras la `@` (secciones primero, luego personas por `nombre`);
   - ↑/↓, Enter/Tab para elegir y Esc para cerrar;
   - al elegir, se inserta `tokenMencion(d) + " "`;
   - el textarea muestra el token crudo (simple). Las etiquetas salen en la nota guardada.
4. **Pintar nota**:
   - `trocearTexto` convierte las menciones en etiquetas con el nombre actual (persona por id, sección por `SECCIONES_MENCIONABLES`);
   - si la mención es a mí o a una sección mía, la etiqueta va resaltada;
   - una persona desconocida sale como «@alguien».
5. Nota restringida: chip «Solo para …» en su cabecera. Fuera la etiqueta vieja «Solo OT».
6. Estilo: tokens HeroUI (`docs/ESTILO-HEROUI.md`). Nada de colores sueltos.

- [ ] **Step 1:** Implementar los puntos 1-6.
- [ ] **Step 2:** `pnpm tsc --noEmit`, `pnpm eslint src/components/NotasPedido.tsx src/components/notas`, `pnpm vitest run`.
- [ ] **Step 3: Prueba en navegador** (skill `run`, dev server, login activo con dos cuentas):
  - Iván deja una nota con `@Producción`, y la campana de Belén suena mientras la de Carrón no;
  - una nota «Solo para Diseño» no aparece en la sesión de Belén;
  - la consulta pública solo enseña las marcadas.
  - Pasar el agente `ui-reviewer` sobre los componentes tocados.
- [ ] **Step 4: Commit con novedad**

```
feat(notas): para quién es cada nota y menciones con @

Novedad: nuevo | Las notas avisan solo a quien mencionas con @
Detalle: Escribe @ y elige una persona o una sección (Oficina Técnica, Diseño, Impresión, Producción, Dirección). La campana ya no suena por cada nota: solo cuando va contigo. También puedes dejar una nota solo para algunas personas o secciones.
```

---

## Cierre

- `pnpm vitest run`, `pnpm tsc --noEmit` y eslint de los ficheros tocados, todo en verde.
- Actualizar `docs/NOTAS-MENCIONES.md` con «Fase 1 hecha (fecha)».
- Actualizar la memoria `notas-menciones.md`.
- No hacer push sin que Iván lo pida. Tras el push, dar el comando de despliegue (la migración 20 se aplica al arrancar):
  `cd /webs/coordina-ot && git pull && pnpm install && pnpm build && pm2 restart coordina-ot`
