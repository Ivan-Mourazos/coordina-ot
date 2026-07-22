# Historial: filtros v2 (familia + cliente autocompletar + volver arriba) — Diseño

Fecha: 2026-07-22
Estado: aprobado (pendiente de plan de implementación)
Sub-proyecto 2 de 2 (el 1 = drawer, ya en main).

## Problema

El Historial permanente tiene búsqueda por texto (AR/cliente) y rango de fechas,
pero se pidió afinarlo: filtrar por **familia**, elegir **cliente de la BD**, y
mejorar la navegación de la lista larga.

## Estudio en vivo (spike, 2026-07-22)

- **Clientes distintos con OT finalizada: 14.850.** Un desplegable plano es
  inusable → el cliente se elige por **autocompletar** (escribes → sugerencias
  de la BD).
- **Familia**: no hay un campo de familia estructurado y limpio; la familia se
  deriva por palabras clave del texto (`familiaDeTexto` en `rps.ts`), catálogo de
  7: TOLDO, LONA, CARPA, REMOLQUE, TAPIZADO, REPARACION, SUMINISTRO. El grupo
  fino de artículo ("TOLDO FACHADA") existe como texto pero su jerarquía es
  sucia → **subfamilias fuera de alcance**.

## Decisiones de diseño (acordadas)

1. **Familia = 7 chips visuales** (toggle). Filtro server-side que replica
   `familiaDeTexto` por palabras clave sobre las descripciones de las MO del
   pedido. Sin subfamilias.
2. **Cliente = autocompletar.** Un input que, al escribir ≥2 letras, consulta la
   BD y sugiere clientes del conjunto finalizado; al elegir uno, filtra por él.
3. **Paginación**: se mantiene el **scroll infinito**; se añade un botón flotante
   **"↑ Volver arriba"** que aparece al bajar.

## Arquitectura

### Filtros (backend)

`HistorialFiltros` (en `src/lib/historial.ts`) gana:
- `familia?: string` — una de las 7 del catálogo.
- `cliente?: string` — nombre exacto de cliente (el elegido en el autocompletar).

`construirFiltros` añade, parametrizadas (nunca interpoladas):
- **Familia** → mapa de palabras clave (derivado de `familiaDeTexto`, en un
  `FAMILIA_KEYWORDS` en `historial.ts`, client-safe):
  `TOLDO→['TOLDO'], LONA→['LONA','ROLLO'], CARPA→['CARPA'], REMOLQUE→['REMOLQUE'],
  TAPIZADO→['TAPIZ'], REPARACION→['REPARAC'], SUMINISTRO→['SUMINISTRO']`.
  Genera una cláusula `EXISTS` que correlaciona por `p.pedido` (CodOrder) sobre
  las MO del pedido y hace `Description LIKE @famN` (OR entre las keywords de esa
  familia). Aproxima la familia mostrada en la tarjeta.
- **Cliente** → `cli.Description = @cliente` (igualdad exacta; el valor viene del
  autocompletar, no texto libre).

**Validación en vivo (spike)** en el plan: el `EXISTS` de familia añade una
correlación sobre las MO en una lista de 50k pedidos — medir su coste y, si
penaliza, ajustar (p. ej. limitar el `EXISTS` con `TOP 1`) o degradar.

**Imprecisión asumida**: una descripción como "TOLDO CON LONA" cuenta para AMBAS
familias en el filtro (contiene las dos palabras), aunque en la tarjeta se pinte
solo la primera que casa en `familiaDeTexto`. Es un filtro "contiene", no
"clasificado como"; aceptable.

### Autocompletar de cliente (endpoint nuevo)

`GET /api/historial/clientes?q=texto` → `{ clientes: string[] }`
- Devuelve hasta 20 nombres de cliente **distintos** del conjunto de OT
  finalizada que contengan `q` (LIKE `%q%`), ordenados alfabéticamente.
- Exige `q` de ≥2 caracteres (si no, `[]`) para no escanear de más.
- Capa `historial-db.ts`: `leerClientesHistorial(q): Promise<string[]>`, con
  fallback mock (clientes de `PEDIDOS`). Spike valida el tiempo de la query.

### UI

- **Barra de filtros** de `HistorialView`:
  - Búsqueda por texto (ya existe).
  - Rango de fechas (ya existe).
  - **7 chips de familia** (toggle single-select; volver a pulsar el activo lo
    quita). Reutiliza el color/estilo del catálogo (`FamiliaTag`/`familiaMeta`).
  - **Autocompletar de cliente**: input con lista de sugerencias (fetch a
    `/api/historial/clientes` con debounce ~250 ms); al elegir, se fija el
    cliente y la lista se recarga; una "x" limpia el cliente.
  - Cualquier cambio de filtro reinicia a la página 0 (ya implementado con
    `filtrosKey` + debounce + guarda de secuencia).
- **Volver arriba**: botón flotante (esquina inferior) que aparece cuando el
  scroll pasa cierto umbral y hace scroll suave al principio de la lista.

## Manejo de errores

- Autocompletar falla: no rompe; simplemente no muestra sugerencias.
- Filtro sin resultados: el estado "Sin resultados con estos filtros" ya existe.
- Familia/cliente inválidos en la API: se ignoran (no casan nada / `[]`).

## Testing

- **Puro (Vitest)**: `construirFiltros` con `familia` (genera el `EXISTS` + params
  de keyword correctos) y con `cliente` (igualdad parametrizada); `FAMILIA_KEYWORDS`
  cubre las 7. El mock de página/clientes honra los nuevos filtros.
- **API**: `GET /api/historial/clientes` en modo mock (forma `{clientes}`, ≥2
  chars, tope 20).
- **UI**: build + manual (chips filtran, autocompletar sugiere y filtra, volver
  arriba funciona).

## Fuera de alcance

- Subfamilias / grupo fino de artículo.
- Multi-selección de familia (single-select por ahora).
- Cambiar el scroll infinito por páginas numeradas (se mantiene el scroll).
