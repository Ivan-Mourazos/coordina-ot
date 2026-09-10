# Pendiente — 10/09/2026

Traspaso rápido. Lo que está hecho, lo que falta, y lo que hay que saber para
no repetir errores ya cometidos.

---

## 0. Aprobación y paso a Producción — CORREGIDO, pendiente de despliegue

Caso **AR.26.04403**, comunicado por Iván el 10/09: Jaime lo aprobó y
desapareció de «Listo para pasar» sin que Iván pulsara «Pasar». La marca del
pedido era de Carrón, del 09/09, y se compartía entre OT y Diseño. Al quedar
aprobada OT, esa marca antigua volvía a dar todo el pedido por completado.

Confirmado leyendo producción: el cierre enviado corresponde a la operación
9 de Diseño; en los eventos consultados de la operación 5 de OT solo constan
inicio/pausa, sin cierre al aprobar Jaime. El fallo era de la situación que
enseñaba CoordinaOT, no un paso automático enviado a OLANET.

Corregido:
- El paso se guarda por **pedido y sección**, con las OF incluidas.
- Aprobar trabajo posterior o una OF nueva no reactiva un paso antiguo.
- El servidor rechaza pasar si queda trabajo pendiente; obtiene las OF del
  pedido real y no permite aprobar y pasar en la misma petición.
- El navegador espera la confirmación del servidor antes de sacar el pedido.
- **Decisión de Iván:** los pedidos activos siguen visibles en el Historial,
  indicando «Esperando revisión», «Listo para pasar», etc., en vez de «Pasado».
  La ficha también muestra su estado y no ofrece reparar cierres mientras
  quede trabajo vivo.

Migración **8**: crea `pedido_paso_seccion`. Las marcas antiguas no guardaban
sección: se atribuyen a la sección del firmante (inferencia para datos antiguos;
en el 4403 se contrastó con la operación cerrada). La tabla original queda
intacta. Las nuevas escrituras registran la sección elegida expresamente.
**Backup antes de desplegar y comprobar `PRAGMA user_version = 8`.**

Validado con el 4403 real y una copia aislada de SQLite en modo sombra:
pendiente → API rechaza pasar (409); aprobación de Jaime → panel de Iván
«Listo para pasar» e Historial con el mismo estado; solo al pulsar y confirmar
«Pasar» se registra el cierre de OT. No se modificó producción.
Comprobaciones finales: **964 tests, lint y tipos limpios**.

## 1. Diseño e Historial — DESPLEGADOS

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
- [x] Novedades generadas y versión desplegada, incluido el formato compacto (`e96efa8`), confirmado por Iván el 10/09. Los cambios posteriores de los puntos 0 y 5 requieren otra actualización.
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

## 2. El login — DESPLEGADO APAGADO

Ya está en `main` (merge `fc4613c`). **Se despliega APAGADO**: el equipo entra
como siempre y no nota nada.

- [x] Código desplegado, confirmado por Iván el 10/09. El login sigue apagado.
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

## 4. El Historial — DESPLEGADO

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

El desglose por centros está en la ficha del pedido. **Corrección de Iván
(10/09): la lista del Historial debe conservar su formato compacto anterior.**
Al desplegar muestra una línea por OF de la sección seleccionada, con código,
descripción, tiempo y roles registrados. Los materiales y el trabajo de otros
centros se consultan en la ficha, sin tarjetas grandes dentro de la lista.
La autoría de la lista corresponde a la sección seleccionada; las tareas de
una misma OF se separan también al agregar los roles registrados en CoordinaOT.

Validación (10/09/2026): 955 tests, tipos, lint y comprobación en navegador contra
RPS real. SA.26.00498: OT 7 min y Taller 998 min, separados; al abrir Taller
no se muestra desglose por persona. Al cambiar a Diseño, OT queda sin personas
incluso desplegada. Ambas secciones devuelven los mismos 40 pedidos, en el
mismo orden, en la primera página consultada. AR.26.04414: Diseño muestra
28 min de Carrón y viene abierto; OT (100 min) y Taller (101 min) quedan
plegados. Se conservan los documentos.

---

## 5. El buscador del Historial — IMPLEMENTADO, pendiente de despliegue

Commit `e833998`: una caja para pedido, OF, cliente y descripción, con familia
y fechas aparte y filas compactas. Busca en RPS antes de paginar, admite
códigos sin puntos y palabras de la descripción en cualquier orden.

