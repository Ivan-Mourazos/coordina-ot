# Historial permanente de pedidos finalizados (RPS, paginado) — Diseño

Fecha: 2026-07-22
Estado: aprobado (pendiente de plan de implementación)

## Problema

Hoy la pestaña **Historial** ([HistorialView.tsx](../../../src/components/HistorialView.tsx))
deriva de los pedidos presentes en el tablero (la vista `TGM_PENDIENTE_OT`, que
es SOLO trabajo pendiente de OT). En cuanto un pedido finalizado sale de esa
vista, desaparece del historial. No es un archivo permanente.

Se quiere que el Historial muestre **todos los pedidos finalizados por OT**,
traídos de RPS igual que el resto de datos, **paginado** para que el volumen no
penalice el rendimiento.

## Estudio en vivo (spike contra la BD real, 2026-07-22)

Validado contra `192.168.0.124/RPSNext` con el usuario de solo lectura:

- **Señal de "OT finalizada"**: `dbo.tgm_estadosof_olanet` con `idestadoof = 3`.
  Cubre **2019-07 → hoy** (7 años), **237.863 tareas finalizadas** en 241.217
  filas totales. Es la señal correcta y de largo alcance (la escribe OLANET al
  finalizar la fase de OT). La situación de fabricación `FINALIZADA` (CodSituation
  `6`, `AllowImputations=0`) lo confirma en el lado de `CPRManufacturingOrder`.
- **Volumen agrupado por pedido**: **50.802 pedidos** finalizados por OT.
- **Rendimiento de paginación (OFFSET/FETCH)**:
  - Página reciente (30 filas): **975 ms**.
  - Página profunda (OFFSET 5000): **465 ms** — no se degrada con la profundidad.
  - Conteo total: 473 ms.
  - **Conclusión: OFFSET/FETCH basta**; no hace falta keyset ni cursores.
- Los códigos de pedido NO son solo `AR.*`: aparecen otras series (`BE.*`,
  `SA.*`…). El historial debe aceptar cualquier `CodOrder`, no filtrar por `AR`.

Columnas reales confirmadas (memoria previa desactualizada):
- `tgm_estadosof_olanet`: `orden, fase, idestadoof, fecha_cambio, ...`
- `CPRManufacturingOrder`: PK `IDManufacturingOrder`, `CodManufacturingOrder`,
  `CodCompany`, `IDMOSituation`, `Description`, ...
- `CPRManufacturingOrderSituation`: PK `IDManufacturingOrderSituation`, `CodSituation`,
  `Description`, `AllowImputations`, `SituationType`.

## Decisiones de diseño (acordadas)

1. **Fuente = RPS** (tablas base), no snapshot propio. Señal de finalización =
   `tgm_estadosof_olanet.idestadoof = 3`, agrupado por pedido `CodOrder`.
2. **Paginación OFFSET/FETCH**, ~40 pedidos por página, orden por fecha de
   finalización descendente (lo último arriba). `hasMore` se resuelve pidiendo
   `size + 1` filas (sin COUNT aparte).
3. **Filtros**: búsqueda por código de pedido / cliente, rango de fechas
   (sobre `fecha_cambio` de finalización), y filtro por cliente/familia.
4. **Detalle por pedido lazy**: la página trae solo el resumen; al expandir un
   pedido se piden sus OFs + tiempos imputados + quién los hizo.

**Limitación asumida (explícita en la UI):** el desglose planteo/revisión y el
rol "revisor" son datos propios de CoordinaOT (SQLite), no están en RPS (eso es
la fase 2b). Para los pedidos históricos solo hay **tiempo total imputado** (de
`CPRImputationMO`) y **quién lo imputó** (`GENEmployee`), sin separar planteo de
revisión. Los pedidos que pasen por CoordinaOT sí tendrán el desglose.

## Arquitectura

### Fuente de datos y query de página (validada)

Consulta base de una página (probada, ~1 s la primera, <0,5 s en profundidad):

```sql
;WITH FinOT AS (
  SELECT e.orden, MAX(e.fecha_cambio) AS fin
  FROM dbo.tgm_estadosof_olanet e
  WHERE e.idestadoof = 3
  GROUP BY e.orden
),
PedFin AS (
  SELECT o.CodOrder AS pedido, MAX(f.fin) AS finalizada,
         MAX(o.IDCustomer) AS idc,
         COUNT(DISTINCT mo.IDManufacturingOrder) AS n_of
  FROM FinOT f
  JOIN dbo.CPRManufacturingOrder mo
       ON mo.CodManufacturingOrder = f.orden AND mo.CodCompany = '001'
  JOIN dbo.FACOrderLineSL l ON l.IDManufacturingOrder = mo.IDManufacturingOrder
  JOIN dbo.FACOrderSL o ON o.IDOrder = l.IDOrder AND o.CodCompany = '001'
  GROUP BY o.CodOrder
)
SELECT p.pedido, p.finalizada, p.n_of, cli.Description AS cliente
FROM PedFin p
LEFT JOIN dbo.FACCustomer cli ON cli.IDCustomer = p.idc
-- filtros opcionales (parametrizados):
--   AND (p.pedido LIKE @q OR cli.Description LIKE @q)
--   AND p.finalizada >= @desde  AND p.finalizada < @hasta
ORDER BY p.finalizada DESC
OFFSET @off ROWS FETCH NEXT @sizeMasUno ROWS ONLY;
```

