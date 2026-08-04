# Rediseño de la pantalla principal

Fecha: 2026-08-04 · Acordado con Iván

## El problema

La zona personal gasta ~400 px de alto para mostrar 5 pedidos. Reserva una columna
fija por cada una de las cuatro fases aunque tres estén vacías, usa tarjetas de tres
líneas y aun así tiene scroll interno. Debajo, la bandeja de partes sin asignar —donde
hay 111 pedidos esperando— se queda con lo que sobra.

Los mandos de redimensionar (handle de contraer, arrastre de altura) no resuelven el
problema: obligan a ajustar a mano algo que debería ajustarse solo.

Hay además una ambigüedad de fondo: la columna «Para revisar» de la zona personal y la
pestaña Revisión muestran las mismas OF sin que se sepa cuál manda.

## Lo que NO se toca

Cabecera, contadores, filtros de la bandeja y la rejilla de miniaturas funcionan bien.
El rediseño no los reescribe.

## Principio

**Se parte por rol, no por estado.** La pantalla Asignar es lo mío como autor; la
pestaña Revisión es lo mío como revisor. Una misma OF nunca aparece dos veces con la
misma cara.

## 1. Zona personal

Cuatro columnas, una por fase, con nombres nuevos:

| Columna | Estados | Puedo actuar |
|---|---|---|
| Sin empezar | `pendiente` | sí |
| Planteando | `en_curso`, `devuelta` | sí, fichas |
| Esperando revisión | `por_revisar`, `en_revision` | **no**, solo consulta |
| Listo para pasar | `aprobada` | sí, pasar a Producción |

«Esperando revisión» sustituye a «Para revisar»: el nombre viejo se lee como «me toca
revisar a mí», que es lo contrario de lo que significa. Muestra quién lo tiene y cuánto
lleva.

Reglas de presentación:

- **Una línea por pedido**: código, cliente, descripción de la OF, nº de OFs y tiempo.
- **Altura acotada**: máximo 3 líneas por columna, luego «+N más». El bloque mide lo
  mismo con 5 pedidos que con 40.
- **Las fases vacías no reservan columna.** Cuando solo hay una fase ocupada, esa
  columna ocupa el ancho entero y caben más líneas antes del corte. Los contadores de
  las fases vacías van como micro-texto en la cabecera del bloque.
- **Prioridad** en el borde izquierdo de la línea (rojo = urgente).
- El pedido que se está fichando lleva borde verde, punto latiendo y su tiempo.
- La columna «Listo para pasar» incluye el botón **Pasar a Producción**.

Objetivo de altura: ~150 px frente a los ~400 actuales.

## 2. Desplegable «+N más»

Al pulsar «+N» se abre un panel **flotante sobre esa columna** con todos los pedidos de
la fase y scroll propio. Las demás columnas no se mueven y el bloque no crece. Se cierra
con Esc o pinchando fuera.

Mismo comportamiento que el panel de compañero: un solo lenguaje para «ver más».

## 3. Fila de equipo

Se mantiene la fila horizontal de tarjetas actual (~75 px). Único cambio: la barra fina
se parte por colores de fase, así dice **en qué** está cargado cada uno y no solo cuánto.
Mini-leyenda de colores junto a la etiqueta EQUIPO, en su misma línea.

**Al pinchar en un compañero** se abre un panel flotante **por encima de la bandeja**,
sin empujarla —si empujara, la página daría un salto y se perdería el espacio ganado—.
El resto de tarjetas y la zona personal se atenúan. Se cierra con Esc, con el botón o
pinchando fuera.

El panel es de **solo consulta**: sobre el trabajo de otro no se ficha ni se cambia de
estado. Lo único permitido es arrastrar pedidos, y solo los de **Sin empezar**. El resto
lleva candado con el motivo visible (`fichando`, `2h 10m`, `revisa Tamara`).

Razón de la restricción: mover un pedido con tiempo ya fichado dejaría las horas a
nombre de una persona y el trabajo a nombre de otra.

## 4. Bandeja de sin asignar

Se conserva la rejilla de miniaturas y sus filtros. Cambios:

- **Fuera el botón «Maximizar bandeja»**; en su sitio, el contador «111 sin asignar».
  (La bandeja sigue teniendo scroll: ganar dos filas no elimina la necesidad de
  desplazarse con 111 partes.)
- **Cliente bajo el código** de cada miniatura.
- **Al pasar el ratón** por un parte: miniatura ampliada legible, cliente, familia,
  fecha, aviso de urgente/atrasado, botón **Cogerlo yo** y avatares para asignar a otro.
  El popover se voltea hacia la izquierda cerca del borde derecho.

Arrastrar sigue funcionando, pero deja de ser la única forma de asignar.

El alto liberado arriba (~255 px) se lo queda la bandeja: dos filas completas de partes
visibles de entrada en lugar de una.

## 5. Flujo de revisión

Hoy `terminar_planteo` lleva la OF a `por_revisar` sin pedir revisor, y
`empezar_revision` exige que alguien lo haya asignado por otro sitio. La OF se queda en
tierra de nadie.

Cambio: **el revisor se elige al pasar a revisión**, en un diálogo que muestra:

- Los compañeros **ordenados por carga**, con su número de pedidos.
- **Sin el autor en la lista**: la regla revisor ≠ autor pasa a ser imposible de
  incumplir en vez de algo que validar.

Al confirmar, se notifica al revisor (la campana ya existe) y la OF aparece en su
pestaña Revisión marcada como nueva y con «de {autor}».

## 6. Pestaña Revisión

Por defecto muestra **solo lo mío como revisor**, en tres columnas: Por empezar,
Revisando, Devueltas por mí.

Un interruptor **«Todo el equipo»** devuelve el tablero global actual (Por revisar / En
revisión / Aprobadas / Devueltas de todos). Ese interruptor es lo que cubre la necesidad
de Ángel como supervisor: no hace falta construirle una vista aparte, él trabaja con el
interruptor puesto.

Consecuencia: los contadores de cabecera «Por revisar» y «En revisión» pasan a contar
**lo mío**, que es lo accionable. El global vive en la pestaña.

## Fuera de alcance

Este documento cubre **la estructura**: qué se ve, dónde vive cada cosa y cuánto espacio
ocupa. Queda fuera, para un segundo diseño:

- **El flujo completo de fichaje**: arrancar, pausar, cambiar de OF, fichar varias a la
  vez, qué pasa al cerrar el navegador con el fichaje abierto.
- **Diseño de botones y acciones**: jerarquía, cuáles son primarias, cuáles piden
  confirmación, dónde viven (línea, hover, panel).
- **Cómo se presenta la información** dentro de cada pedido y cada OF: material
  pendiente, reservas, rotulación, avisos, tiempos.

Ese segundo diseño se apoya en la estructura fijada aquí, así que va después.

También fuera, sin fecha:

- Vista separada para el supervisor: se resuelve con el interruptor.
- Selección múltiple en la bandeja para asignar varios de golpe: buena idea, pero se
  decide después de ver funcionando el resto.
- Rehacer la rejilla de miniaturas o los filtros.

## Pendiente de comprobar antes de implementar

- Las medidas de altura (~400 px actuales, ~150 objetivo) están estimadas sobre
  capturas, no medidas del DOM. Conviene medirlas en el navegador antes de fijar
  valores.
- Si las miniaturas de escaneos reales se leen bien al tamaño de la rejilla.
