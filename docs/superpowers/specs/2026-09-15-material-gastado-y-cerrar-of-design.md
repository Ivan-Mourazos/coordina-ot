# Material gastado, dar por terminada una OF en RPS y recuperar un pedido

Fecha: 2026-09-15 · Rama `tareas-tiempos-equipo`, sobre `7a2fcae`

Fuentes: `.superpowers/sdd/material-gastado.md` (medido contra RPS el 15/09),
`.superpowers/sdd/finalizar-of-olanet.md` y `.superpowers/sdd/recuperar-pedido.md`
(medido contra RPS y OLANET el 15/09). Las referencias al código de esta spec
están comprobadas contra el árbol, no copiadas de los informes.

## Por qué

**Lo que salió del almacén no se ve.** La ficha del Historial enseña el
material asignado en la OF y la reserva que sigue viva. Las dos cosas son
verdad, pero hablan del plan. En las OF entregadas de AR.26, el material
asignado cubre el **32 %** y lo gastado de verdad está apuntado en el **91,6 %**.
Además, el **75 % de lo gastado no estaba asignado**: 21.322 líneas de 28.287.
Es justo lo que hoy no enseña nadie.

**Cerrar una OF suelta obliga a ir a la herramienta vieja.** Hoy el 3 de
OLANET solo sale al pasar el pedido entero (`api/estado/route.ts:144-146`)
o desde el arrastre de pedidos ya pasados (`FasesSinFinalizar`, que solo se
pinta con el pedido completado, `Drawer.tsx:603-607`). Cuando una OF del pedido
tiene que llegar a Producción antes que las demás, no hay puerta.

## Alcance

**Entra:** el botón de material gastado en la ficha del Historial; la acción
«Dar por terminada en RPS» sobre una OF del tablero, con su cajón, su forma de
recuperarla y lo que cambia al pasar el pedido; y volver a traer al panel un
pedido del Historial. Las dos últimas comparten una misma lista en SQLite: las
OF que la web sigue enseñando aunque RPS ya no las traiga.

**No entra:** euros de ningún tipo, una columna de desvío, la consulta sin
login, cerrar varias OF de golpe y tocar RPS para que la vista vuelva a traer
una tarea (bajar el `PercentProgress` o relanzar una OF finalizada).

---

## 1. Material gastado en el Historial

### Decisiones

**Tres fuentes, tres botones, las tres verdad.** Asignado (`CPRMOMaterial`),
reservado (`STKStockReserve`) y gastado (`CPRImputationMaterialMO`) no se
fusionan. No se pueden casar línea a línea: `IDMOMaterial` está vacío en el
**95,4 %** de los apuntes de 2026. Por eso nunca hay columna de «desvío» junto a
lo asignado. Daría a entender una correspondencia que no existe.

**Sin euros.** Material, cantidad gastada, código de artículo y fecha de la
última salida. `CostAmountReal` es coste de almacén, o sea margen, y la ficha no
enseña dinero. La consulta ni siquiera lo pide.

**Agrupado por OF y artículo.** Una línea por material, con la cantidad
sumada. Las devoluciones al almacén entran en la suma: se enseña el **neto**,
y lo devuelto entero (neto cero) no sale. En 2026 hay 76 devoluciones: 59
quedan a cero, 16 en positivo y 1 en negativo. Esa última se enseña con su
signo y la marca «devuelto al almacén». Listar apuntes sueltos enseñaría un
«−1» sin explicación.

**Vacío no es «no se gastó».** Bajo 15 días de antigüedad solo el 46,8 % de
las OF tiene salidas apuntadas, porque el almacén imputa según va saliendo el
material. La ventana vacía dice «Todavía no hay salidas apuntadas».

**Solo el equipo.** La consulta sin login no lo enseña, y no por esconderlo en
pantalla: **el camino del invitado nunca lo lee**. Ver «Cómo».

### Cómo se ve

En la ficha del Historial, dentro de cada OF, en la fila de botones donde hoy
están «🧵 Material» y «📌 Notas de Producción» (`HistorialCentros.tsx:137-149`):

- **«🧵 Asignado  N»**: el botón de hoy, con otro rótulo. Al lado de uno que se
  llama «Gastado», «Material» a secas ya no dice cuál de los dos es. Su ventana
  ya se titula «Asignado en la OF» (`HistorialCentros.tsx:182`).
- **«📦 Gastado  N»**, nuevo. N es el número de materiales distintos. Globo:
  «Material que salió del almacén para esta OF, según RPS.»

El botón de gastado **sale siempre**, también en OF sin material asignado. Hoy
`Materiales` devuelve `null` si no hay asignado ni notas
(`HistorialCentros.tsx:139`), y así se perdería el 57 % de las OF, que tienen
gasto sin nada asignado. Con N = 0 el botón sale apagado de color, pero
pulsable.

La ventana es la misma `VentanaAnclada` de las otras dos:

- Cabecera: **«Salido del almacén»**, con la nota «Última salida 12/09/26».
- Una línea por material: el texto, y a la derecha la cantidad con coma
  decimal («17,7»). Debajo, en pequeño y en gris, el código de artículo, que es
  lo que el almacén reconoce.
- Si el neto es negativo, debajo: «devuelto al almacén».
- Vacía: «Todavía no hay salidas apuntadas para esta OF.» y, en gris, «El
  almacén las apunta según sale el material. Las reparaciones y
  manipulaciones no suelen llevarlo.»
- RPS no contesta: «No se pudo consultar el material gastado.» con «Reintentar».
  El resto de la ficha no se entera.

