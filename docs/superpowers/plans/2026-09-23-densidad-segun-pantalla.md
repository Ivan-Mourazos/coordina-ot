# La web se ajusta a la pantalla — plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que en los monitores bajos de Diseño (611 y 785 px de alto) se vea la primera OF con su botón sin bajar y dos filas de partes, sin que en las pantallas grandes de OT la web quede enana.

**Architecture:** Dos capas. (1) `html { font-size }` baja en línea recta con el alto de la ventana (16 px a 1080 → 14 px a 611); Tailwind 4 escala espacios y textos `rem`, y los textos en `px` fijos no se tocan. (2) Variante `bajo:` (`@media (max-height: 759px)`) para apretar la ficha, el panel y la bandeja donde encoger no basta.

**Tech Stack:** Next.js 16, React, Tailwind CSS 4 (`@custom-variant`), Vitest, Playwright MCP para las capturas.

**Spec:** `docs/superpowers/specs/2026-09-23-densidad-segun-pantalla-design.md`

## Global Constraints

- Escala: 16 px a 1080 de alto, 14 px a 611, lineal, con `clamp` a [14px, 16px].
- Pantalla baja = alto < 760 px (`max-height: 759px`).
- Textos en píxeles fijos (`text-[11px]`, `text-[10px]`, `text-[9px]`) NO se cambian.
- Pantallas de prueba: 1910×928 (OT), 1404×890, 1685×785 y 1362×611 (Diseño).
- Solo PC; no hay tablets.
- Comentarios en el estilo de la casa: por qué, con el caso medido.
- El commit que se note lleva línea `Novedad:` (ver AGENTS.md).

## Cómo se mide (vale para todas las tareas)

Servidor local: `PORT=3100 pnpm dev` (lee `.env.local`, datos reales, fichaje en sombra).

Con Playwright MCP: `browser_resize` al tamaño, `browser_navigate` a
`http://localhost:3100/?seccion=diseno`, cerrar novedades si salen, buscar
`04662` en «Pedido, cliente o negocio…» y abrir AR.26.04662. Medir con
`browser_evaluate`:

```js
() => {
  const panel = document.querySelector(".pedido-contenido");
  const of = panel?.querySelector("[data-of-card], article, li");
  const r = (e) => e && Math.round(e.getBoundingClientRect().top);
  return {
    base: getComputedStyle(document.documentElement).fontSize,
    alto: innerHeight,
    contenido: panel && { visible: panel.clientHeight, total: panel.scrollHeight },
    primeraOF: r([...document.querySelectorAll(".pedido-contenido *")]
      .find((e) => /^Órdenes de fabricación/i.test(e.textContent?.trim() ?? ""))),
    botonFichar: r([...document.querySelectorAll(".pedido-contenido button")]
      .find((b) => /Fichar/.test(b.textContent ?? ""))),
  };
}
```

Y en el panel (ficha cerrada), las filas de «Sin asignar» que caben:

```js
() => {
  const tarjetas = [...document.querySelectorAll(".parte-3d")];
  const visibles = tarjetas.filter((t) => t.getBoundingClientRect().bottom <= innerHeight);
  return { filasVisibles: new Set(visibles.map((t) => Math.round(t.getBoundingClientRect().top))).size };
}
```

Medido ANTES a 1362×611: base 16px, contenido 454/615, primera OF en 430,
botón de fichar fuera; «Sin asignar» 1 fila (11 de 41).

---

### Task 1: Escala según el alto y variante `bajo:`

**Files:**
- Modify: `src/app/globals.css` (junto a `@custom-variant dark`, y la regla `html, body` de la línea ~162)
- Test: `src/lib/__tests__/escala-pantalla.test.ts`

**Interfaces:**
- Produces: variante Tailwind `bajo:` para las tareas 2 y 3; tamaño base variable.

