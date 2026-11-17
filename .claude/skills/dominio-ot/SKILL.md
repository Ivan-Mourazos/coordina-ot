---
name: dominio-ot
description: Use when working on CoordinaOT features involving pedidos, OFs, estados, fichaje, roles autor/revisor, or the RPS/SQL Server data layer — loads the business rules that are not derivable from a single file.
user-invocable: false
---

# Dominio CoordinaOT (Oficina Técnica, Toldos Gómez)

## Modelo

- **Pedido** (código `AR…`) = lo que se escanea y llega de Producción. Contiene 1..n **OF** (Órdenes de Fabricación). El pedido nunca se duplica por número de OFs.
- El trabajo y sus tiempos se guardan **por OF/tarea**; Diseño permite actuar sobre las OF del pedido juntas. Contrato de tipos: [src/lib/types.ts](../../../src/lib/types.ts).

## Roles (a nivel de OF)

- **Autor** = quien *plantea* la OF (operario asignado en tablero).
- **Revisor** = compañero que repasa antes de mandar a Producción. **Regla dura: revisor ≠ autor.**
- Tiempos de planteo y revisión SUMAN al total de la OF pero se guardan por separado.

## Estados de OF

`pendiente → en_curso → por_revisar → en_revision → aprobada | devuelta`; `anulada` fuera de ciclo. Metadatos visuales (colores, chips, rank) centralizados en [src/lib/estado.ts](../../../src/lib/estado.ts) — nunca hardcodear colores de estado/rol en componentes; usar `ESTADO` y `ROL`.

- Color por rol en TODA la app: plantear = esmeralda, revisar = violeta.
- Todas las OF aplicables aprobadas = **Listo para pasar**, no pasado. Hace falta la acción explícita **Pasar a Producción** de un autor del pedido; aprobar como revisor no lo pasa ni habilita ese botón. Se guarda por pedido y sección. Reglas y excepciones: [src/lib/fases-tablero.ts](../../../src/lib/fases-tablero.ts).

## Reglas de datos / RPS (acordadas con IT)

- Acceso al tablero: [src/lib/data.ts](../../../src/lib/data.ts). Producción usa `DATASOURCE=rps`, consultas de servidor y overlay SQLite. Mock es solo para desarrollo; no valida el comportamiento real por sección.
- Solo entran a OT los pedidos con `situacion: "procesado"` (escaneado + OF asignada + pasado). Los `pendiente` solo se consultan en la Lista, no son trabajo de OT.
- **Fichaje por OF/tarea**: intervalos locales y outbox hacia OLANET cuando está activado. Consultar [src/lib/server/olanet-outbox.ts](../../../src/lib/server/olanet-outbox.ts); nunca simular el terminal.

## Secciones (config en [src/lib/secciones.ts](../../../src/lib/secciones.ts))

- **OT** plantea y **revisa** (autor ≠ revisor). Envío del planteamiento a Producción (impresión + correo) solo en OT.
- **Diseño Gráfico** (A-DGRA) **no revisa** (`sinRevision`, desde 26/10/2026): «Finalizar» por OF y «Finalizar todo» por pedido; ninguna acción, guía ni columna de revisión. Cambio de revisión → comprobar que OT no cambia y viceversa.
- **Impresión digital**: sin revisión; «Impreso» = aprobar sin revisión + pasar el pedido. Manuel (22) está en Impresión y también en Diseño. **No tocar Diseño** al trabajar en Impresión.
- Máquinas de corte (P-PCUS, P-PCMU) solo cuentan tiempo: se fichan en la máquina, sin tarjetas por tarea.
- El `CodTarea` no indica el departamento: lo decide el recurso/máquina de la tarea. Una OF puede tener tareas `2` y `02` a la vez: no confundirlas.

## Fichaje y OLANET

- `FICHAJE_OLANET=activo` en producción: los tiempos suben a RPS de verdad. En desarrollo `sombra`/`ensayo`; nunca escribir bonos de prueba en la BD real sin autorización.
- El bono lleva **máquina real, nunca grupo** (OTEC-A→A-OTEC, DGRA-A→A-DGRA): ver `maquinaDeFichaje`. `horaini`/`horafin` en **segundos** desde medianoche; `[of]` es palabra reservada.
- OLANET se lee del servidor principal desde el 26/10/2026; el antiguo `.113` no se usa. Su `scg_Fases` puede tener fases sin cerrar: contrastar con RPS (`fasesTerminadasEnRps`).
- **La sincronización es de un solo sentido** (OLANET → RPS). Para dar una tarea por terminada valen `CPRMOTask.RealEndDate` y la OF FINALIZADA; **no** valen `PercentProgress >= 100` (lo pone el primer fichaje) ni DETENIDA.
- Un pedido está hecho por su **entrega**, no por sus tareas (miles de pedidos entregados con tareas sin cerrar).

## SQL contra RPS / OLANET

- **Tipar siempre los parámetros** de columnas `varchar` (`sql.VarChar(n)`): sin tipo van como `nvarchar`, se pierde el índice y una consulta pasa de 8 ms a 5 s.
- Solo lectura salvo las tablas de fichaje autorizadas, y con el usuario que IT ha asignado a cada servidor. Nada de tareas pesadas (`UPDATE STATISTICS`, barridos) en horario de trabajo.

## Identidad y login

- **Encendido en producción** (`COORDINA_LOGIN=activo`) con consulta pública sin login; existe una cuenta de Dirección de solo lectura. En `.env.example` y en desarrollo sigue `off`.
- Apagado (`COORDINA_LOGIN` distinto de `activo`): se elige operario en el navegador (`coordina-operario-id`) y el servidor acepta el `operarioId` enviado. Esa selección no autentica a nadie.
- Encendido (`COORDINA_LOGIN=activo`): acceso con PIN, cookie firmada `coordina_sesion` HttpOnly y secreto `COORDINA_SESION_SECRET` solo en servidor. `identidad()` toma la identidad de la sesión y no del cuerpo; el almacenamiento del navegador no concede permisos.
- Protege escrituras y determinadas lecturas; tablero, Historial y documentos siguen accesibles en la red. No afirmar que toda la web queda cerrada.
- Producción configura `/webs/coordina-ot/.env`; desarrollo usa `.env.local`. Activación coordinada con el equipo, siguiendo [docs/despliegue-login.md](../../../docs/despliegue-login.md).

## Al tocar código

- Next.js 16 con breaking changes: leer `node_modules/next/dist/docs/` antes de usar APIs dudosas (ver AGENTS.md).
- Clases Tailwind deben aparecer como literales para compilarse (por eso los meta-objetos guardan strings de clases).
