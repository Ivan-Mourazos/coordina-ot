# Plan: incorporar los datos descubiertos en RPS a la web

Estado: fases 0-1 hechas (adaptador de lectura + descripción/piezas/fechas reales).
Origen de los hallazgos: exploración de RPSNext del 2026-07-06 (ver git log y
`docs/rps-schema.json`). Regla transversal: **filtrar siempre `CodCompany='001'`**
(X002 = guarnicionería duplica códigos de OF).

## Arquitectura de consultas

La vista `TGM_PENDIENTE_OT` es cara (7-15 s) — se consulta UNA vez por ciclo de
caché (60 s) y ya está. Todo dato adicional se trae con queries auxiliares
contra tablas indexadas (`CPRManufacturingOrder`, `CPRMOTask`, `CPRImputationMO`,
`FACOrderSL`, `GENEntityDocument`), NUNCA re-joineando la vista. Patrón:

1. Query vista (cara, ya existente) → lista de OFs y pedidos pendientes.
2. Queries auxiliares en paralelo (`Promise.all`) filtradas por esa lista
   (JOIN por `CodManufacturingOrder` / `CodOrder`, que están indexados).
3. Ensamblado en `consultarTablero()` (src/lib/server/rps.ts), caché única.

Los campos nuevos del contrato son SIEMPRE opcionales (`?`) para que el mock
siga compilando sin tocarlo.

## Fase 2 — Datos que ya vienen en la vista y no se muestran  (esfuerzo: bajo)

**2a. Rotulación** (`Rotulacion`, p.ej. "BODEGA MAHOU+ LOGO HABEMUS CONSENSUM").
- `OF.rotulacion?: string`.
- UI: línea propia en el drawer de la OF (icono de texto/rotulo); en tarjeta solo
  un puntito/chip "rotulación" si existe (espacio escaso).

**2b. Compras pendientes** (`PedComprasPendiente`).
- `OF.materialPendiente?: boolean` (la vista trae texto/flag: normalizar a boolean).
- UI: badge ámbar "material pendiente" en tarjeta y drawer. Aviso en el diálogo
  de fichar: "esta OF tiene compras sin recibir" (no bloquea, informa —
  plantear con material sin llegar suele ser trabajo en vano).

**2c. Fichable según RPS** (`SitOF` → `AllowImputations` de
`CPRManufacturingOrderSituation`; fichables: LANZADA, IMPRESA, CON IMPUTACIONES).
- `OF.fichable?: boolean`. `detenida` ya existe; CREADA tampoco es fichable.
- UI: botón de fichar deshabilitado con motivo si `fichable === false`.
  Crítico para la fase 6: fichar en OF no fichable = tiempos que NO suben a RPS.

## Fase 3 — PDF del pedido escaneado (`scanUrl`)  (esfuerzo: medio)

El PDF vive en `\\192.168.0.128\RPS\VENTAS\PEDIDOS\{año}\{CodOrder}.pdf`
(verificado accesible por SMB desde el equipo de desarrollo; indexado además en
`GENEntityDocument`/`GENDocument` con `EntityType='OrderSL'`).

- API route `GET /api/pedidos/[codigo]/scan`:
  - Validar `codigo` contra `^AR\.\d{2}\.\d{5}$` (nada de path traversal).
  - Año = segundo segmento del código (`AR.26.…` → 2026).
  - Leer el fichero del share con `node:fs` (UNC path) y devolver
    `Content-Type: application/pdf` + `Cache-Control` largo. 404 si no existe.
  - Fallback opcional: buscar la ruta real en `GENEntityDocument` si el patrón
    falla (rutas viejas u otras carpetas).
- Adaptador: `scanUrl = /api/pedidos/${codigo}/scan` solo si conviene comprobar
  existencia (v1: ponerla siempre; la tarjeta ya tolera 404 → réplica dibujada).
- UI: el drawer/tarjeta muestran el PDF (iframe/object en drawer; miniatura de
  1ª página con pdfjs queda para más adelante).
- Nota despliegue: el servidor web debe correr con acceso de red al share
  (cuenta de servicio con permiso de lectura a `\\192.168.0.128\RPS`).

## Fase 4 — Operarios reales y autor precargado  (esfuerzo: medio)

