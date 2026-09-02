# El tablero de Diseño Gráfico sale de OLANET, no de la vista de RPS

Fecha: 2026-09-02
Estado: diseño aprobado, pendiente de plan de implementación

## El problema

A Diseño Gráfico le faltan pedidos en su tablero. El caso que lo destapó:
`AR.26.02055` (MAHOU, OF 0228027), que se lo bajaron a mano el 02/09 y no
aparecía por ninguna parte. El segundo, `AR.26.03545` (OF 0230526), igual.

`TGM_PENDIENTE_DISENHO` es un clon de la vista de OT con el centro cambiado, y
filtra por dos condiciones que en Diseño no significan lo que parecen:

```sql
WHERE (e.PercentProgress < 100) AND (sit.CodSituation NOT IN (6))
```

## Lo que se midió (2026-09-02, contra la BD real)

**`CPRMOTask.PercentProgress` no mide avance.** Cada `CPRImputationMO` entra con
`PercentProgress = 100`, así que la tarea vale 0 hasta que alguien ficha el
primer minuto y 100 desde ese momento. En tareas de A-DGRA de OFs creadas en
2026: 1.710 al 100 % (todas con imputación) frente a 52 por debajo (todas sin
ninguna). Idéntico en OTEC. El filtro `< 100` no dice "sin acabar", dice **"nadie
le ha fichado todavía"**.

Y falla también en el otro sentido: 0231636, 0231126, 0210459 y 0199284 están al
100 % en RPS **con cero imputaciones**, y en OLANET siguen cargadas.

**Los cierres masivos entierran trabajo.** `RealEndDate` con `Notes` =
"CUMPLIMENTADO AUTOMATICO": el 28/07/2026 se cerraron 3.274 OFs y entre el 27 y
el 30/04 unas 12.000. Ahí quedó el 02055.

**Diseño no ficha como OT.** Fases de A-DGRA en `scg_Fases`, histórico completo:
40 cargadas, 10.883 finalizadas, 14.391 eliminadas y **cero** iniciadas o
interrumpidas. Van de 0 a 3 de un salto. Las 23 interrumpidas de OTEC son de
nuestra propia web.

**La foto de hoy.** Su tablero enseña 43 filas: 14 están muertas en OLANET (4 con
todas sus fases en estado 4, 8 DETENIDAS y 2 CREADAS con `AllowImputations =
false`) y le faltan 11 que OLANET tiene como cargadas.

**El desfase RPS → OLANET es pequeño pero real.** Mediana 0 días (51 de 58 el
mismo día), máximo 3. Hoy le tocaba a 0231780 (`AR.26.04286`), lanzada el 02/09 y
todavía sin fases en OLANET.

**Fichar una OF cerrada funciona.** Los 2.851 bonos de A-DGRA de 2026 están todos
con `traspasado = 2` y `resultado` vacío, sin un solo rechazo; y en RPS hay 99
imputaciones de Carrón, Manuel y Smith posteriores al `RealEndDate` de su OF (45
OFs, 1.466 minutos). El terminal lo admite y el traspaso lo acepta.

## Lo que se decide

### 1. La lista sale de OLANET

Las fases de la sección en `scg_Fases` con `IdEstadoOF` en `(0 cargada,
1 iniciada, 2 interrumpida)`, filtradas por `MaquinaTeo` con la marca de la
sección (`marcaEnFases`, que ya existe en `secciones.ts` y recoge también
`U-A-DGRA`).

Los tres estados, no solo el 0: dejar fuera iniciada e interrumpida haría que la
tarjeta se desvaneciera a media faena en cuanto alguien fichara desde la web, que
es el fallo que se está arreglando.

### 2. Más lo recién lanzado que OLANET aún no tiene

Se añaden las filas de `TGM_PENDIENTE_DISENHO` cuya `(OF, tarea)` no esté ya en
lo que devolvió OLANET **y** cuya OF admita imputaciones
(`PermiteImputaciones`). Eso recupera el 0231780 sin colar las 8 DETENIDAS ni las
2 CREADAS, que no se pueden fichar.

El emparejamiento normaliza los ceros a la izquierda: `CodTarea` "03" y `Fase`
"3" son la misma fase, y compararlas en crudo parte la unión.

### 3. Oficina Técnica no se toca

