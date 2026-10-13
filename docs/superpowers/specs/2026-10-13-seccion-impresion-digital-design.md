# Sección Impresión Digital — diseño

Fecha: 2026-10-13 · Pide: Iván · Para: Manuel Gómez Camino (CodEmployee 22)

## Por qué

Imprimir es otro trabajo que Diseño Gráfico. Desde el 09/10/2026 el Historial
ya separa su tiempo en el centro «Impresión» (`RECURSOS_IMPRESION` en
`lib/historial-centros.ts`), pero no hay tablero: Manuel no ve su cola en la
web. Este es el paso 2: una tercera sección con tablero propio.

**Regla dura: Diseño Gráfico no cambia.** Sus recursos (A-DGRA, DGRA-A,
P-PCUS), sus tareas —también «PLANTEAR Y PREPARAR ARCHIVOS IMPRESION
DIGITAL»— y su flujo con revisión se quedan como están.

## Datos medidos (OLANET, 13/10/2026)

Fases vivas (`IdEstadoOF IN (0,1,2)`) por centro en `scg_Fases.MaquinaTeo`:

| MaquinaTeo | Fases | Notas |
|---|---|---|
| `U-P-IMDI` | 33 | IMDI-A aparece así en OLANET, nunca como «IMDI-A» |
| `P-HPLA` | 13 | 11 sin empezar, 1 iniciada, 1 interrumpida |
| `P-PCMU` | 2 | troquelar vinilo |

Descripciones: «IMPRIMIR», «IMPRIMIR Y BARNIZAR», «IMPRIMIR Y BARNIZAR LONA»,
«IMPRESION DIGITAL EN PLOTTER».

## Decisiones

1. **Tablero completo.** Manuel ve su cola, ficha desde la web y cierra el
   pedido al imprimirlo. Sus bonos van a OLANET.
2. **Sin revisión.** Nadie revisa lo impreso.
3. **Manuel pasa a Impresión.** Entra ahí por defecto y sigue pudiendo abrir
   Diseño con el selector de sección.
4. **El troquelado (P-PCMU) solo cuenta tiempo.** Se ficha en la máquina, como
   el corte de Diseño (P-PCUS), y no sale en el tablero.
5. **La cola sale solo de OLANET.** No hay vista `TGM_PENDIENTE_*` de
   impresión. Coste aceptado: una OF recién lanzada que OLANET aún no tenga
   tarda unos minutos en aparecer.
6. **Un botón: «Impreso».** Sobre el pedido entero, aprueba sin revisión y lo
   pasa a Producción en el mismo gesto.

## Diseño

### Sección en `lib/secciones.ts`

```ts
impresion: {
  id: "impresion",
  nombre: "Impresión Digital",
  fuente: "olanet",
  // sin `vista`
  recursos: ["imdi-a", "p-hpla", "p-pcmu"],
  recursosSoloTiempo: ["p-pcmu"],
  maquina: "IMDI-A",
  marcasEnFases: ["IMDI", "P-HPLA"],
  nombreCorto: "Impresión",
  ordenFases: ["sinEmpezar", "planteando", "listoParaPasar", "parado"],
  revisionPorPedido: true,
  barraSimple: true,
  internosComoTrabajo: true,
  sinRevision: true,
  etiquetasFase: { planteando: "Imprimiendo", listoParaPasar: "Impreso, sin pasar" },
}
```

- `SeccionId` pasa a `"ot" | "diseno" | "impresion"`, y `esSeccionId` se
  deriva de `SECCIONES`, sin literales.
- **`vista` pasa a opcional.** Si falta, `filasDeLaSeccion` (`rps.ts`) no llama
  a `clavesDeLaVista` y la lista es OLANET más las OF retenidas. Solo se acepta
  sin vista cuando la fuente es `olanet`; con fuente `vista` la vista sigue
  siendo obligatoria, y eso lo comprueba un test.
- Las marcas no chocan: `IMDI` y `P-HPLA` no aparecen en ningún centro de OT
  ni de Diseño, y `esFaseDeLaWeb` las recoge sin cambios. `P-PCMU` queda fuera
  de las marcas: no sale en el tablero y la web no cierra esas fases.
- `RECURSOS_IMPRESION` del Historial deja de ser una lista aparte y pasa a ser
  `SECCIONES.impresion.recursos`. El centro «impresion» del Historial ya es
  ese id, así que no hay que renombrar nada.

### Sin revisión: `sinRevision`

