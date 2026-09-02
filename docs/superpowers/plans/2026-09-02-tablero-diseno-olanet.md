# La lista de Diseño Gráfico sale de OLANET — plan de implementación

> **Para quien lo ejecute:** los pasos van con casilla (`- [ ]`) para ir marcando.
> Spec: [2026-09-02-tablero-diseno-fuente-olanet-design.md](../specs/2026-09-02-tablero-diseno-fuente-olanet-design.md).

**Objetivo:** que el tablero de Diseño Gráfico enseñe el trabajo que de verdad
tienen pendiente, leyendo las fases vivas de OLANET en vez del filtro de
progreso de la vista de RPS.

**Arquitectura:** `consultarTablero` ya trabaja sobre un `FilaVista[]` y todo lo
que viene después (fichajes, reservas, compras, imputaciones, ventas, tareas,
subfamilias, agrupado por pedido) parte de ese array. Se sustituye SOLO la
primera consulta, según la `fuente` de la sección, y no se toca nada del resto.

**Stack:** Next.js 16, TypeScript, `mssql` contra dos SQL Server (RPSNext y
OLANET_TGM_DATOS), vitest.

## Restricciones globales

- **Oficina Técnica no se toca.** Su fuente sigue siendo `TGM_PENDIENTE_OT`. Al
  terminar, su tablero tiene que dar exactamente las mismas filas que antes.
- Los dos SQL Server son máquinas distintas: **no hay JOIN entre ellos**. Son
  dos consultas y el cruce se hace en TypeScript.
- `of` es palabra reservada en T-SQL: siempre `[of]`.
- Consultas a OLANET **siempre parametrizadas** (los códigos vienen de datos
  sucios). En RPS se admite `IN (…)` construido a mano, como ya hace
  `consultarTablero`, pero solo con códigos que pasen `/^[\w.-]+$/`.
- Todo lo que distingue una sección de otra vive en `src/lib/secciones.ts`.
- Las clases de Tailwind, si se tocara UI, van como literales.

---

## Parte A — de dónde sale la lista

### Task 1: cada sección dice de dónde saca su trabajo

**Ficheros:**
- Modificar: `src/lib/secciones.ts`
- Test: `src/lib/__tests__/secciones.test.ts`

**Interfaces:**
- Produce: `Seccion.fuente: "vista" | "olanet"`. `SECCIONES.ot.fuente === "vista"`,
  `SECCIONES.diseno.fuente === "olanet"`.

- [ ] **Paso 1: el test que falla**

```ts
it("cada sección dice de dónde sale su trabajo", () => {
  // OT se queda con su vista: funciona y no se toca. Diseño lee las fases
  // vivas de OLANET, porque el filtro de progreso de la vista no dice
  // "pendiente" sino "nadie le ha fichado todavía".
  expect(SECCIONES.ot.fuente).toBe("vista");
  expect(SECCIONES.diseno.fuente).toBe("olanet");
});
```

- [ ] **Paso 2: ver que falla**

`pnpm vitest run src/lib/__tests__/secciones.test.ts` → FAIL, `fuente` no existe.

- [ ] **Paso 3: implementar**

En la interfaz `Seccion`:

```ts
  /** De dónde sale su lista de trabajo pendiente.
   *
   *  `vista`  → la vista de RPS (`TGM_PENDIENTE_*`), que filtra por
   *             `PercentProgress < 100`.
   *  `olanet` → las fases vivas de `scg_Fases`.
   *
   *  No es un capricho de implementación: ese `PercentProgress` no mide avance.
   *  Cada imputación entra con 100, así que la tarea vale 0 hasta que alguien
   *  ficha el primer minuto y 100 desde ese momento. En OT eso coincide con
   *  "ya está planteada y pasada a Producción" y se nota como acierto; en
   *  Diseño, no. */
  fuente: "vista" | "olanet";
```

Y en cada sección: `fuente: "vista"` en `ot`, `fuente: "olanet"` en `diseno`.