La descripción puede no coincidir con la del material asignado. Es la del
artículo en el momento de la salida, y en la OF 0232098 se asignó una MASACRIL y
se gastó una RECACRIL. No se corrige: son dos datos distintos y los dos son
verdad.

### Cómo

**Ruta propia:** `GET /api/historial/[pedido]/gastado`, con `soloConSesion`,
como el detalle (`api/historial/[pedido]/route.ts:18`).

Va **aparte del detalle y no dentro de `leerHistorialPedido`**. La consulta
sin login llama a la misma `leerHistorialPedidoDetalle`
(`server/publico-db.ts:220-227`). Metido ahí, cada ficha pública pagaría la
consulta y su seguridad dependería de que la lista blanca de `ofConsulta`
(`lib/publico.ts:201-227`) no lo copiara nunca. En ruta propia, el invitado no
tiene camino para leerlo.

La ficha del Historial pide la ruta **al abrirse**, a la vez que el detalle.
Así cada botón ya lleva su número. Son 16-24 ms por pedido en régimen. Pedirlo
al pulsar ahorraría nada y dejaría todos los botones sin número.

La consulta es la del informe (`material-gastado.md` §4) **sin**
`SUM(CostAmountReal)`. Va por el índice
`IXP_CPRImputationMaterialMO1 (CodCompany, IDManufacturingOrder,
ImputationDate)`, con `HAVING SUM(i.Quantity) <> 0` para esconder lo devuelto
entero y `@pedido` tipado `sql.VarChar(25)`. Sin tipo, el driver lo manda como
`nvarchar` y se pierde el índice, como ya pasó en OLANET: 5.522 ms contra 8 ms.
Devuelve `{ [orden]: [{ material, codigo, gastado, ultimaSalida }] }`.

Las 11 filas con fecha en 2210 no afectan: son de carga antigua y no hay
ninguna en pedidos AR.26. `IsRejectedQuantity` está a 0 en todo 2026 y no se
filtra.

---

## 2. Dar por terminada una OF en RPS

### Decisiones

**Una acción por OF, solo de su autor.** Escribe en el sistema de la fábrica
y le dice a Producción que puede seguir. La máquina de estados lleva meses
cerrando con `soloEl` que alguien decida sobre el trabajo de otro
(`acciones.ts:37-52`). `POST /api/fases` hoy no lo exige: solo pide identidad y
código de RPS (`api/fases/route.ts:71-83`).

**En CoordinaOT la OF queda `aprobada` con una marca «cerrada en RPS».** No hay
estado nuevo. El pedido se sigue pudiendo pasar sin tocar `ofsQueCuentan` ni
`pedidoListoParaPasar` (`fases-tablero.ts:131-133`, `214-237`). La marca es un
dato al lado, como ya lo es `revisada`.

**Se esconde como las detenidas.** Sale de la lista de trabajo y va a un cajón
plegado de la ficha del pedido, con quién la cerró y cuándo. El resto del
pedido sigue en el panel. Cuando todas estén aprobadas y alguien pase el pedido,
salen todas juntas al Historial.

**Y sigue en su cajón aunque RPS la saque de la vista.** La lista de Oficina
Técnica sale de `TGM_PENDIENTE_OT` (`secciones.ts:127`, `rps.ts:777-780`), que
solo trae tareas por debajo del 100 %, y en OT el 100 llega al cerrar la fase
(`recuperar-pedido.md` §2). Una OF cerrada puede irse del pedido en minutos, y
con ella el cajón y «Volver a plantear». Por eso la web **se apunta la OF
cerrada** en la lista de OF retenidas (ver «Cómo») y la suma al tablero aunque
la vista ya no la traiga. Es la misma lista que usa la sección 3: así nunca se
pierde la opción de recuperarla. Sale de la lista cuando se pasa el pedido o
cuando alguien la vuelve a plantear.

**Se puede recuperar.** Vuelve a planteando (`en_curso`) y pierde la marca. En
OLANET no se escribe nada: **la operación se reabre sola con el primer
fichaje**. Fichar emite el estado 1 (`fases.ts:46`), `buscarIdBoletin` no mira
el estado de la fase (`olanet.ts:46`) y `moverFase` hace el `UPDATE` sin
condición (`olanet.ts:163`). Es lo que hacía la herramienta vieja. El apunte
del cierre en `sch_FasesMov` se queda en el histórico de OLANET, y eso no se
borra.

**El tiempo antes que el cierre.** Antes de escribir el 3 se corta el fichaje
de esa OF con la hora del servidor, y sus tramos pendientes tienen que haber
llegado a OLANET. Es el contrato de la cola (`olanet-worker.ts:26-30`): el
tiempo va antes del cambio de estado. Si no se puede garantizar, no se cierra.

**Respeta `modoFichaje()`.** En `sombra` y `ensayo` no se escribe el 3. Es el
mismo criterio que la cola, que descarta en ensayo los movimientos de fase
porque no se pueden neutralizar (`olanet-worker.ts:66-73`). La marca se guarda
igualmente, con el modo en que se hizo, y el distintivo lo dice.

**Al pasar el pedido no se reenvía el cierre.** Hoy `encolarFinalizacion` manda
el 3 de todas las OF del pedido (`api/estado/route.ts:102`, `144-146`). La clave
anti-duplicados lleva la hora dentro (`olanet-outbox.ts:63-65`) y `enviarUno` no
mira el estado previo (`olanet-worker.ts:75-94`). Sin este cambio, cada OF
cerrada dejaría un segundo apunte en `sch_FasesMov`.

**La trampa 2 vs 02: se cierran las dos operaciones de la sección, y se dice
antes.** `unaFilaPorOF` colapsa la orden en una fila (`rps.ts:392-403`, clave
solo por orden). Si la OF tiene dos tareas de la misma sección (la `2` y la
`02`), el panel enseña una y la otra no se ve desde ningún sitio del tablero.
Hay tres salidas posibles:

- *Cerrar solo la de la fila* deja la gemela abierta y sin rastro. Así se
  acumularon las 125 operaciones de arrastre (`fase-pendiente.ts:6-10`).
- *Negarse a cerrar* deja a su autor sin puerta por un defecto del dato de RPS.
  Es lo que ya le pasó a Alberto, que acabó en la herramienta vieja
  (`api/fases/route.ts:100-104`).
- ***Cerrar las dos***, que es lo que se hace. Solo se cierran las de **la
  misma sección**: el filtro por máquina (`esFaseDe`) deja fuera la `2` que en
  AR.26.01829 es de montaje. La OF de la fila es trabajo de ese autor en esa
  sección, y la gemela es la misma tarea duplicada. **La confirmación lo
  enseña antes de pulsar**, con los dos números, así que no se escribe nada
  que el autor no haya leído.

**No se ofrece en una OF detenida.** RPS no acepta dar por terminada una OF
detenida (`fases-tablero.ts:156`), y OLANET ni siquiera tiene cargadas sus
fases (`olanet.ts:32-35`).

**No se ofrece si es la última OF que queda.** Cuando las demás OF del pedido
ya están aprobadas, cerradas, anuladas, detenidas o son de taller, cerrar esta
es pasar el pedido. «Pasar a Producción» ya hace eso, además de sacarlo del
panel. Si se ofreciera aquí, el pedido se quedaría en el panel con la lista
vacía y el rótulo «Ninguna OF de este pedido es trabajo de Oficina Técnica»
(`Drawer.tsx:826-830`). Para una OF sin aprobar, el camino es «Dar por bueno sin
revisión» y después pasar. El caso típico es el pedido de una sola OF.

**Desde qué estados:** `pendiente`, `en_curso`, `devuelta` y `aprobada`. No
desde `por_revisar` ni `en_revision`: ahí la OF está en manos del revisor. Es el
mismo criterio que `recuperar_planteo` (`acciones.ts:151-166`). Primero se
recupera y después se cierra.

### Cómo se ve

**El botón.** «Dar por terminada en RPS», en el cajón «⋯» de la fila de la OF,
dentro de la ficha del pedido. No va suelto: `A_LA_VISTA` se decide por
frecuencia (`acciones.ts:282-299`), y esto se pulsa de higos a brevas. En el
tablero no sale ni en la tarjeta ni en la fila de la lista, igual que anular.

**La confirmación.** Antes de enseñarla se piden a OLANET las operaciones de
esa OF, con el `GET /api/fases?ofs=` que ya existe. Con una operación:

> **Dar por terminada en RPS**
> Producción verá la operación 3 de la OF 0232086 como terminada, con la fecha
> de hoy y a tu nombre. Antes se para el reloj de quien la esté fichando.
> Aquí la OF queda aprobada y se aparta del pedido; lo demás sigue en el panel.
> [Cancelar] [Dar por terminada]

Con la trampa, la segunda frase cambia:

> En RPS esta OF tiene dos operaciones de Oficina Técnica abiertas, la 2 y la
> 02. Se dan por terminadas las dos.

Si esa lectura previa encuentra la operación ya terminada, no se pregunta nada
que no vaya a pasar. La frase dice «En RPS ya está terminada. Aquí la OF queda
aprobada y se aparta del pedido.»

**Después.** La OF sale de la lista de la ficha y del tablero, y aparece el
botón de cajón **«Ver 1 cerrada en RPS»** junto a detenidas, taller y anuladas
(`Drawer.tsx:854-887`). Globo: «Dadas por terminadas en RPS antes de pasar el
pedido. Producción ya las ve terminadas.» Debajo, una línea por OF sin abrir
el cajón, como las anuladas: «0232086 — Iván Sánchez, 15/09/26 11:42».

Dentro del cajón, la fila de la OF lleva el distintivo **«CERRADA EN RPS»** en
lugar de «Aprobada». El globo dice quién y cuándo. Si se hizo en sombra o
ensayo, el distintivo pone **«CERRADA · SIN ESCRIBIR EN RPS»** y el globo
explica el modo.

La fila cerrada **no ofrece fichar**, aunque una OF aprobada normal sí se pueda
fichar (`fichaje.ts:306-308`; ver el comentario en `Board.tsx:1873-1876`).
Fichar reabriría la operación en OLANET y la marca quedaría mintiendo. La única
acción que ofrece es:

**«Volver a plantear»**, con confirmación:

> La OF vuelve a planteando. En RPS sigue terminada hasta que alguien fiche en
> ella: el primer fichaje la reabre. El apunte del cierre se queda en el
> histórico de RPS.

La ofrece **cualquier técnico**, como «Restaurar» en las anuladas
(`acciones.ts:195-197`). Solo escribe en CoordinaOT y devuelve trabajo a la
lista, así que no hace nada irreversible. Tampoco se deja al pedido esperando a
que vuelva su autor. «Reabrir revisión» y «Recuperar para corregir», que hoy
salen en cualquier OF aprobada, **no** salen en una cerrada: llevarían la OF a
otro estado sin quitarle la marca.

**Qué ve cada rol:**

| | Botón «Dar por terminada» | Cajón y distintivo | «Volver a plantear» |
|---|---|---|---|
| Autor de la OF | Sí, en «⋯» | Sí | Sí |
| Otro técnico (revisor incluido) | No sale | Sí, con quién y cuándo | Sí |
| Consulta sin login | — (no ve el tablero) | — | — |

