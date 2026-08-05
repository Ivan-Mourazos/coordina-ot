# Traspasar trabajo entre operarios

Fecha: 2026-08-05 · Acordado con Iván

## El problema

Un pedido a medias no se puede soltar. Si alguien se va de vacaciones con tres OF
empezadas, la única salida es el selector «Asignar autor (pedido entero)» del parte:
todo o nada, sin poder repartir. Y devolverlo a «Sin asignar» no vale, porque esa ruta
resetea las OF a `pendiente` y borra el revisor.

Falta poder decir «esta OF se la queda Tamara y estas dos Alberto», conservando lo ya
fichado.

## Lo que ya funciona y no hay que construir

El tablero **no trabaja con pedidos, trabaja con facets**: `facetsByLoc`
(`Board.tsx`) agrupa las OF de cada pedido por `autorId` y reparte un facet a cada
zona. `PedidoLinea` pinta `facet.ofs`, no `pedido.ofs`.

La consecuencia importante: **en cuanto una OF cambie de autor, aparece sola en el
panel del nuevo, y el anterior sigue viendo el mismo pedido con las que le quedan.**
Sin tocar el tablero. `autorId` ya vive por OF en el modelo.

Los tiempos tampoco necesitan nada: cada intervalo guarda su propio `operarioId`, así
que las horas ya fichadas siguen atribuidas a quien las hizo y suben a OLANET a su
nombre. El que recibe la OF empieza a acumular las suyas cuando fiche.

Lo que falta es solo el mando, y que el cambio se cuente.

## Principio

**El revisor se nombra al mandar a revisar, nunca antes.** Ya está escrito en
`Drawer.tsx`: autor y revisor son chips de solo lectura dentro de la OF. Este trabajo
lo lleva hasta el final y quita el único sitio que se lo salta.

Cambiar un revisor **ya nombrado** no contradice la regla: no es elegirlo antes de
tiempo, es corregir una elección hecha.

## 1. Traspasar la autoría

Cada OF del parte gana un selector **Autor**, donde hoy hay un chip. El de «pedido
entero» sigue arriba, sin cambios.

Solo aparece en las fases donde queda trabajo del autor: `pendiente`, `en_curso` y
`devuelta`. En `por_revisar`, `en_revision` y `aprobada` el trabajo del autor ya
terminó y el chip sigue siendo de solo lectura.

Al cambiar el autor de una OF:

| | |
|---|---|
| Estado | se conserva — llega como estaba, no empieza de cero |
| Tiempos fichados | se conservan, atribuidos a quien los hizo |
| Observación (motivo de devolución) | se conserva |
| Revisor | **se borra**, si lo tenía |
| Fichaje del autor anterior sobre esa OF | **se corta**, con la hora del servidor |

El revisor se borra porque se nombró para el trabajo del autor anterior; el nuevo lo
elegirá cuando mande a revisar. Es la misma regla del principio, y de paso hace
imposible que alguien acabe siendo autor y revisor de la misma OF.

El fichaje se corta porque traspasar es soltar el trabajo: si no, el intervalo sigue
abierto en una OF que ya no es tuya y te suma tiempo hasta que pauses. Es el mismo
`efectoFichaje: "corta"` que ya tienen «Pasar a revisión» y «Volver a pendiente» en
`lib/acciones.ts`.

## 2. Cambiar el revisor

Una OF en `por_revisar` o `en_revision` permite cambiar quién la revisa: cambios de
última hora, alguien que se pone malo, un reparto que no salió.

Si la revisión **ya había empezado** (`en_revision`, con tiempo fichado):

- se corta el fichaje de revisión del anterior, sus minutos quedan guardados a su
  nombre;
- la OF vuelve a `por_revisar`;
- el nuevo arranca cuando pulse «Empezar revisión».

No se deja la OF en `en_revision` esperando: quedaría marcada como «se está revisando»
sin que nadie la esté revisando.

### Lo que desaparece

En la vista Revisión, columna «Por revisar», hay hoy un selector suelto «Asignar…» que
nombra revisor a una OF que no lo tiene. Eso es elegir revisor antes de tiempo y se
quita.

Las OF que lleguen ahí sin revisor —las trae RPS, o el mock— se cogen pulsando
**«Empezar revisión»**: quien la pulsa se pone a sí mismo. Es una cola de la que se
coge trabajo, no un reparto. El resumen de la barra pasa de «N sin revisor asignado» a
«N sin coger».

