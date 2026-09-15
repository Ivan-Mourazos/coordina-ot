# La consulta sin login

Fecha: 2026-09-14 · Fase 2 de lo que pidió Esteban Raposo (ver
`2026-09-08-login-operarios-design.md`)

> **Sustituida por `2026-09-15-consulta-publica-v2-design.md`.** Esta versión se
> construyó y se probó con datos reales; la pantalla se rehízo porque las dos
> pestañas obligaban a adivinar dónde estaba un pedido y porque «pendiente»,
> medido por tareas, enseñaba sobre todo lo que RPS no cierra. Se conserva como
> registro de por qué se decidió lo que se decidió.

## Por qué

El login separa quién escribe de quién solo mira. Esto es la otra mitad: **qué
ve quien solo mira**. Toda la casa —comerciales, administración, taller— tiene
la misma pregunta y hoy la hace por teléfono: *¿por dónde va este pedido?*

Hasta ahora la web no la contestaba porque solo sabía de Oficina Técnica. La
contesta si mira el pedido entero, del día que entra al día que sale.

## Alcance

**Entra:** tres pestañas de solo lectura para quien no tiene sesión —Pedidos
Pendientes, Pedidos Realizados y Consultas con OT—, sus rutas propias en el
servidor, y el cierre de las rutas de lectura que hoy están abiertas.

**No entra:** las Métricas, el buscador global, el tablero y la vista de
supervisión de Cris, Carlos y Esteban (fase 3). Escribir, nada: el invitado no
tiene un solo botón que guarde.

## Decisiones

### El pedido entero, no el trabajo de oficina

La pestaña de pendientes enseña **todo pedido de venta con trabajo sin
terminar en la casa**, pase o no por oficina. Un pedido que OT ya pasó a
Producción sigue ahí, esperando por corte o por confección, que es justo lo que
va a preguntar quien lo vendió.

**Los pedidos sin ninguna OF se quedan fuera.** Son 1.060 de los 6.393 de 2026
(medido el 14/09): asistencias (230), notas (72), instalaciones, portes,
alquiler de carpa y material de almacén vendido tal cual. No pasan por fábrica,
así que no tienen ni tarea ni recorrido que enseñar, y meterlos sería llenar la
lista de cosas que no se pueden seguir. El índice de hoy ya los deja fuera por
construcción (une por `IDManufacturingOrder`): no hay nada que cambiar.

### El estado es por dónde va: los centros que le faltan

Un pedido de taller no tiene los estados de OT —planteando, esperando
revisión—, así que el invitado ve lo que RPS sabe de verdad: **los centros de
trabajo con tarea sin cerrar**. «Pendiente de: corte, confección».

Se agrupa por la DESCRIPCIÓN del centro y no por su código. En RPS el mismo
centro aparece con el código escrito de dos maneras —`A-ROTU` y `ROTU-A`,
`OTEC-A` y `A-OTEC`—, y agrupando por código «Rotulaciones Arzúa» saldría dos
veces en la misma línea.

### La entrega es el último tramo

Terminar en fábrica no es entregar. En 2026 hay **184 pedidos con todas las
tareas al 100 y la entrega pendiente**. Si el estado parara en el taller, el
comercial se quedaría sin la etapa que le preguntan.

Así que el recorrido es: «Pendiente de: corte, confección» → «Fabricado,
pendiente de entregar» → fuera de la lista. Un pedido está pendiente mientras
le quede una tarea abierta **o** una línea sin entregar
(`FACOrderLineSL.PendingDelivery`).

Los pedidos bloqueados o anulados en RPS se enseñan igual, con su situación
(en 2026 son dos).

### Lo primero que se ve: lo que entrega antes

Ordenado por fecha solicitada de entrega, con lo vencido arriba. Contesta «¿qué
va tarde?» sin tocar un filtro.

### Qué ve un invitado, y qué no

**Sí:** nombres del equipo, tiempos por persona, datos de cliente y el PDF del
pedido. Son los mismos que salen en la herramienta vieja y en RPS, que ya tiene
media casa.

**No:** las notas del pedido, la nota de devolución, las causas de rechazo y las
marcas del parte revisado. Eso se escribe entre nosotros, para trabajar, y se
escribe distinto si se sabe que lo lee todo el mundo.

**Y se esconde en el servidor, no en la pantalla.** Hoy quedan catorce rutas de
lectura abiertas: quien sepa la dirección lee las notas escribiéndola en la
barra, y una web que invita a toda la casa a entrar es una invitación a
encontrarlas. Sin cerrarlas, esconder las notas es decoración.

### Pantalla aparte, piezas compartidas

El invitado no entra en `Board.tsx`. Son 2.618 líneas con fichaje, arrastre,
sondeo y diez acciones de escritura: una bandera `soloLectura` ahí dentro
convierte cada botón en dos caminos, y el día que se olvide uno es un botón de
escribir delante de quien no debe. Además el invitado se descargaría un montón
de código que no puede usar.

Se reutilizan las PIEZAS, que es donde está el trabajo hecho: la línea de
tiempo, las tareas con sus tiempos, el calendario de visitas y los documentos
del pedido.

## Cómo

### Por dónde entra cada uno

`app/page.tsx` ya es un componente de servidor. Mira la cookie de sesión:

