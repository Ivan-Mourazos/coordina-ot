# Pendiente — 10/09/2026

Traspaso rápido. Lo que está hecho, lo que falta, y lo que hay que saber para
no repetir errores ya cometidos.

---

## 0. Aprobación y paso a Producción — DESPLEGADO Y CONFIRMADO

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
- **Decisión inicial, sustituida por el punto 9:** se mostraban activos con su
  estado pendiente. Iván ha pedido después excluirlos del Historial. La ficha
  sigue mostrando el estado vivo y no ofrece reparar cierres pendientes.

Migración **8**: crea `pedido_paso_seccion`. Las marcas antiguas no guardaban
sección: se atribuyen a la sección del firmante (inferencia para datos antiguos;
en el 4403 se contrastó con la operación cerrada). La tabla original queda
intacta. Las nuevas escrituras registran la sección elegida expresamente.
Backup previo conservado. En producción se comprobó `PRAGMA user_version = 8`
tras el despliegue de `16c2643`, con PM2 online y `/api/health` correcto contra RPS.

**Confirmación de Iván en producción (10/09):** al aprobar el pedido se queda
en «Listo para pasar» y hay que pulsar el botón para pasarlo. Flujo real verificado.

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
- [x] Novedades generadas y versión desplegada, incluido el formato compacto (`e96efa8`), confirmado por Iván el 10/09. También desplegados los cambios posteriores de los puntos 0, 5 y 8, hasta `16c2643`.
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

## 5. El buscador del Historial — DESPLEGADO

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

## 6. Backup — CONFIGURADO Y PROBADO

- [x] Iván comprobó `/etc/cron.d/coordina-backup`: a las 21:00, usuario root,
  Node `/root/.nvm/versions/node/v24.14.0/bin/node`, configuración `.env`.
  Servicio cron activo y fichero con permisos 644, propietario root.
- [x] Ejecución manual con entorno mínimo (`env -i`) correcta el 10/09 a las
  09:58: copias local y en `/mnt/oftecnica/coordina-backups`, ambas de
  3338240 bytes; 17 tablas y 2275 acciones. La ejecución programada de esa
  noche no se ha observado; sí se ha probado el comando fuera del entorno nvm.
- [x] Copia previa al despliegue conservada como
  `data/backups/pre-despliegue-20260910T075521.db`.
- [ ] Borrar el `data/coordina.db.2026-09-04-1314.bak` viejo.

---

## 7. Cosas sueltas que conviene no perder

- [x] Causas existentes ajustadas en producción el 10/09, por indicación de Iván: medidas → «Las medidas del trabajo»; cotas → «Las cotas del croquis»; material conserva «El material apuntado». «Notas» (id 4) pasa de orden 0 a 4, al final. Mismos IDs, categorías y retiradas; copia previa local en `data/causas-antes-20260910.json`. Ángel podrá afinar los textos desde «Cambiar la lista».
- [x] Fotos optimizadas en código, **pendiente de despliegue**. `tgm_monitorizacion` es una **vista**, no una tabla donde pedir ese índice. El aviso tiene `IDPedidoVenta`: ahora se consulta el pedido concreto por esa relación, sin calcularlo desde la ruta del PDF ni cargar todas las asistencias. Sin cambios en RPS ni dependencia de IT. Comparación completa: 19.049 referencias en ambas rutas, sin referencias exclusivas. Consulta definitiva por pedido: 81–270 ms frente a 2,26 s de la carga global anterior, medición local contra RPS. Caché por pedido de 5 min, máximo 200 pedidos y una carga simultánea por código. Verificación con pedidos con fotos y sin ellas, manteniendo visita/instalación y orden estable.
- [x] `.claude/skills/dominio-ot/SKILL.md` actualizado: login instalado pero apagado, identidad de navegador frente a sesión, alcance real de protección y activación separada. Guía de despliegue corregida: `.env` en producción, `.env.local` en desarrollo, migración 8 ya instalada. **No se ha activado el login.**

### Botón de pasar tras aprobar — DESPLEGADO

Iván confirmó el despliegue de `4d25fd9` el 10/09, incluidos este arreglo,
las fotos por pedido y las novedades.