## 3. Quién puede hacerlo

Cualquiera, sin permisos. Coherente con el modelo sin login de la app: Ángel
reorganiza cuando hace falta y nadie se queda bloqueado porque el dueño de una OF esté
de vacaciones.

Lo que hace que eso sea seguro no es un permiso, es el rastro: **ningún cambio es
silencioso**, y en cada aviso consta quién lo hizo.

## 4. Los avisos

Cada cambio ya se guarda en `acciones_log` (`ts`, `operario_id`, `motivo`, `detalle`).
El traspaso y el cambio de revisor se registran con su propio motivo, y la campana lee
de ahí.

Los avisos van **en las dos direcciones**: al que recibe y al que pierde. Si a Tamara
le quitan una revisión y solo se entera el nuevo, Tamara ve desaparecer algo de su
lista sin saber por qué.

| a quién | qué lee |
|---|---|
| nuevo autor | **Iván te ha pasado** OF-023 · AR.26.05552 |
| autor anterior | **Ángel le ha pasado tu** OF-023 a Tamara |
| nuevo revisor | **Iván te ha puesto a revisar** OF-024 · AR.26.05552 — antes Tamara |
| revisor anterior | **Iván te ha quitado** la revisión de OF-024 · AR.26.05552 — ahora Jaime |

Al autor anterior no se le avisa si el cambio lo hizo él mismo.

Estos son los primeros avisos de la campana que nacen de un **hecho**. Los tres de hoy
(por revisar, devuelta, sin empezar) se deducen mirando el estado actual de la OF; un
traspaso no deja rastro en la OF, así que hay que leerlo del registro. Eso obliga a:

- extender `NotifItem` para admitir avisos con origen en `acciones_log`, no solo
  derivados del estado;
- decidir cuándo se apagan. Se apagan **al abrir el pedido**: el aviso deja de salir
  para ese operario en cuanto lo ha visto en su sitio.

Ventana: solo se leen los movimientos de los últimos 7 días. Un traspaso de hace un mes
ya no es noticia.

## 5. Alcance

Entra:

- selector de autor por OF en el parte, con las reglas de la sección 1;
- cambio de revisor en `por_revisar` y `en_revision`, con las reglas de la sección 2;
- retirada del selector suelto de revisor en la vista Revisión, y autoasignación al
  pulsar «Empezar revisión»;
- cuatro avisos nuevos en la campana, leídos de `acciones_log`, con quién y a quién.

No entra:

- permisos por rol (no los hay en la app, y este trabajo no los introduce);
- traspasar la autoría de OF ya en revisión o aprobadas;
- el menú contextual al hacer clic sobre una fila, aparcado en el rediseño anterior.

## Detalles que el plan debe respetar

**El corte de fichaje lo hace el servidor, no el navegador de quien traspasa.** Hoy
todo el fichaje funciona así: el cliente manda su intención a `/api/fichaje` con SU
`operarioId` y el servidor aplica el motor con su hora. Pero aquí hay que cortar el
fichaje **de otra persona**, que puede estar en otro equipo o con la app cerrada. El
corte tiene que ocurrir en el servidor al registrar el traspaso, leyendo el fichaje del
afectado y reescribiéndolo. `desficharOF` (`Board.tsx`) no sirve tal cual: solo sabe
cortar el intervalo abierto del propio navegador.

**Un intervalo puede llevar varias OF.** Cortar por traspaso de una sola significa
cerrar el intervalo y abrir otro con las que quedan, no borrarlo, o se pierde el tiempo
de las demás. La lógica ya existe en el cliente (`desficharOF` filtra y vuelve a
fichar el resto); hace falta la equivalente en servidor, sobre `lib/fichaje.ts`, que es
puro y ya se usa desde la API.

**Los avisos necesitan saber qué ha visto cada uno.** Se apagan al abrir el pedido, uno
a uno, así que no basta con una marca de «último visto». Hace falta guardar la pareja
(operario, línea de `acciones_log`) ya vista. Tabla nueva con esas dos columnas como
clave primaria; se consulta al construir la lista de la campana.

**Traspaso mientras el otro tiene la app abierta.** El polling repondrá la verdad del
servidor, pero durante unos segundos el autor anterior puede seguir viendo la OF y
pulsar algo sobre ella. La escritura es last-write-wins sobre `of_overlay`, así que no
corrompe nada; el aviso explica lo que pasó.
