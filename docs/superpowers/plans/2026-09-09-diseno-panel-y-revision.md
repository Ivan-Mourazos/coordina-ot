# El panel y la revisión de Diseño Gráfico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Diseño Gráfico vea primero lo que puede cerrar hoy, y que pase el pedido entero a revisión de una vez en lugar de OF por OF.

**Architecture:** Las dos diferencias se declaran como campos opcionales de `Seccion` en `src/lib/secciones.ts`, que es el fichero cuyo propósito escrito es que todo lo que distingue a una sección de otra viva ahí. `agruparPorFase` pasa a aceptar la sección y ordenar por ella; `Board` —que ya sabe qué sección se mira— se la baja a los cuatro componentes que agrupan y al `Drawer`. En el `Drawer` la diferencia se resuelve dentro del filtro de acciones que ya existe, así que el botón y la entrada del menú desaparecen a la vez sin tocar dos sitios.

**Tech Stack:** Next.js 16.2.9 (App Router), React 19, Tailwind v4, TypeScript, vitest. **Sin dependencias nuevas.**

## Global Constraints

- **Idioma del código:** comentarios y nombres en castellano, como todo el repositorio. Los comentarios explican POR QUÉ, no QUÉ.
- **Los dos campos nuevos son OPCIONALES.** Una sección que no los declare se comporta EXACTAMENTE como hoy. Es lo que garantiza que Oficina Técnica no se entera de este cambio.
- **Nada de `if (seccion === "diseno")` dentro de un componente.** La diferencia es un dato que viene de `secciones.ts`, no un condicional con el nombre de una sección dentro. Ese patrón se multiplica solo, y a la tercera sección hay que buscarlos por todo el código.
- **Los imports entre `secciones.ts` y `fases-tablero.ts` son SOLO DE TIPO** (`import type`). Cada fichero necesita un tipo del otro; con `import type` los dos se borran al compilar y no hay ciclo en tiempo de ejecución.
- **Clases de Tailwind siempre literales**, nunca construidas: si no, no se compilan (ver AGENTS.md).
- **Esta versión de Next NO es la que conoces.** Antes de usar cualquier API dudosa del framework, lee la guía en `node_modules/next/dist/docs/`.
- `pnpm test` (**936 tests** ahora mismo), `pnpm lint` y `npx tsc --noEmit` tienen que quedar limpios al final de CADA tarea, no solo al final del plan.
- **Reglas de React que el lint hace cumplir:** nada de `setState` dentro de un efecto salvo el de carga inicial, ni acceso a refs durante el render.
- **Los commits de las tareas 2 y 3 llevan línea `Novedad:`** (el equipo lo nota); el de la 1 no (es interno). Ver AGENTS.md.

## Estructura de ficheros

**Modificados** (ninguno nuevo — esto es una diferencia de configuración, no una funcionalidad nueva):

| Fichero | Cambio |
|---|---|
| `src/lib/secciones.ts` | Dos campos opcionales en `Seccion` y sus valores en `diseno`. |
| `src/lib/fases-tablero.ts` | `agruparPorFase` acepta la sección y ordena por ella. |
| `src/components/Board.tsx` | Baja la sección a los cinco componentes que la necesitan. |
| `src/components/ZonaPersonal.tsx`, `TecnicoCard.tsx`, `PanelCompanero.tsx`, `FaseFlyout.tsx` | Reciben la sección y se la pasan a `agruparPorFase`. |
| `src/components/Drawer.tsx` | Recibe la sección; filtra las acciones de la fila de OF y suelta las condiciones de los botones del pedido. |
| `src/lib/__tests__/fases-tablero.test.ts` | Tests del orden por sección. |

---

### Task 1: El orden de las fases lo pone la sección

**Files:**
- Modify: `src/lib/secciones.ts` (interfaz `Seccion`, y la entrada `diseno` de `SECCIONES`)
- Modify: `src/lib/fases-tablero.ts:224-229` (`agruparPorFase`)
- Test: `src/lib/__tests__/fases-tablero.test.ts` (bloque `describe("agruparPorFase")`, línea 120)

