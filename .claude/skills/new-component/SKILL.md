---
name: new-component
description: Use when creating a new React component for CoordinaOT — scaffolds a component following the project's conventions (naming, props, Tailwind tokens, accessibility).
disable-model-invocation: true
---

# Nuevo componente CoordinaOT

Crea `src/components/<Nombre>.tsx` para el nombre pedido en `$ARGUMENTS` (PascalCase, en español como el resto: `PedidoCard`, `Bandeja`, `Zona`).

**Antes de escribir:** consulta la skill `modern-web-guidance` para el patrón de HTML/CSS/JS del componente (diálogos, popovers, formularios, tablas, selects, animaciones…). Usa la plataforma moderna (`<dialog>`, popover, anchor positioning, container queries, view transitions) antes que reimplementarla a mano. El aspecto lo fija `docs/ESTILO-HEROUI.md`, no un estilo genérico.

## Convenciones obligatorias (extraídas de los 25 componentes existentes)

1. **Named exports de function components** — nunca `export default`. Varios componentes pequeños relacionados pueden convivir en un fichero (p.ej. `LiveDot` + `LiveBadge`).
2. **Props tipadas inline** en la firma, no interface aparte (salvo que se exporte, p.ej. `LiveInfo`). Defaults en destructuring: `className = "size-2"`.
3. **Doc-comment `/** … */` en español** encima de cada export explicando qué es y cuándo usar cada prop no obvia.
4. **`"use client"` solo si hay hooks/interactividad.** Componentes presentacionales puros van sin directiva.
5. **Tipos del dominio desde `@/lib/types`**; metadatos visuales desde `@/lib/estado` (`ESTADO`, `ROL`) y `@/lib/familia` — nunca hardcodear colores de estado/rol/familia.
6. **Tailwind 4 con tokens del tema, estilo HeroUI** (`docs/ESTILO-HEROUI.md`, tokens en `src/app/hero.css`): `text-text-muted`, `bg-[var(--surface)]`, `bg-[var(--hero-relleno)]`, `shadow-[var(--hero-sombra-panel)]`… Fondos lisos, paneles sin borde (radio 24 px), botones píldora (radio 999 px), campos radio 14 px con foco `--hero-anillo`. Nada de degradados, textura, cantos metálicos ni sombras interiores; `--glass-*` y las clases del metal quedan solo por compatibilidad, no se usan en código nuevo. Clases como literales (no construir strings dinámicos de clases).
7. **Accesibilidad**: `aria-hidden` en SVG/decoración, `title` cuando solo hay icono, `motion-reduce:animate-none` junto a animaciones.
8. Imports relativos entre componentes (`./Logo`), alias `@/` para `lib`.

## Esqueleto

```tsx
import type { OF } from "@/lib/types";
import { ESTADO } from "@/lib/estado";

/** [Qué es y dónde se usa]. `compacto` para sitios estrechos. */
export function MiComponente({
  of,
  compacto = false,
}: {
  of: OF;
  compacto?: boolean;
}) {
  const meta = ESTADO[of.estado];
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-text-muted ring-1 ring-inset ring-border/60">
      {compacto ? meta.short : meta.label}
    </span>
  );
}
```

## Después de crear

Comprobar con `pnpm exec tsc --noEmit` (el hook PostToolUse ya lo hace) y revisar en la app si hay dev server corriendo.
