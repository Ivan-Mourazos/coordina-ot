# Unificar las vistas de CoordinaOT — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Pendientes, Revisiones, Visitas y la ficha del pedido usen la misma forma de pintar y desplegar una lista que el Historial, sin perder ningún dato.

**Architecture:** Se extraen dos piezas de presentación del Historial —`BloqueLista` (el contenedor con relieve y la cabecera de columnas fuera) y `FilaDesplegable` (la fila con acento dorado, chevron y `Desplegable` animado)— y las cuatro vistas pasan a usarlas. Ninguna lógica de negocio cambia: acciones, máquina de estados, fichaje y consultas a RPS se quedan como están.

**Tech Stack:** Next.js 16.2.9 (App Router), React 19.2.4, Tailwind CSS v4, TypeScript 5, Vitest 4.

## Global Constraints

- **Español en todo el texto de usuario.** Nombres de componentes, props y variables también van en español, como el resto del proyecto.
- **Clases de Tailwind LITERALES.** Tailwind v4 solo compila las clases que ve escritas en el código. Nunca construir una clase concatenando (`` `w-[${n}%]` ``). Si hacen falta dos variantes, se escriben las dos enteras.
- **Nada de `opacity-*` para apagar texto.** Baja el contraste por debajo de lo legible. Se usan los tokens `text-text-muted` / `text-text`.
- **Colores por token**, nunca hex sueltos: `bg-surface`, `bg-surface-2`, `border-border`, `text-text`, `text-text-muted`, `bg-brand-500`, `var(--glass-border)`, `var(--glass-highlight)`. Las clases `bloque-3d`, `chip-3d`, `glass-chip`, `glass-panel` están en `src/app/globals.css`.
- **Las pruebas son de presentación, sin DOM.** El proyecto NO tiene jsdom ni testing-library. Se renderiza a texto con `renderToStaticMarkup` de `react-dom/server` y se comprueba el HTML resultante. Ver `src/lib/__tests__/revision-presentacion.test.ts` como patrón.
- **Comandos:** `pnpm test` (vitest run), `pnpm build`, `pnpm lint`. Las pruebas viven en `src/lib/__tests__/` y el alias `@/` apunta a `src/`.
- **Mensajes de commit:** tipo convencional en español. Los que cambian algo que un técnico nota llevan al final, empezando en la primera columna:
  ```
  Novedad: nuevo | arreglado | mejor | <la frase>
  Detalle: <opcional>
  ```
  Escrita como se lo contarías a un compañero: qué cambia para él. Nada de nombres de ficheros, campos ni estados internos. Refactors y cambios internos NO llevan línea.
- **Atribución:** todo commit termina con `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## Estructura de ficheros

| Fichero | Responsabilidad | Tarea |
|---|---|---|
| `src/components/BloqueLista.tsx` | **Nuevo.** El contenedor de una lista: `bloque-3d`, rótulo opcional encima, cabecera de columnas fuera. | 1 |
| `src/components/FilaDesplegable.tsx` | **Nuevo.** Una fila que se abre: botón de cubierta, chevron, acento dorado, `Desplegable`. | 1 |
| `src/lib/__tests__/lista-comun.test.ts` | **Nuevo.** Pruebas de las dos piezas. | 1 |
| `src/components/HistorialView.tsx` | Pasa a usar las dos piezas. Nada más cambia. | 2 |
| `src/components/ListaView.tsx` | `<table>` → `BloqueLista`. Se va el apaño `ACENTO_ARRIBA`/`ACENTO_ABAJO`. | 3 |
| `src/components/RevisionView.tsx` | 4 columnas → 4 secciones apiladas con filas desplegables. | 4 |
| `src/components/Drawer.tsx` | Botón de "Volver a plantear"; cabecera; asignar autor compacto; orden del cuerpo. | 5, 7 |
| `src/components/HistorialTareas.tsx` | El popover se va; el contenido se rehace. | 6 |
| `src/components/MarcoFicha.tsx` | `CabeceraFicha` acepta un tercer renglón. | 7 |
| `src/components/VisitasCotView.tsx` | Tarjetas → `BloqueLista`; dos datos fuera; textos. | 8 |
| `src/components/ParteEscaneado.tsx` | Chip de girar. | 9 |
| `src/lib/novedades-datos.json` | Lo escribe `pnpm novedades`, no se toca a mano. | 10 |

---

### Task 1: Las dos piezas comunes

**Files:**
- Create: `src/components/BloqueLista.tsx`
- Create: `src/components/FilaDesplegable.tsx`
- Test: `src/lib/__tests__/lista-comun.test.ts`

**Interfaces:**
- Consumes: `Desplegable` de `src/components/Desplegable.tsx` (ya existe, no se toca).
- Produces:
  ```ts
  function BloqueLista(props: {
    columnas: string;
    cabecera?: React.ReactNode;
    /** Sin `color` ni `claseDot` no se pinta punto: un rótulo puede ser solo un
   *  nombre (los días del Historial) y un círculo transparente ocuparía sitio
   *  sin decir nada. */
  rotulo?: { texto: string; color?: string; claseDot?: string; sufijo?: React.ReactNode };
    children: React.ReactNode;
  }): JSX.Element

  function FilaDesplegable(props: {
    columnas: string;
    abierta: boolean;
    onAlternar: () => void;
    etiqueta: string;
    idDetalle: string;
    /** Lo que se cuenta al posar el ratón sobre la fila entera. */
    titulo?: string;
    celdas: React.ReactNode;
    detalle: React.ReactNode;
  }): JSX.Element
  ```

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `src/lib/__tests__/lista-comun.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { BloqueLista } from "../../components/BloqueLista";
import { FilaDesplegable } from "../../components/FilaDesplegable";

const COLUMNAS = "grid grid-cols-[28px_136px_minmax(0,1fr)] items-center gap-x-3";

function fila(abierta: boolean) {
  return renderToStaticMarkup(
    createElement(FilaDesplegable, {
      columnas: COLUMNAS,
      abierta,
      onAlternar() {},
      etiqueta: "AR.26.03914",
      idDetalle: "detalle-1",
      celdas: createElement("span", null, "MAHOU"),
      detalle: createElement("p", null, "el detalle"),
    }),
  );
}

test("la fila cerrada no pinta su detalle, y dice que está plegada", () => {
  const html = fila(false);
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain("Desplegar AR.26.03914");
  expect(html).not.toContain("el detalle");
});

test("la fila abierta pinta el detalle y se marca con el acento de marca", () => {
  const html = fila(true);
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain("Plegar AR.26.03914");
  expect(html).toContain("el detalle");
  // La barra dorada a la izquierda y el fondo: es lo que dice dónde empieza y
  // dónde acaba lo desplegado cuando hay tres abiertos a la vez.
  expect(html).toContain("bg-brand-500");
  expect(html).toContain("bg-brand-500/10");
});

test("el botón que cubre la fila apunta al detalle, para el lector de pantalla", () => {
  expect(fila(false)).toContain('aria-controls="detalle-1"');
});

test("la fila puede contar algo al posar el ratón, sin que sea obligatorio", () => {
  const con = renderToStaticMarkup(
    createElement(FilaDesplegable, {
      columnas: COLUMNAS, abierta: false, onAlternar() {}, etiqueta: "AR.26.03914",
      idDetalle: "detalle-1", titulo: "Lo pasó Iván el 04/09",
      celdas: createElement("span", null, "MAHOU"), detalle: createElement("p", null, "x"),
    }),
  );
  expect(con).toContain("Lo pasó Iván el 04/09");
  expect(fila(false)).not.toContain("title=");
});

test("el bloque reparte las MISMAS columnas a la cabecera y a lo que lleva dentro", () => {
  const html = renderToStaticMarkup(
    createElement(BloqueLista, {
      columnas: COLUMNAS,
      cabecera: [
        createElement("span", { key: "a" }),
        createElement("span", { key: "b" }, "Pedido"),
        createElement("span", { key: "c" }, "Cliente"),
      ],
      children: createElement("div", null, "una fila"),
    }),
  );
  expect(html.match(/grid-cols-\[28px_136px_minmax\(0,1fr\)\]/g)).toHaveLength(2);
  expect(html).toContain("bloque-3d");
  expect(html).toContain("Pedido");
  expect(html).toContain("una fila");
});

test("el rótulo va FUERA del bloque, que es lo que separa un bloque del siguiente", () => {
  const html = renderToStaticMarkup(
    createElement(BloqueLista, {
      columnas: COLUMNAS,
      rotulo: { texto: "Por revisar", claseDot: "bg-amber-500", sufijo: "3 OF" },
      children: createElement("div", null, "una fila"),
    }),
  );
  expect(html.indexOf("Por revisar")).toBeLessThan(html.indexOf("bloque-3d"));
  expect(html).toContain("bg-amber-500");
  expect(html).toContain("3 OF");
});

test("sin cabecera ni rótulo el bloque no deja huecos vacíos por encima", () => {
  const html = renderToStaticMarkup(
    createElement(BloqueLista, { columnas: COLUMNAS, children: createElement("div", null, "x") }),
  );
  expect(html.startsWith("<div")).toBe(true);
  expect(html).not.toContain("text-[11px] font-semibold text-text-muted");
});
```

- [ ] **Step 2: Comprobar que fallan**

Run: `pnpm test lista-comun`
Expected: FAIL — `Failed to resolve import "../../components/BloqueLista"`.

- [ ] **Step 3: Escribir `FilaDesplegable`**

Crear `src/components/FilaDesplegable.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { Desplegable } from "./Desplegable";

// ─── Una fila que se abre ────────────────────────────────────────────────────
// Sale del Historial, que es donde se resolvió primero, y ahora la usan las
// cuatro listas. Hasta aquí cada pestaña tenía la suya: el mismo gesto —abrir
// un pedido para ver qué tiene dentro— se comportaba distinto según dónde
// estuvieras, y en Visitas ni siquiera se animaba.
//
// EL FONDO ES UN BOTÓN, y las cosas con acción propia (el código del pedido,
// un selector) son HERMANOS suyos, no hijos: anidados, un clic dispararía las
// dos acciones. Por eso `celdas` va con `pointer-events-none` en lo que solo
// se lee y sin él en lo que se pulsa — eso lo decide quien pinta las celdas.
//
// El acento de lo abierto es una barra dorada que recorre fila y detalle, más
// el mismo dorado al 10 % de fondo. Sobre blanco queda crema y sobre grafito,
// cálido: en los dos casos se distingue del gris del hover, que es lo que
// fallaba cuando la fila abierta se marcaba con `bg-surface-2`.

