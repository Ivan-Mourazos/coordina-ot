# El login (y la consulta sin login): cómo se despliega y cómo se enciende

Son **dos días distintos**, y confundirlos es lo único que puede salir mal
aquí. El login y la consulta sin login —la fase 2, ver «La consulta sin
login» al final— se despliegan y se encienden JUNTOS, con la misma variable:
no hay un tercer día que planificar aparte.

---

## Día 1 — subir el código (el login APAGADO)

Esto no cambia nada para el equipo. `COORDINA_LOGIN` no está puesta, o está a
`off`, y todo el mundo sigue entrando como siempre: elige su cara y adentro.

1. Desplegar como cualquier otra versión.
2. **Backup de `data/coordina.db` antes de arrancar** (`pnpm backup`): la
   migración 7 crea la tabla `persona`. Es la práctica de siempre, y aquí más.
3. Después de arrancar, comprobar dos cosas:
   - `PRAGMA user_version` en `data/coordina.db` es **al menos 7**. Producción ya tiene la **8**, verificada el 10/09/2026; no bajar la versión.
   - La web se ve exactamente igual que ayer. Si sale una pantalla de PIN, la
     variable está encendida y no debería.

**Nada está protegido todavía.** El servidor sigue creyéndose el `operarioId`
que le manda el navegador, igual que siempre. Lo único que cambia es que la
maquinaria está puesta y probada.

---

## Día 2 — encenderlo

Aquí sí lo nota todo el mundo: **todos los navegadores del equipo pierden su
identidad guardada** y se encuentran la pantalla del PIN. No es un fallo, es el
cambio.

### Qué cierra esto, y qué no

Esta vez sí se cuenta como "la web queda cerrada" para quien no tiene sesión.
Lo que el login cierra son las ESCRITURAS (fichar, aprobar, devolver, notar,
marcar una revisión…) **y ahora también las lecturas del equipo**: eso era la
fase 2, y ya no está aplazada — se construyó en esta rama y se enciende con
la misma variable que el login (detalle completo en «La consulta sin login»,
al final de este documento).

Verificado contra RPS el 14-15/09/2026, sin sesión: **401** en las doce rutas
internas —historial, clientes, métricas, buscador, notas recientes, tablero,
visitas, novedades, avisos, causas, fases y el PDF del equipo—. Siguen en
**200**, a propósito: las cinco rutas de la consulta pública, más `sesion`,
`personas` y `health` (ocho en total).

Alguien de la red interna sin PIN ya **no** lee el tablero ni las notas del
equipo el día después de encenderlo. Lo que sí ve —porque es la otra mitad de
este mismo cambio, no un descuido— es una consulta de solo lectura pensada
para el resto de la casa (comercial, administración, taller): por dónde va
cada pedido, sin una sola nota ni causa de devolución. Se explica entera más
abajo.

### Antes

1. **Avisar al equipo el día anterior.** El mensaje es corto: "mañana la web te
   va a pedir un PIN; es tu extensión, y la primera vez te la pide dos veces".
2. **Tener a mano la lista de extensiones.** Quien no se acuerde de la suya se
   queda fuera de su herramienta de trabajo hasta que alguien se la diga.
3. **Generar el secreto EN el servidor** y ponerlo en su `.env`. Sin él la
   app no arranca con el login encendido. No reutilizar el de desarrollo:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
4. Otro backup. Encender no migra nada, pero es el día de tocar producción.

### Encender

En `/webs/coordina-ot/.env` del servidor (en desarrollo se usa `.env.local`):

```
COORDINA_LOGIN=activo
COORDINA_SESION_SECRET=<lo generado en el paso 3>
```

y reiniciar el proceso. **No hay que desplegar código.**

### Ángel entra el primero

Mientras una persona no tenga PIN puesto, cualquiera de la red puede ponérselo
y entrar como ella: el primer PIN que se teclea para un nombre se acepta como
bueno, quien lo teclee. Ángel es la ÚNICA cuenta activa con rol de supervisor,
o sea la única que puede reiniciarle el PIN a alguien: si alguien se quedara
con su identidad, controlaría después quién recupera su cuenta, y no habría
forma de deshacerlo desde el menú.