**Interfaces:**
- Consumes: `FASES` y `type Fase` de `./fases-tablero`; `type Seccion` de `./secciones`.
- Produces:
  - `Seccion.ordenFases?: readonly Fase[]`
  - `agruparPorFase<T extends ConOFs>(pedidos: readonly T[], seccion?: Seccion): GrupoFase<T>[]` — el segundo argumento es opcional, así que las llamadas que ya existen siguen compilando y comportándose igual.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/__tests__/fases-tablero.test.ts`, añadir al `describe("agruparPorFase")` que ya existe (línea 120). Añadir también `SECCIONES` al import de arriba, desde `../secciones`:

```ts
import { SECCIONES } from "../secciones";
```

```ts
  it("sin sección, el orden es el de siempre", () => {
    // Es la garantía de que Oficina Técnica no se entera de este cambio: las
    // llamadas que no pasan sección tienen que comportarse igual que antes.
    const g = agruparPorFase([{ ofs: [of({ estado: "en_curso" })] }]);
    expect(g.map((x) => x.id)).toEqual(FASES.map((f) => f.id));
  });

  it("Oficina Técnica tampoco cambia: no declara orden propio", () => {
    const g = agruparPorFase([{ ofs: [of({ estado: "en_curso" })] }], SECCIONES.ot);
    expect(g.map((x) => x.id)).toEqual(FASES.map((f) => f.id));
  });

  it("Diseño pone 'listo para pasar' ANTES que 'esperando revisión'", () => {
    // Lo que pueden cerrar hoy delante; lo que depende de otro, al final.
    const g = agruparPorFase([{ ofs: [of({ estado: "en_curso" })] }], SECCIONES.diseno);
    const ids = g.map((x) => x.id);
    expect(ids.indexOf("listoParaPasar")).toBeLessThan(ids.indexOf("esperandoRevision"));
  });

  it("el orden de una sección trae TODAS las fases, ni una de menos", () => {
    // Si un orden se escribiera a mano y se dejara una fuera, esa fase
    // desaparecería del panel entero y nadie vería ese trabajo. Vale para
    // cualquier sección que declare orden, hoy y mañana.
    for (const s of Object.values(SECCIONES)) {
      const g = agruparPorFase([{ ofs: [of({ estado: "en_curso" })] }], s);
      expect([...g.map((x) => x.id)].sort()).toEqual([...FASES.map((f) => f.id)].sort());
    }
  });

  it("los pedidos caen en la misma fase, se ordene como se ordene", () => {
    // El orden es de presentación: no puede cambiar en qué columna está nada.
    const pedidos = [{ ofs: [of({ estado: "en_curso" })] }];
    const ot = agruparPorFase(pedidos, SECCIONES.ot);
    const dis = agruparPorFase(pedidos, SECCIONES.diseno);
    for (const f of FASES) {
      expect(dis.find((g) => g.id === f.id)!.items).toEqual(
        ot.find((g) => g.id === f.id)!.items,
      );
    }
  });
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `pnpm vitest run src/lib/__tests__/fases-tablero.test.ts`
Expected: FAIL — `agruparPorFase` no acepta segundo argumento (error de tipos), y el test del orden de Diseño falla porque hoy no hay orden propio.

- [ ] **Step 3: Añadir el campo a `Seccion`**

En `src/lib/secciones.ts`, añadir el import de tipo arriba del todo:

```ts
import type { Fase } from "./fases-tablero";
```

y el campo dentro de la interfaz `Seccion`, junto a `marcaEnFases`:

```ts
  /** En qué orden se pintan las columnas del panel. Ausente = el de siempre
   *  (ver FASES en lib/fases-tablero.ts).
   *
   *  Es de PRESENTACIÓN: no cambia en qué fase está un pedido, solo cuál se
   *  enseña antes. Diseño Gráfico quiere delante lo que puede cerrar hoy y al
   *  final lo que está esperando por otro, que es justo al revés que aquí.
   *
   *  Va aquí y no como un condicional dentro del panel porque no lo ordena un
   *  sitio: lo ordenan cuatro (el panel, la tarjeta de cada compañero, su panel
   *  de consulta y el desplegable de "ver todos"). Con un `if` en uno solo, el
   *  mismo trabajo saldría en dos órdenes distintos según dónde se mire. */
  ordenFases?: readonly Fase[];
```

