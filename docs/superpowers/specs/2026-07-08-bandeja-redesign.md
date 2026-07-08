# Bandeja Redesign: Paneles redimensionables + modos de orden

## Context

La vista Asignar tiene un layout rígido: panel personal arriba, EQUIPO, y bandeja abajo. La bandeja siempre agrupa por fecha de planificación en cajas, sin importar el dropdown de orden. Los filtros incluyen opciones que no aportan en esta vista (Situación, Solo atrasados, Estado). El usuario necesita más flexibilidad visual y modos de agrupación útiles.

## Scope

- Paneles redimensionables (panel personal + bandeja) con drag en bordes de EQUIPO
- 3 modos de orden para la bandeja: Planificación (flat), Familia (filas horizontales), Prioridad (3 filas)
- Filtros simplificados en vista Asignar
- Tarjeta de bandeja con fecha visible + sin borde rojo para atrasados

---

## 1. Layout redimensionable

### Estructura

```
┌──────────────────────────────────┐
│  PANEL PERSONAL (Zona)           │  min-height: 120px
├─── ═ borde superior EQUIPO ═ ───┤  drag handle (cursor: ns-resize)
│  EQUIPO (TecnicoCards)           │  altura fija (~56px)
├─── ═ borde inferior EQUIPO ═ ───┤  drag handle (cursor: ns-resize)
│  FILTROS + BANDEJA               │  min-height: 200px, overflow-y: auto
└──────────────────────────────────┘
```

### Comportamiento

- **Borde superior de EQUIPO**: arrastra para redimensionar panel personal.
  - Mover arriba = panel personal más pequeño.
  - Mover abajo = panel personal más grande.
  - Mínimo panel personal: 120px.
- **Borde inferior de EQUIPO**: arrastra para redimensionar bandeja.
  - Mover arriba = bandeja más grande.
  - Mover abajo = bandeja más pequeña.
  - Mínimo bandeja: 200px.
- **EQUIPO** mantiene altura fija, solo actúa como separador con drag handles en sus bordes.
- Tamaños se persisten en `localStorage` con clave `coordina-panel-sizes`.
- Al colapsar panel personal (chevron existente), la bandeja ocupa todo el espacio disponible.

### Implementación

- Usar `onMouseDown` + `onMouseMove` + `onMouseUp` en los bordes de EQUIPO.
- Almacenar alturas como porcentaje del viewport para responsividad.
- CSS: `cursor: ns-resize` en zona de 6px alrededor de cada borde.

### Archivos afectados

- `src/components/Board.tsx` — layout principal de vista Asignar (líneas 628-700)

---

## 2. Filtros simplificados (vista Asignar)

### Quitar de la barra en vista Asignar

- **Situación** (procesados/pendientes) — ya se filtra automáticamente por `situacion === "procesado"`
- **Solo atrasados** (toggle) — redundante, atrasados ya se distinguen por color de código
- **Estado** (de OF) — en bandeja sin asignar casi todo es "pendiente", no aporta

### Filtros que quedan en vista Asignar

| Filtro | Tipo | Valores |
|--------|------|---------|
| Query | texto libre | busca en código, cliente, negocio |
| Familia | dropdown | Todas, Toldo, Lona, Carpa, Remolque... |
| Cliente | dropdown | Todos, lista de clientes |
| Prioridad | dropdown | Todas, Urgente (3), Normal (2), Baja (1) |
| Orden | dropdown | Planificación, Familia, Prioridad |

### Vista Lista conserva todos los filtros actuales

No se toca FilterBar en vista Lista — ahí se mantienen Situación, Solo atrasados, Estado, y el resto.

### Archivos afectados

- `src/components/FilterBar.tsx` — condicionar visibilidad de filtros por vista
- `src/components/Board.tsx` — pasar prop indicando vista activa al FilterBar

---

## 3. Tarjeta de bandeja (PedidoCard)

### Cambios respecto al estado actual

- **Añadir fecha** encima del PDF en texto pequeño: `dd/mm` (ej: "08/07"), color gris (text-muted), tamaño 9px.
- **Quitar borde rojo** de las cajas de fecha atrasada (`.bandeja-caja-tarde`). Los atrasados se distinguen solo por el color rojo del código de pedido (ya implementado).
- **Quitar agrupación por fecha** en modo Planificación — tarjetas van en flat flow.

### Layout de tarjeta (80px ancho)

```
┌─────────┐
│ 08/07   │  ← fecha dd/mm, text-muted, 9px
│┌───────┐│
││       ││  ← miniatura PDF
││  PDF  ││
││     ● ││  ← dot prioridad (ya existe)
│└───────┘│
│AR.26.031│  ← código, rojo si atrasado, negro si no
└─────────┘
```

### Archivos afectados

- `src/components/PedidoCard.tsx` — añadir fecha, recibir prop de modo
- `src/app/globals.css` — quitar o no aplicar `.bandeja-caja-tarde` en modo flat

---

## 4. Modo Planificación (flat)

### Comportamiento

- Sin cajas por fecha. Todas las tarjetas en un solo `flex-wrap` continuo.
- Orden: fecha planificación ascendente. Dentro de misma fecha: prioridad descendente (P3 > P2 > P1).
- Cada tarjeta muestra su fecha encima del PDF.
- Atrasados van primero (tienen fechas anteriores a hoy), código en rojo.

### Layout

