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

### De quién fue: las causas

El proceso afectado no basta: RPS no separa OT, Diseño e Impresión. Lo que sí lo dice son las **causas** que
Calidad apunta al investigar la NC (`APQNCCause`, colgadas de cada defecto en `APQNCDefect`, con su tipo en
`APQNCGenericCause`). Cada causa lleva:

- un **tipo**: «ERROR EN PLANTEAMIENDO O DISEÑO GRAFICO» (así, con la errata de RPS), «DOCUMENTAR MAL», «ERROR
  AL CONFECCIONAR O PRODUCIR», «ERROR O DEFECTO AL INSTALAR O ENTREGAR»…;
- el **% con que contribuyó** al fallo;
- en la **primera línea del texto, la persona**: «TAMARA», «ADRIAN- Falta de formación.», «Juan Castro y
  Adrián Quinteiro Vaamonde,».

Ejemplo, NC010178 (AR.26.02293 → AR.26.05101): OSCAR · documentar mal · 80 %; TAMARA · error en planteamiento
o diseño gráfico · 10 %; LOIS · error al instalar · 10 %…

**Son nuestras las causas de tipo «error en planteamiento o diseño gráfico»** (Iván, 26/10/2026), y la persona
dice la sección. Una causa de otro tipo que nombra a alguien nuestro no cuenta (hay un Iván de fábrica, un
Manuel Rivadulla…). Lucía Guillín ya no está en el equipo, pero sus causas son de OT. La lista de nombres y
secciones es `RESPONSABLES` en `src/lib/no-conformidad.ts`; una causa nuestra sin nadie reconocido se lleva a la
sección cuyas tareas lleva el pedido.

En 2026 (hasta el 26/10): 54 causas de ese tipo, 49 con un nombre nuestro. NC con alguna causa nuestra: 51 (46
rectificados, el 17 % de los 274 de la empresa). Por sección: OT 45 (40 rectificados), Diseño 4 (4), Impresión
5 (5). 22 NC aún sin investigar.

### Cuánto pesa lo nuestro, y si es la causa mayor

Contar la NC entera por tener una causa nuestra infla lo nuestro: en NC010178 Tamara tiene un 10 % de un
defecto y Documentación un 80 %. Así que cada NC se **reparte** (`repartoNc` en `src/lib/no-conformidad.ts`):

1. **El % de cada causa lo pone Calidad**, a mano, en `APQNCCause.Contribution`. Va **por defecto**: las causas
   de un defecto suman 100 (343 de 432 defectos en 2026). Casi todos los demás son de una sola causa con el % a
   0, y entonces esa causa se lleva el defecto entero; si un defecto tiene varias a 0, a partes iguales.
2. **Cada defecto vale lo mismo** dentro de la NC. Así la NC suma 1.
3. Lo nuestro se suma por **sección y persona**; lo ajeno, por **tipo de causa** («documentar mal»,
   «instalar»…). Dos personas en la misma causa se la reparten.

Ejemplo, NC010178: dos defectos, cada uno vale la mitad. Tamara tiene el 10 % del primero → **5 % de la NC**.
Documentar mal, 40 %; instalar, 30 %; producir, 25 %.

**Causa mayor**: la sección es la causa mayor si su peso no es menor que el de ningún otro (cada tipo de causa
ajeno y cada otra sección); un empate cuenta como mayor. En NC010178, OT es causa menor.

En Métricas se ven las dos lecturas:

- **«Con alguna causa nuestra»**: cuenta la NC entera. Dice a cuántas tocamos.
- **«Lo nuestro pesa» / «Equivale a»**: suma solo nuestra parte. Es la justa.

En 2026 (hasta el 26/10): de 274 rectificados, 46 tienen alguna causa nuestra (17 %), pero lo nuestro pesa
28,7 (10,5 %). Somos la causa mayor en 40 de las 51 NC con causa nuestra. Por sección: OT 45 NC, mayor en 34,
equivale a 28,3 · Diseño 4, mayor en 2, equivale a 1,6 · Impresión 5, mayor en 5, equivale a 3,8.

El % de la empresa (sobre todos los rectificados) es el único porcentaje; por sección van números.

### Rectificados por familia de producto

