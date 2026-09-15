# La consulta sin login, segunda versión

Fecha: 2026-09-15 · Sustituye a `2026-09-14-consulta-publica-design.md`

## Por qué se rehace

La primera versión se construyó entera, se probó con datos reales y no
convenció. Mirándola desde el sitio de quien la va a usar salieron tres cosas:

**Las dos pestañas obligaban a adivinar.** «Pedidos Pendientes» y «Pedidos
Realizados» partían en dos una misma cosa. Un comercial que busca un pedido no
sabe si está en curso o entregado: eso es justo lo que quiere averiguar. Pedirle
que elija pestaña antes de buscar es pedirle la respuesta para darle la
respuesta.

**«Pendiente» estaba lleno de lo que RPS no cierra.** De 3.049 pedidos
pendientes desde 2025, el 93 % salía fuera de plazo. Casi todo eran pedidos ya
entregados con alguna fase que nadie cerró en OLANET: **109.566 en toda la
historia**. La lista no enseñaba el trabajo por hacer, enseñaba un retrato de
los cierres que faltan.

**Cada retoque salía de mirar la pantalla, y fueron muchos.** Cuando una
pantalla necesita tantos arreglos, el problema no está en los detalles sino en
la forma.

## Para quién y para qué

Comerciales, administración y taller. Llegan a esta web en tres momentos, y en
ninguno piensan en «pendientes» o «realizados»:

1. **Le suena el teléfono**: «¿cómo va lo mío?». Tiene un nombre o un número y
   quiere la respuesta en diez segundos.
2. **Prepara la semana**: «¿qué se entrega estos días?». Quiere una lista
   corta de lo próximo.
3. **Le reclaman algo**: «¿esto ya salió?». Otra vez, un pedido concreto.

Dos de tres empiezan buscando. Y cuando lo encuentran, la segunda pregunta es
**quién lo tiene**, para poder llamarle.

## Alcance

**Entra:** la pantalla del invitado rehecha —dos pestañas, «Pedidos» y
«Consultas con OT»—, la regla nueva de qué es un pedido pendiente, y saber por
qué tarea va cada pedido y quién la tiene.

**Se queda de la primera versión, sin tocar:** el reparto por sesión en
`app/page.tsx`, la pantalla de PIN en `/entrar`, el cierre de las dieciséis
rutas de lectura del equipo, las rutas de `api/publico/`, el aviso de «preparando
la lista» mientras se construye el índice, el tablero en un paquete aparte del
invitado, los nombres legibles de centro, la ciudad de entrega en el índice y
los documentos de RPS con el pedido escaneado el primero.

**No entra:** filtrar por comercial (ver el final), las Métricas, el tablero y
la vista de supervisión de la fase 3.

## Decisiones

### Dos pestañas: Pedidos y Consultas con OT

«Consultas con OT» es otra cosa —una agenda de visitas— y se queda como está.
Todo lo de pedidos va a **una sola pestaña**.

### Se entra buscando

Arriba, un buscador grande: pedido, cliente, obra u OF. **Encuentra cualquier
pedido esté como esté y sea del año que sea.** Al lado, los filtros.

Sin buscar, la pantalla enseña **las próximas entregas**: lo que se entrega
hoy y los catorce días siguientes, por orden. Es la lista corta del momento 2.
Los pedidos pendientes **sin fecha de entrega** no caben ahí —no tienen día—, y
se encuentran buscándolos o con los filtros «En fábrica», «Esperando salir» y
«Todos».

### Pendiente es SIN ENTREGAR

La regla que manda en toda la consulta:

- **Entregado → rematado**, tenga las tareas que tenga abiertas en RPS.
- **Sin entregar → pendiente**, y de dos maneras:
  - **En fábrica**, si le queda trabajo.
  - **Fabricado, esperando salir**, si no.

Por qué la entrega y no las tareas: no se entrega un pedido sin haberlo hecho,
y la entrega la mantiene administración por los albaranes, así que es fiable
también hacia atrás. Medido contra RPS el 15/09/2026:

| | Pendientes | En fábrica | Esperando salir | Fuera de plazo |
|---|---|---|---|---|
| 2026 | 376 | 247 | 129 | 153 |
| 2025 | 56 | 25 | 31 | 56 |
| 2023-2024 | 35 | 15 | 20 | 35 |
| 2020-2022 | 22 | 6 | 16 | 10 |
| Antes de 2020 | 89 | 89 | 0 | 57 |

**578 pendientes en toda la casa y 311 fuera de plazo.** Con esto desaparece el
corte por años de la primera versión: no hay 100.000 pedidos que esconder.

