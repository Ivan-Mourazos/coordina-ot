# Unificar las vistas: Pendientes, Revisiones, Visitas y la ficha del pedido

Fecha: 16/09/2026

## El problema

Las pestañas de CoordinaOT se han ido construyendo una a una y cada una trajo
su propia forma de pintar lo mismo. Hoy conviven:

**Tres maneras de desplegar una fila.**

| Dónde | Cómo | Qué se ve |
|---|---|---|
| Historial, Pendientes | `Desplegable` | abre y cierra con animación |
| Visitas | `{abierta && …}` | aparece y desaparece en seco |
| Tareas y tiempos | `popover` nativo | ventana encima de todo, bloquea el scroll |

**Cuatro maneras de pintar una lista.** Tabla HTML en Pendientes, rejilla
dentro de un bloque con relieve en Historial, tarjetas en columnas kanban en
Revisiones, tarjetas sueltas en Visitas.

La consecuencia no es estética. El mismo gesto —abrir un pedido para ver qué
tiene dentro— se comporta distinto según la pestaña en la que estés, y el sitio
donde mirar cambia de una a otra. Además, dos de esas formas tienen defectos
propios: las tarjetas de Revisiones viven en columnas de ~260 px y ahí no cabe
lo que tienen que enseñar, y el modal de Tareas y tiempos tapa la ficha que
estabas leyendo.

La referencia es el **Historial**: es la vista que mejor resuelve el problema
—lista densa, fila que se despliega, acento claro sobre lo abierto— y la que
ya usan a diario. Las demás se traen a su idioma.

## La gramática común

Se extraen dos piezas nuevas. No son un rediseño: son lo que el Historial ya
hace, puesto donde las otras tres vistas puedan usarlo.

### `BloqueLista`

El contenedor de una lista. Envuelve las filas en `bloque-3d rounded-xl
overflow-hidden` y pinta la cabecera de columnas **fuera** del bloque, encima,
sobre el fondo de la página.

Props: `columnas` (la clase de rejilla, literal — Tailwind solo compila las
clases que ve escritas), `cabecera` (los rótulos de columna), `rotulo`
(opcional: el título del bloque, con punto de color y contador), `children`.

### `FilaDesplegable`

Una fila que se abre. Lleva:

- Un botón invisible en `absolute inset-0` que cubre la fila entera: pulsar en
  cualquier punto despliega. Los elementos que tienen su propia acción (el
  código del pedido, un selector) son hermanos suyos, no hijos, para que un
  clic produzca una sola acción.
- Un chevron que rota 180° al abrir.
- Abierta: barra `bg-brand-500` de 4 px a la izquierda, que recorre fila y
  detalle, y fondo `bg-brand-500/10`.
- Cerrada: `hover:bg-surface-2`.
- Hairline `border-b border-border last:border-b-0`.
- El detalle dentro de `Desplegable`, que ya resuelve la animación de cierre
  sin desmontar a la primera.

Props: `columnas`, `abierta`, `onAlternar`, `etiqueta` (para el
`aria-label` de plegar/desplegar), `celdas`, `detalle`.

Las cuatro vistas pasan a usar estas dos piezas. El contenido de cada fila y de
cada despliegue sigue siendo de cada vista.

### Contraste

Dos opacidades bajan la legibilidad por debajo de lo aceptable y se van:

- `opacity-60` en la fila "Sin procesar" de Pendientes. La píldora ya lo dice;
  apagar la fila entera además hace ilegible el resto de sus datos.
- `border-border/60` en la visita ya hecha. La píldora "Hecha" es el aviso.

## Pendientes

La tabla HTML pasa a `BloqueLista`. **Un solo bloque, sin agrupar.** El orden
lo siguen mandando los filtros y las cabeceras de hoy: no cambia.

Las cuatro columnas se conservan con sus anchos actuales —`Pedido · cliente`
36 %, `Quién · estado` 22 %, `Recorrido` 42 % con mínimo de 520 px— y la
cabecera sigue pegada arriba al hacer scroll. El componente `Detalle` que se
abre bajo la fila no se toca: no se pierde ningún dato.