Iván detectó que el revisor también veía «Pasar a Producción». La ficha solo
comprobaba que el pedido estuviera listo. Ahora exige que quien pulsa sea un
autor del pedido de esa sección; misma regla en la ficha, confirmación y API.
Un revisor sin autoría recibe 403, sin guardar el paso, cortar fichajes ni
encolar la finalización. Los pedidos repartidos admiten cualquiera de sus
autores cuando todo está listo. Prueba del HTML de la ficha con ambas identidades
y prueba de aprobar → intento del revisor rechazado → paso del autor aceptado.
Validación conjunta: **972 tests**, TypeScript y lint sin errores ni avisos.

---

## 8. Ajustes del Historial — DESPLEGADOS

Commits `ad00bca` y `16c2643` subidos a main y desplegados por Iván el 10/09.
Compilación correcta, PM2 online, migración 8 y respuesta de RPS verificados
con la salida de la terminal del servidor.

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

## 9. Historial completo y documentos compactos — pendiente de despliegue

Criterio definitivo de Iván (sustituye la visibilidad de pendientes del punto 0
y la búsqueda de pedidos sin finalizar descrita en el punto 8):

- En OT entra el pedido cuando acaba su trabajo de OT; en Diseño, el de Diseño.
  Si no tiene tareas de la sección seleccionada, deben cerrar las demás tareas.
  Aprobar en CoordinaOT sigue sin equivaler a Pasar: los pedidos vivos del tablero
  se excluyen **antes de paginar**, también al buscar. Un paso antiguo no oculta
  una reapertura. Las OF paradas de un pedido pasado no invalidan ese paso.
- Se muestran **todas las OF**, una fila compacta por código, con sus centros y
  tiempos. AR.26.04413 / OF 0231922: Taller, ADAPTAR LONA CLIENTE, **34 minutos**.
  Contrastado con RPS: Silvia Lopez 12 y Jose Manuel Sanchez 22; sin tiempo de OT.
- Autor de la sección cuando tiene tareas propias; de los demás centros cuando
  no las tiene. Catálogo RPS: nombres y primer apellido, incluidos nombres
  compuestos; no se sustituyen nombres desconocidos por códigos de operario.
- El nombre del pedido abre la ficha; solo la flecha izquierda despliega las OF.
- «Tareas y tiempos» en la lista desplegada y en la ficha: tareas, centros y
  totales de RPS. Personas solo en la sección seleccionada. Escape cierra el
  desglose sin cerrar la ficha. El reloj local no se suma a los minutos de RPS.
- Documentos RPS: todos los grupos empiezan plegados. Fotos de visita,
  instalación, trabajo y las imágenes del SAT se reúnen en **Fotos**, primero.
  Los partes PDF del SAT conservan su grupo. Las URL originales no cambian.

Validación: **981 tests / 84 archivos**, lint y tipos correctos; compilación
correcta (aviso de Turbopack sobre trazado de archivos desde next.config.ts).
Navegador local con RPS real: OF 0231922 visible en OT, autoría con primer apellido,
abrir desde nombre, tareas en lista/ficha, Escape y documentos plegados.
Prueba SQL aislada en tablas temporales: ocho escenarios en OT y Diseño,
incluidos cierre parcial, tarea de Taller asociada a OTEC y aprobado sin pasar.
Paso por XML y exclusión por reapertura contrastados con marca simulada en
memoria; no se escribieron pedidos ni fichajes de producción.

Notas de datos y rendimiento:
- En RPS, PercentProgress=100 puede significar primer fichaje. Se conserva
  únicamente el rescate histórico de OT; para las otras tareas se exige cierre
  de fase. No basta una sola fase cerrada para dar por terminado el pedido.
- «Enrollable» devuelve varias páginas y ordena por fecha del pedido descendente.
  Los recuentos antiguos del punto 8 incluían pendientes y pedidos sin OF: ya
  no son el universo del Historial. «Apilable» no devuelve finalizados en esta
  copia local; el pedido AR.25.05551 conserva una tarea de OT sin cerrar en RPS.
- Consulta global medida en unos 6 s tras agrupar primero por OF (antes 14–15 s
  con el nuevo criterio). Búsqueda exacta por código: alrededor de 0,2 s.
  No se han creado índices ni modificado tablas permanentes de RPS.
- La SQLite local de validación no contiene los pasos de producción: no tomar
  su ausencia como prueba de que un pedido pasado en el servidor está pendiente.

---

## 10. Coherencia visual y de interacción — SEGUNDA ENTREGA IMPLEMENTADA, SIN DESPLEGAR

Plan completo: [PLAN-MEJORAS-UI.md](PLAN-MEJORAS-UI.md).
Iván pidió revisar el conjunto antes de retocar la fila del Historial.
Revisadas las seis pestañas en producción en oscuro y Pendientes, Historial y
Revisiones también en claro; contraste medido, móvil y Diseño quedan por validar.