### Qué es «le queda trabajo»: FINALIZAR manda

Dicho por Iván: **si la tarea de finalizar está cerrada, el pedido está
rematado en fábrica**, aunque quede algo abierto antes, sea de diseño o de
donde sea. «No se da rematado un pedido sin realizar todas las tareas».

Se reconoce **por el centro Finalización o por «FINALIZ» en el texto**. Por el
centro entran EMPAQUETAR y PONER A MEDIDA Y EMBALAR, que no dicen «finalizar».

El 69 % de los pedidos no tiene esa tarea (8.904 de 12.908 desde 2025): Montaje
de toldos, Santiago, Bergondo, Calderería, Rotulaciones. En esos, le queda
trabajo si le queda alguna tarea con centro sin cerrar, como hasta ahora. Como
el pedido solo sale en la lista mientras no se entrega, una tarea olvidada ya no
deja un pedido pendiente para siempre.

### Por dónde va, y quién lo tiene

Para cada OF de un pedido en fábrica, la fila y la ficha dicen **dónde está
ahora**. Puede ser más de un sitio a la vez, porque las tareas van en paralelo
(en la OF 0231429 la calderería se cerró antes de empezar el corte):

- **Lo está haciendo** Fulano — tareas empezadas ahora mismo.
- **Lo tiene pausado** Fulano — tareas interrumpidas: alguien las tiene en la
  mano. Ejemplo real: AR.26.04082, «Plantear y preparar archivos», pausada por
  Adrián Quinteiro desde el 07/09.
- **Siguiente:** Corte, Costura — si nadie ha empezado nada: en cada OF, las
  tareas abiertas con el número de secuencia más bajo. Puede ser más de una si
  comparten número, y cada OF dice la suya.

El estado de cada tarea y quién la tiene **no están en RPS**:
`tgm_estadosof_olanet` solo guarda orden, fase, estado y fecha. Están en
OLANET, en `sch_FasesMov`: estados 1 (en curso), 2 (pausada) y 3 (finalizada),
con `operario_id`, que es el mismo `CodEmployee` que ya traduce a nombre el
Historial.

Se consulta **por página**, solo para las filas que se ven: preguntarle a
OLANET por todas las tareas pausadas de golpe pasó de 3 minutos. Y **si OLANET
no contesta, la pantalla sigue funcionando**: se ve el estado del pedido, sin
nombres, en vez de un error.

### Qué ve un invitado

**Sí, y vuelve respecto a la primera versión:** los nombres de quien hizo cada
cosa y los tiempos, en todos los pedidos, estén en curso o entregados. La ficha
del pedido es **la misma que ve el equipo**: por centro, quién trabajó y cuánto,
y dentro de cada OF sus tareas con nombres y tiempos. Un comercial necesita
saber a quién llamar.

**No, nunca:** las notas del pedido, las notas de devolución, las causas de
rechazo, las marcas de revisión y las métricas. Se ve **quién lleva** un pedido,
nunca **a quién se lo devolvieron** ni por qué.

Y sigue valiendo la regla de la primera versión: **lo que no se enseña se quita
en el servidor**, no en la pantalla.

### Cómo se ve

- **El relieve 3D del Historial del equipo**: una tarjeta por día, con la fecha
  encima.
- **Fila compacta y sin línea de tiempo**: código · cliente · ciudad · dónde
  está · fecha («Entrega 18/09/26» o «Entregado el 09/09/26»). La fecha ya dice
  lo que hacía falta.
- **Al desplegar**, la ficha del equipo y los documentos de RPS con el pedido
  escaneado el primero.

### Los filtros

- **Estado**: Próximas entregas (el de entrada) · Fuera de plazo · En fábrica ·
  Esperando salir · Entregados · Todos.
- **Paso**: Oficina Técnica · Diseño Gráfico · Taller. Solo para lo que está en
  fábrica. Sale del índice, que ya sabe si a un pedido le queda trabajo de cada
  sección. «Taller» es lo que queda en fábrica sin ser de ninguna de las dos: se
  deduce por descarte, así que el día que entre una sección nueva en la web
  caería ahí hasta que alguien la añada. Y refleja las tareas **tal como están
  en RPS**: una tarea de OT que alguien olvidó cerrar hace que el pedido salga
  en «Oficina Técnica» aunque ya esté en el taller. Es lo que dice el dato; lo
  que no puede pasar es que un pedido esperando salir aparezca ahí, porque el
  filtro solo mira lo que está en fábrica.
- **Familia** y **fechas**, como ya estaban.

## Cómo