Sale ganando el acento de lo desplegado. Con `<tr>` no se puede poner un borde
continuo que recorra dos filas, así que hoy se finge con dos pseudoelementos
—`ACENTO_ARRIBA` y `ACENTO_ABAJO`— que dibujan media barra cada uno. Con
rejilla es una sola barra y ese apaño desaparece.

## Revisiones

Las cuatro columnas **giran 90°**: lo que hoy va de izquierda a derecha pasa a
ir de arriba abajo, en el mismo orden (Por revisar → En revisión → Aprobadas →
Devueltas). Cada estado es un `BloqueLista` con su rótulo encima: punto de
color, nombre y contador de OF.

Cada pedido es una línea, no una tarjeta:

```
› AR.26.03877   BAR PEPE · TERRAZA   [toldos]   3 OF   2h10   IS → AG
```

Al desplegar, dentro de la propia fila y a todo el ancho:

- Las OF con su código, descripción, familia y avatares de autor y revisor.
- El selector de revisor.
- La guía de revisión (solo en "En revisión", como hoy).
- Aprobar y Devolver (solo lo que la máquina de estados ofrezca a quien mira).
- La nota de devolución (solo en "Devueltas").

Nada se pierde. Lo que cambia es que deja de estar comprimido en 260 px.

El conmutador *Solo mías / Todo el equipo* y la tira de "Revisando ahora" se
quedan donde están, sobre los cuatro bloques.

### Volver a plantear

Hoy sale con tono `neutra`, que el `Btn` de la ficha pinta como `ghost`:
`border border-border text-text-muted`. En oscuro eso es texto gris sobre
cristal gris, y va al final de la fila de acciones de la OF, entre iguales.

Pero cuando esta acción aparece es la **única** que esa OF admite: sale solo en
una OF aprobada con la marca de cerrada en RPS, y `noSi` apaga todas las demás.
Un botón que es la única salida no puede parecer el último de una lista.

Pasa a botón propio, con relieve —`chip-3d`, el mismo de "Tareas y tiempos"— y
texto `text-text` en lugar de `text-text-muted`, colocado en la cabecera de la
OF y no al final de su fila de acciones.

## Tareas y tiempos

Deja de ser un modal. Pasa a **bloque desplegable dentro del panel de
detalles**, con el mismo rótulo, borde y fondo que Documentos y Notas.

Sigue pidiéndose al abrirlo y no al abrir la ficha: la consulta a RPS cuesta
entre 2,5 y 5 segundos medidos, y la mayoría de las veces la ficha se abre para
fichar, no para mirar tiempos. Lo que se gana es que ya no tapa lo que estabas
leyendo ni bloquea el scroll de detrás.

El contenido se rehace. Hoy cada tarea es un `flex` de tres trozos que compiten
por el ancho, con `py-1` y sin separación entre centros:

| Hoy | Después |
|---|---|
| `flex` con `gap-3`, tres trozos sin alinear | tres columnas alineadas: **tarea** / **quién** / **tiempo** |
| `py-1`, centros pegados | aire entre centros, hairline solo donde corta |
| tiempos en varias tipografías y tamaños | todos `font-mono tabular-nums`, en columna a la derecha |
| "Sin desglose de tareas disponible." | "Esta OF no tiene tareas en RPS." |

En la lista del Historial, donde no hay ficha abierta, el botón se queda pero
abre ese mismo bloque **dentro de la fila ya desplegada**, debajo de las OF.
El popover se elimina por completo.

## La ficha del pedido

### Cabecera

Hoy el código, la prioridad y el cliente van en la cabecera fija, y las piezas,
la ciudad de entrega y las familias van sueltas en el cuerpo, que hace scroll:
se pierden de vista en cuanto bajas. Son datos de identidad del pedido, del
mismo orden que el cliente.

Suben a la cabecera, en un tercer renglón:

```
AR.26.03914   [P3 Urgente]
MAHOU · NOVA CAMELIAS
4 piezas · Madrid · [toldos] [lona]
```

