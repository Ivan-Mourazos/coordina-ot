# Sección Impresión Digital — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tercera sección de CoordinaOT, «Impresión Digital», con tablero propio para Manuel Gómez Camino (22): cola de lo que hay que imprimir, fichaje desde la web y un botón «Impreso» que aprueba y pasa el pedido a Producción.

**Architecture:** Todo lo que distingue a una sección vive en `src/lib/secciones.ts`. Se añade la entrada `impresion` con `fuente: "olanet"` y sin vista de RPS, más dos campos nuevos: `sinRevision` (el tablero no tiene fases de revisión) y `etiquetasFase` (cómo se llaman las columnas en esa sección). Los literales `"ot"`/`"diseno"` repartidos por el código pasan a derivarse de `SECCIONES`. «Impreso» es una acción de pedido del Board que pone las OF en `aprobada` y después reutiliza el paso a Producción que ya existe.

**Tech Stack:** Next.js (versión con cambios: lee `node_modules/next/dist/docs/` antes de tocar rutas), React, TypeScript, Vitest, better-sqlite3 (estado local), mssql (RPS y OLANET).

**Spec:** `docs/superpowers/specs/2026-10-13-seccion-impresion-digital-design.md`

## Global Constraints

- **Diseño Gráfico NO cambia:** ni sus recursos (`a-dgra`, `dgra-a`, `p-pcus`), ni `marcasEnFases: ["DGRA"]`, ni su flujo con revisión.
- El id de la sección es `"impresion"` y no se renombra: va a la BD y a la URL.
- Recursos de impresión: `["imdi-a", "p-hpla", "p-pcmu"]`. `p-pcmu` solo cuenta tiempo (`recursosSoloTiempo`).
- Marcas en OLANET: `["IMDI", "P-HPLA"]`. IMDI-A aparece en `scg_Fases.MaquinaTeo` como `U-P-IMDI`.
- Máquina por defecto de los bonos: `"IMDI-A"`.
- Manuel es `CodEmployee 22`, operarioId `"manuel"`.
- Comentarios y textos en español, con la densidad de comentarios del fichero que se toca: explican el PORQUÉ.
- Cada parámetro SQL de texto se tipa (`sql.VarChar(n)`): sin tipo, SQL Server no usa el índice.
- Solo el commit final que se nota lleva línea `Novedad:`. Los demás commits no la llevan.
- Tests: `pnpm test` (vitest). Tipos: `pnpm exec tsc --noEmit`. Lint: `pnpm lint`.

## Ajuste a la spec, decidido al planificar

- **«Listo para pasar» se queda como columna** en Impresión, con la etiqueta «Impreso, sin pasar». Desaparecen «A corregir» y «Esperando revisión». El motivo es que «Impreso» son dos escrituras: aprobar y luego pasar. Si la segunda falla, el pedido queda aprobado sin pasar, y sin esa columna desaparecería del tablero. Así se ve y se puede pasar a mano.
- Se añade `nombreCorto` a `Seccion` («OT», «Diseño», «Impresión»). Así se sustituyen los tres sitios que hoy lo escriben a mano.

## Mapa de ficheros

| Fichero | Qué cambia |
|---|---|
| `src/lib/secciones.ts` | `SeccionId` + `impresion`; `vista?`; `sinRevision?`; `etiquetasFase?`; `nombreCorto`; `esSeccionId` derivado |
| `src/lib/historial-centros.ts` | `RECURSOS_IMPRESION` = `SECCIONES.impresion.recursos`; `CentroHistorialId = SeccionId \| "taller"`; nombre/corto desde la sección |
| `src/lib/server/rps.ts` | `filasDeLaSeccion` sin vista → solo OLANET + retenidas |
| `src/lib/fases-tablero.ts` | `fasesEnOrden` quita las fases de revisión y aplica las etiquetas; `faseEnUnaPalabra` acepta sección |
| `src/lib/impreso.ts` (nuevo) | `ofsParaImpreso(pedido, miId)`: qué OF marca «Impreso» |
| `src/lib/server/operarios.ts`, `src/lib/mock.ts`, `src/lib/server/estado-db.ts` | Manuel a `impresion` + migración 13 |
| `src/lib/server/historial-db.ts`, `src/lib/server/historial-indice.ts` | bucles y CASE por sección, derivados de `SECCIONES` |
| `src/components/SelectorSeccion.tsx`, `src/components/Herramientas.tsx` | `nombreCorto` |
| `src/components/Drawer.tsx`, `src/components/Board.tsx` | botón «Impreso» y `marcarImpreso` |
| `scripts/verificar-impresion.test.ts` (nuevo) | comprobación opt-in contra OLANET y RPS reales |

---

### Task 1: La sección en `secciones.ts`

**Files:**
- Modify: `src/lib/secciones.ts`
- Modify: `src/lib/historial-centros.ts:1-30`
- Modify: `src/lib/server/rps.ts:775-783` (`clavesDeLaVista`) y `:917-937` (`filasDeLaSeccion`)
- Test: `src/lib/__tests__/secciones.test.ts`

**Interfaces:**
- Produces:
  - `type SeccionId = "ot" | "diseno" | "impresion"`
  - `Seccion.vista?: string`
  - `Seccion.sinRevision?: boolean`
  - `Seccion.etiquetasFase?: Partial<Record<Fase, string>>`
  - `Seccion.nombreCorto: string`
  - `SECCIONES.impresion`
  - `esSeccionId(v): v is SeccionId`, derivado de `SECCIONES`
  - `RECURSOS_IMPRESION`, que sigue exportado y ahora vale `SECCIONES.impresion.recursos`
  - `CentroHistorialId = SeccionId | "taller"`