Y en la entrada `diseno` de `SECCIONES`, junto a `marcaEnFases: "DGRA"`:

```ts
    // Las seis, en el orden en que las quieren ver. Se escriben TODAS y no
    // solo las dos que se mueven: una lista parcial invita a que la siguiente
    // fase que se añada se quede fuera sin que nadie lo note, y una fase fuera
    // de esta lista es una columna que desaparece del panel.
    ordenFases: [
      "devuelta",
      "sinEmpezar",
      "planteando",
      "listoParaPasar",
      "esperandoRevision",
      "parado",
    ],
```

- [ ] **Step 4: Ordenar en `agruparPorFase`**

En `src/lib/fases-tablero.ts`, añadir el import de tipo arriba:

```ts
import type { Seccion } from "./secciones";
```

y sustituir la función entera (línea 224):

```ts
/** Los pedidos repartidos por fase, TODAS las fases y en el orden de la
 *  sección. Sin sección, el orden de siempre.
 *
 *  El orden es lo ÚNICO que cambia entre secciones: en qué fase cae cada
 *  pedido lo decide `faseDePedido` y eso no se toca. */
export function agruparPorFase<T extends ConOFs>(
  pedidos: readonly T[],
  seccion?: Seccion,
): GrupoFase<T>[] {
  return fasesEnOrden(seccion).map((meta) => ({
    ...meta,
    items: pedidos.filter((p) => faseDePedido(p) === meta.id),
  }));
}

/** Las fases en el orden que pida la sección.
 *
 *  Se parte SIEMPRE de `FASES` y se reordena: así una fase nueva aparece
 *  aunque una sección se olvide de meterla en su lista, en vez de desaparecer
 *  del panel en silencio. Lo que la lista de la sección decide es el orden de
 *  las que nombra; lo que no nombre se va detrás, como esté en FASES. */
function fasesEnOrden(seccion?: Seccion): readonly FaseMeta[] {
  const orden = seccion?.ordenFases;
  if (!orden) return FASES;
  const puesto = new Map(orden.map((id, i) => [id, i]));
  return [...FASES].sort(
    (a, b) => (puesto.get(a.id) ?? FASES.length) - (puesto.get(b.id) ?? FASES.length),
  );
}
```

- [ ] **Step 5: Ejecutar los tests y verificar que pasan**

Run: `pnpm vitest run src/lib/__tests__/fases-tablero.test.ts`
Expected: PASS.

- [ ] **Step 6: Comprobar que no hay ciclo en tiempo de ejecución**

Run: `npx tsc --noEmit`
Expected: sin errores. Los dos ficheros se importan tipos entre sí; si alguno se hubiera escrito sin `import type`, aquí o en el arranque saltaría.

Run: `git grep -n "from \"./secciones\"" src/lib/fases-tablero.ts`
Expected: la línea empieza por `import type`. Si dice `import {` a secas, corregirlo.

- [ ] **Step 7: Suite y lint**

Run: `pnpm test && pnpm lint`
Expected: PASS las dos, 936 tests + los 5 nuevos.

- [ ] **Step 8: Commit**

Sin línea `Novedad:`: por sí solo esto no cambia nada en pantalla — hasta la Task 2, nadie pasa la sección.