- [ ] **Paso 4: verde**

`pnpm vitest run src/lib/__tests__/secciones.test.ts` → PASS.

- [ ] **Paso 5: commit**

```bash
git add src/lib/secciones.ts src/lib/__tests__/secciones.test.ts
git commit -m "feat(secciones): cada sección dice de dónde sale su trabajo"
```

---

### Task 2: cruzar las dos fuentes (puro)

Lo que decide qué filas de la vista se añaden a lo que trajo OLANET. Puro y
testeable: es la regla, no la consulta.

**Ficheros:**
- Modificar: `src/lib/server/rps.ts`
- Test: `src/lib/__tests__/fuentes-tablero.test.ts` (crear)

**Interfaces:**
- Consume: nada.
- Produce:
  - `export function claveFase(of: string | null, fase: string | null): string`
    — normaliza ceros a la izquierda: `claveFase("0230700", "03") === "0230700/3"`.
  - `export function permiteImputaciones(fila: FilaVista): boolean` — deja de ser
    privada (hoy lo es, en `rps.ts`).
  - `export function filasQueFaltan<T extends FilaCruzable>(vista: readonly T[], enOlanet: readonly { of: string; fase: string }[]): T[]`
    con `interface FilaCruzable { OF: string | null; CodTarea: string | null; SitOF: string | null; PermiteImputaciones?: boolean | number | null }`.

- [ ] **Paso 1: el test que falla**

Crear `src/lib/__tests__/fuentes-tablero.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { claveFase, filasQueFaltan } from "../server/rps";

const fila = (OF: string, CodTarea: string, extra = {}) => ({
  OF,
  CodTarea,
  SitOF: "CON IMPUTACIONES",
  PermiteImputaciones: true,
  ...extra,
});

describe("claveFase", () => {
  it("los ceros a la izquierda no hacen dos fases de una", () => {
    // RPS guarda la tarea como "03" y OLANET la misma fase como "3". Comparar
    // en crudo parte la unión y la OF sale DOS veces en el tablero.
    expect(claveFase("0230700", "03")).toBe(claveFase("0230700", "3"));
  });

  it("distingue fases distintas de la misma OF", () => {
    expect(claveFase("0230700", "3")).not.toBe(claveFase("0230700", "30"));
  });
});

describe("filasQueFaltan", () => {
  it("no repite lo que OLANET ya trajo", () => {
    const filas = [fila("0230700", "10")];
    expect(filasQueFaltan(filas, [{ of: "0230700", fase: "10" }])).toEqual([]);
  });

  it("añade lo recién lanzado que OLANET todavía no tiene", () => {
    // Medido el 02/09: OLANET recibe las fases el mismo día (51 de 58), pero
    // puede tardar hasta 3. AR.26.04286 se lanzó esa mañana y no estaba.
    const nueva = fila("0231780", "6");
    expect(filasQueFaltan([nueva], [])).toEqual([nueva]);
  });

  it("no añade lo que no se puede fichar", () => {
    // Las DETENIDAS y CREADAS no están en OLANET porque no admiten
    // imputaciones. Colarlas sería ofrecer trabajo con el reloj muerto.
    const parada = fila("0229289", "20", { SitOF: "DETENIDA", PermiteImputaciones: false });
    expect(filasQueFaltan([parada], [])).toEqual([]);
  });

  it("sin el bit de la vista, decide la situación", () => {
    const vieja = fila("0229289", "20", { SitOF: "DETENIDA", PermiteImputaciones: null });
    const viva = fila("0231780", "6", { SitOF: "LANZADA", PermiteImputaciones: null });
    expect(filasQueFaltan([vieja, viva], [])).toEqual([viva]);
  });
});
```

- [ ] **Paso 2: ver que falla**

`pnpm vitest run src/lib/__tests__/fuentes-tablero.test.ts` → FAIL, no existen
`claveFase` ni `filasQueFaltan`.

- [ ] **Paso 3: implementar**