Por eso, nada más reiniciar el proceso y ANTES de avisar al resto del equipo
de que ya pueden entrar: que Ángel entre, elija su PIN y lo compruebe. Solo
entonces se abre paso a los demás.

### Comprobar, en este orden

1. La pantalla de PIN sale.
2. Ángel entra (ver arriba) y el tablero le sale bien.
3. En las herramientas del navegador, Aplicación → Cookies: `coordina_sesion`
   con **HttpOnly marcado**. Si `document.cookie` la enseña desde la consola,
   algo se hizo mal y el login no protege nada.
4. El menú de arriba a la derecha dice **Salir**, no "Cambiar".

### Si algo va mal

Quitar `COORDINA_LOGIN` (o ponerla a `off`) y reiniciar. Vuelve a estar como
antes en un minuto, y nadie pierde nada: los ids de las personas son los de
siempre, así que todo lo que se guardó con el login encendido sigue siendo suyo.

### Las novedades, ese día

El log de novedades sale de los mensajes de commit, y los commits del login y
de la consulta se hicieron **sin** línea `Novedad:` a propósito: el día que se
subió el código no le cambió nada a nadie. El día que se enciende sí, a las
dos cosas a la vez. Poner estas líneas en el commit que cambie la
configuración, y pasar `pnpm novedades`:

    Novedad: nuevo | Ahora entras con un PIN
    Detalle: Eliges tu nombre como siempre y tecleas los cuatro números de tu extensión. La primera vez te los pide dos veces, para que no se cuele una errata. Cuando termines, en el menú de arriba a la derecha tienes Salir.
    Novedad: arreglado | Lo que escribías podía firmarlo otro
    Detalle: Hasta ahora el nombre viajaba desde el navegador y se podía cambiar. Ahora lo pone el servidor: lo que fichas, apruebas o escribes queda a tu nombre y solo al tuyo.
    Novedad: nuevo | El resto de la casa ya puede seguir un pedido sin llamarte
    Detalle: Comercial, administración y taller tienen ahora su propia consulta, de solo lectura, con los pedidos pendientes, los terminados y las visitas con OT. No ven tus notas ni las causas de una devolución: eso lo seguimos escribiendo solo para nosotros. Si entras a la web sin tu PIN, es esa consulta lo que verás en vez del tablero.

### Encender con el equipo delante, y repasar después

Encender la variable un rato antes de que llegue nadie, para "probarlo en
frío", es tentador y es un error: cada cuenta sin PIN es una cuenta libre
hasta que su dueño la reclama, así que cuanto más tiempo pase encendido sin
gente delante tecleando su PIN, más tiempo queda esa puerta abierta sin nadie
vigilándola. Enciéndelo con el equipo ya sentado y avisado, para que cada uno
reclame la suya en cuanto pueda.

Al rato de encenderlo, repasar que no quede nadie sin PIN puesto: el propio
menú de "PIN olvidado" (el que usa Ángel para resetear) marca "sin PIN" junto
al nombre de quien todavía no lo ha puesto, así que mirarlo es cosa de abrir
ese menú. A quien esté de vacaciones o de baja ese día, avisarle para que lo
ponga en cuanto pueda, o esperar a que vuelva: mientras no lo tenga, su cuenta
sigue reclamable por cualquiera de la red, igual que la de Ángel al principio.

### Después

Ángel es el único con rol de supervisor: si alguien se atasca, él le resetea el
PIN desde el menú.

---

## La consulta sin login (fase 2)

Ya no está aplazada: se construyó en esta misma rama, por encima de este
documento, y comparte AL MILÍMETRO el despliegue del login. Se sube apagada
el Día 1, se enciende con la misma `COORDINA_LOGIN=activo` el Día 2, y si algo
va mal se apaga con la misma variable del apartado «Si algo va mal» de arriba.
No hay un segundo interruptor que recordar.

### Qué ve quien no tiene sesión