Flag nuevo en `Seccion`. Ausente significa el flujo de siempre. Con él:

- **Columnas del tablero:** Sin empezar → Imprimiendo → Impreso, sin pasar →
  Parado. Se quitan «A corregir» y «Esperando revisión», porque con este flujo
  nunca se llega a ellas. «Listo para pasar» se queda con el nombre «Impreso,
  sin pasar» (decidido al planificar): si el segundo guardado de «Impreso»
  falla, el pedido no puede desaparecer del tablero.
- **Acción «Impreso»** sobre el pedido (`revisionPorPedido`). Solo sale si
  todo lo que queda del pedido es de Manuel o no es de nadie, y está sin
  empezar o en curso.
  - Pone esas OF en `aprobada`, sin revisión. Las que no tenían autor quedan
    con Manuel como autor.
  - Después pasa el pedido con el `completar` de siempre: corta relojes,
    `encolarFinalizacion` y OLANET a estado 3.
  - Son dos peticiones porque `/api/estado` rechaza un `completar` que lleve
    cambios de OF. La regla vive en `lib/impreso.ts`.
- **En la ficha** no se ofrecen «Terminar planteo», «Pedir revisor» ni las
  acciones de revisor.
- **La pestaña Revisión** no lista nada de esta sección.

### Etiquetas por sección: `etiquetasFase`

Mapa opcional `Partial<Record<Fase, string>>`. Lo usan los cuatro sitios que
ya consultan `ordenFases`: el panel, la tarjeta, la consulta y «ver todos».
Hay un único helper, `etiquetaFase(fase, seccion)`, para que no se escriba la
etiqueta en dos sitios.

### Manuel

- En `operarios.ts`, el CodEmployee 22 pasa a `seccion: "impresion"`.
- El seed de operarios de `estado-db.ts` y `mock.ts` lo coloca en Impresión.
- Bonos: la máquina sale de `tarea_maquina`, que es el recurso real (IMDI-A o
  P-HPLA). Si falta, cae a `MAQUINA_POR_OPERARIO`, que ahora vale `IMDI-A`.
- Su trabajo de Diseño ya hecho sigue contando en Diseño: el tiempo se
  clasifica por recurso, no por persona.

### Literales «ot»/«diseno» que hay que tocar

`ConsultaEnCurso.tsx` (`SECCIONES_EN_CURSO`), `consulta.ts` (`PasoConsulta`),
`historial-db.ts` (CASE de centros y sus otros usos), `historial-indice.ts`,
`historial-centros.ts` (`NOMBRE_CENTRO`, `CENTRO_TONO`), `SelectorSeccion.tsx`
(`ABREVIADO`), seeds de `estado-db.ts` y `mock.ts`. Donde se pueda, se derivan
de `SECCIONES`.

`publico-db.ts` sigue siendo solo de OT: la consulta pública no cambia.

## Lo que NO entra

- Diseño Gráfico: ni recursos, ni flujo, ni tablero.
- `A-PCMU`, `P-PCCUS` y `PCOR-P`, por lo que dice la memoria
  `plotter-corte-diseno`.
- Pedir una vista a IT.
- Dar a María Raquel Quintela un sitio en la sección. Imprimió una vez
  (AR.26.04904); si imprime más, se añade.

## Pruebas

- Unitarias de `secciones`: que `esSeccionId("impresion")` lo acepte; que
  `seccionDeRecurso` dé `p-hpla` e `imdi-a` como impresión y `p-pcus` como
  Diseño; que `esFaseDe("U-P-IMDI")` sea impresión y `esFaseDe("P-PCMU")`
  quede fuera del tablero; y que ninguna fase de Diseño caiga en impresión ni
  al revés.
- Unitarias de `fases-tablero`: que una sección `sinRevision` nunca dé las
  fases de revisión y que las etiquetas sean las de la sección.
- Unitarias de `acciones`: «Impreso» solo con `sinRevision` y solo para el
  autor del pedido.
- Contra la BD real (opt-in, `VALIDAR_RPS_UI=1`): el tablero de impresión
  devuelve las fases vivas de IMDI y P-HPLA con su pedido, y ninguna es de
  A-DGRA, P-PCUS ni P-PCMU.

## Novedad

```
Novedad: nuevo | Impresión Digital tiene su propio tablero
Detalle: Manuel ve lo que queda por imprimir, ficha desde la web y con «Impreso» pasa el pedido a Producción.
```