- [ ] **Step 1: Write the failing tests**

Añade al final de `src/lib/__tests__/secciones.test.ts` (importa `seccionDeRecurso` y `esFaseDeLaWeb` si no están ya en el import):

```ts
describe("Impresión Digital", () => {
  const { impresion, diseno, ot } = SECCIONES;

  it("es una sección que se puede pedir por la URL", () => {
    expect(esSeccionId("impresion")).toBe(true);
    expect(seccionDe("impresion").id).toBe("impresion");
    expect(esSeccionId("taller")).toBe(false);
  });

  it("sus recursos son los tres de impresión y no pisan los de nadie", () => {
    expect(impresion.recursos).toEqual(["imdi-a", "p-hpla", "p-pcmu"]);
    for (const r of impresion.recursos) {
      expect(diseno.recursos).not.toContain(r);
      expect(ot.recursos).not.toContain(r);
    }
    expect(seccionDeRecurso("IMDI-A")).toBe("impresion");
    expect(seccionDeRecurso("P-HPLA")).toBe("impresion");
    expect(seccionDeRecurso("P-PCMU")).toBe("impresion");
    // El plóter de Diseño sigue siendo de Diseño.
    expect(seccionDeRecurso("P-PCUS")).toBe("diseno");
  });

  it("el troquelado cuenta tiempo pero no sale en el tablero", () => {
    expect(recursosSql(impresion)).toContain("'p-pcmu'");
    expect(recursosDeTrabajoSql(impresion)).not.toContain("p-pcmu");
    expect(esFaseDe("P-PCMU", impresion)).toBe(false);
  });

  it("reconoce sus fases de OLANET tal como vienen escritas", () => {
    // IMDI-A sale en scg_Fases como U-P-IMDI (medido el 13/10/2026).
    expect(esFaseDe("U-P-IMDI", impresion)).toBe(true);
    expect(esFaseDe("P-HPLA", impresion)).toBe(true);
    expect(esFaseDeLaWeb("U-P-IMDI")).toBe(true);
  });

  it("la frontera con Diseño no se cruza en ningún sentido", () => {
    for (const m of ["A-DGRA", "U-A-DGRA", "P-PCUS", "U-P-PCUS"]) expect(esFaseDe(m, impresion)).toBe(false);
    for (const m of ["U-P-IMDI", "P-HPLA", "P-PCMU"]) expect(esFaseDe(m, diseno)).toBe(false);
  });

  it("lee de OLANET, sin vista, sin revisión y con su propia máquina", () => {
    expect(impresion.fuente).toBe("olanet");
    expect(impresion.vista).toBeUndefined();
    expect(impresion.sinRevision).toBe(true);
    expect(impresion.maquina).toBe("IMDI-A");
  });

  it("toda sección que lee de la vista tiene vista", () => {
    for (const s of Object.values(SECCIONES)) {
      if (s.fuente === "vista") expect(s.vista).toBeTruthy();
    }
  });

  it("cada sección tiene nombre corto", () => {
    expect(Object.values(SECCIONES).map((s) => s.nombreCorto)).toEqual(["OT", "Diseño", "Impresión"]);
  });
});
```

En `src/lib/__tests__/historial-centros.test.ts:124-127` el test sigue valiendo tal cual: `RECURSOS_IMPRESION` no está en Diseño.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/__tests__/secciones.test.ts`
Expected: FAIL. `esSeccionId("impresion")` da false, y `SECCIONES.impresion` es undefined.

- [ ] **Step 3: Implement**

En `src/lib/secciones.ts`:

1. Cambia el comentario de cabecera para que cuente que hay tres secciones. Añade:

```
//   Impresión Digital → IMDI-A (impresora), P-HPLA (HP Latex), P-PCMU (troquel)
```

   Y una frase: Impresión no tiene vista en RPS y lee solo de OLANET.

2. `export type SeccionId = "ot" | "diseno" | "impresion";`

3. En `interface Seccion`:

```ts
  /** Cómo se la llama cuando no hay sitio: la cabecera de Herramientas, el
   *  selector estrecho, los centros del Historial. Era un literal en tres
   *  sitios y con la tercera sección se desincronizaba. */
  nombreCorto: string;
  /** La vista de RPS con su trabajo pendiente. Ausente solo si la fuente es
   *  OLANET y RPS no tiene vista para ella (Impresión Digital): entonces la
   *  lista es OLANET y nada más. */
  vista?: string;
```

   El `vista: string;` actual se sustituye por el de arriba.

   Después de `internosComoTrabajo`:

```ts
  /** Nadie revisa este trabajo: se hace y se pasa.
   *
   *  Impresión Digital (Iván, 13/10/2026): lo impreso no lo repasa otra
   *  persona. El tablero no enseña «A corregir» ni «Esperando revisión» —con
   *  este flujo nunca se llega a ellas— y la ficha del pedido ofrece «Impreso»,
   *  que aprueba sus OF y lo pasa a Producción de una vez. */
  sinRevision?: boolean;
  /** Cómo se llaman las columnas en esta sección, si no es como en OT. Es de
   *  PRESENTACIÓN, como `ordenFases`: la fase en que cae un pedido no cambia. */
  etiquetasFase?: Partial<Record<Fase, string>>;