- [ ] **Step 1: Test que falla** — la escala es CSS puro; el test fija la fórmula para que no se pierda en un repaso de estilos.

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// La web se ajusta al alto de la pantalla (spec del 23/09/2026): 16 px a 1080
// de alto, 14 px a 611, y la variante `bajo:` por debajo de 760. Es CSS, así
// que se comprueba el texto: si alguien la borra repasando estilos, en los
// monitores de Diseño la primera OF vuelve a quedarse en el borde.
const css = readFileSync("src/app/globals.css", "utf8");

describe("escala según la pantalla", () => {
  it("el tamaño base va de 14 a 16 px con el alto", () => {
    expect(css).toMatch(/font-size:\s*clamp\(14px,\s*calc\(14px \+ \(100vh - 611px\) \* 0\.004264\),\s*16px\)/);
  });

  it("existe la variante de pantalla baja", () => {
    expect(css).toContain("@custom-variant bajo (@media (max-height: 759px));");
  });

  it("la fórmula da lo que dice la spec", () => {
    const base = (alto: number) => Math.min(16, Math.max(14, 14 + (alto - 611) * 0.004264));
    expect(base(611)).toBe(14);
    expect(base(1080)).toBeCloseTo(16, 1);
    expect(base(928)).toBeCloseTo(15.35, 1);
    expect(base(500)).toBe(14);
  });
});
```

- [ ] **Step 2:** `pnpm vitest run src/lib/__tests__/escala-pantalla.test.ts` → FALLAN los dos primeros.

- [ ] **Step 3: Implementar** en `globals.css`, debajo de `@custom-variant dark …`:

```css
/* Pantalla BAJA: los monitores de Diseño Gráfico (611 y 785 px de alto). Por
   debajo de 760 se aprieta la disposición de la ficha y del panel; ver
   docs/superpowers/specs/2026-09-23-densidad-segun-pantalla-design.md. */
@custom-variant bajo (@media (max-height: 759px));
```

Y la regla `html, body { height: 100% }` pasa a:

```css
html,
body {
  height: 100%;
}

/* El tamaño base sigue al ALTO de la ventana: 16 px a 1080, 14 px a 611, en
   línea recta y sin salirse de ahí. Con Tailwind 4 los espacios y los textos en
   rem van detrás; los textos en píxeles fijos (text-[11px] y compañía, los
   pequeños) no se mueven, y así se aprieta el aire sin que la letra menuda
   baje de lo legible. A 1362×611 la primera OF de AR.26.04662 caía en el
   píxel 430 y su botón de fichar, fuera de la pantalla. */
html {
  font-size: clamp(14px, calc(14px + (100vh - 611px) * 0.004264), 16px);
}
```

- [ ] **Step 4:** test → PASA. Medir con Playwright `base` a 1910×928 (≈15.35px), 1404×890 (≈15.19px), 1362×611 (14px).

- [ ] **Step 5: El panel lateral de la ficha no debe encoger con la base.** `MarcoFicha.tsx` usa `max-w-lg` (32rem) y `right-[33rem]`: a 14 px la ficha pasaría de 512 a 448 px. Fijarlos en px:
  - `src/components/MarcoFicha.tsx:71`: `right-[33rem]` → `right-[528px] bajo:right-[576px]`
  - `src/components/MarcoFicha.tsx:79`: `max-w-lg` → `max-w-[512px] bajo:max-w-[560px]`
  - Ajustar el comentario de la línea ~64 ("acaba en 33rem…") a los px nuevos: 512 + 16 de margen = 528; en pantalla baja 560 + 16 = 576, el parte cede 48 px y los gana la ficha.

- [ ] **Step 6:** `pnpm tsc --noEmit -p . && pnpm vitest run` → verde. Capturas a 1910×928 y 1362×611 del panel de Diseño y de la ficha AR.26.04662 en `.playwright-mcp/escala-*.png`.

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css src/components/MarcoFicha.tsx src/lib/__tests__/escala-pantalla.test.ts
git commit -m "feat(web): el tamaño base sigue al alto de la pantalla"
```
(Sin `Novedad:` todavía: va en el último commit, con todo junto.)

