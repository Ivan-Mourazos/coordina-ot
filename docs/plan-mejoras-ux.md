# Plan: mejoras UX del tablero (petición Iván 2026-07-07)

Ejecución por tandas con subagentes; cada tanda es dueña de sus ficheros para
evitar conflictos. Typecheck + vitest + verificación en navegador por tanda,
commit por tanda.

## Mapa de peticiones → tandas

| # | Petición | Tanda |
|---|----------|-------|
| 4 | Fechas: creación + planificada + solicitada, coherentes con el parte | 1A datos |
| 6 | Historial con pedidos finalizados por OT (desde RPS) | 1A datos |
| 12 | Prioridad: 1=poca, 2=normal, 3=urgente (3 respeta planificación al 100%) — INVIERTE la semántica actual | 1A datos (+2 UI) |
| 2 | Miniatura real (1ª página del PDF) en tarjetas | 1B thumb (endpoint) + 2 (uso) |
| 1 | Paneles de compañeros solo informativos (sin acciones) | 2 UI |
| 3 | Fondo del panel de compañero desplegado no es opaco | 2 UI |
| 5 | "Producción arranca" no se entiende → texto claro | 2 UI |
| 7 | Zonas con muchos pedidos: altura limitada + scroll interno | 2 UI |
| 8 | Tarjetas de sin asignar más pequeñas (QuickLook ya amplía) | 2 UI |
| 10 | Chip expandido: resumen de tiempos/autor/revisor, no solo botones | 2 UI |
| 11 | Bandeja agrupada por fecha de planificación; dentro, por prioridad | 2 UI |
| 9 | Panel de filtros reconstruido con sentido | 3 filtros |

## Tanda 1 (paralela)

**1A — Datos (types.ts, mock.ts, src/lib/server/rps.ts):**
- `Pedido.fechaCreacion` desde `FACOrderSL.OrderDate`.
- Prioridad invertida: 1 poca / 2 normal / 3 urgente; RPS 0|null → 1.
  El pedido hereda la MÁS urgente (max). Actualizar mock (invertir valores)
  y comentarios de types.
- Historial: pedidos con la tarea de OT finalizada en RPS (investigar
  `tgm_estadosof_olanet` idestadoof=3 / `CPRMOTask.RealEndDate`), últimos
  ~60 días, como `situacion: "completado"` con OFs `aprobada`.

**1B — Miniatura PDF (src/app/api/pedidos/[archivo]/route.ts):**
- Mismo endpoint, extensión `.png` → render de la 1ª página con
  `pdfjs-dist` + `@napi-rs/canvas`, ancho ~420 px, caché en disco
  (.next/cache) + Cache-Control. `.pdf` sigue igual.

## Tanda 2 — UI del tablero (Board, PedidoCard, PedidoChip, Drawer, ZonaOperario…)

- (1) Acciones de OF solo en tu propia zona; en paneles de compañeros el chip
  es informativo (sin "Pasar a revisión" ni fichar).
- (2) Tarjeta usa `/api/pedidos/{codigo}.png` como imagen del parte con
  fallback a la réplica si 404.
- (3) Panel de compañero desplegado con fondo opaco (surface, no glass
  translúcido).
- (5) "🏭 Producción arranca el X" → "Producción espera el planteo para el X"
  o similar + title explicativo.
- (7) Zona con muchas tarjetas: max-height (~2 filas) + scroll interno.
- (8) Tarjetas de bandeja más pequeñas (~140-150 px de ancho de columna).
- (10) Chip expandido: estado, planteo/revisión/estimado, autor y revisor
  (avatares), material/reservas; acciones solo si es tu zona.
- (11) Bandeja agrupada por `fechaPlanificacion` (cabeceras dd/mm, "Sin
  planificar" al final), dentro de cada grupo orden por prioridad desc
  (urgente primero) y luego código.
- (12 UI) `PRIORIDAD_BG`/chips/replica: 3 rojo, 2 ámbar, 1 gris; orden por
  prioridad = desc; P3 atrasado = lo más destacado del tablero.

## Tanda 3 — Filtros (FilterBar.tsx + estado de filtros en Board)

- (9) Reestructurar: búsqueda (código/cliente/negocio), Familia, Cliente,
  Estado de OF, Prioridad, "Solo atrasados", Orden (Planificación /
  Prioridad / Entrega / Cliente). Chips de filtros activos + "Limpiar".
  Layout: una fila compacta con desplegables coherentes, mismo patrón
  Select del proyecto.

## Reglas para todos los subagentes

- Leer CLAUDE.md/AGENTS.md (Next 16: consultar node_modules/next/dist/docs
  ante APIs dudosas). Comentarios y UI en español.
- Colores/estado SIEMPRE desde src/lib/estado.ts y familia.ts; clases
  Tailwind como literales.
- BD: SQL Server real accesible vía .env.local (lectura). No escribir en BD.
- Antes de terminar: `pnpm exec tsc --noEmit` y `pnpm test` en verde.
- No tocar ficheros fuera del alcance de la tanda.