En `src/lib/server/rps.ts`, junto a `unaFilaPorOF`:

```ts
/** La misma fase escrita por los dos sistemas: "0230700/3".
 *
 *  RPS guarda el código de tarea como viene de la ruta ("03", "5", "42") y
 *  OLANET lo suyo en `Fase`, con los ceros a la izquierda a veces sí y a veces
 *  no. Sin normalizarlos, "03" y "3" son dos fases distintas y la OF sale dos
 *  veces en el tablero: una por OLANET y otra por la vista. */
export function claveFase(of: string | null, fase: string | null): string {
  const o = (of ?? "").trim();
  const f = (fase ?? "").trim().replace(/^0+(?=\d)/, "");
  return `${o}/${f}`;
}

/** Lo que la vista de RPS tiene y OLANET todavía no.
 *
 *  OLANET manda: es quien sabe si una fase está por hacer. Pero recibe las
 *  fases con retraso —medido el 02/09: mediana 0 días, máximo 3— y sin esto el
 *  trabajo lanzado esta mañana no aparecería hasta mañana.
 *
 *  Solo entra lo FICHABLE. Lo que no admite imputaciones no está en OLANET
 *  precisamente por eso, y traerlo desde la vista devolvería al tablero las
 *  DETENIDAS y CREADAS: tarjetas con el reloj muerto que hoy son 10 de las 43
 *  filas de Diseño. */
export function filasQueFaltan<T extends FilaCruzable>(
  vista: readonly T[],
  enOlanet: readonly { of: string; fase: string }[],
): T[] {
  const ya = new Set(enOlanet.map((f) => claveFase(f.of, f.fase)));
  return vista.filter(
    (f) => !ya.has(claveFase(f.OF, f.CodTarea)) && permiteImputaciones(f),
  );
}
```

`FilaCruzable` es lo mínimo que necesita el cruce, y `FilaVista` lo cumple:

```ts
/** Lo que hace falta de una fila para cruzarla con OLANET. Se declara aparte
 *  de `FilaVista` para que el test no tenga que construir las 20 columnas. */
export interface FilaCruzable {
  OF: string | null;
  CodTarea: string | null;
  SitOF: string | null;
  PermiteImputaciones?: boolean | number | null;
}
```

Y `permiteImputaciones` pasa a `export function permiteImputaciones(fila:
FilaCruzable): boolean` — mismo cuerpo, solo cambia el tipo del parámetro y la
visibilidad.

- [ ] **Paso 4: verde**

`pnpm vitest run src/lib/__tests__/fuentes-tablero.test.ts` → PASS.
`pnpm test` entero → 831+ PASS (no puede bajar).

- [ ] **Paso 5: commit**

```bash
git add src/lib/server/rps.ts src/lib/__tests__/fuentes-tablero.test.ts
git commit -m "feat(tablero): la regla para cruzar lo de OLANET con lo de la vista"
```

---

### Task 3: preguntarle a OLANET qué tiene pendiente

**Ficheros:**
- Modificar: `src/lib/server/olanet.ts`

**Interfaces:**
- Consume: `Seccion` y `esFaseDe` de `../secciones`; `getPoolOlanet` de `./db`.
- Produce: `export async function fasesPendientesDe(seccion: Seccion): Promise<FasePendiente[]>`
  con `export interface FasePendiente { of: string; fase: string; idBoletin: string; estado: number }`.

- [ ] **Paso 1: implementar**

En `src/lib/server/olanet.ts`. No lleva test propio: es una consulta, y lo que
tiene regla —el cruce— ya se prueba en el Task 2. Sigue el patrón de
`buscarIdBoletin`, que tampoco lo tiene.