`DatosEnLinea` desaparece del cuerpo de la ficha de Pendientes. El componente
se conserva: lo usa también la ficha del Historial, que no se toca en este
trabajo.

### Asignar autor (pedido entero)

Hoy es una caja con borde, fondo y rótulo propio: unos 3 rem de alto para un
selector. Pasa a una línea —rótulo pequeño y selector a la derecha, sin caja—
dentro del flujo del cuerpo.

### Orden del cuerpo

De arriba abajo: comentario del pedido de venta → aviso de parte re-escaneado →
línea de tiempo → Documentos → Tareas y tiempos → Notas → Asignar autor → OF.

El criterio es el de hoy y no cambia: primero lo que hay que mirar para hacer
el trabajo, después lo que se ha dicho sobre él, y al final lo que se decide.
Tareas y tiempos entra junto a Documentos porque es lo mismo: información de
RPS que se consulta plegada.

## Visitas

Las tarjetas pasan a `BloqueLista` + `FilaDesplegable`. El calendario se queda
a la izquierda, pegado al hacer scroll, como está.

### Datos que se van

- **`Orden: 5891234`** — el id interno de la orden en RPS. Nadie habla de una
  visita por ese número.
- **`Estado RPS: PTE`** — el código crudo del estado. Arriba ya está la píldora
  "Hecha" o su ausencia, que es el mismo dato en el idioma de quien lo lee.

Se quedan el código de incidencia y la solución: la incidencia es por donde se
busca la visita en RPS cuando hace falta, y la solución dice cómo acabó.

### Textos

| Hoy | Después |
|---|---|
| `Aviso: 04/09/2026, 11:32` | `Avisado el 4 sep, 11:32` |
| `Sin descripción` | `Sin motivo escrito` |
| `Sin código` | (no se pinta nada) |

El resto de textos de la vista ya está en el idioma del equipo y no se toca.

## Qué queda fuera

- **La lógica de negocio.** Acciones, máquina de estados, guía de revisión,
  motor de fichaje y permisos: no se tocan. Este trabajo es de presentación.
- **Las consultas a RPS.** Ni una query nueva ni una modificada.
- **Los filtros** de cada pestaña, y el orden que producen.
- **La ficha del Historial** (`HistorialDrawer`) y la **consulta pública**.
  Comparten `MarcoFicha` y `DatosEnLinea` con la ficha de Pendientes, así que
  los cambios de la cabecera se hacen sin romperlas: el tercer renglón entra
  como prop opcional de `CabeceraFicha`, y `DatosEnLinea` se queda tal cual
  para quien lo siga usando.
- **El Panel** (pestaña `asignar`) y **Métricas**: ya están en el idioma común
  o no son listas.

## Cómo se comprueba

- `pnpm test` en verde (hay pruebas de `lib/acciones`, `lib/revision`,
  `lib/historial` — este trabajo no las toca, y eso es justo lo que confirman).
- `pnpm build` sin errores de tipos.
- A ojo, con datos reales, en claro y en oscuro: las cuatro pestañas abren y
  cierran una fila con la misma animación, el mismo acento dorado y el mismo
  chevron.
- Con teclado: el tabulador llega al chevron de cada fila, y `aria-expanded`
  cambia al abrir.
- El agente `ui-reviewer` sobre los componentes tocados.

## Log de novedades

Lo que el equipo nota, y por tanto lleva línea `Novedad:`:

- Revisiones en lista a lo ancho, con el detalle dentro (`mejor`).
- Tareas y tiempos deja de abrirse encima y se abre dentro (`mejor`).
- En la ficha, las piezas, el sitio de entrega y las familias dejan de
  perderse al bajar (`mejor`).
- "Volver a plantear" se ve (`arreglado`).
- En Visitas desaparecen dos datos que no dicen nada (`mejor`).

Lo que no lleva línea: extraer `BloqueLista` y `FilaDesplegable`, y cambiar la
tabla de Pendientes por una rejilla. Son cambios internos que se notan en el
acabado, no en lo que se puede hacer; van contados dentro de las líneas de
arriba y no aparte.