export function FilaDesplegable({
  columnas,
  abierta,
  onAlternar,
  etiqueta,
  idDetalle,
  titulo,
  celdas,
  detalle,
}: {
  /** La rejilla de columnas, literal (Tailwind no compila las concatenadas). */
  columnas: string;
  abierta: boolean;
  onAlternar: () => void;
  /** Qué se abre, para el lector de pantalla: "Desplegar AR.26.03914". */
  etiqueta: string;
  /** El id del contenedor del detalle, al que apunta `aria-controls`. */
  idDetalle: string;
  /** Lo que se cuenta al posar el ratón sobre la fila entera. Lo usa el
   *  Historial para decir cuándo se pasó a Producción y quién lo pasó: es un
   *  dato que no tiene columna y que no cabría en ninguna. */
  titulo?: string;
  celdas: ReactNode;
  detalle: ReactNode;
}) {
  return (
    <div className="relative border-b border-border last:border-b-0">
      {abierta && (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-brand-500" />
      )}
      <div
        className={`relative ${columnas} px-3 py-1 ${
          abierta ? "bg-brand-500/10" : "hover:bg-surface-2"
        }`}
      >
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={abierta}
          aria-controls={idDetalle}
          aria-label={`${abierta ? "Plegar" : "Desplegar"} ${etiqueta}`}
          title={titulo}
          className="absolute inset-0 cursor-pointer rounded-sm focus-visible:z-10"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none grid size-6 place-items-center text-text-muted"
        >
          <svg
            viewBox="0 0 24 24"
            className={`size-3.5 transition-transform motion-reduce:transition-none ${
              abierta ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        {celdas}
      </div>

      {/* Envuelto y no `{abierta && …}`: si React lo quitara al pulsar, el
          contenido desaparecería de golpe y no habría nada que animar. Cerrado
          no ocupa nada — `Desplegable` devuelve null. */}
      <div id={idDetalle}>
        <Desplegable abierto={abierta}>
          <div className="border-t border-border px-3 py-2">{detalle}</div>
        </Desplegable>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Escribir `BloqueLista`**

Crear `src/components/BloqueLista.tsx`:

```tsx
import type { ReactNode } from "react";

// ─── El contenedor de una lista ──────────────────────────────────────────────
// La tarjeta con relieve del Historial, con DOS cosas fuera de ella:
//
//   · El RÓTULO, cuando lo hay. Es el nombre del bloque ("Por revisar", un
//     día), no una fila más de la lista: dentro se leía como el encabezado de
//     la primera fila y el corte entre bloques había que buscarlo.
//   · La CABECERA DE COLUMNAS. Va encima, sobre el fondo, y con la misma
//     rejilla que las filas: así cada rótulo cae justo sobre su columna.
//
// `columnas` llega literal y se reparte a los dos sitios. Es la misma clase o
// no cae nada donde debe: por eso la recibe el bloque y no cada fila por su
// cuenta.

export function BloqueLista({
  columnas,
  cabecera,
  rotulo,
  children,
}: {
  columnas: string;
  /** Los rótulos de columna, uno por celda de la rejilla. */
  cabecera?: ReactNode;
  /** El nombre del bloque, sobre el fondo. `color` para un color calculado
   *  (el de una fase); `claseDot` para uno de los tokens de ESTADO. */
  rotulo?: { texto: string; color?: string; claseDot?: string; sufijo?: ReactNode };
  children: ReactNode;
}) {
  return (
    <div>
      {rotulo && (
        <h3 className="mb-1 flex items-center gap-2 px-3 text-[11px] font-semibold text-text">
          <span
            aria-hidden="true"
            className={`size-2 shrink-0 rounded-full ${rotulo.claseDot ?? ""}`}
            style={rotulo.color ? { background: rotulo.color } : undefined}
          />
          {rotulo.texto}
          {rotulo.sufijo && <span className="font-normal text-text-muted">{rotulo.sufijo}</span>}
        </h3>
      )}
      {cabecera && (
        <div
          aria-hidden="true"
          className={`${columnas} px-3 pb-1 text-[11px] font-semibold text-text-muted`}
        >
          {cabecera}
        </div>
      )}
      <div className="bloque-3d overflow-hidden rounded-xl">{children}</div>
    </div>
  );
}
```

- [ ] **Step 5: Comprobar que pasan**

Run: `pnpm test lista-comun`
Expected: PASS — 7 pruebas.

- [ ] **Step 6: Commit**

```bash
git add src/components/BloqueLista.tsx src/components/FilaDesplegable.tsx src/lib/__tests__/lista-comun.test.ts
git commit -F - <<'EOF'
refactor(ui): extraer BloqueLista y FilaDesplegable del Historial

Cuatro pestañas pintan listas que se despliegan y cada una traía la suya:
tres animaciones distintas y cuatro maneras de dibujar una fila. El
Historial es la que mejor lo resuelve, así que sale de ahí y las demás la
usarán.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: El Historial estrena las piezas

Es el refactor que demuestra que las piezas valen: el Historial tiene que quedar **exactamente igual**, y sus pruebas actuales lo confirman sin tocarlas.

**Files:**
- Modify: `src/components/HistorialView.tsx` (la función `FilaHistorial`, y el bloque que pinta la cabecera de columnas y los días)

**Interfaces:**
- Consumes: `BloqueLista`, `FilaDesplegable` (Task 1).
- Produces: nada nuevo.

- [ ] **Step 1: Comprobar la red de seguridad antes de tocar**

Run: `pnpm test historial`
Expected: PASS. Anotar cuántas pruebas pasan; al final tienen que ser las mismas.

- [ ] **Step 2: Cambiar `FilaHistorial` por `FilaDesplegable`**

En `src/components/HistorialView.tsx`, añadir a los imports:

```tsx
import { FilaDesplegable } from "./FilaDesplegable";
import { BloqueLista } from "./BloqueLista";
```

Dentro de `FilaHistorial`, sustituir todo el `return (…)` (desde `<div className="relative border-b border-border last:border-b-0">` hasta el cierre) por:

```tsx
  return (
    <FilaDesplegable
      columnas={columnas}
      abierta={desplegado}
      onAlternar={alternar}
      etiqueta={item.pedido}
      idDetalle={`ofs-${seccion}-${item.pedido}`}
      titulo={tituloPasado}
      celdas={
        <>
          <div className="pointer-events-none flex min-w-0 items-baseline gap-1.5">
            <PedidoCodigo codigo={item.pedido} onAbrir={() => onOpen(item.pedido)} />
            {item.nOf > 1 && (
              <span
                className="shrink-0 text-[11px] font-medium text-text-muted"
                title={`${item.nOf} órdenes de fabricación en todo el pedido`}
              >
                {item.nOf} OF
              </span>
            )}
          </div>
          <span
            className={`pointer-events-none min-w-0 truncate text-[11px] ${deOtroCentro ? "text-text-muted" : "text-text"}`}
            title={[item.cliente, item.negocio].filter(Boolean).join(" · ")}
          >
            {item.cliente ?? "—"}
            {item.negocio && <span className="text-text-muted"> · {item.negocio}</span>}
            {item.estadoActual && (
              <span className="font-semibold text-amber-700 dark:text-amber-300"> · {item.estadoActual}</span>
            )}
          </span>
          <span
            className="pointer-events-none flex min-w-0 items-center gap-1 overflow-hidden"
            title={familias.join(", ")}
          >
            {familias.slice(0, 1).map((f) => <FamiliaTag key={f} familia={f} />)}
            {familias.length > 1 && <span className="text-[10px] text-text-muted">+{familias.length - 1}</span>}
          </span>
          <div className="pointer-events-none min-w-0 text-[11px] leading-4 text-text-muted">
            <Quien item={item} />
          </div>
          <div
            className={`pointer-events-none text-right font-mono text-[11px] tabular-nums ${deOtroCentro ? "text-text-muted" : "text-text"}`}
            title={item.minutos === undefined
              ? "No se pudo leer el tiempo imputado"
              : `Tiempo imputado en RPS a las tareas de ${deOtroCentro ? item.otrosCentros!.map((c) => CENTRO_CORTO[c]).join(" y ") : CENTRO_CORTO[seccion]}`}
          >
            {item.minutos === undefined ? "—" : fmtMin(item.minutos)}
          </div>
          {conFecha && (
            <div
              className="pointer-events-none text-[11px] leading-4 text-text-muted"
              title={`${item.fechaPedido ? `Pedido del ${fmtFecha(item.fechaPedido).corta}. ` : ""}${tituloPasado}`}
            >
              {item.fechaPedido ? fmtFecha(item.fechaPedido).corta : pasado.corta}
            </div>
          )}
        </>
      }
      detalle={
        <>
          {cargando && <p className="py-1 text-xs text-text-muted">Cargando OF…</p>}
          {error && <p className="py-1 text-xs text-red-500">No se pudieron cargar las OF.</p>}
          {ofs && (
            <HistorialOFsCompactas
              ofs={ofs}
              seccion={seccion}
              columnas={columnas}
              accion={<HistorialTareas pedido={item.pedido} ofs={ofs} seccion={seccion} className="-my-0.5" compacto />}
            />
          )}
        </>
      }
    />
  );
```

El `title={tituloPasado}` viaja en la prop `titulo`: dice cuándo se pasó a Producción y quién lo pasó, y ese dato no tiene columna ni cabría en ninguna. El Historial tiene que quedar **idéntico**, y perderlo no sería idéntico.

- [ ] **Step 3: Cambiar la cabecera y los bloques por `BloqueLista`**

En el `return` de `HistorialView`, sustituir el `<div className="flex flex-col gap-3">` entero (el que lleva la cabecera de columnas y el `dias ? … : …`) por:

```tsx
      <div className="flex flex-col gap-3">
        {/* La cabecera de columnas, UNA vez y encima de todo: es el rótulo de
            la lista entera, no de un día. Metida dentro del primer bloque
            saldría DEBAJO de su título —`BloqueLista` pinta el rótulo primero—
            y con otra separación. Por eso no se le pasa a `BloqueLista` aquí. */}
        {itemsVisibles.length > 0 && (
          <div aria-hidden="true" className={`${columnas} px-3 text-[11px] font-semibold text-text-muted`}>
            {cabeceraColumnas}
          </div>
        )}
        {dias
          ? dias.map((dia, i) => (
              <section key={`${dia.clave}-${i}`} aria-label={dia.titulo}>
                {/* SIN `claseDot`: el día lleva nombre, no color. `BloqueLista`
                    solo pinta el punto cuando hay uno de los dos. */}
                <BloqueLista
                  columnas={columnas}
                  rotulo={{
                    texto: dia.titulo,
                    sufijo: (
                      <>
                        · {dia.total ?? dia.items.length}
                        {dia.total === null && dia.parcial ? "+" : ""} pedido
                        {(dia.total ?? dia.items.length) === 1 && !dia.parcial ? "" : "s"}
                        {dia.minutos > 0 && !dia.parcial &&
                          ` · ${fmtMin(dia.minutos)} de ${CENTRO_CORTO[seccion]}`}
                      </>
                    ),
                  }}
                >
                  {dia.items.map(fila)}
                </BloqueLista>
              </section>
            ))
          : itemsVisibles.length > 0 && (
              <BloqueLista columnas={columnas}>{itemsVisibles.map(fila)}</BloqueLista>
            )}
      </div>
```

Y justo antes del `return`, junto a `const columnas = …`, definir la cabecera una sola vez:

```tsx
  const cabeceraColumnas = (
    <>
      <span /><span>Pedido</span><span>Cliente</span><span>Familia</span><span>Quién</span>
      <span className="text-right">Tiempo {CENTRO_CORTO[seccion]}</span>
      {buscando && <span>Fecha</span>}
    </>
  );
```

- [ ] **Step 4: Comprobar que no ha cambiado nada**

Run: `pnpm test`
Expected: PASS, el mismo número de pruebas que en el Step 1.

Run: `pnpm build`
Expected: compila sin errores de tipos.

- [ ] **Step 5: Commit**

```bash
git add src/components/HistorialView.tsx
git commit -F - <<'EOF'
refactor(historial): usar las piezas comunes de lista

Mismo resultado en pantalla, con el código en un solo sitio. Las pruebas de
presentación del Historial pasan sin tocarlas: es lo que confirma que las
piezas dicen lo mismo que decía la vista.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Pendientes — de tabla a lista

**Files:**
- Modify: `src/components/ListaView.tsx` (líneas ~415-425 las constantes de acento, y ~470-700 el `return` de `ListaView`)
- Test: `src/lib/__tests__/lista-pendientes.test.ts` (nuevo)

**Interfaces:**
- Consumes: `BloqueLista`, `FilaDesplegable` (Task 1), y de `ListaView.tsx` lo que ya existe: `Detalle`, `Estado`, `Recorrido`, `IDENTIDAD_W`, `ESTADO_W`, `RECORRIDO_W`, `comparar`.
- Produces: nada que use otra tarea.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `src/lib/__tests__/lista-pendientes.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ListaView } from "../../components/ListaView";
import { OPERARIOS, PEDIDOS } from "../mock";

function pintar(pedidos = PEDIDOS) {
  return renderToStaticMarkup(
    createElement(ListaView, {
      pedidos, operarios: OPERARIOS, onOpen() {}, orden: "planificacion" as const, ordenDesc: false,
    }),
  );
}

test("ya no es una tabla: la lista se pinta con la rejilla común", () => {
  const html = pintar();
  expect(html).not.toContain("<table");
  expect(html).not.toContain("<tbody");
  expect(html).toContain("bloque-3d");
});

test("un solo bloque, sin agrupar: el orden lo siguen mandando los filtros", () => {
  expect(pintar().match(/bloque-3d/g)).toHaveLength(1);
});

test("las cuatro columnas siguen estando, con sus rótulos", () => {
  const html = pintar();
  expect(html).toContain("Pedido · cliente");
  expect(html).toContain("Quién · estado");
  expect(html).toContain("Recorrido");
});

test("todas las filas se pueden desplegar", () => {
  const html = pintar();
  expect(html.match(/aria-expanded="false"/g)?.length).toBe(PEDIDOS.length);
});

test("la lista vacía explica si es que no hay trabajo o es que lo tapa un filtro", () => {
  const sinFiltros = renderToStaticMarkup(
    createElement(ListaView, {
      pedidos: [], operarios: OPERARIOS, onOpen() {}, orden: "planificacion" as const, ordenDesc: false,
    }),
  );
  expect(sinFiltros).toContain("No hay trabajo pendiente");

  const conFiltros = renderToStaticMarkup(
    createElement(ListaView, {
      pedidos: [], operarios: OPERARIOS, onOpen() {}, orden: "planificacion" as const,
      ordenDesc: false, hayFiltrosActivos: true,
    }),
  );
  expect(conFiltros).toContain("Ningún pedido pasa los filtros");
});

test("un pedido sin procesar se lee entero: lo dice su píldora, no una fila apagada", () => {
  const pedido = { ...PEDIDOS[0], situacion: "pendiente" as const };
  const html = pintar([pedido]);
  expect(html).toContain("Sin procesar");
  expect(html).not.toContain("opacity-60");
});
```

- [ ] **Step 2: Comprobar que fallan**

Run: `pnpm test lista-pendientes`
Expected: FAIL — la primera prueba encuentra `<table` en el HTML.

- [ ] **Step 3: Borrar el apaño del acento**

En `src/components/ListaView.tsx`, borrar el bloque de comentario "─── Marcar lo desplegado ───" entero junto con las dos constantes `ACENTO_ARRIBA` y `ACENTO_ABAJO`. Existían solo porque `border-collapse` no deja poner un borde continuo que recorra dos `<tr>`; con rejilla no hacen falta.

- [ ] **Step 4: Sustituir la tabla por el bloque**

En `src/components/ListaView.tsx`, añadir a los imports:

```tsx
import { BloqueLista } from "./BloqueLista";
import { FilaDesplegable } from "./FilaDesplegable";
```

Añadir, junto a las constantes de ancho, la rejilla literal:

```tsx
/** Las mismas columnas en la cabecera y en cada fila. Literal entera: Tailwind
 *  solo compila las clases que ve escritas.
 *
 *  Son los mismos repartos de antes —36 % identidad, 22 % estado, 42 %
 *  recorrido con suelo de 520 px— más los 32 px del chevron, que en la tabla
 *  era una `<Th className="w-8" />`. El `min-w` del recorrido es el suelo por
 *  debajo del cual las cuatro fechas de la línea se pisan. */
const COLUMNAS_LISTA =
  "grid grid-cols-[32px_36%_22%_minmax(520px,42%)] items-center gap-x-3";
```

`IDENTIDAD_W`, `ESTADO_W` y `RECORRIDO_W` dejan de usarse: borrarlas junto con su comentario de reparto, y dejar `RECORRIDO_PX`, `CHIP_TARDE_PX`, `ANCHO_FECHA_PX` y `ANCHO_FECHA_PCT`, que la línea de tiempo sigue necesitando.

Sustituir el `return` de `ListaView` entero por:

```tsx
  const cabecera = (
    <>
      <span />
      <span>Pedido · cliente</span>
      <span>Quién · estado</span>
      <span>
        <span className="block">Recorrido</span>
        <span className="mt-0.5 block text-[9px] font-normal normal-case tracking-normal text-text-muted">
          creación · <span className="font-semibold text-text">planificada</span> ·
          fabricación · solicitada
        </span>
      </span>
    </>
  );

  if (ordenados.length === 0) {
    return (
      <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-border px-6 py-12 text-center">
        <div>
          <p className="text-sm font-semibold text-text">
            {hayFiltrosActivos ? "Ningún pedido pasa los filtros" : "No hay trabajo pendiente"}
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-text-muted">
            {hayFiltrosActivos
              ? "Hay pedidos en la lista, pero los filtros de arriba los dejan todos fuera. Quita alguno para volver a verlos."
              : "Aquí sale lo que aún no ha pasado a Producción. Los pedidos nuevos aparecerán en cuanto Producción los planifique para Oficina Técnica."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <BloqueLista columnas={COLUMNAS_LISTA} cabecera={cabecera}>
        {ordenados.map((p) => {
          // Terminado = la planificación vencida ya no es un problema
          // pendiente. Misma regla que `estaAtrasado`, que también los excluye.
          const hecho = estaFinalizado(p);
          const pendienteProc = p.situacion === "pendiente";
          const fichando = p.ofs.find((o) => o.fichandoRol)?.fichandoRol ?? null;
          return (
            <FilaDesplegable
              key={p.id}
              columnas={COLUMNAS_LISTA}
              abierta={expandidos.has(p.id)}
              onAlternar={() => toggle(p.id)}
              etiqueta={p.codigo}
              idDetalle={`detalle-${p.id}`}
              celdas={
                <>
                  {/* ─── La celda de identidad ───────────────────────────
                      Arriba QUÉ pedido es y de qué va; abajo, de quién es. */}
                  <div className="pointer-events-none min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className="h-3.5 w-1 shrink-0 rounded-full"
                        style={{ background: PRIORIDAD[p.prioridad].color }}
                        title={`Prioridad ${PRIORIDAD[p.prioridad].label}`}
                      />
                      {/* El código SÍ se pulsa: sale del `pointer-events-none`. */}
                      <span className="pointer-events-auto">
                        <PedidoCodigo codigo={p.codigo} onAbrir={() => onOpen(p)} />
                      </span>
                      <span
                        className="shrink-0 text-[11px] font-medium text-text-muted"
                        title={`${p.ofs.length} orden${p.ofs.length === 1 ? "" : "es"} de fabricación`}
                      >
                        · {p.ofs.length} OF
                      </span>
                      {fichando && (
                        <span
                          title={fichando === "revisar" ? "Revisando ahora" : "Planteando ahora"}
                          className="inline-flex"
                        >
                          <LiveDot rol={fichando} />
                        </span>
                      )}
                      {familiasDe(p).map((f) => (
                        <FamiliaTag key={f} familia={f} />
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4 text-text-muted">
                      <span
                        className="min-w-0 text-text"
                        title={p.negocio ? `Cliente ${p.cliente} · Negocio ${p.negocio}` : `Cliente ${p.cliente}`}
                      >
                        {p.cliente}
                        {p.negocio && <span className="text-text-muted"> · {p.negocio}</span>}
                      </span>
                      {p.interno && (
                        <span
                          className="rounded bg-surface-2 px-1.5 py-0.5 text-[9px] font-bold uppercase text-text-muted ring-1 ring-border"
                          title="Proyecto interno: sin pedido de venta"
                        >
                          Interno
                        </span>
                      )}
                      {pendienteProc && (
                        <span
                          className="rounded bg-surface-2 px-1.5 py-0.5 text-[9px] font-bold uppercase text-text-muted ring-1 ring-border"
                          title="Producción todavía no lo ha pasado a Oficina Técnica"
                        >
                          Sin procesar
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="pointer-events-none min-w-0">
                    <Estado pedido={p} nombrePorId={nombrePorId} />
                  </div>
                  {/* Terminado = el recorrido ya no dice nada: el pedido no se
                      mueve más. Se apaga entero en vez de teñir media lista de
                      rojo por trabajo que ya está hecho. Aquí el `grayscale`
                      no es texto que haya que leer, es una línea. */}
                  <div className={`pointer-events-none min-w-0 ${hecho ? "grayscale" : ""}`}>
                    <Recorrido pedido={p} hoy={hoy} />
                  </div>
                </>
              }
              detalle={<Detalle p={p} hoy={hoy} operarios={operarios} />}
            />
          );
        })}
      </BloqueLista>
    </div>
  );
```

Borrar también el componente auxiliar `Th` y `Td` de `ListaView.tsx` si ya no los usa nadie (comprobar con `grep -n "<Th\|<Td" src/components/ListaView.tsx`).

- [ ] **Step 5: Comprobar que pasan**

Run: `pnpm test lista-pendientes`
Expected: PASS — 6 pruebas.

Run: `pnpm test && pnpm build`
Expected: todo en verde.

- [ ] **Step 6: Commit**

```bash
git add src/components/ListaView.tsx src/lib/__tests__/lista-pendientes.test.ts
git commit -F - <<'EOF'
refactor(pendientes): la lista deja de ser una tabla

Con <tr> no se puede pintar un borde que recorra la fila y su detalle, así
que el acento de lo desplegado se fingía con dos medias barras. Con la
rejilla común es una sola y ese apaño se va. Mismas columnas, mismo orden,
mismo detalle.

Novedad: mejor | En Pendientes, el pedido sin procesar ya se lee entero
Detalle: Iba en gris claro de arriba abajo; ahora solo lleva su etiqueta.
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Revisiones — las columnas giran a filas

**Files:**
- Modify: `src/components/RevisionView.tsx` (sustituye `ColumnaRevision` y `ReviewCard` por `SeccionRevision` y `FilaRevision`)
- Test: `src/lib/__tests__/revision-lista.test.ts` (nuevo)
- Las pruebas de `src/lib/__tests__/revision-presentacion.test.ts` **no se tocan**: comprueban textos que siguen saliendo.

**Interfaces:**
- Consumes: `BloqueLista`, `FilaDesplegable` (Task 1). De `@/lib/revision`: `facetsRevisorEnEstado` y el tipo `FacetRevision` (`{ pedido: Pedido; ofs: OF[] }`). De `@/lib/estado`: `ESTADO`, `ROL`, `fmtMin`, `etiquetaCantidad`.
- Produces: nada que use otra tarea.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `src/lib/__tests__/revision-lista.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { RevisionView } from "../../components/RevisionView";
import { OPERARIOS, PEDIDOS } from "../mock";
import type { EstadoOF } from "../types";

function pintar(estados: EstadoOF[], miId = "revisor") {
  const pedido = {
    ...PEDIDOS[0],
    ofs: estados.map((estado, i) => ({
      ...PEDIDOS[0].ofs[0], id: `of-${i}`, codigo: `OF-${i}`, estado,
      ajenaOT: false, detenida: false, autorId: "autor", revisorId: "revisor",
    })),
  };
  return renderToStaticMarkup(createElement(RevisionView, {
    pedidos: [pedido], operarios: OPERARIOS, miId,
    onOpen() {}, onCambiarRevisor() {}, onAccion() {},
  }));
}

test("los cuatro estados van uno debajo de otro, no en columnas", () => {
  const html = pintar(["en_revision"]);
  // Cuatro bloques apilados, y ninguna rejilla de columnas de tablero.
  expect(html.match(/bloque-3d/g)).toHaveLength(4);
  expect(html).not.toContain("xl:grid-cols-4");
});

test("los cuatro estados salen siempre, tengan algo o no", () => {
  const html = pintar(["en_revision"]);
  for (const titulo of ["Por empezar", "Revisando", "Aprobadas por mí", "Devueltas por mí"]) {
    expect(html).toContain(titulo);
  }
});

test("cada pedido es una línea que se despliega, no una tarjeta abierta", () => {
  const html = pintar(["en_revision"]);
  expect(html).toContain('aria-expanded="false"');
  // Plegada no se ve lo de dentro: ni el selector de revisor ni los botones.
  expect(html).not.toContain("Revisor:");
  expect(html).not.toContain("Aprobar");
});

test("la línea dice lo que hace falta para elegir cuál abrir", () => {
  const html = pintar(["en_revision", "en_revision"]);
  expect(html).toContain(PEDIDOS[0].codigo);
  expect(html).toContain(PEDIDOS[0].cliente);
  expect(html).toContain("2 OF");
});

test("un estado sin nada lo dice, en vez de desaparecer", () => {
  expect(pintar(["en_revision"])).toContain("Aquí no tienes nada");
});

test("el conmutador de alcance sigue estando", () => {
  const html = pintar(["en_revision"]);
  expect(html).toContain("Solo mías");
  expect(html).toContain("Todo el equipo");
});
```

- [ ] **Step 2: Comprobar que fallan**

Run: `pnpm test revision-lista`
Expected: FAIL — la primera encuentra 0 `bloque-3d` (hoy son `bg-zone`).

- [ ] **Step 3: Sustituir `ColumnaRevision` por `SeccionRevision`**

En `src/components/RevisionView.tsx`, añadir a los imports:

```tsx
import { BloqueLista } from "./BloqueLista";
import { FilaDesplegable } from "./FilaDesplegable";
```

Añadir la rejilla, junto a `COLUMNAS`:

```tsx
/** Las columnas de una línea de revisión. Literal entera (Tailwind).
 *  chevron · pedido · cliente · nº OF · tiempo · autor→revisor */
const COLUMNAS_REVISION =
  "grid grid-cols-[28px_136px_minmax(0,1fr)_56px_64px_84px] items-center gap-x-3";
```

Sustituir la rejilla de cuatro columnas del `return` de `RevisionView`:

```tsx
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
```

por una pila:

```tsx
      {/* LOS CUATRO ESTADOS, UNO DEBAJO DE OTRO. Estaban en cuatro columnas y
          cada tarjeta vivía en ~260 px: ahí no caben el selector de revisor,
          la guía de ocho puntos y dos botones sin apretarlo todo. A lo ancho
          cabe, y el recorrido se sigue leyendo igual porque el orden de los
          cuatro no cambia — solo va de arriba abajo en vez de izquierda a
          derecha. */}
      <div className="flex flex-col gap-4">
```

Y sustituir la función `ColumnaRevision` entera por:

```tsx
// Un estado de la revisión: su rótulo con punto de color y contador, y debajo
// una línea por pedido. La comparten los dos alcances — "Todo el equipo"
// colorea por ESTADO, "Solo mías" con el violeta único de la revisión.
function SeccionRevision({
  titulo,
  estado,
  dotClassName,
  dotColor,
  facets,
  operarios,
  miId,
  causas,
  onOpen,
  onCambiarRevisor,
  onAccion,
}: {
  titulo: string;
  estado: EstadoOF;
  dotClassName?: string;
  dotColor?: string;
  facets: RFacet[];
  operarios: Operario[];
  miId: string;
  causas: CausaDevolucion[];
  onOpen: (p: Pedido) => void;
  onCambiarRevisor: (ofId: string, revisorId: string) => void;
  onAccion: (ofId: string, accion: AccionOF, obs?: string) => void;
}) {
  const nOF = facets.reduce((n, f) => n + f.ofs.length, 0);
  return (
    <section aria-label={titulo}>
      <BloqueLista
        columnas={COLUMNAS_REVISION}
        rotulo={{
          texto: titulo,
          claseDot: dotClassName,
          color: dotColor,
          sufijo: `· ${nOF} OF`,
        }}
      >
        {facets.length === 0 ? (
          <p className="px-3 py-3 text-xs text-text-muted">
            Aquí no tienes nada ahora mismo.
          </p>
        ) : (
          facets.map((f) => (
            <FilaRevision
              key={f.pedido.id}
              facet={f}
              estado={estado}
              operarios={operarios}
              miId={miId}
              causas={causas}
              onOpen={() => onOpen(f.pedido)}
              onCambiarRevisor={onCambiarRevisor}
              onAccion={onAccion}
            />
          ))
        )}
      </BloqueLista>
    </section>
  );
}
```

En el `map` de `columnas` del `return`, cambiar `<ColumnaRevision` por `<SeccionRevision` (las props son las mismas).

- [ ] **Step 4: Sustituir `ReviewCard` por `FilaRevision`**

Renombrar `ReviewCard` a `FilaRevision`. Todo lo que hay **antes del `return`** —`revisorComun`, `sinRevisor`, `puedo`, `marcas`, `puntos`, `fallos`, `faltan`, `impedido`, `selectorRevisor`, `accionTodas`, `minutos`— se queda **exactamente igual**: es lógica y no cambia. Añadir al principio del cuerpo:

```tsx
  const [abierta, setAbierta] = useState(false);
```

Y sustituir el `return (…)` entero por:

```tsx
  const autoresDelGrupo = [...new Set(ofs.map((o) => o.autorId).filter(Boolean) as string[])];

  return (
    <FilaDesplegable
      columnas={COLUMNAS_REVISION}
      abierta={abierta}
      onAlternar={() => setAbierta((a) => !a)}
      etiqueta={pedido.codigo}
      idDetalle={`revision-${estado}-${pedido.id}`}
      celdas={
        <>
          {/* El código abre la ficha; el resto de la línea despliega. Hermanos,
              no anidados: un clic produce una sola acción. */}
          <span className="pointer-events-auto min-w-0">
            <button
              type="button"
              onClick={onOpen}
              title={`Abrir la ficha de ${pedido.codigo}`}
              className="font-mono text-xs font-bold text-text underline-offset-2 hover:underline"
            >
              {pedido.codigo}
            </button>
          </span>
          <span
            className="pointer-events-none min-w-0 truncate text-[11px] text-text-muted"
            title={pedido.cliente}
          >
            {pedido.cliente}
          </span>
          <span className="pointer-events-none text-[11px] text-text-muted">
            {ofs.length} OF
          </span>
          <span
            className="pointer-events-none text-right font-mono text-[11px] tabular-nums text-text-muted"
            title="Tiempo ya fichado en estas OF"
          >
            {minutos > 0 ? fmtMin(minutos) : "—"}
          </span>
          {/* De quién viene y a quién le toca, que es lo que se pregunta al
              mirar una cola de revisión. */}
          <span className="pointer-events-none flex items-center justify-end gap-1">
            {autoresDelGrupo.slice(0, 2).map((id) => (
              <Avatar key={id} op={operarios.find((o) => o.id === id)} title="Autor" />
            ))}
            {revisorComun && (
              <>
                <span className="text-text-muted">→</span>
                <Avatar op={operarios.find((o) => o.id === revisorComun)} title="Revisor" />
              </>
            )}
          </span>
        </>
      }
      detalle={
        <div className="space-y-2">
          {/* Las OF del grupo, con lo que las distingue una de otra. */}
          <ul className="space-y-1">
            {ofs.map((of) => (
              <li key={of.id} className="flex items-center gap-2 text-[11px]">
                <FamiliaIcon familia={of.familia} className="size-3.5 shrink-0" />
                <span className="shrink-0 font-mono text-text-muted">{of.codigo}</span>
                <span className="min-w-0 flex-1 truncate text-text" title={of.descripcion}>
                  {of.descripcion}
                </span>
                {of.fichandoRol && (
                  <span
                    title={of.fichandoRol === "revisar" ? "Revisando ahora" : "Planteando ahora"}
                    className="inline-flex shrink-0"
                  >
                    <LiveDot rol={of.fichandoRol} className="size-1.5" />
                  </span>
                )}
                <span className="flex shrink-0 items-center gap-1">
                  <Avatar op={operarios.find((o) => o.id === of.autorId)} title="Autor" />
                  {of.revisorId && (
                    <>
                      <span className="text-text-muted">→</span>
                      <Avatar op={operarios.find((o) => o.id === of.revisorId)} title="Revisor" />
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {estado === "devuelta" && ofs.find((o) => o.observacion) && (
            <NotaDevolucion
              observacion={ofs.find((o) => o.observacion)!.observacion!}
              className="rounded bg-red-500/10 px-2 py-1.5 text-[11px] text-red-600 dark:text-red-400"
            />
          )}

          {/* Acciones. Solo sale lo que me toca a MÍ: la máquina de estados ya
              filtra por rol, así que al autor esto se le queda en un resumen de
              lectura, que es lo que debe ser. */}
          <div className="flex flex-wrap items-center gap-2">
            {estado === "por_revisar" && (
              <>
                {sinRevisor.length > 0 && (
                  <p className="w-full text-[11px] text-text-muted">
                    {sinRevisor.length === ofs.length ? "Sin revisor" : `${sinRevisor.length} sin revisor`} —
                    viene de antes de la web. Ponle uno para que pueda empezar.
                  </p>
                )}
                {selectorRevisor}
                {puedo("empezar_revision") && (
                  <button
                    onClick={() => accionTodas("empezar_revision")}
                    title="Pasa a En revisión y arranca tu fichaje de revisor"
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${ROL.revisar.solido}`}
                  >
                    Empezar revisión
                  </button>
                )}
              </>
            )}
            {estado === "en_revision" && (
              <>
                {selectorRevisor}
                {puedo("devolver") && (
                  <GuiaRevision
                    puntos={puntos}
                    marcas={marcas}
                    onMarcar={marcar}
                    abierta={guiaAbierta}
                    onAbrir={setGuiaAbierta}
                  />
                )}
                {puedo("aprobar") && (
                  <AprobarInline
                    ofs={ofs.map((o) => ({ id: o.id, codigo: o.codigo }))}
                    onAprobar={(ids) => ids.forEach((id) => onAccion(id, "aprobar", undefined))}
                    impedido={impedido}
                    label={etiquetaCantidad("Aprobar", ofs.length)}
                  />
                )}
                {puedo("devolver") && (
                  <DevolverInline
                    label={
                      fallos.length > 0
                        ? `Devolver con ${fallos.length} ${fallos.length === 1 ? "causa" : "causas"}`
                        : ACCIONES.find((a) => a.id === "devolver")?.label
                    }
                    miId={miId}
                    causasSugeridas={fallos}
                    familias={familias}
                    impedido={impedido}
                    ofs={ofs.map((o) => ({ id: o.id, codigo: o.codigo }))}
                    onDevolver={(obs, ids) => (ids ?? ofIds).forEach((id) => onAccion(id, "devolver", obs))}
                  />
                )}
              </>
            )}
            {estado === "aprobada" && (
              <span className="text-[11px] font-medium text-cyan-600 dark:text-cyan-400">
                {pedidoListoParaPasar(pedido)
                  ? "✓ Pedido listo para pasar a Producción"
                  : `✓ ${ofsQueCuentan(pedido).filter((o) => o.estado === "aprobada").length} de ${ofsQueCuentan(pedido).length} OF aprobadas · queda trabajo pendiente`}
              </span>
            )}
            {estado === "devuelta" && (
              <span className="text-[11px] text-text-muted">↩ Vuelve al autor</span>
            )}
          </div>
        </div>
      }
    />
  );
```

**Ojo con `useMarcasRevision`:** sigue llamándose siempre, plegada o desplegada. Es un hook y no se puede condicionar; además lo comprobado se guarda en el servidor y perderlo al plegar obligaría a repasar los ocho puntos otra vez.

El `meta` de `ESTADO[estado]` y su `borderIzq` dejan de usarse en la fila (el color va en el punto del rótulo): quitar la línea `const meta = ESTADO[estado];` si el linter avisa de que sobra.

- [ ] **Step 5: Comprobar**

Run: `pnpm test revision`
Expected: PASS — las 6 nuevas y las 2 de `revision-presentacion.test.ts` que ya existían.

Run: `pnpm test && pnpm build`
Expected: todo en verde.

- [ ] **Step 6: Commit**

```bash
git add src/components/RevisionView.tsx src/lib/__tests__/revision-lista.test.ts
git commit -F - <<'EOF'
feat(revisiones): los cuatro estados en filas, no en columnas

Cada tarjeta vivía en ~260 px y ahí no caben el selector de revisor, la guía
de ocho puntos y dos botones: todo salía apretado y a medias. En vertical
cabe. El recorrido no cambia, solo va de arriba abajo.

Novedad: mejor | Revisiones se ve a lo ancho y cada pedido se abre en su sitio
Detalle: Las cuatro listas van una debajo de otra. Pulsas un pedido y se abre ahí mismo con sus OF, la guía y los botones, sin quedar todo apretado en una columna.
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: «Volver a plantear» se ve

**Files:**
- Modify: `src/components/Drawer.tsx` (la fila de acciones de la OF, alrededor de la línea 1595)
- Test: `src/lib/__tests__/drawer-volver-a-plantear.test.ts` (ya existe — añadir una prueba)

**Interfaces:**
- Consumes: `AccionDef` de `@/lib/acciones`.
- Produces: `Drawer.tsx` exporta
  ```ts
  export function BotonVolverAPlantear(props: { label: string; onPulsar: () => void }): JSX.Element
  ```

**Contexto y por qué hace falta un componente con nombre.** `volver_a_plantear` solo aparece en una OF aprobada con la marca de cerrada en RPS (`noSi: (of) => of.cerradaRps === undefined`), y en ese caso **es la única acción que se ofrece**. Hoy sale con tono `neutra`, que `Btn` pinta como `ghost` = `border border-border text-text-muted`: gris sobre cristal gris en tema oscuro, al final de una fila de iguales.

Esa OF vive dentro del cajón «Ver 1 cerrada en RPS», que se abre con estado de React (`mostrar`, un `Set`). `renderToStaticMarkup` no puede pulsar nada y el proyecto no tiene entorno de DOM, así que **el botón no se puede alcanzar renderizando el `Drawer`** — el propio `drawer-volver-a-plantear.test.ts` ya lo explica en su cabecera y por eso prueba la decisión (`accionesDisponibles`) en vez del pintado. Sacarlo a un componente con nombre y exportarlo es lo que lo hace comprobable sin montar un entorno de DOM entero para un botón.

- [ ] **Step 1: Comprobar el punto de partida**

Run: `pnpm test drawer-volver-a-plantear`
Expected: PASS, 6 pruebas. No se toca ninguna: siguen valiendo tal cual.

- [ ] **Step 2: Escribir la prueba que falla**

Crear `src/lib/__tests__/drawer-boton-volver.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { BotonVolverAPlantear } from "../../components/Drawer";

const html = () =>
  renderToStaticMarkup(
    createElement(BotonVolverAPlantear, { label: "Volver a plantear", onPulsar() {} }),
  );

test("se lee en tema oscuro: tinta normal, no la de texto secundario", () => {
  expect(html()).toContain("text-text");
  expect(html()).not.toContain("text-text-muted");
});

test("con relieve, como los demás chips de la ficha, y no un borde gris", () => {
  expect(html()).toContain("chip-3d");
  expect(html()).not.toContain("border-border");
});

test("a su propia línea: es la única salida de esa OF, no un botón más de la fila", () => {
  expect(html()).toContain("w-full");
  expect(html()).toContain("order-first");
});

test("dice para qué sirve, que la OF sigue terminada en RPS hasta que alguien fiche", () => {
  expect(html()).toContain("Volver a plantear");
  expect(html()).toContain("En RPS sigue terminada");
});
```

- [ ] **Step 3: Comprobar que falla**

Run: `pnpm test drawer-boton-volver`
Expected: FAIL — `BotonVolverAPlantear` no se exporta desde `Drawer`.

- [ ] **Step 4: Escribir el componente**

En `src/components/Drawer.tsx`, junto a `Btn` al final del fichero:

```tsx
/** «Volver a plantear», el botón.
 *
 *  Es la ÚNICA acción que admite una OF cerrada en RPS: `noSi` apaga todas las
 *  demás. Un botón que es la única salida no puede parecer el último de una
 *  fila de iguales, y con el tono neutro —`ghost`, que es borde gris y
 *  `text-text-muted`— en tema oscuro quedaba gris sobre gris.
 *
 *  Con nombre propio y exportado porque esa OF vive dentro de un cajón que se
 *  abre con estado de React: renderizando el `Drawer` no se llega hasta aquí
 *  (ver la cabecera de `drawer-volver-a-plantear.test.ts`). */
export function BotonVolverAPlantear({
  label,
  onPulsar,
}: {
  label: string;
  onPulsar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPulsar}
      title="La OF vuelve a planteando. En RPS sigue terminada hasta que alguien fiche en ella: el primer fichaje la reabre."
      className="chip-3d order-first w-full rounded-lg px-3 py-1.5 text-xs font-semibold text-text"
    >
      ↩ {label}
    </button>
  );
}
```

`order-first` con `w-full` la saca a su propia línea al principio del `flex flex-wrap` que envuelve las acciones, sin reordenar el array.

- [ ] **Step 5: Usarlo en la fila de acciones**

En el `map` de `aLaVista`, añadir esta rama **antes** del `return` genérico con `<Btn>` (junto a las de `terminar_planteo` y `cerrar_en_rps`, que ya funcionan igual):

```tsx
        if (a.id === "volver_a_plantear")
          return (
            <BotonVolverAPlantear
              key={a.id}
              label={a.label}
              onPulsar={() => pedirConfirmacion(a)}
            />
          );
```

- [ ] **Step 6: Comprobar**

Run: `pnpm test drawer`
Expected: PASS — las 4 nuevas y todas las de `drawer-*` que ya existían, sin tocarlas.

Run: `pnpm test && pnpm build`
Expected: todo en verde.

- [ ] **Step 7: Commit**

```bash
git add src/components/Drawer.tsx src/lib/__tests__/drawer-boton-volver.test.ts
git commit -F - <<'EOF'
fix(ficha): que se vea el botón de volver a plantear

Es la única acción que admite una OF ya cerrada en RPS, y salía en gris al
final de la fila de botones: en tema oscuro, gris sobre gris.

Novedad: arreglado | El botón de volver a plantear ya se ve
Detalle: En una OF cerrada en RPS es lo único que puedes hacer, y en modo oscuro no se distinguía del fondo.
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: Tareas y tiempos deja de ser un modal

**Files:**
- Modify: `src/components/HistorialTareas.tsx` (todo el fichero)
- Test: `src/lib/__tests__/tareas-tiempos.test.ts` (nuevo)

**Interfaces:**
- Consumes: `Desplegable`, `agruparCentros`, `rangoCentro`, `HistorialCentro` de `@/lib/historial-centros`, `fmtMin` de `@/lib/estado`.
- Produces: `HistorialTareas` y `TareasDelPedido` conservan su firma pública actual (`pedido`, `ofs`, `seccion`, `className`, `compacto`, `abrirAlMontar`) para no romper a `HistorialView`, `HistorialDrawer` y `Drawer`. `TareasPorCentro` y `TareasDeOF` siguen exportándose: los usa la consulta sin login.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `src/lib/__tests__/tareas-tiempos.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { HistorialTareas, TareasDeOF } from "../../components/HistorialTareas";
import type { HistorialOF } from "../historial";

const OF: HistorialOF = {
  codigo: "0231922", descripcion: "Lona frontal", centro: "ot",
  tiempoImputadoMin: 14, piezas: 1,
  tareas: [
    { codigo: "1", descripcion: "Plantear", tiempoImputadoMin: 10,
      personas: [{ nombre: "Iván Sánchez", min: 7 }, { nombre: "Jaime Vázquez", min: 3 }] },
    { codigo: "2", descripcion: "Preparar archivo", tiempoImputadoMin: 4,
      personas: [{ nombre: "Jaime Vázquez", min: 4 }] },
    { codigo: "9", descripcion: "Embalar", tiempoImputadoMin: 0, personas: [] },
  ],
} as unknown as HistorialOF;

test("ya no hay popover: el desglose se abre dentro, como los demás bloques", () => {
  const html = renderToStaticMarkup(
    createElement(HistorialTareas, { pedido: "AR.26.03914", ofs: [OF], seccion: "ot" as const }),
  );
  expect(html).not.toContain("popover");
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain("Tareas y tiempos");
});

test("abierto de salida cuando se pide, para no cobrar un segundo clic", () => {
  const html = renderToStaticMarkup(
    createElement(HistorialTareas, {
      pedido: "AR.26.03914", ofs: [OF], seccion: "ot" as const, abrirAlMontar: true,
    }),
  );
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain("Plantear");
});

test("los tiempos van todos en la misma columna y con cifras de ancho fijo", () => {
  const html = renderToStaticMarkup(createElement(TareasDeOF, { of: OF }));
  // Una tarea = una rejilla de tres columnas: tarea, quién, tiempo.
  expect(html.match(/grid-cols-\[minmax\(0,1fr\)_auto_56px\]/g)).toHaveLength(3);
  expect(html.match(/tabular-nums/g)).toHaveLength(3);
});

test("con una sola persona su nombre basta: su tiempo es el de la tarea", () => {
  const html = renderToStaticMarkup(createElement(TareasDeOF, { of: OF }));
  expect(html).toContain("Jaime Vázquez");
  expect(html).not.toContain("Jaime Vázquez 4m");
  // Con dos sí hace falta el de cada uno, que es lo que el total no dice.
  expect(html).toContain("Iván Sánchez 7m");
});

test("una OF sin tareas en RPS lo dice en el idioma de quien lo lee", () => {
  const vacia = { ...OF, tareas: [] } as unknown as HistorialOF;
  const html = renderToStaticMarkup(createElement(TareasDeOF, { of: vacia }));
  expect(html).toContain("Esta OF no tiene tareas en RPS.");
  expect(html).not.toContain("Sin desglose de tareas disponible");
});
```

- [ ] **Step 2: Comprobar que fallan**

Run: `pnpm test tareas-tiempos`
Expected: FAIL — el HTML contiene `popover`.

- [ ] **Step 3: Cambiar el popover por un bloque desplegable**

En `src/components/HistorialTareas.tsx`, sustituir el componente `HistorialTareas` entero por:

```tsx
/** «Tareas y tiempos»: qué tareas lleva el pedido en RPS y cuánto se ha echado
 *  en cada una.
 *
 *  ERA UN POPOVER, una ventana encima de todo. Se abría justo sobre la ficha
 *  que estabas leyendo, tapándola, y había que cerrarla para volver — con el
 *  añadido de que un popover nativo no congela el `body` por su cuenta, así
 *  que la rueda seguía moviendo lo de detrás y al cerrar aparecías en otro
 *  sitio. Ahora es un bloque que se abre DENTRO, con el mismo borde y fondo
 *  que Documentos y Notas: se lee al lado de lo demás y no tapa nada. */
export function HistorialTareas({
  pedido,
  ofs,
  seccion,
  className = "mb-4",
  compacto = false,
  abrirAlMontar = false,
}: {
  pedido: string;
  ofs: HistorialOF[];
  seccion: SeccionId;
  className?: string;
  /** En la lista del Historial va dentro de una fila ya desplegada: rótulo
   *  corto, con el largo en el `title`. */
  compacto?: boolean;
  /** Abierto nada más montar. Lo usa `TareasDelPedido`: allí el botón de
   *  verdad es el que dispara la carga, y al llegar los datos esto aparece ya
   *  abierto en vez de pedir un segundo clic. */
  abrirAlMontar?: boolean;
}) {
  const id = useId();
  const [abierto, setAbierto] = useState(abrirAlMontar);
  return (
    <section
      className={`${className} rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)]`}
    >
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-controls={id}
        title={compacto ? "Tareas y tiempos" : undefined}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-text"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`size-3.5 shrink-0 text-text-muted transition-transform motion-reduce:transition-none ${abierto ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {compacto ? "Tareas" : "Tareas y tiempos"}
        <span className="ml-auto font-mono text-[10px] font-normal text-text-muted">{pedido}</span>
      </button>
      <div id={id}>
        <Desplegable abierto={abierto}>
          <div className="border-t border-[var(--glass-border)] px-3 py-3">
            {/* Con color, como la consulta: el código de la OF y los tiempos se
                recorren con la vista sin leerlo todo. */}
            <TareasPorCentro ofs={ofs} seccion={seccion} conColor />
          </div>
        </Desplegable>
      </div>
    </section>
  );
}
```

Ajustar los imports del fichero: fuera `useEffect` y `useScrollBloqueado` (el popover era lo único que los usaba), dentro `Desplegable`:

```tsx
import { useId, useState } from "react";
import { Desplegable } from "./Desplegable";
```

Comprobar que `useScrollBloqueado` sigue usándose en otro sitio antes de dejarlo huérfano: `grep -rn "useScrollBloqueado" src/`. Si no lo usa nadie más, **dejar el fichero `src/lib/useScrollBloqueado.ts` donde está**: tiene sus propias pruebas y borrarlo no es parte de este trabajo.

- [ ] **Step 4: Dar aire al contenido**

En el mismo fichero, sustituir `CentroTareas` por:

```tsx
/** Un centro con sus OF y, dentro, sus tareas.
 *
 *  QUIÉN ECHÓ CADA TAREA SALE EN TODOS LOS CENTROS, no solo en el que se está
 *  mirando: esto se abre justo para eso, y dejar Diseño y Taller con un número
 *  y sin nadie obligaba a preguntar por el pasillo quién lo había hecho. */
function CentroTareas({
  centro,
  conColor = false,
  extraCentro,
  extraOF,
}: {
  centro: HistorialCentro;
  conColor?: boolean;
  extraCentro?: (centro: HistorialCentro) => React.ReactNode;
  extraOF?: (of: HistorialOF, centro: HistorialCentro) => React.ReactNode;
}) {
  const acento = conColor ? "text-brand-700 dark:text-brand-300" : "";
  // Con una sola OF su tiempo ES el del centro, que está justo encima: no se
  // escribe dos veces. Con varias sí reparten, y entonces hace falta.
  const variasOF = centro.ofs.length > 1;
  return (
    // Aire entre centro y centro. Iban pegados, y con tres o cuatro no se veía
    // dónde acababa uno.
    <section className="mb-5 last:mb-0">
      <h4
        className="mb-2 flex items-baseline justify-between gap-3 text-sm font-semibold"
        title="Tiempo imputado en RPS"
      >
        <span>{centro.nombre}</span>
        <span className={`font-mono tabular-nums ${acento}`}>{fmtMin(centro.totalMin)}</span>
      </h4>
      {extraCentro?.(centro)}
      {centro.ofs.map((of) => (
        <div key={of.codigo} className="mb-3 border-t border-border pt-2 text-xs last:mb-0">
          <p className="mb-1.5 flex items-baseline justify-between gap-3 font-semibold">
            <span className="min-w-0">
              <span className={conColor ? `font-mono ${acento}` : undefined}>{of.codigo}</span>
              {" · "}
              {of.descripcion}
            </span>
            {variasOF && (
              <span
                className={`shrink-0 font-mono tabular-nums ${acento}`}
                title="Tiempo imputado en RPS"
              >
                {fmtMin(of.tiempoImputadoMin)}
              </span>
            )}
          </p>
          <TareasDeOF of={of} conColor={conColor} />
          {extraOF?.(of, centro)}
        </div>
      ))}
    </section>
  );
}
```

Y sustituir `TareasDeOF` por:

```tsx
/** Las tareas de una OF: qué se hace, quién la echó y cuánto lleva.
 *
 *  TRES COLUMNAS ALINEADAS y no un `flex` de tres trozos. Con flex, el nombre
 *  y el tiempo caían en un sitio distinto en cada línea según lo larga que
 *  fuera la tarea, y la columna de tiempos —que es la que se recorre con la
 *  vista— no existía como columna. El ancho del tiempo es fijo, y `tabular-nums`
 *  hace que "7m" y "1h 20m" ocupen lo mismo por cifra.
 *
 *  Vive aquí y la pintan DOS sitios —este bloque y el lateral de la ficha del
 *  Historial— porque son la misma información. Estuvo duplicada un tiempo y
 *  acabaron diciendo cosas distintas del mismo pedido. */
export function TareasDeOF({ of, conColor = false }: { of: HistorialOF; conColor?: boolean }) {
  if (!of.tareas?.length) {
    return <p className="text-text-muted">Esta OF no tiene tareas en RPS.</p>;
  }
  return (
    <>
      {of.tareas.map((tarea) => {
        const personas = tarea.personas.filter((p) => p.min > 0).sort(porMinutos);
        const vacia = tarea.tiempoImputadoMin <= 0;
        // Con UNA sola persona su tiempo es el de la tarea, que está al final
        // de la misma línea: ponerlo detrás del nombre era escribir dos veces
        // el mismo número. Con varias sí hace falta el de cada uno.
        const solaEllaEntera =
          personas.length === 1 && personas[0].min === tarea.tiempoImputadoMin;
        return (
          <p
            key={tarea.codigo}
            className={`grid grid-cols-[minmax(0,1fr)_auto_56px] items-baseline gap-x-3 py-1 ${
              vacia ? "text-text-muted" : ""
            }`}
          >
            <span className="min-w-0">
              {tarea.codigo} · {tarea.descripcion}
            </span>
            <span
              className={`text-right ${conColor && !vacia ? "font-medium text-text" : "text-text-muted"}`}
            >
              {personas.length === 0
                ? ""
                : solaEllaEntera
                  ? personas[0].nombre
                  : personas.map((p) => `${p.nombre} ${fmtMin(p.min)}`).join(" · ")}
            </span>
            <span
              className={`text-right font-mono tabular-nums ${vacia ? "" : "font-semibold"} ${
                conColor && !vacia ? "text-brand-700 dark:text-brand-300" : ""
              }`}
            >
              {fmtMin(tarea.tiempoImputadoMin)}
            </span>
          </p>
        );
      })}
    </>
  );
}
```

- [ ] **Step 5: Comprobar**

Run: `pnpm test tareas-tiempos`
Expected: PASS — 5 pruebas.

Run: `pnpm test && pnpm build`
Expected: todo en verde. `historial-presentacion.test.ts` usa `HistorialTareas`: si alguna prueba suya esperaba `popover`, ajustarla al bloque nuevo.

- [ ] **Step 6: Commit**

```bash
git add src/components/HistorialTareas.tsx src/lib/__tests__/tareas-tiempos.test.ts
git commit -F - <<'EOF'
feat(tareas): el desglose se abre dentro, no encima

El popover tapaba la ficha que estabas leyendo y, al no congelar el body,
la rueda movía lo de detrás: al cerrar aparecías en otro sitio. Y las tres
partes de cada tarea caían donde les tocaba según lo larga que fuera la
descripción, así que no había columna de tiempos que recorrer.

Novedad: mejor | Tareas y tiempos se abre dentro de la ficha, sin taparla
Detalle: Antes salía una ventana encima. Ahora se despliega como Documentos y Notas, y los tiempos van en columna para poder recorrerlos de un vistazo.
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: La ficha del pedido

**Files:**
- Modify: `src/components/MarcoFicha.tsx` (`CabeceraFicha`)
- Modify: `src/components/Drawer.tsx` (líneas ~490-500 la cabecera, ~552-562 `DatosEnLinea`, ~615-660 el orden del cuerpo y "Asignar autor")
- Test: `src/lib/__tests__/ficha-cabecera.test.ts` (nuevo)

**Interfaces:**
- Consumes: `piezasTotal` de `@/lib/types`, `FamiliaTag`.
- Produces:
  ```ts
  function CabeceraFicha(props: {
    codigo: string;
    prioridad?: Prioridad;
    cliente?: string | null;
    negocio?: string | null;
    /** Tercer renglón: piezas, dónde se entrega y las familias. Opcional — la
     *  ficha del Historial no lo pasa. */
    datos?: readonly string[];
    familias?: readonly string[];
  }): JSX.Element
  ```
  `DatosEnLinea` **se conserva sin cambios**: lo sigue usando `HistorialDrawer`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `src/lib/__tests__/ficha-cabecera.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { CabeceraFicha } from "../../components/MarcoFicha";

test("la cabecera lleva los datos de identidad del pedido, que no se van al bajar", () => {
  const html = renderToStaticMarkup(
    createElement(CabeceraFicha, {
      codigo: "AR.26.03914", prioridad: 3, cliente: "MAHOU", negocio: "NOVA CAMELIAS",
      datos: ["4 piezas", "Madrid"], familias: ["toldos", "lona"],
    }),
  );
  expect(html).toContain("AR.26.03914");
  expect(html).toContain("MAHOU");
  expect(html).toContain("NOVA CAMELIAS");
  expect(html).toContain("4 piezas");
  expect(html).toContain("Madrid");
});

test("sin datos ni familias no aparece el tercer renglón vacío", () => {
  const html = renderToStaticMarkup(
    createElement(CabeceraFicha, { codigo: "AR.26.03914", cliente: "MAHOU" }),
  );
  expect(html).toContain("AR.26.03914");
  // Ni el separador suelto ni una lista vacía.
  expect(html).not.toContain("·</span>");
});

test("un pedido sin ciudad de entrega no deja un hueco donde iría", () => {
  const html = renderToStaticMarkup(
    createElement(CabeceraFicha, {
      codigo: "AR.26.03914", cliente: "MAHOU", datos: ["1 pieza"], familias: [],
    }),
  );
  expect(html).toContain("1 pieza");
  expect(html).not.toContain("· ·");
});
```

- [ ] **Step 2: Comprobar que falla**

Run: `pnpm test ficha-cabecera`
Expected: FAIL — el HTML no contiene "4 piezas" (la prop `datos` se ignora).

- [ ] **Step 3: Añadir el tercer renglón a `CabeceraFicha`**

En `src/components/MarcoFicha.tsx`, sustituir `CabeceraFicha` por:

```tsx
/** Código, prioridad, cliente · negocio y, si se pasan, los datos de identidad
 *  del pedido: cuántas piezas, dónde se entrega y de qué es.
 *
 *  ESOS TRES SUBIERON AQUÍ. Vivían sueltos en el cuerpo, que hace scroll: al
 *  bajar a las OF o al hilo de notas desaparecían, y son del mismo orden que
 *  el cliente — lo que identifica el pedido, no lo que se decide sobre él.
 *
 *  La prioridad falta mientras el Historial carga el detalle: el código ya se
 *  sabe, el resto todavía no. */
export function CabeceraFicha({
  codigo,
  prioridad,
  cliente,
  negocio,
  datos = [],
  familias = [],
}: {
  codigo: string;
  prioridad?: Prioridad;
  cliente?: string | null;
  negocio?: string | null;
  /** Ya escritos ("4 piezas", "Madrid"): quien los pinta sabe pluralizar. */
  datos?: readonly string[];
  familias?: readonly string[];
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <h2 className="font-mono text-lg font-bold text-text">{codigo}</h2>
        {prioridad !== undefined && (
          <span
            className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
            style={{ background: PRIORIDAD[prioridad].color, color: PRIORIDAD[prioridad].tinta }}
            title={`Prioridad ${PRIORIDAD[prioridad].label}`}
          >
            P{prioridad} {PRIORIDAD[prioridad].label}
          </span>
        )}
      </div>
      <p className="truncate text-sm text-text-muted">
        {cliente || "—"}
        {negocio && <span className="font-semibold text-text"> · {negocio}</span>}
      </p>
      {(datos.length > 0 || familias.length > 0) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {datos.map((d, i) => (
            <span key={d} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden="true" className="text-text-muted">·</span>}
              <span className="font-medium text-text">{d}</span>
            </span>
          ))}
          {familias.length > 0 && (
            <span className="flex items-center gap-2">
              {datos.length > 0 && <span aria-hidden="true" className="text-text-muted">·</span>}
              <span className="flex flex-wrap gap-1">
                {familias.map((f) => <FamiliaTag key={f} familia={f} />)}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Pasar los datos desde el `Drawer` y quitar `DatosEnLinea`**

En `src/components/Drawer.tsx`, sustituir el `cabecera={…}` del `MarcoFicha` por:

```tsx
      cabecera={
        <CabeceraFicha
          codigo={pedido.codigo}
          prioridad={pedido.prioridad}
          cliente={pedido.cliente}
          negocio={pedido.negocio}
          datos={[
            `${piezasTotal(pedido)} ${piezasTotal(pedido) === 1 ? "pieza" : "piezas"}`,
            ...(pedido.ciudadEntrega ? [pedido.ciudadEntrega] : []),
          ]}
          familias={[...new Set(pedido.ofs.map((o) => o.familia))]}
        />
      }
```

Y borrar del cuerpo el `<DatosEnLinea … />` entero con su comentario. Quitar `DatosEnLinea` de los imports de `Drawer.tsx` (sigue exportándose desde `MarcoFicha` para `HistorialDrawer`).

- [ ] **Step 5: Encoger «Asignar autor» y ordenar el cuerpo**

Sustituir el bloque de asignar autor por una línea:

```tsx
          {/* Asignar el autor del pedido entero. Era una caja con borde, fondo
              y rótulo propio: tres renglones de alto para un selector, en una
              ficha donde el alto es lo que escasea. */}
          <div className="mb-4 flex items-center gap-2 text-xs">
            <span className="font-semibold text-text-muted">Autor del pedido</span>
            <div className="ml-auto">
              <Select
                value={
                  pedido.ofs.every((of) => of.autorId === pedido.ofs[0].autorId)
                    ? pedido.ofs[0].autorId
                    : null
                }
                onChange={(v) => onAssignPedido(v)}
                placeholder="Sin asignar"
                // La opción de vaciar dice lo que HACE, no el estado en que
                // deja las cosas: "Sin asignar" a secas se leía como el rótulo
                // del selector vacío y nadie caía en que ahí estaba la forma de
                // devolver un pedido a la bandeja.
                etiquetaVaciar="Quitar autor · vuelve a Sin asignar"
                alignRight
                options={opcionesOperario(operarios, miId)}
              />
            </div>
          </div>
```

Mover el `<TareasDelPedido … />` para que quede **justo después** de `<DocumentosPedido … />` y **antes** de `<NotasPedido … />`. El orden final del cuerpo, de arriba abajo:

1. `<LineaTiempoPedido>`
2. aviso de cierre en RPS (`avisosCierreRps`)
3. `<BloqueFicha titulo="Comentario del pedido">`
4. `<AvisoParteNuevo>`
5. `<DocumentosPedido>`
6. `<TareasDelPedido>`
7. `<NotasPedido>`
8. Autor del pedido
9. `<FasesSinFinalizar>` (solo en los ya pasados)
10. Las OF

Quitar el `className` por defecto de `TareasDelPedido` si lo llevaba puesto en la llamada, para que use el `mb-4` de bloque que ahora trae de serie.

- [ ] **Step 6: Comprobar**

Run: `pnpm test ficha-cabecera`
Expected: PASS — 3 pruebas.

Run: `pnpm test && pnpm build`
Expected: todo en verde.

- [ ] **Step 7: Commit**

```bash
git add src/components/MarcoFicha.tsx src/components/Drawer.tsx src/lib/__tests__/ficha-cabecera.test.ts
git commit -F - <<'EOF'
feat(ficha): piezas, entrega y familias a la cabecera

Vivían sueltos en el cuerpo, que hace scroll: al bajar a las OF o al hilo de
notas desaparecían. Son del mismo orden que el cliente. De paso, asignar
autor deja de ocupar tres renglones para un selector.

Novedad: mejor | En la ficha del pedido ya no se pierden de vista las piezas ni el sitio de entrega
Detalle: Suben arriba, junto al pedido y el cliente. Antes se iban al bajar a las OF.
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 8: Visitas

**Files:**
- Modify: `src/components/VisitasCotView.tsx` (`GrupoDia`, `VisitaCard`, `fmtFechaHora`)
- Test: `src/lib/__tests__/visitas-presentacion.test.ts` (nuevo)

**Interfaces:**
- Consumes: `BloqueLista`, `FilaDesplegable` (Task 1), `MESES_CORTOS` de `@/lib/calendario`.
- Produces: nada.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `src/lib/__tests__/visitas-presentacion.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { VisitaCard, fmtAviso } from "../../components/VisitasCotView";
import type { VisitaCot } from "../visitas-cot";

const VISITA: VisitaCot = {
  idOrden: "5891234", incidencia: "INC.26.0412", pedido: "AR.26.03914",
  responsable: "JUAN JOSÉ PÉREZ", cliente: "MAHOU", fechaVisita: "2026-09-18",
  fechaAviso: "2026-09-04T11:32:00", motivo: "Medir el hueco del toldo",
  solucion: "Presupuestar", notas: "Llamar antes", estado: "pendiente",
  estadoRps: "PTE",
} as unknown as VisitaCot;

function pintar(v: Partial<VisitaCot> = {}) {
  return renderToStaticMarkup(
    createElement(VisitaCard, { visita: { ...VISITA, ...v } as VisitaCot }),
  );
}

test("el id de la orden y el estado crudo de RPS no se enseñan: no dicen nada", () => {
  const html = pintar();
  expect(html).not.toContain("5891234");
  expect(html).not.toContain("Estado RPS");
  expect(html).not.toContain("PTE");
});

test("lo que sí sirve para encontrar la visita en RPS se queda", () => {
  const html = pintar();
  expect(html).toContain("INC.26.0412");
  expect(html).toContain("AR.26.03914");
  expect(html).toContain("Presupuestar");
});

test("la visita se abre con la misma animación que el resto de la web", () => {
  const html = pintar();
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain("Llamar antes");
});

test("una visita sin motivo lo dice como se diría hablando", () => {
  expect(pintar({ motivo: "" })).toContain("Sin motivo escrito");
});

test("sin código de incidencia no se escribe un hueco que rellenar", () => {
  const html = pintar({ incidencia: "" });
  expect(html).not.toContain("Sin código");
});

test("la fecha del aviso se lee, no se descifra", () => {
  expect(fmtAviso("2026-09-04T11:32:00")).toBe("Avisado el 4 sep, 11:32");
  expect(fmtAviso(null)).toBe("Sin fecha de aviso");
});
```

- [ ] **Step 2: Comprobar que fallan**

Run: `pnpm test visitas-presentacion`
Expected: FAIL — `VisitaCard` y `fmtAviso` no se exportan.

- [ ] **Step 3: Cambiar el formateador de fecha**

En `src/components/VisitasCotView.tsx`, sustituir `fmtFechaHora` por:

```tsx
import { MESES_CORTOS } from "@/lib/calendario";

/** «Avisado el 4 sep, 11:32». Era «Aviso: 04/09/2026, 11:32», que es la fecha
 *  escrita para una máquina: cuatro cifras de año que nadie necesita —una
 *  visita se avisa días antes, no años— y un ceroa la izquierda que solo
 *  alarga. */
export function fmtAviso(iso: string | null): string {
  if (!iso) return "Sin fecha de aviso";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Sin fecha de aviso";
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `Avisado el ${d.getDate()} ${MESES_CORTOS[d.getMonth()]}, ${hh}:${mi}`;
}
```

Corregir la errata `ceroa` → `cero a` al escribirlo.

- [ ] **Step 4: Cambiar `VisitaCard` por una fila desplegable**

Exportar `VisitaCard` (añadir `export`) y sustituirla por:

```tsx
/** Las columnas de una visita. Literal entera (Tailwind).
 *  chevron · comercial · motivo · códigos */
const COLUMNAS_VISITA =
  "grid grid-cols-[28px_minmax(140px,180px)_minmax(0,1fr)_minmax(120px,200px)] items-start gap-x-3";

export function VisitaCard({ visita }: { visita: VisitaCot }) {
  const [abierta, setAbierta] = useState(false);
  const pendiente = visita.estado === "pendiente";
  const color = colorDe(visita.responsable);

  return (
    <FilaDesplegable
      columnas={COLUMNAS_VISITA}
      abierta={abierta}
      onAlternar={() => setAbierta((a) => !a)}
      etiqueta={`la visita de ${visita.responsable}`}
      idDetalle={`visita-${visita.idOrden}`}
      celdas={
        <>
          {/* El comercial primero y con cara: es el dato con el que se habla de
              estas visitas ("la de Juan José"). */}
          <span className="pointer-events-none flex min-w-0 items-center gap-2 py-1">
            <span
              className="grid size-6 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white"
              style={{ background: color }}
              aria-hidden="true"
            >
              {inicialesDe(visita.responsable)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-semibold text-text">
                {visita.responsable}
              </span>
              {visita.cliente && (
                <span className="block truncate text-[11px] text-text-muted">{visita.cliente}</span>
              )}
            </span>
          </span>
          {/* El MOTIVO entero, sin truncar: es la razón de que la visita
              exista, y recortado obligaba a abrir cada una para saber de qué
              iba. */}
          <span className="pointer-events-none min-w-0 whitespace-pre-line py-1 text-[13px] leading-snug text-text">
            {visita.motivo || "Sin motivo escrito"}
          </span>
          <span className="pointer-events-none flex flex-wrap items-center justify-end gap-x-2 gap-y-1 py-1 text-[10px]">
            {!pendiente && (
              <span className="rounded-full bg-cyan-600/12 px-1.5 py-0.5 text-[9px] font-bold uppercase text-cyan-700 dark:text-cyan-300">
                Hecha
              </span>
            )}
            {visita.solucion && (
              <span className="font-semibold text-cyan-700 dark:text-cyan-300">
                {visita.solucion}
              </span>
            )}
            {visita.incidencia && (
              <span className="font-mono text-text-muted" title="Código de la incidencia en RPS">
                {visita.incidencia}
              </span>
            )}
            {visita.pedido && (
              <span className="font-mono text-text-muted" title="Pedido enlazado">
                {visita.pedido}
              </span>
            )}
          </span>
        </>
      }
      detalle={
        <div className="space-y-2">
          {visita.notas && (
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-text-muted">
                Notas
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-xs leading-5 text-text">
                {visita.notas}
              </p>
            </div>
          )}
          {/* Se fueron el id de la orden y el código crudo del estado de RPS.
              El primero no lo usa nadie para hablar de una visita; el segundo
              es el mismo dato que la píldora "Hecha", escrito para RPS. */}
          <p className="text-[11px] text-text-muted">{fmtAviso(visita.fechaAviso)}</p>
        </div>
      }
    />
  );
}
```

`tieneDetalle` desaparece: la fila siempre se puede abrir, y con la nota vacía queda solo la fecha del aviso, que es información. Añadir `import { FilaDesplegable } from "./FilaDesplegable";` y `import { BloqueLista } from "./BloqueLista";`.

- [ ] **Step 5: Envolver cada día en un `BloqueLista`**

En `GrupoDia`, sustituir el `return` por:

```tsx
  return (
    <section aria-label={sub ? `${titulo} · ${sub}` : titulo}>
      <BloqueLista
        columnas={COLUMNAS_VISITA}
        rotulo={
          conCabecera
            ? {
                texto: titulo,
                claseDot: atrasado ? "bg-red-500" : pendientes > 0 ? "bg-brand-400" : "bg-cyan-600",
                sufijo: (
                  <>
                    {sub && <span className="mr-1">{sub}</span>}
                    · {visitas.length} visita{visitas.length === 1 ? "" : "s"}
                    {atrasado && (
                      <span
                        className="ml-1.5 rounded-full bg-red-500/12 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-300"
                        title="Es de un día que ya pasó y sigue sin cerrarse en RPS"
                      >
                        Sin cerrar
                      </span>
                    )}
                  </>
                ),
              }
            : undefined
        }
      >
        {visitas.map((visita) => (
          <VisitaCard key={visita.idOrden} visita={visita} />
        ))}
      </BloqueLista>
    </section>
  );
```

En el `return` de `VisitasCotView`, cambiar `<div className="min-w-0 space-y-3">` por `<div className="min-w-0 space-y-4">` para que los bloques respiren igual que en el Historial.

- [ ] **Step 6: Comprobar**

Run: `pnpm test visitas`
Expected: PASS — las 6 nuevas y las que ya tenía `visitas-cot.test.ts`.

Run: `pnpm test && pnpm build`
Expected: todo en verde.

- [ ] **Step 7: Commit**

```bash
git add src/components/VisitasCotView.tsx src/lib/__tests__/visitas-presentacion.test.ts
git commit -F - <<'EOF'
feat(visitas): fuera dos datos de RPS y la agenda en el formato de la casa

El id de la orden y el código crudo del estado no los usa nadie: el segundo
además repite lo que ya dice la píldora "Hecha". La ficha pasa a abrirse con
la misma animación que el resto de la web.

Novedad: mejor | En Visitas desaparecen dos datos que no decían nada
Detalle: El número de orden y el estado en clave de RPS. Lo que sirve para buscarla allí —la incidencia y el pedido— se queda.
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 9: Girar el parte escaneado

**Files:**
- Modify: `src/components/ParteEscaneado.tsx`
- Test: `src/lib/__tests__/parte-girar.test.ts` (nuevo)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `ParteEscaneado` conserva su firma (`codigo`, `scanUrl`).

**Contexto:** el visor de PDF de Chrome solo entiende `Fit`, `FitH` y `FitV` en `#view=`; **no hay parámetro de rotación**. Por eso el giro va con `transform: rotate()` sobre el `<iframe>`. `VisorDocumento` no tiene este problema porque deja la barra de Chrome, que ya trae giro.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `src/lib/__tests__/parte-girar.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ParteEscaneado, giroIntercambia, siguienteGiro } from "../../components/ParteEscaneado";

const pintar = () =>
  renderToStaticMarkup(
    createElement(ParteEscaneado, { codigo: "AR.26.03914", scanUrl: "/scan/AR.26.03914.pdf" }),
  );

test("hay un botón para girar el parte", () => {
  expect(pintar()).toContain("Girar el parte");
});

test("de salida el parte no está girado", () => {
  expect(pintar()).toContain("rotate(0deg)");
});

test("el botón da la vuelta entera en cuatro y empieza otra vez", () => {
  expect(siguienteGiro(0)).toBe(90);
  expect(siguienteGiro(90)).toBe(180);
  expect(siguienteGiro(180)).toBe(270);
  expect(siguienteGiro(270)).toBe(0);
});

test("solo el cuarto IMPAR intercambia ancho y alto, que es lo que llena el hueco", () => {
  // De pie dentro de un hueco apaisado: lo que era alto pasa a ser ancho.
  expect(giroIntercambia(90)).toBe(true);
  expect(giroIntercambia(270)).toBe(true);
  // Boca abajo mide igual que del derecho.
  expect(giroIntercambia(0)).toBe(false);
  expect(giroIntercambia(180)).toBe(false);
});
```

- [ ] **Step 2: Comprobar que fallan**

Run: `pnpm test parte-girar`
Expected: FAIL — `giroIntercambia` no se exporta.

- [ ] **Step 3: Añadir el giro**

En `src/components/ParteEscaneado.tsx`:

Añadir arriba, junto a las otras constantes:

```tsx
/** Los cuatro cuartos de vuelta, en el orden en que los da el botón. */
const GIROS = [0, 90, 180, 270] as const;
export type Giro = (typeof GIROS)[number];

/** El siguiente cuarto de vuelta. Cuatro pulsaciones = vuelta entera. */
export function siguienteGiro(giro: Giro): Giro {
  return GIROS[(GIROS.indexOf(giro) + 1) % GIROS.length];
}

/** ¿Este giro intercambia el ancho y el alto de la hoja?
 *
 *  `transform` NO cambia cómo se mide el elemento: el `<iframe>` se sigue
 *  midiendo en el sistema de coordenadas de antes de girar. Así que a 90° y a
 *  270° hay que darle de ancho el ALTO del hueco y de alto su ANCHO, o la hoja
 *  sale recortada por los lados y con franjas arriba y abajo. A 0° y a 180°
 *  mide igual y basta con el 100 % de siempre. */
export function giroIntercambia(giro: Giro): boolean {
  return giro === 90 || giro === 270;
}
```

Dentro del componente, añadir el estado:

```tsx
  // El giro NO se guarda entre pedidos. El encaje sí (es cómo prefiere mirar
  // cada uno), pero esto es de ESTE parte: que el siguiente se abriera torcido
  // porque el anterior lo estaba sería peor que no tener botón.
  const [giro, setGiro] = useState<Giro>(0);
```

Añadir el chip, después de los dos de encaje y antes del de descargar:

```tsx
        <button
          type="button"
          onClick={() => setGiro(siguienteGiro)}
          title={`Girar el parte · ahora ${giro}°`}
          aria-label="Girar el parte"
          className={`${chip} ${giro !== 0 ? "ring-2 ring-brand-400 text-brand-700 dark:text-brand-300" : ""}`}
        >
          ↻
        </button>
```

Y sustituir el `<iframe>` por el iframe dentro de un contenedor que lo centre:

```tsx
      {/* El contenedor manda el hueco; el iframe gira dentro de él, centrado.
          Girado un cuarto impar mide al revés (ver `giroIntercambia`), por eso el
          alto y el ancho salen del contenedor y no de él. */}
      <div className="relative h-full min-w-0 flex-1 overflow-hidden rounded-xl">
        <iframe
          // `key` CON EL ENCAJE, y no es cosmética: cambiar solo el fragmento
          // de la URL no recarga nada —para el navegador es la misma página— y
          // el visor se quedaba con el encaje anterior.
          //
          // EL GIRO NO ENTRA EN LA CLAVE. Es CSS: si entrara, girar tiraría el
          // visor, recargaría el PDF y volvería a la página 1.
          key={ajuste}
          ref={marco}
          src={`${scanUrl}#page=1&view=${ajuste}&toolbar=0`}
          title={`Pedido ${codigo}`}
          style={{
            transform: `translate(-50%, -50%) rotate(${giro}deg)`,
            width: giroIntercambia(giro) ? "var(--alto-hueco)" : "100%",
            height: giroIntercambia(giro) ? "var(--ancho-hueco)" : "100%",
          }}
          className="absolute left-1/2 top-1/2 border-none bg-white"
        />
      </div>
```

Y en el contenedor de arriba (`<div className="flex h-full w-full gap-2" …>`), medir el hueco con un `ResizeObserver` para alimentar esas dos variables:

```tsx
  const hueco = useRef<HTMLDivElement>(null);
  const [medida, setMedida] = useState({ ancho: 0, alto: 0 });
  useEffect(() => {
    const el = hueco.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setMedida({ ancho: Math.round(width), alto: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
```

Poner `ref={hueco}` en el `<div className="relative h-full min-w-0 flex-1 …">` y pasarle las variables:

```tsx
        style={{
          ["--ancho-hueco" as string]: `${medida.ancho}px`,
          ["--alto-hueco" as string]: `${medida.alto}px`,
        }}
```

Añadir `useEffect` a los imports de React.

**Descargar e imprimir no cambian:** siguen dando el original sin girar, que es el documento que está en el share.

- [ ] **Step 4: Comprobar**

Run: `pnpm test parte-girar`
Expected: PASS — 3 pruebas.

Run: `pnpm test && pnpm build`
Expected: todo en verde.

- [ ] **Step 5: Probarlo a ojo**

Run: `pnpm dev`
Abrir un pedido con parte escaneado en Pendientes. Pulsar `↻` cuatro veces: la hoja tiene que dar la vuelta entera llenando el hueco en los cuatro pasos, sin recargar (el PDF no debe parpadear ni volver a la página 1). Pulsar "ajustar al ancho" con la hoja girada: ahí sí recarga, y es lo esperado.

- [ ] **Step 6: Commit**

```bash
git add src/components/ParteEscaneado.tsx src/lib/__tests__/parte-girar.test.ts
git commit -F - <<'EOF'
feat(parte): girar el escaneado sin salir de la ficha

Al esconder la barra de Chrome se rehicieron al lado el encaje, descargar e
imprimir, pero el giro se quedó dentro. Chrome no tiene parámetro de
rotación en la URL, así que va por CSS sobre el iframe — fuera del `key`,
para no recargar el PDF al girar.

Novedad: nuevo | Ya puedes girar el parte escaneado
Detalle: Botón ↻ al lado del parte. Los que entran de lado se leen sin descargarlos. Al cambiar de pedido vuelve a su posición.
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 10: Repaso final y novedades

**Files:**
- Modify: `src/lib/novedades-datos.json` (lo escribe `pnpm novedades`, no a mano)

**Interfaces:** ninguna.

- [ ] **Step 1: Todo en verde**

```bash
pnpm test
pnpm build
pnpm lint
```
Expected: las tres sin errores.

- [ ] **Step 2: Repaso a ojo, en claro y en oscuro**

Run: `pnpm dev`

Con el tema claro y con el oscuro, comprobar en las cuatro pestañas:

- Abrir y cerrar una fila: misma animación, mismo chevron que rota, misma barra dorada a la izquierda y mismo fondo `bg-brand-500/10`.
- Con dos o tres filas abiertas a la vez se ve dónde acaba una y empieza la siguiente.
- Ningún texto gris sobre gris. Mirar en concreto "Volver a plantear" en oscuro.
- Con el tabulador se llega al chevron de cada fila y `aria-expanded` cambia al abrir.
- En Pendientes, la línea de tiempo no se pisa con la ventana estrecha (el `min-w` de 520 px tiene que meter scroll horizontal, no apelotonar las fechas).
- En la ficha: piezas, entrega y familias siguen viéndose al bajar hasta las OF.
- Tareas y tiempos: abrir, leer, y comprobar que la columna de tiempos se recorre con la vista.

Anotar lo que falle y arreglarlo antes de seguir.

- [ ] **Step 3: Pasar el revisor de UI**

Lanzar el agente `ui-reviewer` sobre los componentes tocados:

```
src/components/BloqueLista.tsx
src/components/FilaDesplegable.tsx
src/components/ListaView.tsx
src/components/RevisionView.tsx
src/components/VisitasCotView.tsx
src/components/HistorialTareas.tsx
src/components/MarcoFicha.tsx
src/components/ParteEscaneado.tsx
```

Arreglar lo que señale de ARIA, foco, contraste y tema claro/oscuro. Lo que sea discutible, consultarlo antes de cambiarlo.

- [ ] **Step 4: Recoger las novedades**

```bash
pnpm novedades --ver
```

Leer lo que saldría. Tienen que aparecer las seis líneas `Novedad:` de los commits de las tareas 3, 4, 5, 6, 8 y 9, y **ninguna** de las tareas 1, 2 y 7 salvo la de la ficha. Si alguna frase habla de ficheros, campos o estados internos, corregirla en el commit correspondiente antes de publicar.

Cuando esté bien:

```bash
pnpm novedades
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/novedades-datos.json
git commit -F - <<'EOF'
docs(novedades): entrada de las cuatro pestañas unificadas

La FECHA no va aquí: la sella el servidor al estrenar la versión.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Repaso del plan contra la spec

| Sección de la spec | Tarea |
|---|---|
| La gramática común (`BloqueLista`, `FilaDesplegable`) | 1, y 2 la estrena |
| Contraste (fuera las dos `opacity`) | 3 (Pendientes), 8 (Visitas) |
| Pendientes: tabla → lista, un solo bloque | 3 |
| Revisiones: columnas → filas apiladas | 4 |
| Volver a plantear | 5 |
| Tareas y tiempos: modal → bloque, contenido rehecho | 6 |
| Ficha: cabecera, asignar autor, orden del cuerpo | 7 |
| Girar el parte | 9 |
| Visitas: bloque, dos datos fuera, textos | 8 |
| Cómo se comprueba | 10 |
| Log de novedades | líneas en 3, 4, 5, 6, 7, 8, 9; recogida en 10 |