```ts
/** Lo que a una sección le queda por hacer, según OLANET.
 *
 *  Los tres estados VIVOS: cargada (nadie la ha tocado), iniciada e
 *  interrumpida (alguien está o estuvo en ella). Los tres, no solo el 0:
 *  dejando fuera las dos últimas, la tarjeta se desvanecería a media faena en
 *  cuanto se fichara desde la web.
 *
 *  Se filtra por `MaquinaTeo` en SQL con un LIKE sobre la marca de la sección
 *  ("DGRA", "OTEC") porque en esa columna hay erratas reales, y se vuelve a
 *  filtrar en TypeScript con `esFaseDe` para no fiarse del LIKE. */
export async function fasesPendientesDe(seccion: Seccion): Promise<FasePendiente[]> {
  const pool = await getPoolOlanet();
  const r = await pool
    .request()
    .input("marca", sql.VarChar(20), `%${seccion.marcaEnFases}%`)
    .query<{ Orden: string; Fase: string; IdBoletin: string; MaquinaTeo: string; IdEstadoOF: number }>(
      `SELECT Orden, Fase, IdBoletin, MaquinaTeo, IdEstadoOF
         FROM scg_Fases
        WHERE MaquinaTeo LIKE @marca AND IdEstadoOF IN (0, 1, 2)`,
    );
  return r.recordset
    .filter((f) => esFaseDe(f.MaquinaTeo ?? "", seccion))
    .map((f) => ({
      of: (f.Orden ?? "").trim(),
      fase: (f.Fase ?? "").trim(),
      idBoletin: String(f.IdBoletin),
      estado: f.IdEstadoOF,
    }))
    .filter((f) => f.of !== "" && f.fase !== "");
}
```

Import a añadir arriba: `import { esFaseDe, type Seccion } from "../secciones";`

- [ ] **Paso 2: comprobar contra la BD**

```bash
node --env-file=.env.local -e "
import('./src/lib/server/olanet.ts')" # no: TS. Usar el script de comprobación del Task 6.
```

Se comprueba en el Task 6, con el resto. Aquí basta con que `pnpm test` y
`npx tsc --noEmit` sigan limpios.

- [ ] **Paso 3: commit**

```bash
git add src/lib/server/olanet.ts
git commit -m "feat(olanet): las fases vivas de una sección"
```

---

### Task 4: los datos del pedido a partir de una lista de OFs

Hoy la única forma de conseguir las 20 columnas es la vista, y la vista trae
dentro los dos filtros que sobran. Se copia su cuerpo sin ellos.

**Ficheros:**
- Modificar: `src/lib/server/rps.ts`

**Interfaces:**
- Consume: `recursosSql(seccion)` de `../secciones`.
- Produce: `async function filasPorFase(pool, seccion, fases): Promise<FilaVista[]>`
  (privada del módulo; la usa `consultarTablero`).

- [ ] **Paso 1: implementar**