---

### Task 2: La ficha, apretada en pantalla baja

**Files:**
- Modify: `src/components/MarcoFicha.tsx` (header ~82, contenido ~95, `CabeceraFicha` ~141-186)
- Modify: `src/components/LineaTiempoPedido.tsx:29-30, :116`
- Modify: `src/components/NotasPedido.tsx:145`
- Modify: `src/components/BloqueDesplegable.tsx:20, :54`

**Interfaces:**
- Consumes: variante `bajo:` (Task 1).

- [ ] **Step 1: Medir ANTES** con la escala ya puesta (1362×611, AR.26.04662): anotar `primeraOF`, `botonFichar`, `contenido`.

- [ ] **Step 2: Marco** (`MarcoFicha.tsx`):
  - header `p-4 pb-2` → `p-4 pb-2 bajo:px-3 bajo:pt-2 bajo:pb-1`
  - contenido `overflow-y-auto p-4` → `overflow-y-auto p-4 bajo:px-3 bajo:pt-2`

- [ ] **Step 3: Cabecera** (`CabeceraFicha`): cliente y datos en la misma línea en pantalla baja. Envolver el `<p>` del cliente y el bloque de datos:

```tsx
      {/* En pantalla baja, cliente y datos en UNA línea: la cabecera se comía
          135 px de los 611 del monitor de Diseño. */}
      <div className="min-w-0 bajo:flex bajo:items-baseline bajo:gap-2">
        <p className="truncate text-sm text-text-muted bajo:min-w-0 bajo:shrink">
          {/* …cliente y negocio, sin cambios… */}
        </p>
        {(datos.length > 0 || familias.length > 0) && (
          <div className="mt-1 overflow-hidden text-xs bajo:mt-0 bajo:shrink-0">
            {/* …sin cambios… */}
          </div>
        )}
      </div>
      {extra && <div className="mt-2 bajo:mt-1">{extra}</div>}
```

  Y el código: `h2 … text-lg` → `text-lg bajo:text-base`.

- [ ] **Step 4: Recorrido** (`LineaTiempoPedido.tsx`):
  - contenedor `mb-4 … px-3 pb-3 pt-2` → añadir `bajo:mb-2 bajo:pb-2 bajo:pt-1.5`
  - título `mb-4 flex …` → añadir `bajo:mb-2`
  - leyenda `mt-2 flex justify-between` → añadir `bajo:mt-1`

- [ ] **Step 5: Notas y bloques plegables**:
  - `NotasPedido.tsx:145` `bloque-3d mb-4 rounded-xl p-3` → `bloque-3d mb-4 rounded-xl p-3 bajo:mb-2 bajo:px-3 bajo:py-2`
  - `BloqueDesplegable.tsx:20` default `className = "mb-4"` → `"mb-4 bajo:mb-2"`
  - `BloqueDesplegable.tsx:54` botón `px-3 py-2` → `px-3 py-2 bajo:py-1.5`

- [ ] **Step 6: Medir DESPUÉS** a 1362×611 y 1685×785. Criterio: `botonFichar` < 611 (botón visible sin bajar) a 1362×611. Si NO se cumple, pasar a la opción de la spec: notas, documentos y tareas en una fila de botones — y parar a enseñar capturas antes de rehacer los tres componentes.

- [ ] **Step 7:** capturas antes/después en `.playwright-mcp/ficha-{antes,despues}-{1362x611,1685x785,1910x928}.png`. A 1910×928 no debe cambiar nada salvo la escala (la variante no aplica).

- [ ] **Step 8:** `pnpm tsc --noEmit -p . && pnpm vitest run && pnpm lint`, luego commit:

```bash
git add src/components/MarcoFicha.tsx src/components/LineaTiempoPedido.tsx src/components/NotasPedido.tsx src/components/BloqueDesplegable.tsx
git commit -m "feat(ficha): más apretada en pantallas bajas"
```