En vez del tablero del equipo, dos pestañas de solo lectura pensadas para el
resto de la casa —comercial, administración, taller—, que hoy hace esta
pregunta por teléfono porque la web no se la contestaba:

- **Pedidos** — se entra buscando: pedido, cliente, obra u OF, de cualquier
  año y esté como esté. Sin buscar, lo que se entrega hoy y los catorce días
  siguientes, en una tarjeta por día. Filtros de estado (fuera de plazo, en
  fábrica, esperando salir, entregados), paso, familia y fechas. Cada fila
  dice dónde está el pedido y quién lo tiene; al abrirla, las tareas con sus
  tiempos y quién las hizo, y los documentos de RPS.
- **Consultas con OT** — el calendario de visitas, sin los botones de crear,
  editar ni cerrar. El buscador de arriba vale también para esta pestaña.

Pendiente quiere decir **sin entregar**: lo que ya salió está rematado, tenga
las tareas que tenga abiertas en RPS. La fecha de salida es la del albarán; sin
albarán enlazado, la fila dice «Entregado» a secas y no se inventa otra fecha.

Lo que NO enseña, en ninguna pestaña: las notas del pedido, las notas de
producción, la nota de devolución, las causas de rechazo ni las marcas del
parte revisado. Eso se escribe entre nosotros para trabajar, y no cambia porque
ahora lo pueda leer cualquiera de la casa.

### Verificado contra RPS y OLANET (15/09/2026)

- Pendientes en toda la casa: **585** — 396 en fábrica y 189 esperando salir.
- Entregados de 2026: **4.974**, y solo **34** sin albarán enlazado.
- La lista en memoria se construye en **45 s** (los albaranes se agrupan de una
  vez; preguntándolos línea a línea eran 97 s).
- Saber dónde está un pedido y quién lo tiene: **menos de 2 s** con las
  conexiones abiertas. Con OLANET caído la lista carga igual, sin nombres.

### El orden importa

Encender el login SIN esto construido deja a la casa fuera de una web que
antes veían entera: hasta ayer, cualquiera de la red leía el tablero sin PIN;
con el login solo, esa misma persona se encontraría un 401 y ninguna otra
puerta. Y encender esto SIN el login no tiene manera de saber quién pregunta,
así que no habría forma de decidir quién es "el equipo" y quién "la casa" —
tendría que enseñárselo a todo el mundo, PIN o no.

Por eso van con la misma variable: el día que se enciende `COORDINA_LOGIN`,
las dos cosas cambian a la vez. No hay un orden que elegir entre ellas porque
no son dos pasos: son un solo interruptor.

---

## Lo que NO entra en esta versión

La vista de supervisión de Cris, Carlos y Esteban (fase 3): el corte por
técnico y fechas, y las causas de rechazo del equipo, sin nombres. Sigue
aplazada por el mismo motivo de siempre — hay que saber qué preguntas quieren
contestar, para no construir una pantalla que se mire una vez. Sus filas
están sembradas en la tabla con `activo = 0`, y migrar no hace falta: los
datos ya están.

**Pero ojo, activarla (`activo = 1`) NO basta para que entren**, y no es un
descuido que se arregle solo poniendo la fila a activo:

- La rejilla del login solo enseña a quien tenga rol `tecnico`. Los tres son
  supervisores puros y no saldrían en ella.
- El enlace "Entrar con otro usuario" —para entrar tecleando nombre y PIN,
  sin necesidad de salir en la rejilla— está SIN CONSTRUIR a propósito: hoy no
  hay a quién llevar ahí, y una puerta a un cuarto vacío no se construye antes
  de tiempo.
- Y si aun así alguno consiguiera una cookie válida, el tablero busca a quien
  entra en el catálogo de operarios (`TODOS_LOS_OPERARIOS`, de `lib/mock.ts`),
  y los tres no están ahí: el render reventaría.

Nada de esto es un fallo que corregir hoy: es la fase 3, con su propia
pantalla, todavía sin diseñar. Activar la fila es un paso más de esa fase el
día que se aborde, no el que la sustituye.