```ts
/** Las mismas columnas que la vista, pero para unas fases concretas.
 *
 *  Es el cuerpo de `TGM_PENDIENTE_DISENHO` SIN sus dos filtros
 *  (`PercentProgress < 100` y `CodSituation NOT IN (6)`), que son justo los que
 *  esconden el trabajo: el primero significa "alguien le fichó", no "está
 *  hecha", y el segundo tira lo que se lleva por delante un cierre masivo.
 *  Quién está pendiente lo decide OLANET; esto solo pone los datos.
 *
 *  Se copia a nuestro código y no se pide otra vista a IT porque el filtrado ya
 *  no es cosa de la vista. */
async function filasPorFase(
  pool: sql.ConnectionPool,
  seccion: Seccion,
  fases: readonly { of: string; fase: string }[],
): Promise<FilaVista[]> {
  const ordenes = [...new Set(fases.map((f) => f.of).filter((o) => /^[\w.-]+$/.test(o)))];
  if (ordenes.length === 0) return [];
  const listaIn = ordenes.map((o) => `'${o}'`).join(",");

  const r = await pool.request().query<FilaVista>(`
    SELECT d.CodManufacturingOrder AS [OF], e.CodMOTask AS CodTarea,
           e.Description AS Tarea, b.CodOrder AS Pedido, cli.Description AS Cliente,
           STR(a.Quantity, 3, 0) + ' - ' + fam.CodProductFamily AS Articulo,
           (CASE WHEN ISNULL(l.TextoRotulacion, 'nulo') = 'nulo' THEN NULL
                 ELSE l.TextoRotulacion END) AS Rotulacion,
           a.ReceptionDemandDate AS FechaSolicitada, d.Priority AS Prioridad,
           e.ExecutionTime AS TiempoPrevisto,
           (SELECT MAX(ReceptionDate) FROM dbo.PUROrderLine
             WHERE CodCompany = '001' AND IDManufacturingOrder = d.IDManufacturingOrder
               AND Quantity > ReceivedQuantity) AS FechaCompras,
           CONVERT(datetime,
             (SELECT TOP (1) SUBSTRING(Planning, 28, 19) FROM dbo.PACResourcePlanning
               WHERE CodCompany = '001' AND EntityCode = d.CodManufacturingOrder
                 AND Planning LIKE '%CodTask="' + e.CodMOTask + '"%'), 101) AS FechaPlanificada,
           sit.Description AS SitOF, sit.AllowImputations AS PermiteImputaciones,
           d.Notes AS NotasOF,
           d.Description AS DescripcionMO, d.Quantity AS Cantidad,
           d.PlannedStartDate, d.PlannedEndDate, d.ManualEndDate
      FROM dbo.CPRMOTask AS e
      INNER JOIN dbo.CPRManufacturingOrder AS d WITH (NOLOCK)
        ON e.IDManufacturingOrder = d.IDManufacturingOrder
      INNER JOIN dbo.CPRManufacturingOrderSituation AS sit WITH (NOLOCK)
        ON d.IDMOSituation = sit.IDManufacturingOrderSituation
      INNER JOIN dbo.CPRMOResourceMachine AS f WITH (NOLOCK)
        ON e.IDMOTask = f.IDMOTask AND f.CodMOResourceMachine IN (${recursosSql(seccion)})
      LEFT OUTER JOIN dbo.FACOrderLineSL AS a WITH (NOLOCK)
        ON d.IDManufacturingOrder = a.IDManufacturingOrder
      LEFT OUTER JOIN dbo.FACOrderSL AS b WITH (NOLOCK) ON a.IDOrder = b.IDOrder
      LEFT OUTER JOIN dbo.FACCustomer AS cli WITH (NOLOCK) ON b.IDCustomer = cli.IDCustomer
      LEFT OUTER JOIN dbo.STKArticle AS art WITH (NOLOCK) ON a.IDArticle = art.IDArticle
      LEFT OUTER JOIN dbo.GENProductFamily AS fam WITH (NOLOCK)
        ON art.IDProductFamily = fam.IDProductFamily
      LEFT OUTER JOIN dbo._FACOrderLineSL_Custom AS l WITH (NOLOCK)
        ON a.IDOrderLine = l.IDOrderLine
     WHERE f.CodCompany = '001' AND d.CodManufacturingOrder IN (${listaIn})
  `);

  // La consulta trae TODAS las fases de la sección de esas OFs; nos quedamos
  // con las que OLANET dio por pendientes.
  const quiero = new Set(fases.map((f) => claveFase(f.of, f.fase)));
  return r.recordset.filter((f) => quiero.has(claveFase(f.OF, f.CodTarea)));
}
```

Nota: la vista usa `recursosSql` con los recursos en minúsculas y SQL Server no
distingue mayúsculas, así que el `IN` vale tal cual.

- [ ] **Paso 2: tipos limpios**

`npx tsc --noEmit` → sin salida.

- [ ] **Paso 3: commit**

```bash
git add src/lib/server/rps.ts
git commit -m "feat(tablero): los datos del pedido a partir de una lista de fases"
```

---

### Task 5: enchufar la fuente en consultarTablero

**Ficheros:**
- Modificar: `src/lib/server/rps.ts:611-628` (el arranque de `consultarTablero`)

- [ ] **Paso 1: implementar**

Sustituir la consulta de la vista por:

```ts
  // De dónde sale la lista de trabajo. Ver `Seccion.fuente`: OT se queda con su
  // vista; Diseño lee las fases vivas de OLANET y las completa con lo recién
  // lanzado que OLANET aún no tiene.
  const vista = { recordset: await filasDeLaSeccion(pool, seccion) };
```

y añadir, encima de `consultarTablero`:

```ts
async function filasDeLaSeccion(
  pool: sql.ConnectionPool,
  seccion: Seccion,
): Promise<FilaVista[]> {
  if (seccion.fuente === "vista") return filasDeLaVista(pool, seccion);

  const { fasesPendientesDe } = await import("./olanet");
  const fases = await fasesPendientesDe(seccion);
  const [deOlanet, deLaVista] = await Promise.all([
    filasPorFase(pool, seccion, fases),
    filasDeLaVista(pool, seccion),
  ]);
  return [...deOlanet, ...filasQueFaltan(deLaVista, fases)];
}
```

donde `filasDeLaVista` es la consulta de hoy movida tal cual a su propia
función (mismo SQL, mismo `LEFT JOIN` a `CPRManufacturingOrder`).

- [ ] **Paso 2: que OT no se mueva**

`pnpm test` → todo verde. `npx tsc --noEmit` y `pnpm lint` → limpios.

- [ ] **Paso 3: commit**

```bash
git add src/lib/server/rps.ts
git commit -m "feat(diseno): el tablero sale de las fases vivas de OLANET"
```

---

### Task 6: comprobarlo contra la BD real

**Ficheros:**
- Crear y borrar: `scripts/_comprueba-diseno.mjs` (temporal, no se commitea)

- [ ] **Paso 1: contar antes y después**

Con la app levantada (`pnpm dev`), pedir las dos secciones y contar OFs:

```bash
curl -s "http://localhost:3000/api/tablero?seccion=ot"     | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const t=JSON.parse(s);console.log('OT pedidos',t.pedidos.length,'OFs',t.pedidos.reduce((n,p)=>n+p.ofs.length,0))})"
curl -s "http://localhost:3000/api/tablero?seccion=diseno" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const t=JSON.parse(s);console.log('DIS pedidos',t.pedidos.length,'OFs',t.pedidos.reduce((n,p)=>n+p.ofs.length,0))})"
```

Esperado, medido el 02/09/2026:
- **OT: exactamente las mismas cifras que antes del cambio.** Apuntarlas ANTES
  de empezar el Task 5 y comparar. Si se mueve una sola fila, el cambio se ha
  colado donde no debía.
- **Diseño: ~41 OFs** (hoy son 43). Dentro tienen que estar las 11 que faltaban
  —0231636, 0231465, 0231126, 0230576, 0229965, 0229217, 0229210, 0210459,
  0199284, 0148169, 0145514/0145515— y fuera las 13 muertas —0230700, 0230346,
  0229333, 0229698, 0229699, 0231108, 0230701, 0229289, 0229415, 0217044,
  0228702, 0230837, 0230838—.
- **0231780 tiene que salir** aunque OLANET no lo tenga: es lo que prueba que
  la unión con la vista sirve para algo.

- [ ] **Paso 2: commit del log de novedades**

```bash
git commit --allow-empty -F - <<'EOF'
chore(diseno): la lista nueva, comprobada contra la BD

Novedad: arreglado | A Diseño Gráfico le faltaban pedidos en su lista
Detalle: Salía solo lo que nadie había tocado nunca, así que un trabajo a medias desaparecía. Ahora sale lo que de verdad está por hacer, y también lo que se lanzó esta misma mañana.
EOF
```

---

## Parte B — traer una OF a mano (plan aparte)

No entra en este plan y se hace después, con su propio ciclo: necesita tabla
nueva (`of_traida`), botón en el buscador, y que el fichaje escriba el bono sin
mover la fase cuando esa fase está eliminada o finalizada. La Parte A vale por
sí sola: arregla la lista sin depender de nada de esto.