```
Sin asignar  81 ped · 135 OF

┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ...
│8/07│ │8/07│ │8/07│ │9/07│ │9/07│ │10/7│ │10/7│
│PDF │ │PDF │ │PDF │ │PDF │ │PDF │ │PDF │ │PDF │
│.031│ │.029│ │.034│ │.017│ │.025│ │.041│ │.038│
└────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘
```

### Archivos afectados

- `src/components/Bandeja.tsx` — nuevo modo de renderizado (flat sin grupos)

---

## 5. Modo Familia (filas horizontales)

### Comportamiento

- Cada familia de producto = una fila horizontal.
- Fila: cabecera con icono + nombre + contador, luego tarjetas en scroll horizontal.
- Scroll horizontal con mouse drag (cursor: grab → grabbing al arrastrar).
- Dentro de cada fila: prioridad descendente, luego fecha planificación ascendente.
- Filas ordenadas por cantidad de pedidos descendente (más llenas arriba).
- Familias sin pedidos no se muestran.
- Familias desconocidas (de RPS) se agrupan bajo su nombre string original.

### Layout

```
Sin asignar  81 ped · 135 OF

🏗 Toldo (23)
  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ...  ← scroll horizontal
  │PDF │ │PDF │ │PDF │ │PDF │ │PDF │ │PDF │ │PDF │ │PDF │
  │.031│ │.029│ │.034│ │.017│ │.025│ │.041│ │.038│ │.051│
  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘

🧵 Lona (15)
  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ...

🚛 Remolque (5)
  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐
```

### Scroll horizontal arrastrable

- Contenedor con `overflow-x: auto`, `cursor: grab`.
- `onMouseDown`: guardar posición inicial, `cursor: grabbing`.
- `onMouseMove`: `scrollLeft -= deltaX`.
- `onMouseUp`: restaurar cursor.
- Prevenir drag de imágenes con `draggable={false}` o `user-select: none`.

### Agrupación

```typescript
// Agrupar facets por familia de la primera OF
const porFamilia = new Map<string, Facet[]>();
for (const f of facets) {
  const fam = f.ofs[0]?.familia ?? "OTRO";
  const arr = porFamilia.get(fam);
  if (arr) arr.push(f);
  else porFamilia.set(fam, [f]);
}
// Ordenar filas por cantidad descendente
const filas = [...porFamilia.entries()].sort((a, b) => b[1].length - a[1].length);
```

### Nota sobre pedidos multi-familia

Un pedido puede tener OFs de distintas familias. Criterio: agrupar por la familia de la primera OF del pedido (`ofs[0].familia`). Si un pedido tiene 2 OFs de familias distintas, aparece en la fila de la primera.

### Archivos afectados

- `src/components/Bandeja.tsx` — nuevo modo de renderizado (filas + scroll drag)

---

## 6. Modo Prioridad (3 filas)

### Comportamiento

- 3 filas horizontales: Urgente (P3), Normal (P2), Baja (P1).
- Misma mecánica de scroll arrastrable que modo Familia.
- Dentro de cada fila: fecha planificación ascendente.
- Cabecera: dot de color + nombre prioridad + contador.

### Layout

```
Sin asignar  81 ped · 135 OF

🔴 Urgente (8)
  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐  ← scroll horizontal

🟠 Normal (45)
  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ...

⚪ Baja (28)
  ┌────┐ ┌────┐ ┌────┐ ...
```

### Archivos afectados

- `src/components/Bandeja.tsx` — nuevo modo de renderizado (filas por prioridad)

---

## 7. Tipo Orden actualizado

```typescript
// Antes:
type Orden = "planificacion" | "entrega" | "prioridad" | "cliente";

// Después:
type Orden = "planificacion" | "familia" | "prioridad" | "entrega" | "cliente";
```

En vista Asignar, el dropdown Orden muestra solo: **Planificación, Familia, Prioridad**.
En vista Lista, mantiene todos los existentes.

### Archivos afectados

- `src/lib/types.ts` o `src/components/FilterBar.tsx` — donde se define `Orden`
- `src/components/Board.tsx` — pasar opciones de orden según vista

---

## 8. Resumen de archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/Board.tsx` | Layout redimensionable con drag handles, filtrar opciones de Orden por vista |
| `src/components/Bandeja.tsx` | 3 modos de render (flat, familia, prioridad), quitar cajas fecha |
| `src/components/PedidoCard.tsx` | Añadir fecha dd/mm encima del PDF |
| `src/components/FilterBar.tsx` | Ocultar filtros Situación/SoloAtrasados/Estado en vista Asignar, añadir "familia" a Orden |
| `src/app/globals.css` | Posible ajuste de `.bandeja-caja-tarde` |

---

## Verificación

1. **Paneles redimensionables**: arrastrar borde superior/inferior de EQUIPO, verificar mínimos (120px/200px), recargar página y comprobar persistencia en localStorage.
2. **Modo Planificación**: seleccionar Orden=Planificación, verificar tarjetas flat con fecha, sin cajas, atrasados con código rojo sin borde rojo.
3. **Modo Familia**: seleccionar Orden=Familia, verificar filas por familia con scroll horizontal arrastrable, orden prioridad+fecha dentro de fila.
4. **Modo Prioridad**: seleccionar Orden=Prioridad, verificar 3 filas con scroll arrastrable, orden por fecha dentro.
5. **Filtros**: verificar que en Asignar solo aparecen Query/Familia/Cliente/Prioridad/Orden. En Lista, todos los filtros originales.
6. **Ambos temas**: comprobar en modo claro y oscuro.
7. **Drag & drop**: verificar que arrastrar tarjetas a operarios sigue funcionando en los 3 modos.