- **Sin sesión** → `<Consulta/>`, con un botón «Entrar» que lleva a `/entrar`.
- **Con sesión** → el `<Board/>` de siempre, sin un cambio.
- **`COORDINA_LOGIN=off`** → nadie es invitado y todo sigue como hoy. La
  consulta se enciende con la misma palanca que el login, y por el mismo
  motivo: se sube construida y apagada.

`LoginGate` sale de dentro de `Board` a su propia ruta `/entrar`. Hoy vive en la
línea 1917 de Board, y desde ahí no puede servir a una pantalla que no es la
suya.

### Los datos ya están: el índice del Historial

`server/historial-indice.ts` mantiene en memoria **los 153.451 pedidos de la
casa**, no solo los de oficina, con un `pendienteTotal` por pedido que ya
significa «le queda alguna tarea en cualquier centro». Se refresca solo cada 30
minutos. Las dos primeras pestañas son ese índice filtrado:

- **Pedidos Pendientes** → `pendienteTotal || pendienteEntrega`
- **Pedidos Realizados** → ni lo uno ni lo otro

Filtrar 153.000 pedidos en memoria son milisegundos. No hay consulta pesada
nueva, que era el riesgo de esta pantalla: la casa entera mirando el trabajo
más caro que hace la web.

Al índice se le añaden **dos campos por pedido**:

```ts
fechaEntrega: number | null;   // MIN(ReceptionDemandDate) de las líneas
pendienteEntrega: boolean;     // MAX(PendingDelivery) de las líneas
```

Un número y un bit por pedido. La memoria del proceso está en 589 MB con un
tope de 1 GB en PM2, así que el coste hay que mirarlo: son ~1,5 MB.

El detalle de las 40 filas que se ven —OF, tareas, centros abiertos, tiempos—
se pide a RPS por página, como hace hoy el Historial (menos de medio segundo).

### Las rutas

Nuevas, y solo devuelven lo que el invitado puede ver:

- `GET /api/publico/pedidos` — pendientes o realizados, paginado, con búsqueda,
  cliente, familia y fechas.
- `GET /api/publico/pedidos/[pedido]` — el detalle: OF, tareas, tiempos,
  personas, documentos de RPS y el PDF del pedido.
- `GET /api/publico/visitas` — las consultas con OT.

Las de siempre pasan a exigir sesión: `tablero`, `historial`,
`historial/[pedido]`, `historial/[pedido]/documento/[indice]`,
`historial/clientes`, `metricas`, `buscar`, `notas-recientes`, `notas`,
`avisos`, `causas`, `fases`, `visitas-cot`, `novedades`, `pedidos/[archivo]`.
El ayudante `quienEs(req)` del login ya está; aquí se le pide que también
proteja las lecturas.

Módulos nuevos: `lib/publico.ts` (puro: el estado por centros, el orden, los
filtros — con tests sin base de datos) y `lib/server/publico-db.ts` (el detalle
por página). Nada de banderas de invitado dentro del Historial existente: el
recorte tiene que ser un sitio, no una condición repartida por diez ficheros.

### Las tres pestañas

**Pedidos Pendientes.** Fila: código, cliente, entrega, línea de tiempo a
escala y el estado por centros. La línea de tiempo es la misma pieza, midiendo
contra la ENTREGA y no contra la planificada de OT: esa fecha la recalcula el
planificador de RPS en bloque y fuera de OT no significa nada. Al desplegar,
las OF con sus tareas, cuáles están cerradas y los tiempos. Al abrir, el PDF.

**Pedidos Realizados.** `HistorialView` con sus tareas, tiempos y personas,
sobre todo lo terminado de la casa. Buscador, cliente, fechas y familia se
quedan; las notas y el parte marcado, no.

**Consultas con OT.** `CalendarioVisitas` tal cual, con fotos y quién atendió,
sin los botones de crear, editar y cerrar.

Sin sondeo automático: un botón «Actualizar». Toda la casa preguntando cada 30
segundos es carga de RPS a cambio de nada — nadie mira esta pantalla esperando
a que cambie sola.

## Qué se prueba

- Sin cookie, `/api/historial` responde 401. Hoy responde con los datos.
- `/api/publico/pedidos` no devuelve ni una nota, ni una causa, ni una marca de
  revisión, mire quien lo mire.
- Un pedido que nunca tocó oficina sale en Pendientes con sus centros abiertos.
- Un pedido con todas las tareas cerradas y una línea sin entregar sigue en
  Pendientes, y dice «pendiente de entregar».
- Un pedido sin ninguna OF no sale en ninguna de las dos listas.
- La lista ordena por entrega, y lo vencido va arriba.
- Dos códigos del mismo centro (`A-ROTU` y `ROTU-A`) salen como un solo centro.
- Con sesión, todo lo de hoy sigue igual.
- Con `COORDINA_LOGIN=off` no hay vista de invitado: la web es la de siempre.

## El día del despliegue

Se sube apagado, como el login. Encenderlo es la misma variable: con el login
encendido, quien no entra ve la consulta. **El orden importa**: encender el
login sin esto deja a la casa fuera de una web que antes veían entera; esto sin
el login no tiene manera de saber quién pregunta.

## Lo que queda para la fase 3

La vista de supervisión de Cris, Carlos y Esteban: el corte por técnico y
fechas y las causas de rechazo del equipo, sin nombres. Sigue aplazada por el
mismo motivo de siempre — hay que saber qué preguntas quieren contestar, para
no construir una pantalla que se mire una vez.
