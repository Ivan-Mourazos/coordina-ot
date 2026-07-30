# Visitas COT — Plan de implementación

**Goal:** Añadir a CoordinaOT una quinta vista de solo lectura para consultar
las visitas COT pendientes y su historial completo desde RPS.

**Architecture:** Un módulo client-safe define tipos, validación y mapeo. Una
capa server-only pagina `MANMaintenanceOrder` y enlaza aviso, responsable,
solución y pedido. Un route handler valida la URL y expone JSON. Una vista
cliente autónoma ofrece Pendientes/Historial, filtros, refresco y carga paginada.

**Tech Stack:** Next.js 16, React 19, TypeScript, `mssql`, Tailwind CSS 4,
Vitest.

## Restricciones globales

- Solo lectura sobre RPS; ninguna escritura.
- `CodCompany = '001'` y tipo de aviso `COT`.
- Una fila por `MANMaintenanceOrder`.
- Pendientes = estado `001-0` (Creado); historial = `001-9` (Cerrado).
- Toda entrada de usuario viaja como parámetro `mssql`, nunca interpolada.
- API y consulta aisladas de `/api/tablero` y de su polling.
- `DATASOURCE=mock` funciona sin conexión SQL.
- UI prioritaria para PC, accesible con teclado y coherente con el tema claro/oscuro.

## Task 1 — Tipos, filtros y mapeo

**Files**

- Create: `src/lib/visitas-cot.ts`
- Test: `src/lib/__tests__/visitas-cot.test.ts`

**Produces**

- `AmbitoVisitasCot = "pendientes" | "historial"`.
- `VisitaCot`, `VisitasCotPagina`, `VisitasCotFiltros`.
- `normalizarFiltrosVisitasCot(URLSearchParams)`.
- `filaAVisitaCot(fila)`.
- `agruparVisitasPorFecha(items)`.

**Verify**

- URL inválida cae a valores seguros.
- Fechas y textos se normalizan.
- Dos órdenes del mismo aviso conservan IDs y filas independientes.

## Task 2 — Consulta RPS y fallback mock

**Files**

- Create: `src/lib/server/visitas-cot-db.ts`

**Produces**

- `leerVisitasCot(filtros): Promise<VisitasCotPagina>`.

**Query**

- Base: tipo COT → aviso → orden de mantenimiento.
- Estado fijo según ámbito.
- Responsable por `GENEmployee`.
- Solución por `_MANMaintenanceOrder_Custom` + `tgm_soluciones_sat`.
- Pedido por `OUTER APPLY TOP 1` sobre aviso → tarea → OF → pedido.
- Búsqueda y fechas parametrizadas.
- `ORDER BY ExecutionDate ASC` para pendientes y `DESC` para historial.
- `OFFSET/FETCH`, tamaño 40, fila 41 para `hasMore`.

**Fallback**

- Datos mock con pendientes, cerradas, varias visitas en una incidencia y una
  visita sin pedido.

## Task 3 — API

**Files**

- Create: `src/app/api/visitas-cot/route.ts`
- Test: `src/lib/__tests__/api-visitas-cot.test.ts`

**Contract**

`GET /api/visitas-cot?ambito=pendientes|historial&page=0&q=&desde=&hasta=`

```json
{
  "visitas": [],
  "hasMore": false,
  "refreshedAt": "ISO"
}
```

**Verify**

- Respuesta `200` en mock.
- Parámetros inválidos se normalizan.
- Cabecera `Cache-Control: no-store`.
- Fallo de BD devuelve `500` con mensaje estable.

## Task 4 — Vista de escritorio

**Files**

- Create: `src/components/VisitasCotView.tsx`
- Modify: `src/components/ViewSwitcher.tsx`
- Modify: `src/components/Board.tsx`

**UI**

- Quinta opción `Visitas`.
- Cabecera de módulo con Pendientes/Historial y actualización manual.
- Búsqueda con debounce y rango de fechas.
- Agenda agrupada por día, con fecha como raíl visual.
- Fila expandible para texto, solución y notas.
- Pendientes se refrescan cada 60 s; historial solo bajo demanda.
- Botón `Cargar anteriores` cuando `hasMore`.
- Estados de carga, vacío y error con reintento.

**Design**

- Mantener vidrio, dorado y tipografías de CoordinaOT.
- Usar mono para incidencia/pedido y cifras tabulares para fechas.
- Firma visual: raíl de agenda diario, no tarjetas KPI genéricas.
- Respetar tema oscuro, foco de teclado y `aria-expanded`.

## Task 5 — Verificación

1. `pnpm test`
2. `pnpm lint`
3. `pnpm build`
4. Ejecutar app con mock y capturar la vista.
5. Revisar Pendientes, Historial, filtros, expansión, vacío y error.
6. Ejecutar una comprobación de solo lectura con `DATASOURCE=rps`.
7. `git diff --check` y revisión final del diff.