```bash
git add src/lib/secciones.ts src/lib/fases-tablero.ts src/lib/__tests__/fases-tablero.test.ts
git commit -m "feat(secciones): cada sección puede ordenar sus columnas

Diseño Gráfico quiere delante lo que puede cerrar hoy y al final lo que
espera por otro. El orden se declara en secciones.ts, que es donde el
propio fichero dice que tiene que vivir todo lo que las distingue.

Se parte siempre de FASES y se reordena, en vez de usar la lista de la
sección tal cual: así una fase nueva sale aunque una sección se olvide de
meterla, en lugar de desaparecer del panel sin que nadie lo note.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Los cuatro sitios que agrupan reciben la sección

Son cuatro y no uno, y ésa es toda la dificultad de esta tarea: si se cambia solo el panel, el mismo trabajo sale en dos órdenes distintos según dónde se mire, que es peor que no cambiarlo.

**Files:**
- Modify: `src/components/ZonaPersonal.tsx:4,52` (import y llamada)
- Modify: `src/components/TecnicoCard.tsx:10,45,117` (import, llamada y el `<PanelCompanero>` que monta)
- Modify: `src/components/PanelCompanero.tsx:4,42` (import y llamada)
- Modify: `src/components/FaseFlyout.tsx:4,37` (import y llamada)
- Modify: `src/components/Board.tsx:2116,2131,2164` (los tres montajes)

**Interfaces:**
- Consumes: `agruparPorFase(pedidos, seccion?)` de la Task 1; `SECCIONES` y `type Seccion` de `@/lib/secciones`.
- Produces: los cuatro componentes ganan una prop `seccion: Seccion`. `PanelCompanero` la recibe de `TecnicoCard`, no de `Board`: es `TecnicoCard` quien lo monta (línea 117).

- [ ] **Step 1: Bajar la sección desde Board**

`Board.tsx` ya tiene la sección que se está mirando en `seccionActual` (un `SeccionId`). Justo antes del `return` del tablero, resolver el objeto una sola vez:

```tsx
  // El objeto de la sección, no su id: es lo que consumen agruparPorFase y el
  // Drawer, y resolverlo aquí evita que cada componente tenga que importar
  // SECCIONES para hacer el mismo lookup.
  const laSeccion = SECCIONES[seccionActual];
```

y añadir `seccion={laSeccion}` a los tres montajes: `<ZonaPersonal` (2116), `<FaseFlyout` (2131) y `<TecnicoCard` (2164).

Comprobar que `SECCIONES` está importado en `Board.tsx`; si no, añadirlo al import que ya existe de `@/lib/secciones`.

- [ ] **Step 2: Cada componente la recibe y la pasa**

En los cuatro, añadir la prop al bloque de props que ya existe:

```tsx
  /** De qué sección es lo que se está pintando. De ella sale el ORDEN de las
   *  columnas (ver `ordenFases` en lib/secciones.ts). */
  seccion: Seccion;
```

con su import de tipo:

```tsx
import type { Seccion } from "@/lib/secciones";
```

y pasarla en la llamada:

- `ZonaPersonal.tsx:52` → `const grupos = agruparPorFase(facets, seccion);`
- `PanelCompanero.tsx:42` → `const grupos = agruparPorFase(facets, seccion);`
- `TecnicoCard.tsx:45` → `const porFase = agruparPorFase(facets, seccion).map((g) => ({ ...g, n: g.items.length }));`
- `FaseFlyout.tsx:37` → `const grupo = agruparPorFase(facets, seccion).find((g) => g.id === faseId);`

Y en `TecnicoCard.tsx:117`, pasarla al `<PanelCompanero seccion={seccion} …>` que monta.

- [ ] **Step 3: Comprobar que no queda ningún sitio sin ella**

Run: `git grep -n "agruparPorFase(" src/components/`
Expected: **cuatro** resultados, y los cuatro con dos argumentos. Uno con un solo argumento es una vista que se quedó con el orden viejo.

Run: `npx tsc --noEmit`
Expected: sin errores. Como la prop es obligatoria en los componentes, un montaje que se olvide de pasarla no compila — que es justo la red que se quiere aquí.

- [ ] **Step 4: Comprobarlo a ojo**

Run: `pnpm dev`

1. En **Oficina Técnica**, el panel enseña "Esperando revisión" antes que "Listo para pasar", como siempre.
2. Cambiar a **Diseño Gráfico** desde el menú. Ahora "Listo para pasar" va antes que "Esperando revisión".
3. En Diseño, mirar los otros tres sitios y ver **el mismo orden** en los tres: la tarjeta de un compañero, su panel al pulsarla, y el desplegable de "ver todos" de una fase.
4. Volver a OT: el orden vuelve al de siempre.

Si el punto 3 falla en alguno, es que ese componente se quedó sin la prop.

- [ ] **Step 5: Suite y lint**

Run: `pnpm test && pnpm lint && npx tsc --noEmit`
Expected: PASS los tres.

- [ ] **Step 6: Commit**

```bash
git add src/components
git commit -m "feat(diseno): el panel enseña primero lo que se puede cerrar hoy