**4a. Catálogo de operarios** (`GENEmployee`: `CodEmployee` ↔ nombre).
- Los 6 del tablero se mapean por código de empleado en una constante
  (`OPERARIOS_OT: { codEmployee, id, nombre, iniciales, color }[]`):
  10=Alberto Carbón, 120=Jaime Vázquez, 149=Iván Vázquez, 195=Iván Sánchez…
  (completar los 6 con David/lista GENEmployee).
- No hay departamento fiable en RPS (IDDepartment=null) → el filtro "quién es
  de OT" es nuestro, no de RPS. Config en código hasta que exista algo mejor.

**4b. Quién ficha ahora** (`tgm_fichajes_olanet.codoperario` = `CodEmployee`).
- El adaptador ya detecta fichajes vivos; añadir el operario:
  `fichandoRol` + operario real → el tablero pinta el timer en la zona correcta
  (hoy la identidad vive en localStorage; esto la contrasta con la realidad).

**4c. Autor real** (`CPRImputationMO` agregada por OF+tarea de OT).
- Query auxiliar: suma de `ExecutionTime` por `IDEmployeeMachineTool` para las
  OFs pendientes en su tarea de OT; el empleado con más tiempo = autor.
- `OF.autorId` se precarga con ese operario si es uno de los 6 del tablero.
  La asignación manual del tablero puede seguir moviéndolo (RPS no guarda
  nuestra asignación hasta la fase 6).
- `tiempoPlanteoMin` ya viene de la vista (TiempoTotalFichado): sin cambios.

## Fase 5 — Ruta de tareas y avisos (`CPRMOTask`)  (esfuerzo: medio-alto)

- Query auxiliar por las OFs pendientes: `CodMOTask`, `Description`,
  `ExecutionTime`, `PlannedStartDate`, `PercentProgress`, `Canceled`.
- **Avisos**: hay "tareas-nota" (p.ej. "18/06 SOLICITA IVAN VISITA DE JUAN
  CASTRO CON OT"). Heurística v1: descripción que empieza por fecha `dd/mm` o
  que no está en el catálogo de fases estándar → `OF.avisos?: string[]`.
  UI: sección "Avisos de producción" en el drawer + indicador en tarjeta.
- **Siguiente fase tras OT**: la `PlannedStartDate` de la primera tarea de
  producción (CORTE, SOLDAR…) = para cuándo espera Producción el planteo.
  `OF.fechaLimitePlanteo?: string`. UI: urgencia más fina que la fecha del
  pedido (semáforo en tarjeta: vencida / esta semana / holgada).
- Riesgo: heurística de notas puede confundir; empezar mostrando y ajustar
  con feedback de los operarios.

## Fase 6 — Contexto del pedido de venta (`FACOrderSL`)  (esfuerzo: bajo)

- Query auxiliar por `CodOrder`: `Comment`, `ReceptionDemandDate`,
  `CityDelivery`, `ContactPersonDelivery`, `OrderPriority`.
- `Pedido.comentarioVenta?`, `Pedido.ciudadEntrega?`; valorar usar
  `ReceptionDemandDate` como `fechaEntrega` si es más fiable que
  `PlannedEndDate` (comparar con datos reales unos días).
- UI: drawer del pedido (bloque "Venta"), ciudad en la Lista.

## Fase 7 — Escritura de fichaje  (BLOQUEADA por David)

Especificada en memoria (fichaje-escritura-rps): pool a `stinkor\sqlexpress`
(192.168.4.113:54325, SQL 2008 R2 — probar TLS/tedious), `SCG_FASES.idestadoof`
2/3 + `SCH_RPS_BONOs` + borrar/insertar `tgm_estadosof_olanet` + job ~1 min a
`tgm_fichajes_olanet`. Pendiente: credenciales de escritura y confirmación de
tablas. La guarda de `fichable` (2c) es prerequisito.

## Orden propuesto y porqué

| # | Fase | Valor | Esfuerzo |
|---|------|-------|----------|
| 1 | 2a+2b+2c (vista sin explotar) | Alto (evita trabajo en vano; prerequisito F7) | Bajo |
| 2 | 3 (PDF pedido) | Alto (feature estrella de la tarjeta) | Medio |
| 3 | 4 (operarios + autor) | Alto (tablero refleja realidad) | Medio |
| 4 | 6 (contexto venta) | Medio | Bajo |
| 5 | 5 (ruta + avisos) | Medio (heurística a pulir) | Medio-alto |
| 6 | 7 (escritura fichaje) | Crítico | Bloqueado |

Cada fase: rama corta, typecheck + vitest + verificación con datos reales por
VPN, commit por fase.