- `@off = page * size`; `@sizeMasUno = size + 1` (la fila extra decide `hasMore`;
  se descarta antes de responder).
- Filtros: se añaden como cláusulas AND parametrizadas (mssql `request.input`),
  NUNCA por interpolación de strings (inyección). `@q` = `%texto%`.
- **Filtro por familia**: la familia vive a nivel de OF (artículo), no en el
  resumen del pedido. Se aplica como `EXISTS` sobre las OFs del pedido. Esta
  sub-cláusula NO se cronometró en el spike; el plan debe medirla y, si penaliza,
  degradarla a filtro en cliente sobre la página o dejarla para una 2ª vuelta.

### Detalle por pedido (lazy, al expandir)

`GET /api/historial/[pedido]` devuelve las OFs del pedido con su tiempo imputado
y quién lo hizo. Se construye con el MISMO patrón ya en producción en
[rps.ts](../../../src/lib/server/rps.ts) para imputaciones (`CPRImputationMO` +
`CPRMOTask` + `GENEmployee`, filtrando OT por `CPRMOResourceMachine IN
('a-otec','otec-a')` y `CodCompany='001'`) y descripción/artículo desde
`CPRManufacturingOrder`. El plan concreta la query exacta reutilizando ese patrón.

### API

- `GET /api/historial?page=0&q=&desde=&hasta=&cliente=&familia=`
  → `{ pedidos: HistorialItem[], hasMore: boolean }`
  - `HistorialItem = { pedido: string; cliente: string | null; finalizada: string /*ISO*/; nOf: number; familias?: string[] }`
  - Validación: `page` entero ≥ 0 (default 0); `size` fijo en el server (~40),
    no viene del cliente; fechas ISO válidas o se ignoran; `q` recortado.
- `GET /api/historial/[pedido]`
  → `{ pedido: string; ofs: HistorialOF[] }`
  - `HistorialOF = { codigo: string; descripcion: string; familia: string; tiempoImputadoMin: number; quien: string[] /*nombres*/ }`
  - Valida `pedido` contra un patrón de código (`^[A-Z]{2}\.\d{2}\.\d{5}$`), sin
    inyección.

### Capa de datos (server)

Módulo nuevo `src/lib/server/historial.ts` (aislado del adaptador del tablero):
- `leerHistorialPagina(filtros): Promise<{ pedidos: HistorialItem[]; hasMore: boolean }>`
- `leerHistorialPedido(pedido): Promise<HistorialOF[]>`
- Usa el pool de [db.ts](../../../src/lib/server/db.ts) (mismo `getPool`,
  `requestTimeout` holgado ya configurado). En modo `DATASOURCE=mock` devuelve
  un pequeño historial de ejemplo desde el mock (para desarrollo sin BD).

### Caché

La query base vuela (<1 s), así que **v1 sin caché**. Si con carga real se nota,
añadir una caché corta (p. ej. 60 s) por combinación de filtros, con el mismo
patrón stale-while-revalidate que ya usa el tablero. Anotado, no en v1.

### UI

`HistorialView` pasa de derivar del tablero a consumir la API:
- Barra de filtros arriba: búsqueda (pedido/cliente), rango de fechas,
  desplegable de cliente/familia.
- Lista paginada con **scroll infinito** ("cargar más" al llegar al final,
  usando `hasMore`). Reutiliza la fila expandible actual (`FilaHistorial`); al
  expandir, hace `GET /api/historial/[pedido]` y pinta las OFs con tiempo + quién.
- Estados: cargando, vacío ("sin resultados con estos filtros"), error (reintentar).
- Se desacopla de `pedidos`/`Board`: el Historial ya no depende del tablero vivo.

## Manejo de errores

- BD no disponible / timeout: la API responde error; la UI muestra "no se pudo
  cargar el historial" con reintentar, sin romper el resto de la app.
- Fila mala en RPS (pedido sin cliente, fecha nula): se interpreta lo mejor
  posible (cliente `—`), nunca se rompe la página — mismo criterio que `rps.ts`.
- Página fuera de rango: devuelve lista vacía + `hasMore=false`.

## Testing

- **Puro (Vitest, sin BD)**: el constructor de la cláusula de filtros
  (parametrización de `q`/fechas/cliente) y el mapeo fila→`HistorialItem` /
  fila→`HistorialOF`. Son las piezas con lógica; la SQL se valida contra la BD.
- **Query real**: ya validada por el spike (rendimiento y forma). El plan puede
  incluir un script de verificación equivalente para la query de detalle.
- **UI**: sin RTL en el repo; verificación por build + comprobación manual
  (paginar, filtrar, expandir un pedido, caso vacío).

## Fuera de alcance

- Desglose planteo/revisión y revisor para históricos (solo era CoordinaOT).
- Subida/edición de datos a RPS (esto es solo lectura).
- Caché (v1 sin ella; se añade si hace falta).
- Filtro por familia si su `EXISTS` penaliza el rendimiento (se degrada o difiere).
- Ver el PDF escaneado de series no `AR` (la ruta de PDFs hoy solo resuelve `AR.*`).