```

4. Añade `nombreCorto: "OT"` a `ot` y `nombreCorto: "Diseño"` a `diseno`. No toques nada más de `diseno`.

5. Añade la entrada:

```ts
  impresion: {
    id: "impresion",
    nombre: "Impresión Digital",
    nombreCorto: "Impresión",
    // Sin vista: RPS no tiene `TGM_PENDIENTE_*` de impresión. La lista es la
    // de OLANET, que es la que ya manda en Diseño. Lo que se pierde es lo
    // recién lanzado que OLANET aún no tenga, y eso son minutos.
    fuente: "olanet",
    // Las tres máquinas de Manuel (medido en RPS: ~720 h desde 2025 entre
    // IMDI-A y P-HPLA). P-PCMU es el plóter de troquelar vinilo: 38 fichajes
    // de Manuel contra 5 de Smith (17/09/2026).
    recursos: ["imdi-a", "p-hpla", "p-pcmu"],
    // Troquelar se ficha en la máquina, como el corte de Diseño (P-PCUS): el
    // tiempo es de Impresión pero la tarea no sale en su tablero.
    recursosSoloTiempo: ["p-pcmu"],
    maquina: "IMDI-A",
    // IMDI-A sale en OLANET como «U-P-IMDI» (13/10/2026: 33 fases vivas así y
    // ninguna como «IMDI-A»). "IMDI" recoge las dos. El plóter va entero,
    // con su «P-», por lo mismo que en Diseño: deja fuera los A-… del taller.
    marcasEnFases: ["IMDI", "P-HPLA"],
    ordenFases: ["sinEmpezar", "planteando", "listoParaPasar", "parado"],
    etiquetasFase: { planteando: "Imprimiendo", listoParaPasar: "Impreso, sin pasar" },
    revisionPorPedido: true,
    barraSimple: true,
    internosComoTrabajo: true,
    sinRevision: true,
  },
```

6. Sustituye `esSeccionId`:

```ts
export function esSeccionId(v: unknown): v is SeccionId {
  return typeof v === "string" && Object.hasOwn(SECCIONES, v);
}
```

7. Cambia el comentario de `esFaseDeLaWeb` para que diga «de cualquier sección de la web», sin «OT o Diseño».

En `src/lib/historial-centros.ts`:

```ts
export type CentroHistorialId = SeccionId | "taller";

/** Los recursos de Impresión Digital. Desde el 13/10/2026 es una sección de la
 *  web y la lista vive allí; esto se queda como nombre para el Historial, que
 *  la separa de Taller desde el 09/10. Diseño se mira ANTES en los CASE: lo
 *  que lleve su mesa sigue siendo suyo. */
export const RECURSOS_IMPRESION: readonly string[] = SECCIONES.impresion.recursos;

export const recursosImpresionSql = (): string => recursosSql(SECCIONES.impresion);
```

Importa `recursosSql`. Cambia `CENTRO_CORTO` y `NOMBRE_CENTRO` a:

```ts
export const CENTRO_CORTO: Record<CentroHistorialId, string> = {
  ot: SECCIONES.ot.nombreCorto,
  diseno: SECCIONES.diseno.nombreCorto,
  impresion: SECCIONES.impresion.nombreCorto,
  taller: "Taller",
};
```

`NOMBRE_CENTRO.impresion` sigue siendo `"Impresión digital"`. No lo cambies: es lo que ve hoy el Historial.

En `src/lib/server/rps.ts`, `filasDeLaSeccion`:

```ts
  if (seccion.fuente === "vista") {
    const claves = await clavesDeLaVista(pool, seccion);
    return filasPorFase(pool, seccion, unirRetenidas(paresDe(claves), retenidas));
  }

  const { fasesPendientesDe } = await import("./olanet");
  // Sin vista (Impresión Digital): OLANET es toda la lista. Ver `Seccion.vista`.
  if (!seccion.vista) {
    const fases = await fasesPendientesDe(seccion);
    return filasPorFase(pool, seccion, unirRetenidas(fases, retenidas));
  }
  // OLANET manda, y la vista solo completa …  (lo de siempre)
```

`clavesDeLaVista` lanza si no hay vista. Esto nunca se debería alcanzar, pero un error claro es mejor que un `dbo.undefined`:

```ts
  if (!seccion.vista) throw new Error(`La sección ${seccion.id} no tiene vista de RPS`);