### Lo que cambia en el índice

`server/historial-indice.ts` ya guarda por pedido si queda algo sin entregar
(`pendienteEntrega`), la fecha de entrega solicitada, si le queda trabajo de cada sección
y la ciudad. Hay que añadirle **si le queda trabajo**, con la regla de
FINALIZAR, para poder decir «en fábrica» o «esperando salir» y filtrar por
estado sin ir a RPS.

Ojo, que no es un dato del pedido sino de sus OF: un pedido con varias puede
tener unas con tarea de finalizar y otras sin ella. Se calcula **por OF** —con
finalizar cerrada no le queda trabajo; sin tarea de finalizar, le queda si
tiene alguna tarea con centro sin cerrar— y el pedido tiene trabajo si lo tiene
**alguna** de sus OF. Guardar solo «finalizar cerrada» por pedido daría por
rematado un pedido que tiene una OF de Santiago a medias.

Y **la fecha real en que salió**, para poder decir «Entregado el 09/09/26» y
para ordenar y agrupar por días lo entregado. Ver «La fecha real de entrega»,
más abajo.

**La regla de `pendienteTotal` del equipo no se toca.** La consulta usa la suya
propia; el Historial del equipo sigue exactamente igual.

### Lo que se pide por página

Para las filas que se ven, de una vez y no una consulta por pedido:

- A RPS, las tareas abiertas de cada OF (ya existe, `centrosDe`).
- A OLANET, el último movimiento de cada una de esas tareas, con su operario.

### Lo que se quita de la primera versión

- Las dos listas y el apartado plegado de vencidos: pasan a ser filtros.
- La línea de tiempo de cada fila.
- El corte por años de la lista sin buscar.
- El recorte de nombres y tiempos en el detalle público.
- Los buscadores de encima de cada lista: queda uno solo, arriba.

## Qué se prueba

- Un pedido entregado con tareas sin cerrar sale como **Entregado**, no como
  pendiente.
- Un pedido sin entregar con FINALIZAR cerrada sale como **esperando salir**,
  aunque tenga tareas de antes abiertas.
- Un pedido sin entregar sin tarea de finalizar y con una tarea abierta sale
  **en fábrica**.
- Buscar un pedido de 2019 lo encuentra.
- Un pedido entregado cuyo albarán no está enlazado dice «Entregado», sin fecha:
  nunca la solicitada ni la del cierre de tareas haciéndose pasar por ella.
- Una tarea pausada en OLANET sale con el nombre de quien la tiene.
- **Con OLANET caído, la lista carga igual**, sin nombres.
- El detalle público trae nombres y tiempos, y **no** trae notas, causas,
  devoluciones ni marcas de revisión.
- Con sesión y con `COORDINA_LOGIN=off`, la web del equipo no cambia.

## La fecha real de entrega

Sale del **albarán**: `FACDeliveryNoteSL.DeliveryNoteDate`, llegando a él
desde las líneas del pedido por `FACDeliveryNoteLineSL.IDOrderLine`. Si un
pedido salió en varios albaranes, cuenta **el último**: hasta que no sale la
última línea, no está entregado.

Tiene que ser **por línea y no por cabecera**. `FACDeliveryNoteSL.IDOrder`
existe, pero está vacío: 0 pedidos enlazados así en 2025 y en 2026.

Medido contra RPS el 15/09/2026, pedidos con OF ya entregados enteros:

| | Entregados | Con albarán | Sin albarán |
|---|---|---|---|
| 2026 | 4.973 | 4.941 | 32 |
| 2025 | 7.502 | 7.448 | 54 |
| 2020-2024 | 40.433 | 39.790 | 643 |
| Antes de 2020 | 191.899 | 146.970 | 44.929 |

Del 99 % en lo reciente; antes de 2020 los albaranes no se enlazaban. En los
6.116 albaranes de 2026 no hay ni una fecha vacía ni el centinela de 1900 que ya
obligó a filtrar la fecha solicitada.

Cuando no hay albarán, la fila dice **«Entregado» a secas**. Ni la fecha
solicitada ni el cierre de las tareas valen como sustituto: son otra cosa, y
una fecha que no es la de salida engaña más que no poner ninguna.

Ejemplo de por qué importa: SA.26.00927 se pidió para el 11/09 y su albarán es
del 14/09. Con la solicitada, la fila habría dicho que salió a tiempo.

## Para después

**Filtrar por comercial.** Si RPS guarda qué comercial lleva cada pedido, un
filtro «comercial» dejaría a cada uno ver lo suyo sin necesidad de login. No
bloquea nada de lo anterior.