### Qué pasa cuando…

**OLANET no contesta al pedir las operaciones.** No sale la confirmación. Aviso
en la fila: «No se puede hablar con RPS ahora mismo. No se ha cerrado nada.» No
se ha tocado nada, ni siquiera el reloj.

**OLANET se cae entre la confirmación y la escritura.** Se contesta 503, la OF
se queda como estaba y no se guarda la marca. Aviso: «No se ha podido escribir
en RPS. No se ha cerrado nada; el reloj sí se ha parado.» El corte del reloj ya
estaba hecho y no se deshace, igual que en «Pasar a Producción». Volver a
pulsar es seguro.

**Quedan tramos sin subir.** Si después de cortar y drenar sigue en la cola
algún evento de esa orden y operación, se contesta 409 y no se escribe el 3.
Aviso: «Queda tiempo de esta OF por subir a RPS y ahora no entra. No se ha
cerrado nada; el reloj sí se ha parado. Vuelve a probar en unos minutos.» Lo
normal es que la cola esté vacía o casi: el worker pasa cada 60 s
(`olanet-worker.ts:39`).

**Otra persona ya la terminó en OLANET.** Se contesta 200 con `yaEstaba`,
igual que la ruta de hoy (`api/fases/route.ts:140-143`). La marca se guarda
igual y el aviso lo dice sin alarma: «Ya estaba terminada en RPS: la cerró
alguien antes. Queda apartada aquí igual.»

**La operación está eliminada (4) o en un estado desconocido.** Se contesta 409
y no se marca: «RPS ya retiró esta operación; no hay nada que cerrar.» En la
trampa, si la gemela está en 4 se deja y se cierra la de la fila. El aviso nombra
lo que se cerró.

**Se escribe una de las dos gemelas y la otra falla.** La marca se guarda si
la operación **de la fila** quedó en 3, escrita o ya estaba. El aviso dice cuál
no entró: «Se cerró la 02; la 2 no ha podido escribirse. Vuelve a pulsar para
reintentarla.» Pulsar otra vez es idempotente: la cerrada contesta `yaEstaba`.

**Quien pulsa no tiene código de RPS.** Se contesta 400. La acción no se
ofrece a quien no tenga código, y la ruta lo comprueba igual.

**OLANET escribió pero el guardado en CoordinaOT falla.** La operación está en
3 y la OF sin marca. Se registra en el log del servidor. Volver a pulsar lo
arregla, porque la escritura contesta `yaEstaba` y entonces se marca.

**La OF se detiene después de cerrarla.** Sigue en el cajón de cerradas. La
precedencia de `grupoOculto` (`Drawer.tsx:97-106`) queda así: anulada >
cerrada > taller > detenida. Lo que explica que no se trabaje es que se cerró.

**Alguien la ficha desde la herramienta vieja.** OLANET la reabre y CoordinaOT
no se entera: la marca sigue diciendo cerrada. No se vigila. Se nota en la
ficha porque el tiempo sigue creciendo, y se arregla con «Volver a plantear».

**Modo sombra o ensayo.** Se corta el reloj y se guarda la marca con el modo.
No se drena ni se escribe. La cola deja un evento descartado con el motivo
(«ensayo: no se cierra la operación 0232086/3»), visible en `/api/fichaje/cola`.
Al pasar el pedido, **estas OF sí mandan su 3**: nunca llegó a escribirse.

### Cómo

**La acción.** Entrada nueva en `ACCIONES` (`acciones.ts:65-198`) con id
`cerrar_en_rps`:

- `desde: ["pendiente", "en_curso", "devuelta", "aprobada"]`, `requiere` y
  `soloEl: "autor"`, `efectoFichaje: "corta"`, `destino: "aprobada"`.
- No se ofrece si la OF está detenida, ya lleva la marca o es la última que
  queda. Las dos primeras se miran en `accionesDisponibles`; la tercera, en el
  Drawer, que tiene el pedido.

Y `volver_a_plantear`: `desde: ["aprobada"]`, solo con marca y
`destino: "en_curso"`. Con marca puesta se quitan `reabrir` y
`recuperar_aprobada`.

A diferencia de las demás acciones, **el Board no la guarda con
`/api/estado`**. Llama a la ruta nueva, que hace todo en el servidor. La OF
solo cambia en pantalla cuando llega la respuesta, porque un cambio optimista
que luego falla dejaría la OF apartada sin haberse cerrado.

**La ruta:** `POST /api/fases/cerrar-of`, con `{ ofId }`. En este orden:

1. `identidad(req, …, "tecnico")` y código de RPS
   (`api/fases/route.ts:71-83`).
2. Se relee el tablero con su overlay, como hace `/api/estado`
   (`api/estado/route.ts:85-88`). Se comprueba que la OF existe, que su autor es
   quien llama (403), que el estado está en `desde`, y que no está detenida, ni
   marcada, ni es la última que queda (409).
3. Se corta el fichaje: `cortarFichajeDeOF(ofId, ahora)`
   (`fichaje-db.ts:212-236`), que ya encola los tramos cerrados.
4. Si el modo no es `activo`: evento descartado, marca con el modo, paso 7.
5. Se drena la cola: `drenarCola()` en orden, y después se comprueba que no
   quede pendiente ningún evento de esa orden y operación.
6. Se leen las operaciones de la orden (`fasesDeOFs`), se filtran con
   `finalizables(fases, seccion)` y, por cada una, se hace lo que hoy hace el
   `POST` de `/api/fases`: releer máquina y estado, rebuscar el boletín si se
   quedó viejo, 403 si no es de la sección, `yaEstaba` si ya está en 3, y
   `moverFase(3)` con la fecha de hoy.
