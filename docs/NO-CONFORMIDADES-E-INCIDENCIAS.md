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

### Los nuestros: DISEÑO, principal o secundario

Los rectificados «nuestros» son los que llevan el proceso **DISEÑO** (Iván, 26/10/2026). El orden de los dos
procesos cuenta: el **1 es el principal** (a quien Calidad achaca el fallo) y el **2 el secundario** (también
tuvo parte). Se cuentan por separado; si DISEÑO está en los dos, cuenta como principal (`papelDiseno` en
`src/lib/no-conformidad.ts`).

En 2026 (hasta el 26/10), en toda la empresa: 392 NC, 274 rectificados. De DISEÑO: 38 NC como principal (33
rectificados) y 16 como secundario (14 rectificados). 20 sin clasificar todavía.

### Por nombre: OT, Diseño o Impresión

Ninguna de las tres secciones tiene proceso propio en RPS: todas caen en DISEÑO. Se reparten por las **tareas
del pedido que falló**, con los recursos de cada sección (OT `a-otec`/`otec-a`, Diseño `a-dgra`/`dgra-a`,
Impresión `imdi-a`, `u-p-imdi`, `p-hpla`, `p-iduv`, `p-jeti`). Un pedido con tareas de dos secciones cuenta en
las dos, así que la suma por sección puede pasar del total. Una NC de Comercial o Compras en un pedido con
tareas de OT **no** es de OT.

En 2026 (hasta el 26/10), NC de DISEÑO por sección:

| Sección | Principal | Secundario | Rectificados |
|---|---|---|---|
| Oficina Técnica | 35 | 16 | 44 |
| Diseño Gráfico | 13 | 5 | 16 |
| Impresión Digital | 8 | 3 | 9 |
| Sin tareas de ninguna | 1 | 0 | 1 |

Entran las de proceso DISEÑO **y las que aún no tienen ningún proceso**: Calidad las abre y las clasifica
después, y las de octubre estaban casi todas sin clasificar (NC010176, NC010188). Salen marcadas «sin
clasificar».

Si se quiere que RPS las distinga en origen, la forma limpia es que Calidad tenga dos procesos («Oficina
Técnica» y «Diseño Gráfico») en lugar de uno. Lo decide quien gestiona Calidad en RPS.

### Rectificados

No hay una lista aparte: el pedido rectificativo vive en la NC (`_APQNonConformity_Custom.CodPedidoRectificado`).
En 2026, 274 de 392 NC lo tienen. Por año: 2021: 736 NC (548 con rectificativo) · 2022: 504 (356) · 2023: 542
(386) · 2024: 540 (345) · 2025: 483 (342).

**El % solo para la empresa entera**: «de todos los rectificados, cuántos llevan DISEÑO como principal y cuántos
como secundario» lo dice RPS tal cual. Por sección se dan números sin %, porque el reparto entre OT, Diseño e
Impresión es una deducción por las tareas del pedido.

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
  fecha, procesos con su papel («COMERCIAL (principal) · DISEÑO (secundario)»), origen, si está abierta, el texto y los comentarios de Calidad, y «rectificado en …» con
  enlace al parte del rectificativo (donde viene la hoja). Si el pedido es un rectificativo: «Este pedido
  rectifica el …», con enlace al parte del original.
- **Métricas de OT y Diseño**: incidencias de la sección.
- **Métricas de las tres secciones**: panel de no conformidades. Las de la sección, en NC y rectificados, como
  DISEÑO principal, secundario o sin clasificar; y la empresa entera, con el % de rectificados de DISEÑO
  (principal y secundario) y el reparto por nombre de sección.
- **Métricas de Diseño e Impresión**: sin nada de revisión (no revisan).

Código: `src/lib/server/nc-db.ts`, `src/lib/no-conformidad.ts`, `src/components/NoConformidadesPedido.tsx`,
`src/lib/server/metricas-fuentes.ts` (`INCIDENCIAS`), `src/components/MetricasView.tsx`.