Los cuatro sitios que agrupan por fase reciben la sección, no solo el
panel: con uno solo, el mismo trabajo salía en dos órdenes distintos
según dónde se mirara.

La prop es obligatoria a propósito. Así un montaje que se olvide de
pasarla no compila, en vez de quedarse callado con el orden viejo.

Novedad: mejor | En Diseño Gráfico, primero lo que puedes cerrar
Detalle: Las columnas de tu panel cambian de orden: lo que ya está listo para pasar a Producción va delante, y lo que está esperando a que otro lo revise queda al final. En Oficina Técnica no cambia nada.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: En Diseño se revisa por pedido, no por OF

**Files:**
- Modify: `src/lib/secciones.ts` (segundo campo de `Seccion`, y su valor en `diseno`)
- Modify: `src/components/Drawer.tsx` — props del propio `Drawer` (126), props de `OFRow` (886) y su montaje (734), props de `AccionesOF` (1143) y su montaje (1120), el filtro de acciones (~1276), y las condiciones de los tres botones del pedido (625, 644, 686)
- Modify: `src/components/Board.tsx:2359` (`<Drawer`)

**Interfaces:**
- Consumes: `type Seccion` de `@/lib/secciones`; `laSeccion` de la Task 2 en `Board.tsx`.
- Produces: `Seccion.revisionPorPedido?: boolean`.

- [ ] **Step 1: Añadir el campo a `Seccion`**

En `src/lib/secciones.ts`, dentro de la interfaz, junto a `ordenFases`:

```ts
  /** Las acciones de estado se hacen sobre el PEDIDO entero, no OF por OF.
   *  Ausente = como siempre, cada OF con las suyas.
   *
   *  En Oficina Técnica un pedido se reparte entre varios y cada uno manda lo
   *  suyo cuando lo acaba, así que la OF es la unidad correcta. En Diseño
   *  Gráfico no se reparte nada: una persona hace el pedido entero y lo pasa de
   *  golpe, y si otro tiene que meter mano se lo pasa cuando termina. Mandarlo
   *  OF por OF es repetir cinco veces un gesto que debería ser uno.
   *
   *  NO afecta a fichar ni a anular, y las dos excepciones son a propósito:
   *  fichar es lo único que de verdad se hace sobre una OF suelta —arrancar el
   *  reloj en lo que estás tocando ahora—, y anular no es el paso siguiente del
   *  trabajo sino "esto no debería estar aquí". Las tareas que RPS duplica
   *  cambiando solo el cero de delante (la 2 y la 02) salieron en 37 pedidos y
   *  Diseño es la sección más afectada: con anular a nivel de pedido habría que
   *  cargarse los trabajos buenos para tirar el malo. */
  revisionPorPedido?: boolean;
```

Y en la entrada `diseno`, junto a `ordenFases`:

```ts
    revisionPorPedido: true,
```

- [ ] **Step 2: Bajar la sección al Drawer**

En `Board.tsx:2359`, añadir `seccion={laSeccion}` al `<Drawer`. (`laSeccion` ya existe desde la Task 2.)

En `Drawer.tsx`, añadir la prop al bloque de props del componente, con su import de tipo:

```tsx
  /** De qué sección es este pedido. De ella sale si las acciones de estado van
   *  por OF o por pedido (ver `revisionPorPedido` en lib/secciones.ts). */
  seccion: Seccion;
```

- [ ] **Step 3: Quitar las acciones de estado de la fila de OF**