7. `guardarMutacion` con el cambio a `aprobada`, la marca y el motivo
   `cerrar_en_rps`. El motivo se añade a `cierraRevision`
   (`estado-db.ts:1096-1106`).

La respuesta dice qué pasó con cada operación.

**Lo que se comparte con `/api/fases`.** El paso 6 se saca del `POST` actual
(`api/fases/route.ts:90-159`) a una función de servidor, y las dos rutas la
usan. `moverFase` y `olanet.ts` no se tocan.

**El candado de la cola.** `drenarCola` no tiene candado: `corriendo` protege
`vuelta` (`olanet-worker.ts:49`, `222`), no la función. Si la ruta la llama
mientras corre el temporizador, un evento puede salir dos veces. El candado
**baja a `drenarCola`**, y quien llega con otra pasada en curso espera a que
termine y vuelve a mirar. No se salta la pasada.

**La marca.** Tres columnas nuevas en `of_overlay`: `cerrada_rps_at`,
`cerrada_rps_por` y `cerrada_rps_modo`. Viajan en `CambioOF` y `aplicarOverlay`
las copia a `OF.cerradaRps`. «Volver a plantear» las pone a `NULL`, y
`acciones_log` conserva quién cerró y quién la devolvió.

**La lista de OF retenidas.** Tabla nueva `of_retenida`, compartida con la
sección 3: `of_id` (la clave `orden:tarea` del tablero, `rps.ts:1179`),
`pedido`, `seccion`, `motivo` (`cerrada`, `recuperada` o `del_pedido`), `por` y
`at`. El paso 7 de la ruta añade la fila `cerrada` en la misma transacción que
la marca, y «Volver a plantear» la borra. `filasDeLaSeccion` (`rps.ts:773-790`)
suma las de la sección a lo que traen la vista u OLANET:
`filasPorFase(pool, seccion, [...pares, ...retenidas])`. `filasPorFase`
(`rps.ts:714-765`) ya ignora el `PercentProgress` y la situación, así que trae
los datos del pedido aunque la tarea esté al 100 %. Se quitan duplicados por
`claveFase` antes de llamar.

**El tablero.** En `facetsByLoc` (`Board.tsx:722-729`) la cerrada se salta
como la anulada, y lo mismo en la Lista y en «Mi fichaje». En el Drawer entra
un cuarto grupo, `"cerrada"`, en `GRUPOS`. `ofsFichables` las excluye.

**Al pasar el pedido** (`api/estado/route.ts:102`, `144-146`):
- `ofIdsPedido` **las sigue incluyendo**. Es la lista que se guarda como
  «OF que se pasaron», y `aplicarOverlay` reabre el pedido si le aparece una OF
  que no estaba en esa lista (`overlay.ts:101-108`). Quitarlas lo reabriría al
  momento.
- Solo a `encolarFinalizacion` se le quitan las marcadas con modo `activo`.
- `guardarMutacion`, cuando lleva `completarPedidoId`, borra en la misma
  transacción las filas de `of_retenida` de ese pedido y sección. Desde ese
  momento el pedido depende otra vez solo de RPS, que es lo que tiene que pasar.

### Ensayo antes de producción

No hay forma neutra de escribir un 3 (R4 del informe), así que el ensayo se
hace sobre algo real:

1. **Tests**, que son la red de verdad (ver «Qué se prueba»).
2. **En local, en `sombra`**: pantalla, permisos, cajón, marca y recuperación.
3. **Avisar a David/IT** antes del primer 3 desde el tablero, como se hizo con
   el fichaje, y dejar el interruptor documentado en `MANUAL-IT.md`.
4. **Contra el servidor real, con un script sobre una operación ya muerta** de
   las de arrastre de 2020-2024, casi todas de urgencias (`U-A-OTEC`) y en
   pedidos entregados hace años. Cerrarlas hay que cerrarlas igual, y en
   Producción nadie espera ese aviso. El script llama a la función de servidor
   del paso 6, la misma que usan las dos rutas, con David/IT avisados antes.
   Comprobar en `scg_Fases` y `sch_FasesMov` un solo movimiento a 3, con la
   fecha y el operario, y que una segunda llamada contesta `yaEstaba` sin
   escribir otro.

   **Esto no prueba el botón ni el corte del fichaje.** Esas operaciones son de
   pedidos pasados hace años: no están en el tablero, no tienen autor y nadie
   las ficha. El orden corte → drenado → 3, los permisos y lo que pasa al pasar
   el pedido los cubren los tests. El primer uso del botón sobre una OF viva ya
   es real.

---

## 3. Recuperar un pedido del Historial

### Lo medido

**Un pedido recuperado no vuelve al tablero solo.** En 20 pedidos recientes del
Historial, sus 47 tareas de OT están al 100 % y `TGM_PENDIENTE_OT` las deja
fuera. Fichar no baja ese 100: solo baja si alguien edita la tarea en RPS, y la
herramienta vieja tampoco lo hacía (`recuperar-pedido.md` §2 y §4). El overlay
ya sabe reabrir un pedido pasado (`reabiertoPor`, `overlay.ts:101-108`), pero
solo si el pedido llega en el tablero base.

**Nada impide fichar sobre una fase en 3.** `POST /api/fichaje` no mira el
estado, `buscarIdBoletin` tampoco, y `moverFase` escribe el 1 a pelo. Las 47
tareas admiten imputaciones. 7 de los 20 pedidos ya estaban entregados.

### Decisiones

**Se puede recuperar aunque el pedido ya se haya entregado.** A veces algo fue
mal y se corrige el planteamiento para dejarlo bien, y eso no es un pedido
nuevo: es el mismo. La confirmación dice que ya se entregó, pero no lo impide.