Se revisó la lupa: su consulta de pedidos externos solo busca pedido/cliente
y limita resultados, por lo que no sirve tal cual. Se reutilizó su normalización;
la lupa conserva también las coincidencias por OF/descripción de la API ampliada.
Consultas reales verificadas: `0231269`, `AR2603972`, `CLADDING NW3250` y
`ASSA ABLOY`; todas encuentran AR.26.03972, y cliente conserva la paginación.
Comprobado también en navegador: buscar `0231269` encuentra AR.26.03972
tanto en la caja del Historial como en la lupa de la cabecera.

---

## 6. Backup — sin terminar

- [ ] El cron quedó con la ruta mala de node. Node va bajo nvm, así que hace falta la ruta absoluta o un enlace en `/usr/local/bin/node`. **Un cron con `/usr/bin/node` no falla: no hace nada, y no se entera nadie.**
  El 10/09 se intentó comprobarlo por SSH: `root@192.168.0.90` rechaza la clave
  disponible. Iván confirma que usa contraseña; falta autenticar la conexión.
- [ ] Borrar el `data/coordina.db.2026-09-04-1314.bak` viejo.

---

## 7. Cosas sueltas que conviene no perder

- [ ] **Ángel tiene que repasar las tres causas genéricas de devolución.** Las escribí yo, no las dictó él. Y la causa "notas" (id 4, orden 0) sale la primera en producción y no debería.
- [ ] Pedir a IT un índice en `tgm_monitorizacion(pedido)`: hoy es un escaneo de 4,5 s y por eso las fotos de visita van con caché de 30 min.
- [ ] `.claude/skills/dominio-ot` dice "sin login: identidad en localStorage". Se queda corto desde que existe el login (apagado). Actualizar cuando se encienda.

---

## 8. Ajustes del Historial — implementados, pendientes de despliegue

- «PLANTEAR EN TALLER» pertenece a Taller aunque RPS la asocie a OTEC-A.
  Se mueve la tarea completa, no se filtra por quién fichó. También se excluye
  de la deducción de autores de OT en la lista.
- Verificado AR.26.03626 contra RPS: OT **41 min** (Iván 35, Jaime 6), Diseño
  **12 min**, Taller **2321 min**. Los **38 min** de la tarea de la OF 0230699
  (Esteban 37, Jaime 1) quedan en Taller. Total **2374 min**, idéntico a la suma
  directa de imputaciones de personas de RPS. El reloj de CoordinaOT se rotula
  aparte: no se suma al total de RPS.
- Apuntado, Apartado y notas de producción se abren con botones. Comprobado
  en navegador con las ocho líneas reales de 0230697: tarjeta de 155 px tanto
  cerrada como abierta; Escape cierra el material y mantiene abierta la ficha.
- La búsqueda incluye descripciones de venta y pedidos sin OF o sin cierre
  registrado. «Apilable» encuentra **13 pedidos**, antes solo uno. Se admite
  el código antiguo AR.10N00595 en el detalle; su visor de escaneo no admite
  ese formato y lo indica, manteniendo los documentos disponibles.
- Al buscar, orden por **fecha del pedido descendente**, con código como
  desempate, antes de paginar. «Enrollable»: **7048 pedidos / 177 páginas**;
  páginas 0, 1 y 176 contrastadas con una consulta independiente de RPS,
  coinciden exactamente y la última contiene ocho pedidos, sin más páginas.
- Durante otra consulta no se muestran resultados de la anterior. El botón
  «Volver arriba» lleva texto y queda sobre el reloj; comprobado en navegador.
- Validación: 965 tests, TypeScript y lint limpios. Las comprobaciones locales
  usan otra SQLite; no se han modificado fichajes ni pedidos de producción.

---

## Avisos de método, que costaron caro

- **Que la suite esté verde no prueba que algo funcione.** En estas dos ramas ha pasado tres veces: un reinicio de PIN completamente roto con 932 tests en verde (solo salió abriendo el navegador y pulsando el botón); un test que no probaba lo que decía (se descubrió rompiendo la función a propósito y viendo que solo él fallaba); y un botón que iba a leerse "Aprobar las 1" en cada pedido de Diseño.
- **Con `DATASOURCE=mock` el origen de datos ignora la sección** (`data.ts:38`) y devuelve siempre los mismos pedidos y los nueve operarios. No es un fallo de la web: contra RPS cada sección devuelve solo los suyos (comprobado: OT → 6 operarios / 57 pedidos; Diseño → carron, manuel, smith / 41 pedidos).
- **No dar por buenos los comentarios ni los mensajes de commit.** En esta sesión hubo dos informes que afirmaron cosas falsas: un precedente de código que no existía, y una lista de consumidores mal contada.

El registro completo, tarea por tarea y con todos los hallazgos, está en
`.superpowers/sdd/progress.md` (no versionado).
