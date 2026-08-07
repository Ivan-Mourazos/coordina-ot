# Las OF que no son de Oficina Técnica

Fecha: 2026-08-07 · Acordado con Iván (a partir de los apuntes de Ángel)

## El problema

En el tablero aparecen OF que no le tocan a OT. Las capotas son el caso claro:
Toldos Gómez no las plantea, y sin embargo están ahí. Lo mismo con faldones y
con OF de un pedido que llevan otra fecha de entrega.

## Por qué pasa (verificado contra RPS)

La vista `TGM_PENDIENTE_OT` filtra por el TEXTO de la tarea: deja pasar todo lo
que empieza por "PLANTEAR". Y hay dos cosas distintas que empiezan igual:

```
OF 0228833 — 1 - CAPOTA
  tarea 5   PLANTEAR EN TALLER          ← por aquí entra
  tarea 20  FABRICAR ESTRUCTURA CAPOTA
  tarea 26  TAPIZAR CAPOTA
```

**`PLANTEAR EN TALLER` es el discriminador.** Lo comprobé en las 106 filas de la
vista: por ahí entran 9 OF — las 2 capotas, 2 de `OTR.ESTRUCTURAS` y 5 de
`TOLDO FACHADA`. Las de OT usan "PLANTEAR Y PREPARAR ARCHIVO(S) MAQ. DE CORTE",
"PLANTEAMIENTO EN OFICINA TECNICA" o "PLANTEAR" a secas.

Lo que NO sirve para distinguirlas, y se descartó comprobándolo:

- **La máquina de la tarea.** Ninguna de las 106 tiene `IDBudgetMachine`. La
  intuición del compañero (que Producción les asigna una máquina distinta) no
  se sostiene en ese campo.
- **El catálogo de tareas.** La misma descripción aparece unas veces con
  `IDUsualTask = '001-7'` y otras sin él, según cómo la crearan.

## Decisión

Se filtran por el texto de la tarea, asumiendo que **"PLANTEAR EN TALLER" nunca
es trabajo de OT** (confirmado por Iván: "en teoría vamos a pensar que sí").
Es un filtro por texto y eso es frágil —se rompe el día que alguien escriba la
tarea distinta—, así que se asume a sabiendas y por eso las OF no se tiran: se
esconden y se pueden recuperar.

## 1. No se descartan, se marcan

La OF llega igual y gana una marca de que no es trabajo de OT. Tirarlas en el
adaptador dejaría pedidos incompletos y sin forma de encontrarlos, que es justo
lo que Iván pidió evitar: *"por si algún día se quiere buscar dicho pedido"*.

## 2. Fuera del tablero, buscables en la Lista

- **Asignar**: no aparecen. Ni en la bandeja ni en las zonas.
- **Lista**: aparecen, con un filtro para verlas o esconderlas. Ahí es donde se
  busca un pedido concreto, y esconderlas del todo sería perder el rastro.
- Se distinguen a simple vista, como ya se hace con "Sin procesar".

## 3. Recuperarla es asignar el pedido

Si resulta que sí es trabajo nuestro, **se asigna el pedido entero** y todas sus
OF pasan a ser trabajo normal de OT: dejan de estar marcadas y entran en el
tablero como cualquier otra.

No se hace por OF suelta: el caso real es "este pedido sí lo llevamos nosotros",
y obligar a rescatar una por una sería trabajo de más para el mismo resultado.

**Y siempre se puede deshacer**, que es lo que hace segura la decisión:
- anular una OF suelta (la acción `anular` ya existe);
- o devolver el pedido entero a "no es de OT".

Esa segunda es la única pieza de interfaz nueva de esta sección.

## 4. Lo que NO entra

- Cambiar la vista de RPS. Es de IT, y este filtro no depende de que la toquen.
  Si algún día David marca las tareas de OT de forma fiable, esto se sustituye
  por esa marca y todo lo demás sigue igual.
- Los proyectos internos (SISGEKO, ACOPLA, "Modernización página…") ya tienen su
  propio camino: `Pedido.interno`, fuera del tablero y visibles en la Lista.

## Detalles que el plan debe respetar

**Dónde va el filtro.** En `familiaDeTexto` no: eso es familia. La marca se pone
al construir la OF en `src/lib/server/rps.ts`, donde ya está `Tarea` en la fila
de la vista (`FilaVista.Tarea`).

**El estado sobrevive al recargo.** Rescatar un pedido es un dato de OT, no de
RPS, así que vive en el overlay (`of_overlay`) como el resto del flujo. Si solo
se guardara en memoria, volvería a esconderse en el siguiente polling.

**Un pedido con OF de las dos clases.** Es el caso de Ángel: unas OF para OT y
otras no. En el tablero el pedido aparece solo con las suyas —el tablero ya
reparte por facets, así que sale gratis— y en el parte se ven todas, separadas.

**Ojo con `estaAtrasado` y los contadores.** Si una OF ajena cuenta como trabajo
pendiente, la cabecera dirá que hay más de lo que hay. Todo lo que cuenta
trabajo tiene que excluirlas.