**La web recuerda el pedido mientras no se vuelva a pasar.** Sus OF entran en
`of_retenida` (sección 2, «Cómo») y `filasDeLaSeccion` las suma al tablero
aunque la vista no las traiga. Al volver a pasarlo salen de la lista, se
escribe otra vez el 3 y el pedido vuelve al Historial como cualquier otro. No
se pide a planificación que baje el porcentaje en RPS: dependería de un gesto
a mano en otro sistema.

**Vuelve el pedido entero; se reabren las OF que se marquen.** Producción
recibe el pedido completo, y el permiso para pasar se decide sobre el pedido
(`pedidoListoParaPasar`, `fases-tablero.ts:214-237`, que exige aprobadas todas
las `ofsQueCuentan`). Traer una OF suelta dejaría en el panel un pedido de una
sola OF, que no es lo que hay, y la regla de «la última que queda» de la
sección 2 se equivocaría. Pero reabrirlas todas tampoco: cada OF en la que se
fiche vuelve a salir «empezada» en el taller, y lo normal es que se corrija una.

Así que vuelven todas las OF de OT del pedido, y en la confirmación cada una
lleva su casilla. **Por defecto van todas marcadas**: es lo que se entiende por
«recuperar el pedido», y quien sabe cuál hay que corregir desmarca el resto.
Hace falta al menos una marcada.

**Qué OF vuelven.** Las de la última vez que se pasó, que ya están guardadas:
`pedido_paso_seccion.of_ids` (`estado-db.ts:337-342`, rellenado con
`ofIdsPedido`, `api/estado/route.ts:102`). Esa lista ya deja fuera las
anuladas, las de taller y las detenidas. Si el pedido se pasó antes de que se
guardara, o desde la herramienta vieja, no hay lista, y se sacan de RPS: las
tareas de la sección de las OF del pedido, sin las de taller. Es el `SELECT` de
`filasPorFase` sin su último filtro, que ya trae todas las fases de la sección
de esas órdenes (`rps.ts:761-764`).

**Qué estado toma cada OF en CoordinaOT:**

| OF | Estado | Autor y revisor | En `of_retenida` |
|---|---|---|---|
| Marcada, con fila en el overlay | `en_curso` | Los que tenía. `revisada` no se apaga | `recuperada` |
| Marcada, sin fila (pasada fuera de CoordinaOT) | `en_curso` | Autor: quien recupera. Revisor: nadie | `recuperada` |
| Sin marcar, con fila en el overlay | Sigue `aprobada` | Los que tenía | `del_pedido` |
| Sin marcar, sin fila | `aprobada` (se crea la fila) | Autor: el que deduce RPS. Revisor: nadie | `del_pedido` |
| Anulada o de taller | No vuelve | — | — |

Es lo mismo que hace «Recuperar para corregir» con una OF aprobada
(`acciones.ts:181-183`): vuelve al planteo con el mismo revisor nombrado, y al
mandarla otra vez entra en «Por revisar». Con `en_curso`, `aplicarOverlay` la
cuenta en `reabiertoPor`, el pedido sale `procesado` y el tablero lo enseña
(`Board.tsx:644-647`). La marca de pasado no se borra: la regla que ya existe lo
reabre.

Las dos filas «sin fila» no son un detalle. Una OF sin overlay llega de RPS en
`en_curso` si tiene tiempo (`rps.ts:645`), así que una sin marcar bloquearía el
pedido para siempre. Y una marcada sin autor encendería el aviso «OF nueva»
(`avisaDeOFNueva`, `fases-tablero.ts:325-328`) y nadie podría pasar el pedido,
porque `puedePasarAProduccion` pide un autor (`fases-tablero.ts:204-210`). Quien
recupera es quien va a corregir, así que queda de autor.

**Lo recupera cualquier técnico.** Como «Volver a plantear» una OF cerrada
(sección 2): solo escribe en CoordinaOT, no hace nada irreversible y no deja el
pedido esperando a que vuelva su autor. La consulta sin login no ve el botón,
y la ruta pide sesión igual que el resto del Historial.

**En OLANET no se escribe nada al recuperar.** El primer fichaje en una OF
recuperada escribe el 1 (`fases.ts:46`) y al parar el 2. Desde ese momento, y
hasta que se vuelva a pasar el pedido, **el taller ve la operación de OT
empezada**. Es verdad: se está volviendo a plantear. Una OF marcada en la que
nadie ficha sigue en 3 para Producción.

### Cómo se ve

**El botón.** En la ficha del Historial, en el mismo bloque de acciones que
`FasesSinFinalizar` (`HistorialDrawer.tsx:233-237`), que hoy es lo único que se
puede hacer desde ahí. Botón neutro **«Volver a plantear el pedido»**, el mismo
verbo que la sección 2. Solo sale si el pedido no está ya en el panel
(`!detalle.estadoActual`, que es lo mismo que decide `FasesSinFinalizar`).

**La confirmación.** Antes de enseñarla se pide
`GET /api/historial/[pedido]/recuperar`, que devuelve las OF que volverían,
si RPS deja fichar en cada una y si el pedido ya se entregó (el índice del
Historial lo sabe: `pendienteEntrega` y `fechaEntregado`,
`server/historial-indice.ts:128-132`).

> **Volver a plantear AR.26.04351**
> Este pedido ya se entregó al cliente el 12/09/26.
> El pedido vuelve al panel y las OF marcadas vuelven a planteando, con su
> autor y su revisor de antes. Las demás vuelven aprobadas, para que se vea el
> pedido entero.
> ☑ 0232086 — Toldo cofre, Iván Sánchez
> ☑ 0232087 — Pérgola, Tamara
> En RPS siguen terminadas. En cuanto alguien fiche en una, Producción la verá
> empezada hasta que se vuelva a pasar el pedido.
> [Cancelar] [Volver a plantear]