Para ver en qué familias tiene cada sección más rectificados y cuánta culpa media lleva en ellos
(`rectificadosPorFamilia` en `src/lib/no-conformidad.ts`):

- Entran los **rectificados** (NC con pedido rectificativo) cuyo pedido lleva tareas de la sección.
- Cada uno cuenta en la familia de las OF donde la sección tiene tareas (si no se sabe en cuál, en todas las del
  pedido). La familia es la misma regla que el resto de Métricas (`familiaDe` en `metricas-fuentes.ts`).
- **Con causa**: los que Calidad achaca en algo a la sección.
- **Culpa media**: la parte media de la sección (ver arriba) **solo entre los ya investigados**; uno sin causas
  daría un 0 que no es verdad.

En 2026 (hasta el 26/10), OT: Toldo 128 rectificados, 17 con causa de OT, culpa media 6 % · Lona 43, 13, 17 %
· Funda 12, 4, 27 % · Remolque 12, 4, 27 %. Diseño: Toldo 53, 3, 3 % · En vinilo 12, 0, 0 %. Un pedido con
OF de dos familias cuenta en las dos.

### Pendientes de investigar

Una NC recién abierta no tiene causas: Calidad la investiga después (las de octubre estaban casi todas así:
NC010176, NC010188). Se enseñan aparte, «pendientes de investigar», en la sección cuyas tareas lleva el pedido
que falló (OT `a-otec`/`otec-a`, Diseño `a-dgra`/`dgra-a`, Impresión `imdi-a`, `u-p-imdi`, `p-hpla`,
`p-iduv`, `p-jeti`), salvo que el proceso afectado ya la descarte (Comercial, Compras…). Pueden acabar no
siendo nuestras.

### El proceso afectado, principal o secundario

También se enseña, porque dice otra cosa (Iván, 26/10/2026): el **proceso 1 es el principal** y el **2 el
secundario**. En 2026: DISEÑO como principal en 38 NC y como secundario en 16. Si se quiere que RPS distinga
las secciones en origen, la forma limpia es que Calidad tenga un proceso por sección en lugar de uno.

### Rectificados

No hay una lista aparte: el pedido rectificativo vive en la NC (`_APQNonConformity_Custom.CodPedidoRectificado`).
En 2026, 274 de 392 NC lo tienen. Por año: 2021: 736 NC (548 con rectificativo) · 2022: 504 (356) · 2023: 542
(386) · 2024: 540 (345) · 2025: 483 (342).

**El % solo para la empresa entera** (rectificados con causa nuestra sobre todos los rectificados). Por sección,
números: una NC con causas de dos secciones cuenta en las dos.

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
  fecha, procesos con su papel («COMERCIAL (principal) · DISEÑO (secundario)»), la parte de cada sección nuestra («OT 5 % (causa menor)»), origen, si está abierta, y «rectificado en …» con
  enlace al parte del rectificativo (donde viene la hoja). Si el pedido es un rectificativo: «Este pedido
  rectifica el …», con enlace al parte del original. En «Ver detalles», plegado: el reparto de la culpa en barras
  (cada sección nuestra y cada tipo de causa ajeno), los defectos con sus causas (persona, tipo, % y texto), lo que
  escribió Calidad y sus comentarios.
- **Métricas de OT y Diseño**: incidencias de la sección.
- **Métricas de las tres secciones**: rectificados por familia de producto, con cuántos tienen causa de la
  sección y la culpa media.
- **Métricas de las tres secciones**: panel de no conformidades. Las de la sección por causa de planteamiento de
  alguien de la sección y las pendientes de investigar, en NC y rectificados, con «tuyas» para quien mira (sin
  nombres de compañeros: cada uno ve lo suyo). La empresa entera: % de rectificados con causa nuestra, reparto
  por sección y el proceso DISEÑO como principal o secundario.
- **Métricas de Diseño e Impresión**: sin nada de revisión (no revisan).

Código: `src/lib/server/nc-db.ts`, `src/lib/no-conformidad.ts`, `src/components/NoConformidadesPedido.tsx`,
`src/lib/server/metricas-fuentes.ts` (`INCIDENCIAS`), `src/components/MetricasView.tsx`.
