# Pendiente — 10/09/2026

Traspaso rápido. Lo que está hecho, lo que falta, y lo que hay que saber para
no repetir errores ya cometidos.

---

## 1. Rama `feat/diseno-panel-y-revision` — HECHA, sin fusionar

9 commits sobre `main` (`fc4613c..ad8be32`). **950 tests, `pnpm lint` y
`npx tsc --noEmit` limpios.**

Contiene:
- El orden de columnas del panel como dato de la sección (Diseño: "listo para
  pasar" antes que "esperando revisión").
- En Diseño, las acciones de estado son del pedido entero. Fichar y anular
  siguen por OF, a propósito.
- El arreglo del reloj de la píldora (ver abajo).

Pasó revisión por tarea **y** revisión final de rama, con dos rondas de
arreglos. Está lista para fusionar.

**Lo que falta:**

- [ ] Fusionar a `main` (`git checkout main && git merge --no-ff feat/diseno-panel-y-revision`), verificar tests **sobre el resultado de la fusión**, y borrar la rama.
- [ ] `pnpm novedades` antes de desplegar: recoge las 3 líneas `Novedad:` de esta rama y escribe la entrada. Con `--ver` enseña lo que haría sin tocar nada.
- [ ] **Repaso a ojo pendiente, contra RPS de verdad** (los agentes solo pudieron con datos simulados):
  - En **Diseño**: que el orden de columnas sea el nuevo en los CUATRO sitios (panel, tarjeta de compañero, panel de consulta, desplegable de "ver todos").
  - En **Diseño**: fichar una OF de un pedido de tres y comprobar que las otras dos **sí** se pueden mandar a revisión sin pausar.
  - En **Oficina Técnica**: que NADA haya cambiado.

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

## 3. El fallo del reloj — ARREGLADO (dentro de la rama de Diseño)

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

## 4. El Historial — DISEÑADO A MEDIAS, sin escribir

Es el trabajo grande que queda, y **no es solo de Diseño: cambia las dos
secciones.** Decidido con Iván:

- Un bloque **por centro de trabajo**: `Oficina Técnica · Diseño Gráfico ·
  Taller`, cada uno con su total y con quién lo hizo.
- **El bloque de tu sección viene abierto**, los demás plegados.
- La lista sigue enseñando **todos** los pedidos (el Historial también sirve
  para buscar uno viejo y ver sus fotos).

**Lo que falta por decidir antes de construirlo:** si dentro del bloque de
Taller se desglosa por persona o basta el total. Sería la primera vez que esta
web enseña, con nombre y apellidos, cuánto echó cada uno de corte o confección.
Es lo mismo que ya enseña RPS, pero no a la misma gente.

**El número que hay que tener delante:** hoy el Historial cuenta solo el trabajo
de **A-OTEC**. Meter el taller multiplica el total de un pedido por 60 y por
143 (medido el 01/09: SA.26.00860 pasa de 4 min a 240; SA.26.00498, de 14 a
2010). Por eso los bloques van separados y no hay un total único.

Hoy, un pedido de Diseño que Manuel cierre desde la herramienta vieja **entra
solo al Historial** (se alimenta de la fase cerrada en OLANET, no de que nadie
pulse nada en la web) pero **sale sin tiempos**, porque el filtro es solo de OT.

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