La línea de la entrega solo sale si ya se entregó. Una OF sin autor registrado
dice «sin autor: quedarás tú». Una OF en la que RPS no deja fichar lleva debajo,
en ámbar: **«RPS no deja fichar en esta OF (FINALIZADA). Si hay que echarle
tiempo, pide a Producción que la vuelva a lanzar.»**

**Después.** La ficha dice «Vuelve al panel en cuanto se refresque» y se cierra.
En el panel, el pedido sale en su columna como cualquier otro, sin chip de
«OF nueva» (todas tienen autor). En la fila de cada OF recuperada, el globo del
estado dice «Recuperada del Historial por Iván Sánchez el 15/09/26».

### Qué pasa cuando…

**La OF está FINALIZADA en RPS.** No se puede fichar y la web no lo arregla: el
usuario de RPS es de lectura. Se avisa dos veces, en la confirmación (arriba) y
en la tarjeta, con el motivo que ya existe: «La situación en RPS no admite
fichar (el tiempo no subiría)» (`fichaje.ts:311-316`). No bloquea: se puede
recuperar para corregir documentos o el planteo sin echar tiempo. En la muestra
del último mes no hubo ninguna; en pedidos más viejos o tocados por un cierre
masivo será lo normal.

**Dos personas recuperan a la vez, o se pulsa dos veces.** Hasta que se
refresca el tablero, el pedido sigue en el Historial y el botón sigue saliendo.
La ruta mira `of_retenida`: si el pedido ya tiene filas `recuperada`, contesta
200 con `yaEstaba` y no toca nada. No pisa lo que la primera persona ya haya
empezado. El aviso: «Ya lo había vuelto a plantear Tamara.»

**Se recupera un pedido que ya se recuperó y se volvió a pasar.** Es como la
primera vez: al pasarlo se borraron sus filas. `acciones_log` guarda las dos
vueltas.

**Alguien pasa el pedido sin tocar nada.** No puede sin más: las OF marcadas
están en `en_curso` y `pedidoListoParaPasar` pide todas aprobadas. Su autor
tiene que aprobarlas: «Dar por corregida» si ya se revisaron alguna vez, «Dar
por bueno sin revisión» si no (`acciones.ts:102-138`). Es también el camino para
deshacer una recuperación por error; no hay botón aparte. Al pasar, se manda el
3 solo de las `recuperada`. Si nadie fichó en una, su fase sigue en 3 y el 3
nuevo deja un segundo apunte en `sch_FasesMov` (ver «A confirmar»).

**La lista, al pasar el pedido.** `guardarMutacion` borra en la misma
transacción todas las filas del pedido y la sección, sea cual sea el motivo. El
pedido vuelve a depender solo de RPS: sus tareas siguen al 100 %, la vista no lo
trae y sale en el Historial (`historial-finalizacion-sql.ts:11-13`). Mientras
estuvo en el panel, el Historial ya lo quitaba solo (`api/historial/route.ts:44-45`).

**Una OF recuperada se detiene en RPS.** Sale como las detenidas, en su cajón.
Si es la única marcada, el pedido queda parado y no se puede pasar
(`fases-tablero.ts:229-235`), igual que cualquier pedido del panel.

**RPS no contesta al preparar la confirmación.** No sale la confirmación:
«No se puede consultar RPS ahora mismo. No se ha tocado nada.»

**En Diseño.** Vale igual: `filasDeLaSeccion` suma las retenidas en las dos
ramas. En Diseño, en cuanto se fiche, la fase pasa a 1 y OLANET ya la traería
sola; la fila de la lista no estorba.

### Cómo

**La ruta:** `POST /api/historial/[pedido]/recuperar`, con
`{ seccion, ofIds }` (las marcadas). `GET` en la misma ruta prepara la
confirmación. En este orden:

1. `identidad(req, …, "tecnico")`.
2. Se relee el tablero con su overlay. Si el pedido ya está en el panel y no
   `completado`, 409: «Este pedido ya está en el panel.» Si ya tiene filas
   `recuperada`, 200 con `yaEstaba`.
3. Se sacan las OF que vuelven (`of_ids` del último paso o, sin él, RPS) y se
   comprueba que las marcadas están entre ellas y que hay al menos una.
4. En una transacción: `guardarMutacion` con los cambios de la tabla de arriba y
   el motivo `recuperar_pedido`, y las filas de `of_retenida`.
5. Se invalida la caché del tablero de la sección y se lanza el refresco sin
   esperarlo (`refrescarTablero`, `rps.ts:1251-1264`). La consulta tarda de 7 a
   15 s y no puede colgar la respuesta.

**Al pasar el pedido** (`api/estado/route.ts:102`, `144-146`), además de lo de
la sección 2: a `encolarFinalizacion` se le quitan las `del_pedido`. Así un
pedido recuperado solo manda el 3 de lo que se reabrió, más cualquier OF que no
estuviera en el paso anterior. `ofIdsPedido` las sigue incluyendo todas, por lo
mismo que en la sección 2 (`overlay.ts:101-108`).

---

## Qué se prueba

**Material gastado**
- Una OF con salidas y una devolución parcial enseña el neto. Lo devuelto
  entero no sale. Un neto negativo sale con signo y con «devuelto al almacén».
- Una OF sin salidas dice «Todavía no hay salidas apuntadas», nunca «no se
  gastó material».
