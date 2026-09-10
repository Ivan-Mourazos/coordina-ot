# Pendiente — 10/09/2026

Traspaso rápido. Lo que está hecho, lo que falta, y lo que hay que saber para
no repetir errores ya cometidos.

---

## 1. Diseño e Historial — FUSIONADOS en `main`, sin desplegar

Merge `21f9d21`. Incluye el Historial por centros (`4919e1e`) y el arreglo
de la leyenda (`eeab3ea`). Verificado **sobre el resultado de la fusión**:
**955 tests (78 archivos), `pnpm lint` y `pnpm exec tsc --noEmit` limpios.**
La rama local `feat/diseno-panel-y-revision` ya está borrada.

Contiene:
- El orden de columnas del panel como dato de la sección (Diseño: "listo para
  pasar" antes que "esperando revisión").
- En Diseño, las acciones de estado son del pedido entero. Fichar y anular
  siguen por OF, a propósito.
- El arreglo del reloj de la píldora (ver abajo).

Pasó revisión por tarea **y** revisión final de rama, con dos rondas de
arreglos. Repaso real y fusión completados el 10/09.

**Lo que falta:**

- [x] Fusionar a `main`, verificar tests **sobre el resultado de la fusión**, y borrar la rama local.
- [ ] `pnpm novedades` antes de desplegar: recoge las líneas `Novedad:` de los commits y escribe la entrada. Con `--ver` enseña lo que haría sin tocar nada.
- [x] **Repaso en navegador con pedidos de RPS real (10/09)**. Estados y
  fichajes preparados en una copia aislada de SQLite, con OLANET en modo
  sombra; las pruebas no escriben en producción.
  - **Diseño**: «Listo para pasar» antes de «Esperando revisión» en el panel
    personal, la tarjeta de Manuel y su panel de consulta. Corregida la leyenda
    del equipo, que aún seguía el orden de OT. «Ver todos» abre los ocho pedidos
    del bloque correcto; muestra una sola fase, no columnas entre fases.
  - **Diseño**, pedido real **AR.26.04432**: fichar `0232008:7`, enviar las
    otras dos OF a revisión y comprobar en pantalla y en los datos que quedan
    `por_revisar` mientras el intervalo de la primera sigue abierto.
  - **OT**: conserva «Planteando → Esperando revisión → Listo para pasar» y
    la acción «Pasar a revisión» por OF (comprobada en **AR.26.04435**).

---

## 2. El login — HECHO y fusionado a `main`, SIN DESPLEGAR

Ya está en `main` (merge `fc4613c`). **Se despliega APAGADO**: el equipo entra
como siempre y no nota nada.

- [ ] Desplegar. Lo único que pasa en el servidor es que se crea la tabla `persona` → **`pnpm backup` antes de arrancar**.
- [ ] El día que se encienda: seguir `docs/despliegue-login.md`, que separa el día de subir el código del día de encenderlo.

**Tres cosas de ese día que no se pueden saltar:**
1. Generar `COORDINA_SESION_SECRET` **en el servidor**. Si falta, la app ya no arranca (se arregló porque prometía eso y no lo hacía).
2. **Ángel entra el primero**: es la única cuenta de supervisor activa, la única que puede reiniciar PINs.
3. Repasar al rato que no quede nadie sin PIN puesto.

**Y dos cosas que el login encendido NO hace** (no prometerlas):
- **No cierra la web.** Quedan ~14 rutas de lectura abiertas: tablero, historial con documentos, métricas, buscador. Cerrarlas es la fase 2.
- **No echa a nadie de una pestaña ya abierta.** Impide entrar de nuevo, que es distinto.

---

## 3. El fallo del reloj — ARREGLADO y fusionado en `main`

Commit `2c390a8`. Causa raíz, confirmada con datos de producción:

Cambiar qué OFs corren cierra un tramo y abre otro **sin parar el reloj** — el
`fin` de uno es exactamente el `inicio` del siguiente, 0 ms. La píldora contaba
desde el tramo abierto, así que pausar uno de seis pedidos la mandaba a
`0:00:01`. Medido: Carrón, 09/09, fichó **21 minutos seguidos** en cinco tramos
encadenados y la píldora marcaba un segundo.

**Nunca se perdió tiempo.** Cada OF suma los minutos de todos los tramos.
Mentía el número de la pantalla. Ahora cuenta desde que el reloj arrancó sin
parar, y dice qué pedido está corriendo.

---

## 4. El Historial — IMPLEMENTADO, pendiente de despliegue

Commit `4919e1e`, integrado en `main` mediante `21f9d21`.

**No es solo de Diseño: cambia las dos
secciones.** Decidido con Iván:

- Un bloque **por centro de trabajo**: `Oficina Técnica · Diseño Gráfico ·
  Taller`, cada uno con su total.
- **Tiempos por persona solo en la sección seleccionada**. Los bloques de
  las demás secciones muestran únicamente su total, sin desglose por persona.
- **El bloque de tu sección viene abierto**, los demás plegados.
- La lista sigue enseñando **todos** los pedidos (el Historial también sirve
  para buscar uno viejo y ver sus fotos).

**Decisión de Iván (10/09/2026):** la misma regla se aplica a Taller: solo
se desglosa por persona si corresponde a la sección seleccionada; en caso
contrario se muestra el total. Abrir un bloque de otra sección no muestra
los tiempos individuales.

**El motivo de la separación:** antes el Historial contaba solo el trabajo
de **A-OTEC**. El taller pesa mucho más, por eso los bloques van separados y
no hay un total único. Las medidas manuales del 01/09 (4/240 y 14/2010 min)
incluían también máquinas: no eran los tiempos que enseñaba la aplicación.
Comparadas las consultas anterior y nueva contra RPS el 10/09, ambas cuentan
solo personas (`ResourceType = 1`): SA.26.00860 mantiene 2 min de OT y
SA.26.00498 mantiene 7 min de OT. **Este cambio no corrige ni reduce tiempos.**

La unión de la lista con líneas de venta podría duplicar minutos si una OF
apareciera en varias líneas. No se encontraron casos entre los pedidos de
2026 con tareas de OT/Diseño; queda como borde conocido, no como fallo observado.
Lista y ficha consultan la misma API de detalle. El desglose por sección es
una regla de presentación: la respuesta puede contener nombres de otros centros.

Un pedido de Diseño que Manuel cierre desde la herramienta vieja **entra
solo al Historial** (se alimenta de la fase cerrada en OLANET, no de que nadie
pulse nada en la web). Ahora sus tiempos salen en el bloque de Diseño.

Implementado en la ficha y en el desplegable de OF de la lista. La autoría de
la lista corresponde a la sección seleccionada; las tareas de una misma OF
se separan también al agregar los roles registrados en CoordinaOT.

Validación (10/09/2026): 955 tests, tipos, lint y comprobación en navegador contra
RPS real. SA.26.00498: OT 7 min y Taller 998 min, separados; al abrir Taller
no se muestra desglose por persona. Al cambiar a Diseño, OT queda sin personas
incluso desplegada. Ambas secciones devuelven los mismos 40 pedidos, en el
mismo orden, en la primera página consultada. AR.26.04414: Diseño muestra
28 min de Carrón y viene abierto; OT (100 min) y Taller (101 min) quedan
plegados. Se conservan los documentos.

---

## 5. El buscador del Historial — sin empezar

Va **después** del punto 4: aquél cambia qué se enseña y éste cómo se busca
dentro, así que hacerlo antes es rehacerlo.

Hoy hay un campo "Pedido o cliente" y, al lado, un autocompletar de cliente:
dos formas de buscar lo mismo. Se quiere **uno solo** que busque por OF, pedido,
cliente y texto de la OF, con los filtros aparte.

Antes de escribir nada: mirar si **el buscador global que ya tiene la web** (el
de la lupa) sirve tal cual.

---

## 6. Backup — sin terminar

- [ ] El cron quedó con la ruta mala de node. Node va bajo nvm, así que hace falta la ruta absoluta o un enlace en `/usr/local/bin/node`. **Un cron con `/usr/bin/node` no falla: no hace nada, y no se entera nadie.**
- [ ] Borrar el `data/coordina.db.2026-09-04-1314.bak` viejo.

---

## 7. Cosas sueltas que conviene no perder

- [ ] **Ángel tiene que repasar las tres causas genéricas de devolución.** Las escribí yo, no las dictó él. Y la causa "notas" (id 4, orden 0) sale la primera en producción y no debería.
- [ ] Pedir a IT un índice en `tgm_monitorizacion(pedido)`: hoy es un escaneo de 4,5 s y por eso las fotos de visita van con caché de 30 min.
- [ ] `.claude/skills/dominio-ot` dice "sin login: identidad en localStorage". Se queda corto desde que existe el login (apagado). Actualizar cuando se encienda.

---

## Avisos de método, que costaron caro

- **Que la suite esté verde no prueba que algo funcione.** En estas dos ramas ha pasado tres veces: un reinicio de PIN completamente roto con 932 tests en verde (solo salió abriendo el navegador y pulsando el botón); un test que no probaba lo que decía (se descubrió rompiendo la función a propósito y viendo que solo él fallaba); y un botón que iba a leerse "Aprobar las 1" en cada pedido de Diseño.
- **Con `DATASOURCE=mock` el origen de datos ignora la sección** (`data.ts:38`) y devuelve siempre los mismos pedidos y los nueve operarios. No es un fallo de la web: contra RPS cada sección devuelve solo los suyos (comprobado: OT → 6 operarios / 57 pedidos; Diseño → carron, manuel, smith / 41 pedidos).
- **No dar por buenos los comentarios ni los mensajes de commit.** En esta sesión hubo dos informes que afirmaron cosas falsas: un precedente de código que no existía, y una lista de consumidores mal contada.

El registro completo, tarea por tarea y con todos los hallazgos, está en
`.superpowers/sdd/progress.md` (no versionado).