**La cadena son tres componentes, no dos:** `Drawer` (126) → `OFRow` (886) → `AccionesOF` (1143). El `<AccionesOF` está dentro de `OFRow` (línea 1120), y `OFRow` se monta desde el `Drawer` (línea 734). Así que la prop atraviesa los tres.

Se baja el **booleano ya resuelto**, no el objeto de la sección: `OFRow` y `AccionesOF` no necesitan saber qué sección es, solo cómo se comportan. Un componente que recibe la sección entera acaba mirándole otros campos.

`OFRow` (886) y `AccionesOF` (1143) reciben los dos la misma prop:

```tsx
  /** Con la revisión por pedido, esta fila no ofrece pasar a revisión,
   *  aprobar ni devolver: esas suben al bloque del pedido. */
  revisionPorPedido: boolean;
```

- El `<OFRow` de la línea 734 recibe `revisionPorPedido={porPedido}` (la constante del Step 4; si haces este paso antes, decláralas ya).
- El `<AccionesOF` de la línea 1120 la reenvía: `revisionPorPedido={revisionPorPedido}`.

Dentro, al filtro de `acciones` que ya existe (línea ~1276), añadir una condición más. **Va en ese filtro y no pintando menos botones abajo** porque de `acciones` salen tanto los botones a la vista como el cajón de "⋯": filtrando aquí desaparecen de los dos a la vez, y no puede quedarse uno colgando en el menú.

```tsx
  const acciones = accionesDisponibles(of, miId).filter(
    (a) =>
      a.id !== "empezar_planteo" &&
      a.id !== "retomar" &&
      !(relojALaVista && a.id === "empezar_revision") &&
      !(fichandoYoEsta && a.id === "terminar_planteo") &&
      // Las de estado suben al pedido en las secciones que trabajan así. Se
      // quedan fichar —que no pasa por aquí, tiene su propio botón— y anular,
      // que es la única que de verdad es de una OF suelta.
      !(revisionPorPedido && ACCIONES_DEL_PEDIDO.has(a.id)),
  );
```

con la constante arriba del fichero, junto a `A_LA_VISTA`:

```tsx
/** Las acciones que suben al bloque del pedido cuando la sección trabaja así.
 *  `anular` NO está, y es la excepción que importa: ver `revisionPorPedido`. */
const ACCIONES_DEL_PEDIDO: ReadonlySet<AccionOF> = new Set([
  "terminar_planteo",
  "aprobar",
  "devolver",
]);
```

- [ ] **Step 4: Que los botones del pedido salgan con una sola OF**

Los tres se esconden hoy con `> 1`, y tiene sentido mientras exista el botón de la fila: con una sola OF harían lo mismo. En cuanto se quita el de la fila deja de tenerlo, y el caso más común de Diseño —un pedido, una OF— se quedaría sin ninguna forma de pasarlo.

En `Drawer.tsx`, calcular una vez, junto a `paraRevisar`/`paraAprobar`/`paraDevolver` (líneas 307-335):

```tsx
  // Con la revisión por pedido, el bloque del pedido es el ÚNICO sitio donde
  // están estas acciones, así que tiene que salir también con una sola OF.
  const porPedido = seccion.revisionPorPedido ?? false;
  const minimoDelBloque = porPedido ? 1 : 2;
```

y sustituir las tres condiciones:

- Línea 625: `{paraAprobar.length > 1 && (` → `{paraAprobar.length >= minimoDelBloque && (`
- Línea 644: `{fichandoYo.length === 0 && paraRevisar.length > 1 && autoresParaRevisar.length === 1 && !pidiendoRevisorPedido && (` → `{fichandoYo.length === 0 && paraRevisar.length >= minimoDelBloque && (autoresParaRevisar.length === 1 || porPedido) && !pidiendoRevisorPedido && (`
- Línea 686: `{paraDevolver.length > 1 && (` → `{paraDevolver.length >= minimoDelBloque && (`

