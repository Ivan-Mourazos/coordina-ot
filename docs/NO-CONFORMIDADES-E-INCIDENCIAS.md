# No conformidades, rectificados e incidencias (octubre 2026)

De dónde salen en RPS, cómo se reparten entre Oficina Técnica y Diseño Gráfico, qué enseña Coordina y qué
**no** se puede saber. Medido contra RPS el 26/10/2026.

## 1. Dos cosas distintas

| | Incidencia | No conformidad (NC) |
|---|---|---|
| Quién la apunta | Producción, al fichar en el taller | Calidad, a mano en RPS |
| Dónde | `CPRImputationMO` con `Unproductive = 1`, tipo en `CPRUnproductiveType` | `APQNonConformity` + `_APQNonConformity_Custom` |
| Sobre qué | Una **OF** (la tarea donde se perdió el tiempo) | Un **pedido** (no trae OF, tarea ni empleado) |
| Qué dice | Un tipo cerrado («CORTE-ERROR EN PLANTEAMIENTO») | Texto libre, procesos afectados y el pedido rectificativo |

## 2. Incidencias

Un improductivo de RPS cuenta como incidencia de una sección según su tipo (`INCIDENCIAS` en
`src/lib/server/metricas-fuentes.ts`):

- **Oficina Técnica**: «… ERROR EN PLANTEAMIENTO», de corte, confección o soldadura (Iván, 21/10/2026).
- **Diseño Gráfico** (Iván, 26/10/2026), y **solo en OF con tarea de Diseño** (un error de rotulación en una OF
  que Diseño no tocó es del taller):
  - ROTULACION-OTROS ERRORES ROTULACION (40 OF en 2026)
  - ROTULACION-ERROR AL DOCUMENTAR PEDIDO (14)
  - ROTULACION-ERROR EN CORTE DE MASCARA O VINILO (3)
  - IMPRESION DIGITAL-ERROR EN ARCHIVO (2)

  Cuentan **desde el 08/09/2026**, que es cuando Diseño empezó a pasar pedidos en Coordina: antes no hay OF
  pasadas sobre las que sacar el %.
- **Impresión Digital**: ninguna.

En RPS no existe un «error de diseño» como tal; los de Diseño los eligió Iván entre los que hay.

El % es incidencias sobre OF pasadas en Coordina. Si en RPS se apunta una incidencia en una OF que no pasó por
Coordina, el % sale más alto de lo real: vigilarlo.

## 3. No conformidades

### Los procesos de RPS

Calidad marca uno o dos «procesos afectados» (`IDProcesoAfectado1/2` → `_Proceso`). Es la lista del sistema de
calidad, migrada a RPS en 2020:

| Cód. | Proceso | Usos en NC (histórico) |
|---|---|---|
| 01 | Comercial | 1.033 |
| 02 | Compras | 630 |
| **03** | **Diseño** | **317** |
| 04 | Facturación y cobros | 25 |
| 05 | Gestión de recursos técnicos | 2 |
| 06 | Instalación y entrega | 404 |
| 07 | Planificación | 2 |
| 08 | Prevención de riesgos laborales | 0 |
| 09 | Producción | 810 |
| 10 | Gestión de RR. HH. | 1 |
| 11 | Dirección | 31 |

**No hay un proceso «Oficina Técnica».** «Diseño» es diseño en el sentido de calidad (diseñar el producto antes
de fabricarlo: medidas, planteamiento), que es lo que hace OT; Diseño Gráfico tampoco tiene proceso propio. Por
eso las NC de OT vienen como «DISEÑO».

### Cómo se reparten entre OT y Diseño

Por las **tareas del pedido que falló**: es de OT si tiene tareas en `a-otec`/`otec-a`, de Diseño si las tiene
en `a-dgra`/`dgra-a`, de las dos si tiene de ambas. En 2026, de 53 NC de DISEÑO: 34 solo OT, 2 solo Diseño, 16
de las dos, 1 de ninguna. Una NC de Comercial o Compras en un pedido con tareas de OT **no** es de OT.

Entran las de proceso DISEÑO **y las que aún no tienen ningún proceso**: Calidad las abre y las clasifica
después, y las de octubre estaban casi todas sin clasificar (NC010176, NC010188). Salen marcadas «sin
clasificar».

Si se quiere que RPS las distinga en origen, la forma limpia es que Calidad tenga dos procesos («Oficina
Técnica» y «Diseño Gráfico») en lugar de uno. Lo decide quien gestiona Calidad en RPS.

### Rectificados

No hay una lista aparte: el pedido rectificativo vive en la NC (`_APQNonConformity_Custom.CodPedidoRectificado`).
En 2026, 274 de 392 NC lo tienen. Por año: 2021: 736 NC (548 con rectificativo) · 2022: 504 (356) · 2023: 542
(386) · 2024: 540 (345) · 2025: 483 (342).

**No se da un % de «rectificados nuestros»**: de quién fue lo decide Calidad a mano y muchas siguen sin
clasificar, así que el número no sería verdad. Sí se dan los totales: los de la sección y, como referencia, los
de toda la empresa en el periodo.

### La hoja en papel

La hoja «No conformidad en pedido de cliente» (tipo de defecto, medida actual y correcta, quién la rellena) no
está adjunta a la NC en RPS: viene **escaneada con el pedido rectificativo**. Sus casillas no se guardan como
datos; a RPS solo pasa el texto. Para contar por tipo de defecto, Calidad tendría que registrarlo
(`APQNCDefect` existe y no se usa para esto).

Ejemplo: NC010176. Pedido AR.26.04635 (medida 462 cm, debía ser 434), rectificado en AR.26.05096, cuya hoja va
en el PDF de AR.26.05096. En RPS: sin procesos, abierta, y en comentarios «sin fotos no se puede investigar».

### Comentarios de Calidad

`APQNonConformity.Comments` guarda el seguimiento, y a veces es justo lo que OT necesita: en NC010188, «Un toldo
modelo Electra con guías no puede aparecer en el planteamiento "perfil aluminio universal 280"». Se enseñan en
la ficha, plegados.

## 4. Qué enseña Coordina

- **Ficha del pedido** (tablero e Historial, todas las secciones), solo si hay algo: la NC del pedido con su
  fecha, procesos, origen, si está abierta, el texto y los comentarios de Calidad, y «rectificado en …» con
  enlace al parte del rectificativo (donde viene la hoja). Si el pedido es un rectificativo: «Este pedido
  rectifica el …», con enlace al parte del original.
- **Métricas de OT y Diseño**: incidencias de la sección y panel de no conformidades (las de la sección, cuántas
  con rectificativo, cuántas sin clasificar, y el total de la empresa).
- **Métricas de Diseño e Impresión**: sin nada de revisión (no revisan).

Código: `src/lib/server/nc-db.ts`, `src/lib/no-conformidad.ts`, `src/components/NoConformidadesPedido.tsx`,
`src/lib/server/metricas-fuentes.ts` (`INCIDENCIAS`), `src/components/MetricasView.tsx`.