OT sigue con su vista. Funciona, y cambiar las dos fuentes a la vez es meter mano
en lo que va bien. `Seccion` gana un campo `fuente: "vista" | "olanet"` para que
la diferencia viva donde vive todo lo demás que distingue una sección de otra, y
no repartida por el código.

### 4. RPS sigue poniendo los datos del pedido

Cliente, fechas, prioridad, familia, material, compras: igual que hoy. Lo único
que cambia es de dónde sale la LISTA de OFs. Como efecto secundario, Diseño se
ahorra la vista pesada (7-15 s).

### 5. El arrastre sale y ellos lo cierran

Las 6 fases de 2020-2024 y las 10 planificadas a 2030 aparecen en el tablero.
Estado 0 es finalizable, así que la herramienta de fases que ya tiene la web
sirve para que las cierren ellos. Molestará unos días y quedará limpio; un corte
por antigüedad las escondería para siempre sin resolverlas.

### 6. Traer una OF a mano, y que fiche

Desde el buscador, que ya encuentra cualquier pedido esté donde esté, un botón
engancha la OF al tablero de la sección. Se guarda en nuestro SQLite.

Esa tarjeta **sí ficha**: se escribe el bono en `sch_RPS_bonos` y **no** se mueve
`IdEstadoOF`. `insertarBono` y `moverFase` ya son funciones separadas y el bono
solo necesita OF, `numope` y máquina, no el `IdBoletin`. Es exactamente lo que
hace hoy el terminal con el 2055, y la regla de no resucitar lo que OLANET dio
por muerto se respeta entera: no se le cambia el estado a nada, solo se apunta el
tiempo. Queda marcado en el SQLite para poder auditarlo después.

## Arquitectura

```
                    ┌─ olanet.ts: fasesPendientesDe(seccion) ──┐
  fuente "olanet" ──┤                                          ├─→ FilaVista[]
                    └─ rps.ts:    filasPorOF(ofs, seccion) ─────┘
                                                                     │
  fuente "vista"  ──── rps.ts: la consulta de hoy ───────────────────┤
                                                                     ↓
                              consultarTablero(): auxiliares en paralelo,
                              agrupado por pedido, contrato de Tablero
```

`consultarTablero` ya trabaja sobre un `FilaVista[]` y todo lo de después
(fichajes, reservas, compras, imputaciones, ventas, tareas, subfamilias,
agrupado) parte de ese array. El cambio es sustituir la primera consulta y no
tocar nada del resto.

Piezas nuevas:

- **`fasesPendientesDe(seccion)`** en `server/olanet.ts`. Devuelve
  `{ of, fase, idBoletin, estado }[]`. Filtra por `marcaEnFases` y por los tres
  estados vivos.
- **`filasPorOF(pares, seccion)`** en `server/rps.ts`. El mismo SELECT que el
  cuerpo de la vista (incluidas las subconsultas de `FechaCompras` y
  `FechaPlanificada`), acotado por las parejas (OF, tarea) que llegan, y sin los
  dos filtros que la vista trae dentro. Se copia a nuestro código a propósito:
  esos filtros son justamente lo que sobra.
- **`unirFuentes(deOlanet, deVista)`** puro y testeable, con la normalización de
  ceros. Es donde vive la regla del punto 2.
- **`fuente`** en `Seccion` (`secciones.ts`).
- **`of_traida`** en el SQLite de estado: OF, sección, quién y cuándo.

## Qué se prueba

Tests unitarios, sin BD:

- `unirFuentes`: OLANET manda; la vista solo añade lo que falta y solo si admite
  imputaciones; "03" y "3" son la misma fase; listas vacías por los dos lados.
- `fasesPendientesDe`: que `U-A-DGRA` entra y que `A-OTEC` no.
- Que una fase eliminada o finalizada traída a mano genera bono y **no** llamada
  a `moverFase`.

Contra la BD real, antes de desplegar: que la lista de Diseño da las ~41 filas
esperadas, con las 11 recuperadas dentro y las 13 muertas fuera, y que el tablero
de OT no se mueve ni una fila.

## Lo que este diseño NO resuelve

Cuando rehacen algo cuya fase ya está finalizada —el 03545, con los 18 minutos de
Carrón del 07/08— no hay rastro en RPS ni en OLANET. Nadie lo sabe hasta que
alguien lo dice, y por eso el punto 6 es a mano y no automático. Si más adelante
aparece una señal (un parte re-escaneado, una nota), se podrá proponer sola.