---

### Task 3: Panel y bandeja en pantalla baja

**Files:**
- Modify: `src/components/ZonaPersonal.tsx:78-80, :121`
- Modify: `src/components/TecnicoCard.tsx:67, :110`
- Modify: `src/components/PedidoCard.tsx:131`
- Modify (si hace falta tras medir): separaciones entre bloques del panel en `src/components/Board.tsx`

**Interfaces:**
- Consumes: variante `bajo:` (Task 1).

- [ ] **Step 1: Medir ANTES** (1362×611, panel de Diseño): `filasVisibles`, y la `top` del título «Sin asignar».

- [ ] **Step 2: Zona propia vacía** (`ZonaPersonal.tsx`): la cabecera ya dice "0 pedidos · 0 OF", así que en pantalla baja sobra la línea de "Sin pedidos asignados".
  - contenedor `glass-panel flex flex-col rounded-2xl border p-3` → añadir `bajo:px-3 bajo:py-2`
  - cabecera `mb-2 flex flex-wrap …` → `${conItems.length === 0 ? "mb-2 bajo:mb-0" : "mb-2"} flex flex-wrap …`
  - `<p className="py-2 text-[11px] text-text-muted">Sin pedidos asignados.</p>` → añadir `bajo:hidden`

- [ ] **Step 3: Equipo** (`TecnicoCard.tsx`): botón `px-3 py-2` → `px-3 py-2 bajo:py-1.5`; barra `mt-1.5` → `mt-1.5 bajo:mt-1`.

- [ ] **Step 4: Miniaturas** (`PedidoCard.tsx:131`): en pantalla baja la miniatura enseña la mitad de arriba del parte (cabecera, cliente, lo que se lee en la bandeja) en vez de la hoja entera: `aspect-[210/297]` → `aspect-[210/297] bajo:aspect-[210/210]`. Comentario: la hoja entera medía 160 px y en 611 de alto solo cabía una fila.

- [ ] **Step 5: Medir DESPUÉS.** Criterio: `filasVisibles >= 2` a 1362×611. Si no llega, mirar en `Board.tsx` los márgenes entre zona propia, EQUIPO, filtros y bandeja (`mb-*`, `gap-*`, `space-y-*`) y añadir `bajo:` a la baja, un bloque cada vez y midiendo.

- [ ] **Step 6:** capturas `.playwright-mcp/panel-{antes,despues}-{1362x611,1685x785,1910x928}.png`, en Diseño y en OT (OT a 1910×928 solo cambia la escala).

- [ ] **Step 7:** `pnpm tsc --noEmit -p . && pnpm vitest run && pnpm lint`, y commit con la novedad (es lo primero que el equipo nota):

```bash
git add src/components/ZonaPersonal.tsx src/components/TecnicoCard.tsx src/components/PedidoCard.tsx src/components/Board.tsx
git commit -F - <<'EOF'
feat(panel): más partes a la vista en pantallas bajas

Novedad: mejor | La web se ajusta al tamaño de tu pantalla
Detalle: En los monitores pequeños caben más partes en el panel y la primera OF de un pedido se ve con su botón de fichar sin bajar. En las pantallas grandes todo queda un poco más compacto.
EOF
```

---

### Task 4: Repaso final

- [ ] **Step 1:** Capturas a los cuatro tamaños de: panel de Diseño, panel de OT, ficha AR.26.04662, Revisiones e Historial (estas dos solo heredan la escala: comprobar que nada se rompe ni se solapa).
- [ ] **Step 2:** `ui-reviewer` (subagente) sobre los cambios: contraste, foco, claro/oscuro.
- [ ] **Step 3:** `pnpm novedades --ver` → debe salir la línea de la Task 3; `pnpm novedades` y commit `docs(novedades): …`.
- [ ] **Step 4:** Enseñar a Iván el antes/después a 1362×611 y 1910×928.