- El botón sale en una OF sin material asignado.
- La respuesta de la ruta no trae ningún campo de coste.
- Sin sesión, `GET /api/historial/[pedido]/gastado` contesta como el detalle
  (`soloConSesion`). El detalle público (`detalleConsulta`) no trae material
  gastado, y la consulta sin login no llama a la ruta.
- El parámetro va como `VarChar(25)`, comprobado en el test de la consulta.

**Dar por terminada en RPS**
- Solo el autor la ve. Otro técnico no, y la ruta le contesta 403.
- No se ofrece en una OF detenida, en `por_revisar`, en `en_revision`, en una ya
  marcada ni cuando es la última que queda. La ruta rechaza los mismos casos.
- **El corte va antes que el 3.** Con un intervalo abierto sobre la OF, la cola
  queda con los tramos antes que el movimiento de fase, y `moverFase` se
  llama después de drenarlos.
- Con un tramo que no entra (OLANET falla en el bono), la ruta contesta 409,
  `moverFase` no se llama y la OF no queda marcada.
- En `sombra` y `ensayo` no se llama a `moverFase`, se guarda la marca con el
  modo y queda el evento descartado.
- Con la operación ya en 3 contesta `yaEstaba`, marca y no escribe.
- Con la trampa 2/02 de la misma sección se cierran las dos. Si la `2` es de
  montaje, solo se cierra la `02`.
- Pasar un pedido con una OF cerrada en `activo` no encola su 3, la mantiene en
  la lista de OF pasadas y el pedido no se reabre. Con la OF cerrada en
  `ensayo`, sí encola su 3.
- «Volver a plantear» la deja en `en_curso`, sin marca, fuera del cajón y otra
  vez fichable. No escribe nada en OLANET.
- `drenarCola` llamada dos veces a la vez no envía un evento dos veces.
- Una OF cerrada sigue en el tablero, en su cajón, aunque la vista ya no la
  traiga. Al pasar el pedido o al volver a plantearla sale de `of_retenida`.
- Siguen pasando los seis casos de `api-fases.test.ts` que comprueban que no se
  escribe (`src/lib/__tests__/api-fases.test.ts`).

**Recuperar un pedido**
- Con la vista sin ninguna de sus tareas, un pedido recuperado sale en el
  tablero: `procesado`, con `reabiertoPor` y sin aviso de «OF nueva».
- Las marcadas quedan en `en_curso` con el autor y el revisor de antes y
  `revisada` intacta; las sin marcar siguen `aprobada`.
- Una OF sin fila en el overlay: marcada, queda de autor quien recupera; sin
  marcar, queda `aprobada` y no bloquea el pedido.
- Sin `of_ids` guardados, las OF salen de RPS y no entran las de taller. Con
  ellos, no vuelven anuladas, de taller ni detenidas.
- Un pedido entregado se recupera igual y la confirmación lo dice.
- Una OF FINALIZADA se recupera, sale no fichable y la confirmación lo avisa.
- Recuperar dos veces contesta `yaEstaba` y no cambia ningún estado. Un pedido
  que está en el panel contesta 409.
- La ruta no escribe nada en OLANET (sin eventos en la cola).
- El pedido no se puede pasar hasta aprobar las marcadas. Al pasarlo, solo se
  encola el 3 de las `recuperada`, se borran todas sus filas de `of_retenida`
  y el pedido sale del tablero base.
- Recuperado, pasado y recuperado otra vez funciona como la primera vez.
- Sin sesión, las dos rutas contestan como el detalle del Historial.

## Para después

**Pasar a Producción también deja la gemela abierta.** `eventosFinalizacion`
emite un 3 por `(orden, operación)` de la fila (`fases.ts:57-72`), así que
un pedido con la trampa 2/02 se pasa con una de las dos abierta. La función del
paso 6 sirve igual para la cola.

**Cerrar varias de golpe.** Si se usa más de lo previsto, un «Dar por
terminadas las N» en el bloque del pedido, como «Aprobar las N».

**Avisar cuando la herramienta vieja reabre una cerrada.** Comparar la marca
con el estado de OLANET en la misma consulta por página que ya trae quién tiene
cada tarea.

## Confirmado con Iván (15/09/2026)

1. **`POST /api/fases` respeta también `modoFichaje()`.** Al compartir la
   función con la ruta nueva, en `sombra` y `ensayo` el arrastre tampoco
   escribe en OLANET. Con el servidor en `activo` no cambia nada. La regla de
   autor no aplica ahí, porque el pedido ya está pasado.

2. **No se escribe un 3 sobre una fase que ya está en 3.** `enviarUno`
   (`olanet-worker.ts:75-94`) lee el estado de la fase antes de mandar un
   movimiento de finalización y, si ya está terminada, lo da por enviado sin
   escribir. Evita el segundo apunte en `sch_FasesMov` al volver a pasar un
   pedido recuperado, y arregla de paso lo que ya pasa hoy con los pedidos
   reabiertos por una OF nueva. Cuesta una consulta por evento de fase.

3. **Sección 3, tal como está escrita:**
   - Vuelve el pedido entero y se eligen qué OF se reabren, **todas marcadas
     por defecto**.
   - **Lo recupera cualquier técnico**, igual que «Volver a plantear» una OF
     cerrada. Para volver a pasarlo sí hace falta autor.
   - Una OF sin autor registrado queda a nombre de quien recupera.
   - Las anuladas y las de taller no vuelven.
   - Una OF FINALIZADA en RPS se deja recuperar, con aviso, aunque no se pueda
     fichar.
   - No hay botón para deshacer la recuperación: se aprueban las OF y se
     vuelve a pasar el pedido.