Prioridades: reconciliar los pedidos que aparecen arriba y abajo del Historial;
distinguir OF aprobada de pedido listo para pasar; después unificar filas compactas,
nombres, tiempos, filtros y fichas. Interacción solicitada: nombre abre la ficha,
resto de cabecera/flecha despliega y se elimina el ojo. Cada fase se valida en
**claro y oscuro**.

Primera entrega del 11/09: el Historial usa su única lista paginada, que ya incluye
pasos locales; las fechas filtran por el paso local cuando existe. Filas compactas
y alineadas, código compartido con Pendientes, clic en el nombre abre y en el resto
despliega; ojo retirado. Revisiones distingue OF aprobadas de pedido completo listo.
983 tests correctos y prueba SQL adicional con tablas temporales, en OT y Diseño,
para paso antes/después del cierre RPS, reapertura, fechas y búsqueda. Verificación
visual en ambos temas y Historial sin desbordamiento horizontal a 390 px.
Segunda entrega del 11/09: sección visible en cabecera, nombres y primer apellido
coherentes, documentos plegados con el mismo control en ambas fichas y botón
Reintentar en Documentos/Métricas. Cabecera adaptada a pantallas estrechas sin
solapar logo/buscador. Se omiten los centros sin OF, manteniendo los que tienen
trabajo a cero minutos. No cambia el cálculo de tiempos ni los permisos.
Comprobación visual local en claro/oscuro, OT/Diseño y anchos 390/768/1440.
Iván aclara que no se usa móvil: queda fuera del plan. Objetivo de pantalla:
PC desde 1280 × 720, claro y oscuro. Fichas con espaciado compacto para poca
altura; después, materiales, filtros y contraste. Detalles y límites en el plan.
No se ha desplegado esta segunda entrega.

Continuación: el Historial conserva sus filtros por sección al cambiar de
pestaña; permite vaciar solo la búsqueda. Materiales cierra con Escape sin
cerrar la ficha y devuelve el foco a su botón. Probado en navegador. Aún falta
conservar páginas/posición y completar el resto del plan de coherencia visual.

Tercera entrega (11/09, sin desplegar): Escape por capas en toda la app, misma
ventana y vocabulario de material en las dos fichas (con rayas y cuerpo 3D),
marco común de fichas, contraste medido y corregido en la ficha (53 textos
≥4,5:1 en claro y oscuro) y campana callada para partes re-escaneados de
pedidos parados. Detalle, pares medidos y límites en el plan.
Después, con el visto bueno de Iván: el autor recupera su OF aprobada con
«Recuperar para corregir» y al reenviarla entra en «Por revisar»; filas del
Historial en una línea, con tiempo de la sección, revisor, «Solo Taller» y
fecha con año (tiempos de lista y ficha iguales en 12 pedidos reales).
También «Dar por corregidas las N» en la ficha, desde dos OF devueltas.
Siguen sin hacer: contraste fuera de la ficha, qué personas enseña «Tareas y
tiempos» frente a la autoría (a mirar con Iván), conservar páginas/posición y
filtros de Visitas y Métricas. «Dar por corregida» tras recuperar una OF
aprobada se queda: decidido por Iván.

---

## Avisos de método, que costaron caro

- **Que la suite esté verde no prueba que algo funcione.** En estas dos ramas ha pasado tres veces: un reinicio de PIN completamente roto con 932 tests en verde (solo salió abriendo el navegador y pulsando el botón); un test que no probaba lo que decía (se descubrió rompiendo la función a propósito y viendo que solo él fallaba); y un botón que iba a leerse "Aprobar las 1" en cada pedido de Diseño.
- **Con `DATASOURCE=mock` el origen de datos ignora la sección** (`data.ts:38`) y devuelve siempre los mismos pedidos y los nueve operarios. No es un fallo de la web: contra RPS cada sección devuelve solo los suyos (comprobado: OT → 6 operarios / 57 pedidos; Diseño → carron, manuel, smith / 41 pedidos).
- **No dar por buenos los comentarios ni los mensajes de commit.** En esta sesión hubo dos informes que afirmaron cosas falsas: un precedente de código que no existía, y una lista de consumidores mal contada.

El registro completo, tarea por tarea y con todos los hallazgos, está en
`.superpowers/sdd/progress.md` (no versionado).