La condición de un solo autor se relaja **solo** con la revisión por pedido, y no porque se haya resuelto el caso: en Diseño no ocurre, porque no se reparten las OF de un pedido. `PedirRevisor` ya recibe `excluirIds` como lista, así que excluir a dos autores a la vez funciona sin tocarlo.

El texto de la línea 712 —*"Se mandan a revisar las N OF de {nombre}"*— nombra a `autoresParaRevisar[0]`. Con varios autores diría el de uno solo, y mentiría. Cambiarlo para que con más de uno diga "de este pedido" sin nombrar a nadie:

```tsx
                Se mandan a revisar las {paraRevisar.length} OF de{" "}
                {autoresParaRevisar.length === 1
                  ? (opById(autoresParaRevisar[0])?.nombre ?? "este pedido")
                  : "este pedido"}
                , con el mismo revisor.
```

- [ ] **Step 5: Comprobarlo a ojo, que es la única puerta que tiene**

Esta tarea no lleva tests automáticos y es correcto: el repo no tiene infraestructura para probar componentes (ni testing-library, ni jsdom, ni happy-dom; los 76 ficheros de test son de `lib/` y de rutas). Su puerta son `tsc`, `lint` y este repaso. **No montes esa infraestructura.**

Run: `pnpm dev`

En **Diseño Gráfico**, sobre un pedido con UNA sola OF en curso:
1. Abrir la ficha. La fila de la OF **no** ofrece "Pasar a revisión" ni en el botón ni en el cajón de "⋯".
2. Pero **sí** ofrece el reloj (fichar/pausar) y **sí** ofrece "Anular" en el cajón.
3. Arriba, el bloque del pedido ofrece **"Pasar la 1 a revisión"**. Pulsarlo pide revisor y funciona.
4. Con el reloj corriendo, ese botón del pedido no sale (hay que pausar primero) — es la conducta de siempre y no se toca.

En Diseño, sobre un pedido que estés revisando: el bloque del pedido ofrece aprobar y devolver aunque solo haya una OF.

En **Oficina Técnica**, sobre un pedido con una sola OF: todo **exactamente como antes** — el botón está en la fila de la OF, y el bloque del pedido no aparece.

- [ ] **Step 6: Suite y lint**

Run: `pnpm test && pnpm lint && npx tsc --noEmit`
Expected: PASS los tres.

- [ ] **Step 7: Commit**

```bash
git add src/lib/secciones.ts src/components
git commit -m "feat(diseno): el pedido se manda a revisar de una vez

En Diseño no se reparte un pedido entre varios: lo hace una persona
entera y lo pasa de golpe. Mandarlo OF por OF era repetir cinco veces un
gesto que debería ser uno.

Las de estado se quitan en el filtro de acciones que ya existía, no
pintando menos botones: de esa lista salen tanto los botones a la vista
como el cajón de tres puntos, así que desaparecen de los dos a la vez y
no puede quedarse uno colgando en el menú.

Fichar y anular se quedan por OF. Anular porque es la única que no es el
paso siguiente del trabajo sino 'esto no debería estar aquí', y las
tareas duplicadas por el cero de delante salieron en 37 pedidos con
Diseño como la sección más afectada.

Y los tres botones del pedido dejan de exigir más de una OF: en cuanto se
quita el de la fila, un pedido de una sola OF se quedaba sin salida.

Novedad: mejor | En Diseño Gráfico, el pedido se pasa entero de una vez
Detalle: Ya no hay que ir OF por OF: pasar a revisión, aprobar y devolver están arriba y van sobre el pedido completo, aunque solo tenga una. Fichar y anular siguen igual, sobre la OF que quieras. En Oficina Técnica no cambia nada.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Cuando esté todo

`pnpm novedades` recoge las líneas `Novedad:` de las tareas 2 y 3 y escribe la entrada en `src/lib/novedades-datos.json`. Con `--ver` enseña lo que haría sin tocar nada.

**Lo que este plan NO hace**, y está en la spec: el Historial (las OF etiquetadas por centro de trabajo con sus tiempos, y el buscador universal) y el fallo de la píldora del reloj, que va por su cuenta como el bug que es.