```

- [ ] **Step 4: Typecheck y arreglar lo que rompa el tipo**

Run: `pnpm exec tsc --noEmit`

Sitios que van a fallar, y cómo se arreglan:
- `seccion.vista` usado como `string`: solo `clavesDeLaVista`, que ya tiene la guarda.
- `Record<SeccionId, …>` sin `impresion`: añade la clave.
- `const ABREVIADO` de `SelectorSeccion.tsx` es `Partial`, así que no rompe. Se cambia en la Task 4.

Repite hasta que no salga ningún error.

- [ ] **Step 5: Run tests**

Run: `pnpm test`
Expected: todo en verde. Si `historial-centros.test.ts` o `barra-filtros-seccion.test.ts` cuentan secciones («las dos»), ajusta su número a tres solo si el test enumera `SECCIONES`. No cambies lo que comprueban de OT y Diseño.

- [ ] **Step 6: Commit**

```bash
git add src/lib/secciones.ts src/lib/historial-centros.ts src/lib/server/rps.ts src/lib/__tests__/
git commit -m "feat(secciones): Impresión Digital como tercera sección, leyendo de OLANET"
```

(Sin línea `Novedad:`: todavía no se ve.)

---

### Task 2: Tablero sin revisión y con sus etiquetas

**Files:**
- Modify: `src/lib/fases-tablero.ts` (`fasesEnOrden`, `faseEnUnaPalabra`)
- Test: `src/lib/__tests__/fases-tablero.test.ts`

**Interfaces:**
- Consumes: `Seccion.sinRevision`, `Seccion.etiquetasFase`, `SECCIONES.impresion` (Task 1)
- Produces:
  - `agruparPorFase(pedidos, seccion)`: con `sinRevision` no devuelve `devuelta` ni `esperandoRevision`, y aplica `etiquetasFase` a `label`.
  - `etiquetaFase(fase: Fase, seccion?: Seccion): string`
  - `faseEnUnaPalabra(p, { invitado?, seccion? })`

- [ ] **Step 1: Write the failing tests**

Añade a `src/lib/__tests__/fases-tablero.test.ts`. Antes, mira qué helper usa el fichero para fabricar OF y pedidos (busca `function of(` o `mkOF`) y úsalo. Aquí se llama `of(...)`:

```ts
import { SECCIONES } from "../secciones";
import { agruparPorFase, etiquetaFase } from "../fases-tablero";

describe("sección sin revisión (Impresión Digital)", () => {
  const imp = SECCIONES.impresion;

  it("no tiene columnas de revisión", () => {
    const ids = agruparPorFase([], imp).map((g) => g.id);
    expect(ids).toEqual(["sinEmpezar", "planteando", "listoParaPasar", "parado"]);
  });

  it("las columnas se llaman como en la sección", () => {
    const grupos = agruparPorFase([], imp);
    expect(grupos.find((g) => g.id === "planteando")?.label).toBe("Imprimiendo");
    expect(etiquetaFase("listoParaPasar", imp)).toBe("Impreso, sin pasar");
    expect(etiquetaFase("sinEmpezar", imp)).toBe("Sin empezar");
  });

  it("Diseño y OT no cambian", () => {
    expect(agruparPorFase([], SECCIONES.diseno).map((g) => g.id)).toEqual([
      "devuelta", "sinEmpezar", "planteando", "listoParaPasar", "esperandoRevision", "parado",
    ]);
    expect(agruparPorFase([], SECCIONES.ot).map((g) => g.label)).toContain("Planteando");
    expect(etiquetaFase("planteando")).toBe("Planteando");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test src/lib/__tests__/fases-tablero.test.ts`
Expected: FAIL. `etiquetaFase` no existe y salen seis columnas.

- [ ] **Step 3: Implement**

En `src/lib/fases-tablero.ts`:

```ts
/** Las fases a las que no se llega sin revisión. */
const FASES_DE_REVISION: ReadonlySet<Fase> = new Set(["devuelta", "esperandoRevision"]);

/** Cómo se llama esta fase en esta sección. Sin sección, como en FASES. */
export function etiquetaFase(fase: Fase, seccion?: Seccion): string {
  return seccion?.etiquetasFase?.[fase] ?? FASES.find((f) => f.id === fase)!.label;
}
```

`fasesEnOrden` filtra y pone las etiquetas después de ordenar:

```ts
function fasesEnOrden(seccion?: Seccion): readonly FaseMeta[] {
  // Sin revisión, sus dos fases no son columnas vacías: no existen. Se quitan
  // aquí, y no en la lista de la sección, porque `ordenFases` manda lo que no
  // nombre al final en vez de esconderlo (ver más abajo).
  const base = seccion?.sinRevision ? FASES.filter((f) => !FASES_DE_REVISION.has(f.id)) : FASES;
  const orden = seccion?.ordenFases;
  const ordenadas = !orden
    ? base
    : (() => {
        const puesto = new Map(orden.map((id, i) => [id, i]));
        return [...base].sort(
          (a, b) => (puesto.get(a.id) ?? FASES.length) - (puesto.get(b.id) ?? FASES.length),
        );
      })();
  return seccion?.etiquetasFase
    ? ordenadas.map((f) => ({ ...f, label: etiquetaFase(f.id, seccion) }))
    : ordenadas;
}
```

`faseEnUnaPalabra`: añade `seccion?: Seccion` a las opciones y úsala en `planteando` y `listoParaPasar`:

```ts
    case "planteando":
      return { texto: etiquetaFase("planteando", seccion), color: color(fase) };
    …
    case "listoParaPasar":
      return { texto: invitado ? "Listo" : etiquetaFase("listoParaPasar", seccion), color: color(fase) };
```

Busca con `grep -rn "faseEnUnaPalabra\|FASES.find\|\.label" src/components` los sitios que pintan la etiqueta de una fase leyendo `FASES` directamente, en vez de por `agruparPorFase`. Si alguno tiene la sección a mano, pásale `etiquetaFase(id, seccion)`. Los que no la tengan se quedan como están: con «Planteando» en un sitio secundario no se rompe nada.

- [ ] **Step 4: Run tests**

Run: `pnpm test && pnpm exec tsc --noEmit`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fases-tablero.ts src/lib/__tests__/fases-tablero.test.ts src/components
git commit -m "feat(tablero): secciones sin revisión y con nombres de columna propios"
```

---

### Task 3: Manuel pasa a Impresión

**Files:**
- Modify: `src/lib/server/operarios.ts:36`
- Modify: `src/lib/mock.ts:28`
- Modify: `src/lib/server/estado-db.ts:680` (semilla) y `MIGRACIONES` (nueva versión 13)
- Test: `src/lib/__tests__/operarios-seccion.test.ts`; test de migración junto a los demás de `estado-db` (busca `user_version` o `cuentas_de_direccion` en `src/lib/__tests__` para ver el patrón)

**Interfaces:**
- Consumes: `SeccionId` con `"impresion"` (Task 1)
- Produces:
  - `seccionDeOperario("manuel") === "impresion"`
  - `MAQUINA_POR_OPERARIO.manuel === "IMDI-A"`
  - la fila de `persona` de Manuel con `seccion = 'impresion'`

- [ ] **Step 1: Write the failing tests**

En `src/lib/__tests__/operarios-seccion.test.ts`:

```ts
it("Manuel imprime: su sección es Impresión y ficha en IMDI-A", () => {
  expect(seccionDeOperario("manuel")).toBe("impresion");
  expect(MAQUINA_POR_OPERARIO.manuel).toBe("IMDI-A");
  expect(operariosDeSeccion("impresion")).toEqual(["manuel"]);
  // Diseño se queda con Carrón y Smith.
  expect(operariosDeSeccion("diseno")).toEqual(["carron", "smith"]);
});
```

Para la migración, copia el patrón del test que ya exista de `cuentas_de_direccion` (BD en memoria, `migrar`, leer `persona`). Tiene que comprobar dos cosas:
- una base con Manuel en `diseno` acaba con Manuel en `impresion`;
- si alguien le había puesto otra sección a mano (por ejemplo `ot`), no se toca.

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test src/lib/__tests__/operarios-seccion.test.ts`
Expected: FAIL. Hoy da `"diseno"`.

- [ ] **Step 3: Implement**

`operarios.ts`:

```ts
  // ── Impresión Digital ──
  // Manuel también diseña, pero lo suyo es imprimir (Iván, 13/10/2026): entra
  // en Impresión y abre Diseño con el selector cuando le toca. Su tiempo en
  // A-DGRA sigue contando para Diseño — el tiempo va por recurso, no por persona.
  "22": { operarioId: "manuel", seccion: "impresion" }, // GOMEZ CAMINO, MANUEL RAMON
```

Quita la línea de Manuel de su sitio en Diseño y actualiza el comentario de cabecera (en Diseño quedan dos).

`mock.ts:28`: `seccion: "impresion"`.

`estado-db.ts`:
- En la semilla: `["manuel", "Manuel", "impresion"]`. Cambia el comentario de arriba: «Oficina Técnica, Diseño Gráfico e Impresión».
- La migración nueva:

```ts
/** Manuel pasa de Diseño Gráfico a Impresión Digital (13/10/2026).
 *
 *  La semilla de la 7 solo entra en bases nuevas, así que producción hay que
 *  moverla aquí. Solo si sigue en Diseño: si alguien le puso otra sección a
 *  mano, esa decisión manda. */
function manuelAImpresion(db: Database.Database): void {
  db.prepare("UPDATE persona SET seccion = 'impresion' WHERE id = 'manuel' AND seccion = 'diseno'").run();
}
```

Y en `MIGRACIONES`:

```ts
  // Impresión Digital abre con tablero propio y Manuel es quien imprime.
  { version: 13, nombre: "manuel_a_impresion", aplicar: manuelAImpresion },
```

- [ ] **Step 4: Run tests**

Run: `pnpm test && pnpm exec tsc --noEmit`
Expected: verde. Si algún test enumeraba los tres de Diseño, corrígelo a dos y deja dicho por qué.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/operarios.ts src/lib/mock.ts src/lib/server/estado-db.ts src/lib/__tests__/
git commit -m "feat(operarios): Manuel pasa a Impresión Digital"
```

---

### Task 4: Literales de sección repartidos (Historial, selector, herramientas)

**Files:**
- Modify: `src/lib/server/historial-db.ts:286-288`, `:429-431`, `:704-711`, `:749`
- Modify: `src/lib/server/historial-indice.ts:240-241` (y el tipo de `base` en `IndiceHistorial`)
- Modify: `src/components/SelectorSeccion.tsx:79-84`
- Modify: `src/components/Herramientas.tsx:105`
- Test: los que ya hay de historial (`pnpm test`) + `scripts/verificar-historial-centros.test.ts` (opt-in)

**Interfaces:**
- Consumes: `SECCIONES`, `Seccion.nombreCorto`, `recursosSql` (Task 1)
- Produces: el índice del Historial lleva `base[seccion]` para las tres secciones.

- [ ] **Step 1: historial-db.ts — el CASE de centros**

En los dos CASE (`:286` y `:704`), el orden se queda: OT, Diseño, Impresión, Taller. Solo cambia de dónde sale la lista de impresión: `recursosSql(SECCIONES.impresion)` en lugar de `recursosImpresionSql()`. Quita el import de `recursosImpresionSql` si deja de usarse. **No generes el CASE con un bucle sobre `SECCIONES`**: el orden importa (Diseño antes que Impresión), y escrito a mano se ve.

- [ ] **Step 2: historial-db.ts — overlay y roles**

`:429`:

```ts
    const todas = (Object.keys(SECCIONES) as SeccionId[]).map((s) => leerOverlay(s).ofs);
    overlay = { ofs: new Map(todas.flatMap((m) => [...m])) };
```

`:749`: `for (const centro of Object.keys(SECCIONES) as SeccionId[]) {`

Así los fichajes registrados en la web dentro de Impresión salen con autor en el Historial.

- [ ] **Step 3: historial-indice.ts**

```ts
  const ids = Object.keys(SECCIONES) as SeccionId[];
  const base = Object.fromEntries(
    await Promise.all(ids.map(async (s) => [s, await baseDe(s)] as const)),
  ) as Record<SeccionId, BaseHistorial[]>;
  const pedidos = new Set(Object.values(base).flat().map((b) => b.pedido));
```

Cambia el tipo de `IndiceHistorial.base` a `Record<SeccionId, BaseHistorial[]>`. Antes, lee `baseDe` entera y comprueba que solo usa `recursosSql(seccion)` / `recursosDeTrabajoSql(seccion)` y nada propio de OT o Diseño. Si encuentras algo propio, para y repórtalo.

Mide el coste. El log `[historial] lista en memoria lista en N ms` sale al arrancar `pnpm dev`. Apunta el antes y el después en el mensaje del commit. Ahora las consultas van en paralelo; antes iban seguidas.

- [ ] **Step 4: SelectorSeccion y Herramientas**

`SelectorSeccion.tsx`: borra `ABREVIADO` y usa `s.nombreCorto` donde se usaba `ABREVIADO[s.id] ?? s.nombre`.

`Herramientas.tsx:105`: `{SECCIONES[seccion].nombreCorto}`.

- [ ] **Step 5: Verify**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm lint`
Expected: verde.

Con acceso a RPS: `VALIDAR_RPS_UI=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run scripts/verificar-historial-centros.test.ts`
Expected: verde, igual que antes del cambio.

Run: `grep -rn '"diseno"' src --include=*.ts --include=*.tsx | grep -v __tests__`
Expected: solo quedan `secciones.ts`, la semilla, `operarios.ts`, `mock.ts`, `consulta.ts` (consulta pública: fuera de alcance por la spec) y `ConsultaEnCurso.tsx:24` (ídem).

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/historial-db.ts src/lib/server/historial-indice.ts src/components/SelectorSeccion.tsx src/components/Herramientas.tsx
git commit -m "refactor(secciones): Historial, selector y herramientas derivan las secciones de SECCIONES"
```

---

### Task 5: El botón «Impreso»

**Files:**
- Create: `src/lib/impreso.ts`
- Test: `src/lib/__tests__/impreso.test.ts`
- Modify: `src/components/Drawer.tsx` (bloque del pedido, junto a `paraSinRevision`, `:466-476` y `:920-934`)
- Modify: `src/components/Board.tsx` (`completarPedidoAhora` `:2096` y un `marcarImpreso` nuevo al lado)

**Interfaces:**
- Consumes: `Seccion.sinRevision`, `ofsQueCuentan`, `pedidoListoParaPasar`, `puedePasarAProduccion` de `fases-tablero.ts`
- Produces:
  - `ofsParaImpreso(pedido: Pedido, miId: string | null): OF[]`
  - `marcarComoImpreso(of: OF, miId: string): OF`
  - Drawer prop `onImpreso?: (pedidoId: string) => void`

**Qué hace «Impreso».** Manuel abre el pedido y pulsa el botón:
1. Las OF del pedido que cuentan (`ofsQueCuentan`) y están en `pendiente` o `en_curso` pasan a `aprobada`. Si alguna no tiene autor, se queda con Manuel como autor. Queda con `revisada: false`, igual que `aprobar_sin_revision`. Se persiste con `motivo: "impreso"` y se corta el reloj de esas OF.
2. Cuando ese guardado responde, se pasa el pedido a Producción con el mismo `completar` de siempre: corta relojes, encola la finalización y OLANET pone las fases en estado 3.

Son dos escrituras porque `/api/estado` rechaza un `completar` que lleve cambios de OF. Si la segunda falla, el pedido se queda en «Impreso, sin pasar» con su botón de pasar de siempre.

**El botón no sale si:**
- el pedido tiene alguna OF de otra persona sin aprobar (su trabajo no es de Manuel);
- o tiene alguna OF en revisión o devuelta (en esta sección no debería pasar, pero si pasa, esa OF manda).

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/impreso.test.ts`. Para fabricar OF y pedidos usa el helper de `fases-tablero.test.ts`; si no se exporta, cópialo al principio del fichero.

```ts
import { describe, expect, it } from "vitest";
import { marcarComoImpreso, ofsParaImpreso } from "../impreso";

describe("Impreso", () => {
  it("coge mis OF en curso y las sin empezar sin dueño", () => {
    const p = pedido([
      of({ id: "a", estado: "en_curso", autorId: "manuel" }),
      of({ id: "b", estado: "pendiente", autorId: null }),
      of({ id: "c", estado: "aprobada", autorId: "manuel" }),
      of({ id: "d", estado: "anulada", autorId: null }),
    ]);
    expect(ofsParaImpreso(p, "manuel").map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("no sale si queda trabajo de otra persona", () => {
    const p = pedido([
      of({ id: "a", estado: "en_curso", autorId: "manuel" }),
      of({ id: "b", estado: "en_curso", autorId: "carron" }),
    ]);
    expect(ofsParaImpreso(p, "manuel")).toEqual([]);
  });

  it("no sale si hay una OF en revisión", () => {
    const p = pedido([
      of({ id: "a", estado: "en_curso", autorId: "manuel" }),
      of({ id: "b", estado: "por_revisar", autorId: "manuel", revisorId: "carron" }),
    ]);
    expect(ofsParaImpreso(p, "manuel")).toEqual([]);
  });

  it("sin identidad no sale nada", () => {
    expect(ofsParaImpreso(pedido([of({ id: "a", estado: "pendiente", autorId: null })]), null)).toEqual([]);
  });

  it("marca aprobada, sin revisión, y adopta la OF huérfana", () => {
    const r = marcarComoImpreso(of({ id: "b", estado: "pendiente", autorId: null }), "manuel");
    expect(r).toMatchObject({ estado: "aprobada", autorId: "manuel" });
    expect(r.revisada).not.toBe(true);
  });

  it("con todas marcadas, el pedido queda listo para pasar y Manuel puede pasarlo", () => {
    const p = pedido([
      of({ id: "a", estado: "en_curso", autorId: "manuel" }),
      of({ id: "b", estado: "pendiente", autorId: null }),
    ]);
    const marcado = { ...p, ofs: p.ofs.map((o) => marcarComoImpreso(o, "manuel")) };
    expect(pedidoListoParaPasar(marcado)).toBe(true);
    expect(puedePasarAProduccion(marcado, "manuel")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test src/lib/__tests__/impreso.test.ts`
Expected: FAIL, el módulo `../impreso` no existe.

- [ ] **Step 3: Implement `src/lib/impreso.ts`**

```ts
import { ofsQueCuentan } from "./fases-tablero";
import type { OF, Pedido } from "./types";

// ─── «Impreso»: el único gesto de Impresión Digital ──────────────────────────
// En Impresión no revisa nadie (ver `Seccion.sinRevision`): se imprime y se
// pasa. El botón aprueba las OF del pedido y luego el Board lo pasa a
// Producción con el `completar` de siempre. Aquí solo está la regla de QUÉ
// OF se marcan, para que la pantalla y los tests digan lo mismo.

const PENDIENTES: ReadonlySet<OF["estado"]> = new Set(["pendiente", "en_curso"]);

/** Las OF que «Impreso» aprobaría, o [] si el botón no debe salir.
 *
 *  Sale solo si TODO lo que queda del pedido es mío o de nadie, y está sin
 *  empezar o en curso. Una OF en curso de otra persona es su trabajo, y
 *  aprobarla sería darlo por hecho en su nombre. Una en revisión o devuelta no
 *  debería existir en esta sección; si existe, alguien la está mirando y esa
 *  OF manda. */
export function ofsParaImpreso(pedido: Pedido, miId: string | null): OF[] {
  if (!miId) return [];
  const quedan = ofsQueCuentan(pedido).filter((o) => o.estado !== "aprobada");
  const todasMias = quedan.every(
    (o) => PENDIENTES.has(o.estado) && (o.autorId === null || o.autorId === miId),
  );
  return todasMias ? quedan : [];
}

/** La OF tal como queda al pulsar «Impreso»: aprobada sin revisión y, si no
 *  era de nadie, mía. Sin autor no se podría pasar el pedido (ver
 *  `puedePasarAProduccion`). `revisada` no se toca: no hubo revisión. */
export function marcarComoImpreso(of: OF, miId: string): OF {
  return { ...of, estado: "aprobada", autorId: of.autorId ?? miId };
}
```

Run: `pnpm test src/lib/__tests__/impreso.test.ts`
Expected: PASS.

- [ ] **Step 4: Board — `marcarImpreso`**

En `Board.tsx`, cambia `completarPedidoAhora` para que acepte el pedido ya calculado. Así no lee un `pedidos` viejo, de antes de aprobar:

```ts
  const completarPedidoAhora = useCallback(
    async (pedidoId: string, recienAprobado?: Pedido) => {
      setPasarError(null);
      const pedido = recienAprobado ?? pedidos.find((p) => p.id === pedidoId);
```

El resto queda igual. Justo debajo:

```ts
  // «Impreso» (Impresión Digital, sin revisión): aprueba lo que queda del
  // pedido y lo pasa a Producción. Son DOS escrituras porque /api/estado no
  // acepta un `completar` con cambios de OF; si la segunda falla, el pedido
  // se queda en «Impreso, sin pasar» con su botón de pasar de siempre.
  const marcarImpreso = useCallback(
    async (pedidoId: string) => {
      const pedido = pedidosRef.current.find((p) => p.id === pedidoId);
      if (!pedido || !miId) return;
      const ofs = ofsParaImpreso(pedido, miId);
      if (ofs.length === 0) return;
      const ids = new Set(ofs.map((o) => o.id));
      const aprobado = { ...pedido, ofs: pedido.ofs.map((o) => (ids.has(o.id) ? marcarComoImpreso(o, miId) : o)) };
      setPedidosSync((prev) => prev.map((p) => (p.id === pedidoId ? aprobado : p)));
      const ok = await persistir({
        motivo: "impreso",
        cambiosOF: aprobado.ofs.filter((o) => ids.has(o.id)).map(snapshotDe),
        cortarFichajeDe: [...ids],
      });
      if (!ok) {
        setPasarError("No se ha guardado. Vuelve a pulsar «Impreso».");
        return;
      }
      await completarPedidoAhora(pedidoId, aprobado);
    },
    [miId, persistir, setPedidosSync, completarPedidoAhora],
  );
```

Comprueba que `pedidosRef` y `snapshotDe` están disponibles en ese punto del componente. `mut` ya los usa, así que lo están. Importa `ofsParaImpreso` y `marcarComoImpreso`.

Comprueba que el servidor acepta `motivo: "impreso"`. Lee `src/app/api/estado/route.ts:60-200`. Si hay una lista blanca de motivos, añádelo con un comentario. Si no la hay, no hay nada que hacer. En las dos rutas, el servidor comprueba que una OF `aprobada` cumple lo de siempre (autor ≠ revisor, no cerrada en RPS).

Pasa `onImpreso={marcarImpreso}` al `<Drawer>` **solo si `seccionActual` tiene `sinRevision`**. Las demás secciones reciben `undefined`.

- [ ] **Step 5: Drawer — el botón**

En el bloque del pedido, al lado de `paraSinRevision`:

```ts
  // Impresión Digital: un solo gesto, «Impreso», que aprueba y pasa (ver
  // lib/impreso.ts). Solo existe donde el Board lo ofrece.
  const paraImpreso = onImpreso ? ofsParaImpreso(pedido, miId) : [];
```

En el JSX, antes del botón de «Pasar … a revisión»:

```tsx
                {paraImpreso.length > 0 && (
                  <button
                    onClick={() => setConfirmandoImpreso(true)}
                    title="Da el pedido por impreso y lo pasa a Producción"
                    className="boton-3d rounded-lg bg-teal-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-800"
                  >
                    Impreso
                  </button>
                )}
```

La confirmación usa el mismo diálogo de confirmar que el resto del Drawer. Busca cómo se pinta `confirmacionPedido.dialogo` y añade un `useConfirmacion` propio que llame a `onImpreso(pedido.id)`, con este texto:

> «El pedido queda impreso y pasa a Producción: sale del tablero y sus fases se cierran en OLANET. Si falta algo por imprimir, no lo pulses.»

En la sección `sinRevision`, `terminar_planteo` y `aprobar_sin_revision` no deben salir en el bloque ni en las filas:
- Los botones de bloque que dependen de `paraRevisarBloque` y `paraSinRevision` se ocultan con `!onImpreso`.
- En la fila, añade a `ACCIONES_DEL_PEDIDO` (o al filtro de `:1731`) `aprobar_sin_revision` y `terminar_planteo` cuando la sección es `sinRevision`. El Drawer ya recibe `seccion`.

- [ ] **Step 6: Verify**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm lint`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/impreso.ts src/lib/__tests__/impreso.test.ts src/components/Drawer.tsx src/components/Board.tsx src/app/api/estado/route.ts
git commit -m "feat(impresion): botón Impreso que aprueba y pasa el pedido"
```

---

### Task 6: Comprobación contra las bases reales, prueba en la app y novedad

**Files:**
- Create: `scripts/verificar-impresion.test.ts`
- Modify: memoria `impresion-digital.md` (fuera del repo)

**Interfaces:**
- Consumes: `fasesPendientesDe(seccion)` de `src/lib/server/olanet.ts`, `getPool`/`getPoolOlanet` de `src/lib/server/db.ts`

- [ ] **Step 1: Script opt-in**

```ts
import { afterAll, expect, test } from "vitest";
import { getPool, getPoolOlanet } from "../src/lib/server/db";
import { fasesPendientesDe } from "../src/lib/server/olanet";
import { SECCIONES } from "../src/lib/secciones";

// ─── El tablero de Impresión contra OLANET y RPS de verdad ──────────────────
// Solo lectura. Opt-in:
//   VALIDAR_RPS_UI=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run scripts/verificar-impresion.test.ts

const ACTIVO = process.env.VALIDAR_RPS_UI === "1";

afterAll(async () => {
  if (!ACTIVO) return;
  await (await getPool()).close();
  await (await getPoolOlanet()).close();
});

test.skipIf(!ACTIVO)("la cola de impresión es de impresión y de nadie más", async () => {
  const fases = await fasesPendientesDe(SECCIONES.impresion);
  console.info(`[impresion] ${fases.length} fases vivas`);
  expect(fases.length).toBeGreaterThan(0);

  // Cada fase cuelga en RPS de una tarea con recurso de impresión, y nunca
  // del troquel ni de Diseño.
  const pool = await getPool();
  const req = pool.request();
  const pares = fases.map((f, i) => {
    req.input(`o${i}`, f.of);
    req.input(`t${i}`, f.fase);
    return `(mo.CodManufacturingOrder = @o${i} AND t.CodMOTask = @t${i})`;
  });
  const r = await req.query<{ orden: string; tarea: string; recurso: string }>(`
    SELECT mo.CodManufacturingOrder AS orden, t.CodMOTask AS tarea, LOWER(rm.CodMOResourceMachine) AS recurso
      FROM dbo.CPRManufacturingOrder mo
      JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = mo.IDManufacturingOrder
      JOIN dbo.CPRMOResourceMachine rm ON rm.IDMOTask = t.IDMOTask
     WHERE mo.CodCompany = '001' AND (${pares.join(" OR ")})`);
  const recursos = new Set(r.recordset.map((f) => f.recurso));
  console.info("[impresion] recursos en RPS:", [...recursos]);
  for (const rec of recursos) expect(["imdi-a", "p-hpla"]).toContain(rec);
}, 120_000);
```

Ojo con la trampa de las tareas `2` y `02` (son distintas en RPS): el `CodMOTask` se compara tal cual, sin normalizar.

- [ ] **Step 2: Ejecutarlo**

Run: `VALIDAR_RPS_UI=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run scripts/verificar-impresion.test.ts`
Expected: PASS. Hay unas 46 fases (el 13/10/2026 eran 33 de IMDI y 13 de P-HPLA), y los recursos son solo `imdi-a` y `p-hpla`. Si aparece otro recurso, **para** y repórtalo: no se toca la frontera para que el test pase.

- [ ] **Step 3: Prueba en la app**

Usa la skill `run` (o `pnpm dev`) y comprueba en el navegador:
1. El selector de sección ofrece «Impresión». Al entrar, el tablero tiene «Sin empezar», «Imprimiendo», «Impreso, sin pasar» y «Parado», y pedidos de impresión. Ninguno de A-DGRA.
2. Como Manuel: Fichar en una OF la pasa a «Imprimiendo».
3. «Impreso» pide confirmación. **NO lo confirmes contra producción**: cierra fases de verdad en OLANET. Comprueba el flujo con el mock o con una BD local sin OLANET real conectado. Si no hay forma segura, para y pregunta a Iván.
4. Diseño y OT se ven exactamente igual que antes. Mira el panel de Diseño: siguen sus seis columnas en su orden.
5. Historial con la sección Impresión: carga y enseña pedidos.

- [ ] **Step 4: Commit con novedad**

```bash
git add scripts/verificar-impresion.test.ts
git commit -F - <<'EOF'
test(impresion): la cola de Impresión contra OLANET y RPS reales

Novedad: nuevo | Impresión Digital tiene su propio tablero
Detalle: Manuel ve lo que queda por imprimir, ficha desde la web y con «Impreso» pasa el pedido a Producción.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 5: Memoria**

Actualiza `impresion-digital.md` en la memoria del proyecto:
- el paso 2 está hecho (tablero desde el 13/10/2026);
- IMDI-A sale en OLANET como `U-P-IMDI`;
- Manuel entra en Impresión por defecto;
- no hay revisión: «Impreso» aprueba y pasa.
