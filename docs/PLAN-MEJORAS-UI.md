# Plan de coherencia visual y uso — 10/09/2026

## Alcance y decisión

Revisión del código de `main` en `d95188d` y de la web en producción: Panel,
Pendientes, Revisiones, Visitas, Historial y Métricas, en escritorio y tema oscuro.
Comparación adicional de Pendientes, Historial y Revisiones en modo claro.
También se han comparado los componentes de fichas, tiempos, materiales y documentos.
No se han cambiado pedidos, fichajes ni aprobaciones durante la revisión.

Iván pidió revisar el conjunto antes de tocar piezas aisladas. Este documento
es el plan resultante. **Primera entrega implementada el 11/09, pendiente de desplegar:**
lista única del Historial, filtro por fecha del paso local, aprobación parcial,
filas compactas con columnas, código compartido que abre la ficha y resto que
despliega, sin ojo. El resto del plan sigue pendiente.
La comprobación visual de móvil, sección Diseño y del resto de pantallas en claro
queda como requisito de la implementación, no como validación ya realizada.

La dirección propuesta es conservar la interfaz compacta, la tipografía y el
gris/dorado actuales. Unificar la forma de presentar la misma información y de
interactuar con ella, respetando la función distinta de cada pestaña.

## 1. Resolver primero las confusiones de información

### Un pedido aparece dos veces en Historial

Observado en producción: un mismo pedido aparece en «Pasados a Producción» con
1 OF y en la lista del Historial con 3 OF. Los recuentos tienen ámbitos distintos:
trabajo de la sección frente al conjunto de OF. Esto no demuestra un cálculo
erróneo, pero sí una duplicación y una presentación ambigua.

El bloque superior se alimenta de todos los pedidos con situación `completado`
(`src/components/Board.tsx:1878`, montaje en `:2390`). El Historial los muestra
por separado (`src/components/HistorialView.tsx:159`) sin reconciliarlos con su lista.

**Cambio:** una sola entrada por pedido en la sección consultada. Reconciliar
los pasos locales y las entradas del Historial antes de presentar el resultado.
Conservar los pedidos recién pasados que todavía no devuelva la consulta histórica;
no basta con borrar el bloque superior. Aplicar coherentemente búsqueda, filtros,
orden y paginación a esa unión. Mostrar el número total de OF en Historial; cuando
se muestre un subtotal de sección, nombrar su ámbito.

**Aceptación:** un pedido pasado localmente aparece una vez antes y después de que
RPS refleje su cierre; una reapertura lo excluye conforme a las reglas vigentes.
Buscarlo o cambiar de página no crea duplicados ni lo hace desaparecer indebidamente.

### Una OF aprobada no equivale a un pedido listo

Observado en Revisiones: un pedido tiene una OF en «Listas para pasar» y otra en
«Devueltas». La primera lleva el texto «Lista para pasar a Producción».
El texto se decide únicamente por la aprobación de esa agrupación
(`src/components/RevisionView.tsx:533`). No se ha constatado un fallo de permisos:
el problema verificado es lo que el rótulo da a entender.

**Cambio:** llamar «Aprobadas» a las OF que han superado revisión. Reservar
«Pedido listo para pasar» para cuando todo su trabajo de la sección cumpla la
condición real. En pedidos parciales, indicar cuántas OF están aprobadas y si
quedan otras pendientes o devueltas. Reutilizar el criterio de disponibilidad
del paso, sin crear una segunda definición basada solamente en etiquetas.

**Aceptación:** una OF aprobada y otra devuelta nunca presentan el pedido entero
como listo. Aprobar sigue siendo distinto de pasar; se conserva el paso explícito
por la persona autorizada.

## 2. Pendientes e Historial: el mismo lenguaje de filas

Pendientes usa una tabla con columnas; Historial usa tarjetas sin cabecera.
El código, el número de OF, los autores y los metadatos cambian de tamaño o lugar.
En monitores anchos, Historial deja un gran vacío central y empuja toda la información
al extremo derecho. Pendientes dedica mucho espacio al recorrido temporal.

| Elemento | Propuesta común | Diferencia que sí tiene sentido |
|---|---|---|
| Identidad | Código destacado, número de OF al lado y familias en orden estable | Historial cuenta todas las OF; identificar cualquier subtotal de sección |
| Segunda línea | Cliente y referencia/negocio con jerarquía secundaria | Mostrar solo los campos disponibles, sin huecos de relleno |
| Personas | Nombre y primer apellido; distinguir autor y revisor | Pendientes muestra responsabilidad actual; Historial, autoría del trabajo |
| Estado | Texto breve y color semántico compartido | Activo/pendiente frente a finalizado/pasado |
| Fechas | Columnas alineadas y significado explícito | Planificación en Pendientes; finalización/paso en Historial |
| Desplegado | OF compactas, información adicional bajo botones | Mantener acciones de trabajo donde procedan |

Distribución orientativa para escritorio; el ancho se ajustará con datos reales:

```text
       Pedido · cliente                    Quién · estado        Planificación
  ▸    AR.… · 3 OF · Familia                Nombre Apellido       Fechas / recorrido
       Cliente · referencia                Revisor · estado

       Pedido · cliente                    Autoría · centro      Finalizado
  ▸    AR.… · 3 OF · Familia                Nombre Apellido       Fecha
       Cliente · referencia                Centro, si aclara el origen
```

**Interacción solicitada por Iván:**

- Pulsar el código/nombre del pedido abre su ficha.
- Pulsar el resto de la cabecera o la flecha despliega/pliega las OF.
- Quitar el ojo «Ver detalle» del Historial.
- Los botones interiores conservan su acción y no disparan las dos anteriores.
- Aplicarlo también a los pedidos recién pasados que se integren en Historial.

Pendientes ya separa estos gestos (`src/components/ListaView.tsx:530`, `:549`, `:585`).
Historial abre la ficha desde toda la cabecera y desde el ojo
(`src/components/HistorialView.tsx:442`, `:481`). La estructura nueva debe ofrecer
controles de teclado independientes, nombres accesibles y `aria-expanded`, sin
anidar botones. No extender automáticamente el gesto de desplegar a tarjetas
del Panel que actualmente no tienen un desplegable equivalente.

Mantener una densidad próxima a Pendientes. Acotar el ancho del recorrido para
que las fechas sean legibles y no alejen excesivamente los datos relacionados.
En pantallas pequeñas, conservar código, estado y acción de apertura visibles;
recolocar los metadatos sin añadir desplazamiento horizontal a toda la página.

## 3. Personas, sección y tiempos

- **Sección visible:** OT/Diseño debe verse sin abrir Herramientas. El selector
  actual está dentro del menú (`src/components/Board.tsx:2049`); mostrar su valor
  en la cabecera y conservar un único lugar para cambiarlo. Corregir los textos
  genéricos del Historial que siempre dicen «Oficina Técnica» (`:162`, `:289`).
- **Nombres:** usar nombre y primer apellido en listados y fichas, con un
  formateador común. Pendientes abrevia de otra manera, Historial incluye apellido
  y Visitas muestra nombres completos con ambos apellidos. Conservar el ID como
  identidad interna y una salida diferenciada para «Sin asignar» y «Sin autor registrado».
- **Autoría:** respetar la sección seleccionada; cuando el pedido no tenga tareas
  de ella, mostrar la autoría de los otros centros e identificar el centro cuando
  sea necesario. No sustituir autor del trabajo por quien pulsó «Pasar».
- **Tiempos:** normalizar etiquetas, alineación y formato. Distinguir tiempo de
  RPS, estimación y fichaje actual cuando convivan; no sumar dos fuentes que
  representan el mismo trabajo. `TiempoOF` ya contempla esa distinción.
- **Detalle progresivo:** mantener «Tareas y tiempos» como acceso reconocible y
  evitar repetir tres desgloses casi iguales entre la fila, la OF y la ficha.
  Mostrar personas solo en la sección seleccionada y totales en las demás.
  Conservar precisión y cálculos; cero y dato desconocido no son equivalentes.

Referencias: `src/components/TiempoOF.tsx:104`, `src/components/HistorialTareas.tsx:22`,
`src/components/HistorialDrawer.tsx`, `src/components/RolChip.tsx`.

## 4. Fichas, materiales y documentos

- Compartir la estructura visual de las dos fichas: cabecera, bloques, cierre,
  espacios y desplazamiento. Ya tienen el mismo ancho máximo; extraer solo el
  marco común, sin mezclar sus reglas de negocio.
- Unificar el nombre «Documentos de RPS» y sus contadores. En Pendientes hay un
  acordeón exterior y después los grupos; Historial presenta directamente los
  grupos. Evitar pasos de apertura redundantes conservando la carga bajo demanda.
- Mantener **Fotos primero y todo plegado al entrar**, con los PDF en sus grupos.
  Reutilizar `DocumentosRps` y conservar los enlaces originales.
- Materiales siempre compactos, tras un botón con cantidad. Acordar un vocabulario
  común para «Apuntado/Asignar» y «Apartado/Reservar» sin confundir acciones actuales
  con datos históricos. Una reserva ausente hoy no demuestra que nunca existiera.
- Unificar el comportamiento de las ventanas pequeñas: anclaje, límite de altura,
  foco, clic fuera y Escape. Comprobar que cerrar una no cierra también la ficha.

Referencias: `src/components/DocumentosPedido.tsx:60`,
`src/components/HistorialDrawer.tsx:311`, `src/components/MaterialChip.tsx`.

## 5. Base visual y navegación del conjunto

La web ya tiene variables de color, estilos de foco y tratamiento de movimiento
reducido en `src/app/globals.css`. Aprovechar esa base.

**Claro y oscuro tienen la misma prioridad desde la primera fase.** La revisión
en claro confirma la diferencia entre la tabla continua de Pendientes y las
tarjetas blancas separadas de Historial. Mantener en ambos temas la misma jerarquía,
densidad y significado de los estados, con tonos propios de cada fondo. No resolver
un contraste en oscuro fijando un color que se pierda sobre blanco. Comprobar los
fondos translúcidos reales, textos secundarios, fechas, foco, hover, selección y
menús; la inspección visual realizada no equivale a certificar sus ratios de contraste.

- Tres niveles de texto: dato principal, dato secundario y metadato. Punto de
  partida: 14/12/11 px; no encoger datos importantes para hacerlos caber.
- Espaciado en pasos de 4/8/12/16 px; radios y bordes compartidos. Reducir sombras
  y efectos de relieve en listas densas; reservar los paneles para agrupaciones.
- Botones primarios, secundarios y de icono consistentes. El color de estado,
  prioridad y rol mantiene su significado actual; acompañarlo con texto.
- Un mismo patrón de filtros: búsqueda con etiqueta accesible, limpiar búsqueda
  separado de limpiar todos los filtros, filtros activos visibles y fechas con
  significado explícito. Pendientes tiene una búsqueda cuyo único rótulo es el
  placeholder (`src/components/FilterBar.tsx:200`).
- Explicar qué fecha ordena el Historial. La búsqueda ordena por fecha del pedido;
  «Más recientes primero» por sí solo no explica su relación con la fecha mostrada.
- Conservar búsqueda, filtros y posición al consultar una ficha y volver, o al
  cambiar de pestaña. Valorar URL para los filtros que convenga compartir.
- Carga, vacío y error con un patrón común. Métricas pide reintentar sin ofrecer
  botón (`src/components/MetricasView.tsx:182`); Documentos pide plegar y abrir
  (`src/components/DocumentosPedido.tsx:78`). Ofrecer «Reintentar» directamente.
- Revisar tamaños de pulsación, foco visible, encabezados, nombres accesibles,
  contraste y cierre de capas. El control «Volver arriba» debe mantener posición
  y aspecto coherentes y no tapar el fichaje ni acciones de la ficha.

Visitas conserva su calendario; Métricas, sus gráficos; Panel, la agrupación por
persona y sus accesos rápidos. Compartir controles, personas, estados y superficies
no exige convertir las seis pestañas en la misma pantalla.

## Orden de ejecución y comprobaciones

| Fase | Entrega acotada | Comprobación de salida |
|---|---|---|
| 1 | Historial sin duplicados y textos de aprobación parcial correctos | Casos reales equivalentes y pruebas de reconciliación/estado; sin alterar permisos |
| 2 | Filas comunes de Pendientes/Historial y gestos solicitados; retirar ojo | Ratón y teclado: nombre abre, resto despliega; una sola acción por pulsación |
| 3 | Nombres, sección visible y presentación de tiempos | OT y Diseño; varias personas/centros; totales idénticos antes/después |
| 4 | Fichas, materiales, documentos y filtros coherentes | Fotos plegadas, carga diferida, Escape/foco, búsqueda y retorno conservados |
| 5 | Acabado global para PC | Claro/oscuro; 1280 × 720 como base, 1366 × 768 y 1920 × 1080; nombres y descripciones largos |

Cada fase debe quedar revisable por separado y comprobarse en claro y oscuro;
la fase 5 amplía esa comprobación, no la pospone. Crear componentes compartidos
pequeños a partir de los dos usos reales, sin introducir una tabla universal
llena de opciones. No añadir consultas de red por fila para obtener la nueva apariencia.

Antes de dar una fase por terminada: comprobaciones de tipos y lint; tests para
las reglas de datos/interacción que cambien; revisión real en navegador con
pedidos de una y muchas OF, sin tareas de la sección, finalizados y reabiertos.
La suite verde no sustituye comprobar lo que ve y pulsa el usuario.

Los commits perceptibles llevan `Novedad:` y, cuando aclare el cambio, `Detalle:`.
Ejecutar `pnpm novedades` antes de preparar cada actualización. Este plan documental
no genera una novedad en la aplicación.

Referencia de apoyo para accesibilidad y controles:
[Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md).

## Validación de la primera entrega — 11/09

- La consulta ya incluía pasos locales antes de paginar. Se retiró la segunda
  fuente visual; no hizo falta introducir otra unión en el navegador.
- Prueba contra SQL Server con tablas temporales: paso local sin cierre RPS,
  cierre posterior, reapertura, búsqueda, fechas y dos líneas de venta para una
  misma OF. Probado en OT y Diseño, sin modificar datos de producción.
- La prueba está en `scripts/verificar-historial-ui.test.ts`; requiere
  `VALIDAR_RPS_UI=1` y cargar `.env.local`. La suite ordinaria la omite.
- 983 tests de la suite ordinaria correctos. Tests de presentación comprueban
  que una OF devuelta impide anunciar el pedido completo como listo.
- Lint, tipos y compilación correctos. La compilación conserva el aviso previo
  de Turbopack sobre trazado desde `next.config.ts` en la ruta de documentos.
- Navegador local con RPS: abrir por código, desplegar por cabecera, teclado,
  todas las OF, claro/oscuro y cambio OT/Diseño. Historial sin desbordamiento
  horizontal a 390 px; inspección de escritorio a 1116 y 1440 px.
- La copia local no tiene las marcas de paso de producción. Para los escenarios
  de paso/reapertura se usaron las tablas temporales, no esa ausencia de marcas.

## Segunda entrega — 11/09, pendiente de despliegue

- Sección OT/Diseño visible junto al avatar. En pantallas inferiores a 1024 px,
  la cabecera separa identidad, pestañas y búsqueda en tres filas: el buscador
  ya no tapa el logotipo ni deja las pestañas sin espacio.
- Nombre y primer apellido compartidos por el catálogo del equipo, tiempos,
  autorías y responsables de visitas. Se conservan nombres compuestos y
  partículas como «de la» y «da». La búsqueda de visitas sigue consultando
  el nombre completo en SQL; no se recortan los datos de búsqueda.
- Ambas fichas usan «Documentos de RPS», plegado al entrar. Sus grupos también
  empiezan cerrados y Fotos sigue primero. Pendientes carga al desplegar;
  Historial reutiliza los documentos ya recibidos, sin otra petición.
- El desglose no muestra centros sin OF. Mantiene los centros con trabajo y
  cero minutos; no se modifican los cálculos ni la separación RPS/reloj local.
- Documentos y Métricas ofrecen «Reintentar» ante un fallo de carga. El filtro
  compartido de pedidos tiene etiqueta accesible independiente del placeholder.

Validación visual local con RPS: Pendientes de OT (autor y tiempos coincidentes),
Historial de Diseño (José Luis Carrón, 16 min de Diseño y 29 min de Taller;
personas solo en Diseño), documentos plegados en ambas fichas. Claro a 390 y
1440 px; oscuro a 768 px y ficha a 1440 px. El recorrido de Pendientes aún se
comprime en móvil; esa adaptación queda fuera del alcance acordado posteriormente. No se ha certificado el
contraste ni se ha provocado una caída de red en navegador para probar Reintentar.
983 tests correctos; lint, tipos y compilación correctos. Se conserva el aviso
previo de Turbopack sobre el trazado de archivos en la ruta de documentos.

Pendiente del plan: marco común de fichas,
materiales y ventanas pequeñas, filtros y conservación del contexto, revisión de
contraste y teclado de todas las pantallas. Esta entrega no completa esas fases.

## Alcance corregido por Iván — PC, desde 720p

No se utiliza móvil. Se retira su adaptación del plan. Prioridad: 1280 × 720
y superiores en claro y oscuro, incluyendo la menor altura útil que deja el
navegador. Conservar listas compactas, pestañas, filtros y texto legible.
En fichas de poca altura se reduce el espacio entre bloques y en cabecera/pie,
sin encoger fuentes ni controles. Las acciones y el cierre permanecen accesibles.

Comprobado en navegador local con RPS: Pendientes y ficha de tres OF en claro a
1280 × 720; Historial y ficha en oscuro a 1280 × 630 (altura útil del navegador).
Cabecera y filtros caben sin solaparse. En el pedido de prueba la primera OF
sube unos 60 px; el cierre conserva su espacio y el contenido desplaza por dentro.
Tipos y lint correctos. Cambio de espaciado; no cambian reglas ni cálculos.

## Continuación: filtros del Historial y Escape en Materiales

- Los filtros del Historial viven en el tablero, separados por sección, y
  sobreviven a salir de la pestaña. Se vuelven a consultar los resultados al
  regresar; todavía no se conservan las páginas cargadas ni el desplazamiento.
- «Vaciar la búsqueda» quita solo el texto; «Limpiar filtros» borra el conjunto.
- Escape en Materiales cierra únicamente esa ventana y devuelve el foco al
  botón que la abrió; otra pulsación puede cerrar la ficha.
- Comprobado en navegador: ida y vuelta Pendientes/Historial con «enrollable» y
  familia Puerta; vaciado del texto sin perder la familia. Fecha comparte el
  estado conservado, pero la automatización de su control nativo no confirmó
  la edición y no se cuenta como prueba visual superada.
- Probado Escape en AR.26.04082: primero desaparece Materiales con la ficha
  abierta y el foco en su botón; segundo Escape cierra la ficha.

Siguen pendientes: conservación de páginas/posición, filtros de otras pestañas,
marco común de fichas, resto de ventanas, vocabulario de materiales y revisión
completa de contraste/teclado. Estas comprobaciones no completan todo el plan.

## Tercera entrega — fichas, materiales y contraste (11/09, sin desplegar)

**Escape por capas.** Cada ventana escuchaba Escape en el `document` y todas
reaccionaban a la vez: con la ficha abierta, Escape en el desplegable de autor,
la confirmación, el menú «⋯» o una nota a medias cerraba también la ficha.
Ahora hay una pila común (`lib/capas-escape.ts`, `useCapaEscape`): las capas se
apilan al abrirse y Escape cierra la última. La usan Drawer, HistorialDrawer
(y su parte ampliado), Select, MenuAccionesOF, MenuAsignar, ConfirmDialog,
ScanViewer, VisorDocumento, PanelFlotante, MiFichaje y `usePopover`. Los
`textarea` de devolver, anular y notas cortan su propio Escape. Los popovers
nativos («Tareas y tiempos») se respetan. Tests de la pila (7).
Probado en navegador: Material, desplegable de autor y parte ampliado; en los
tres, el primer Escape cierra solo esa capa (foco de vuelta a su botón) y el
segundo cierra la ficha. Botones interiores de la confirmación, del menú «⋯» y
del visor de documentos no se han recorrido uno a uno en navegador.

**Materiales.** `VentanaAnclada` sustituye al portal propio de Pendientes y al
popover nativo del Historial: anclada al botón, techo de 240 px con scroll,
clic fuera, cierre al mover el panel, Escape como capa. Mismo vocabulario en
las dos fichas: «Asignado en la OF» y «reservado». El Historial enseña un botón
«Material N», marca lo que «sigue reservado» y, sin reserva viva, dice «Sin
reserva viva hoy» (con la explicación de que la reserva se borra al consumir).
La cabecera ya no dice «Asignado por Oficina Técnica»: en Diseño no está
comprobado quién lo apunta. Raya fina (`--border`) entre artículos y cuerpo 3D
(`.ventana-3d`) en claro y oscuro, también en «Tareas y tiempos».
Probado: AR.26.04082 (compras) y AR.26.03798 (7 materiales, sin reserva viva)
a 1280 × 720, claro y oscuro; la ventana cabe sin tapar el cierre.

**Marco común de fichas.** `MarcoFicha` (telón, visor, cabecera, cuerpo, pie) con
`CabeceraFicha`, `DatosFicha`, `FamiliasFicha` y `BloqueFicha`. La lógica de cada
ficha sigue en su componente. Se conservan `pedido-panel`/`pedido-contenido`.
El Historial usa `useScrollBloqueado`. Probado: las dos fichas en claro a 720p;
Historial con parte ampliado y Escape por capas; el body queda libre al cerrar.

**Contraste (medido).** Script en el navegador que compone telón (negro 60 %),
vidrio y tintes de los bloques sobre el fondo de la página y calcula el ratio
WCAG de cada texto de la ficha AR.26.04082. Límites del método: ignora el
desenfoque y los degradados de brillo (estos aclaran un poco en oscuro).

| Par medido | Antes | Después |
|---|---|---|
| Secundario oscuro sobre bloque de vidrio | 3,4–3,7 | ≥4,6 (`--text-muted` #b3b9c2) |
| Cliente de la cabecera, claro | 3,95 | ≥4,6 (`--glass-bg-strong` 0,82) |
| Blanco sobre prioridad Normal | 2,5 | 7+ (tinta oscura, mismo ámbar) |
| Blanco sobre esmeralda/teal/cian-600 | 3,65–3,77 | 5,4–5,5 (-700) |
| Blanco sobre ámbar-500 | 2,15 | 5,0 (ámbar-700) |
| Rojo de «Producción empieza…», claro | 4,48 | rojo-700 |

Resultado: 53 textos de la ficha ≥4,5:1 en los dos temas (peor 4,59 claro,
4,64 oscuro). Queda: iniciales de avatares (3,2:1, color de cada persona).
**No medido:** Historial, Panel, Revisiones, Visitas y Métricas fuera de la ficha.

**Avisos.** La campana no avisa del parte re-escaneado mientras el pedido está
parado por Producción; si nadie lo había visto, suena al liberarlo.

### Decididos por Iván y hechos después

- **OF aprobada que se reabre.** «Reabrir revisión» llevaba siempre a
  `en_revision` («Revisando» del revisor), la pulsara quien la pulsara. Ahora el
  autor tiene «Recuperar para corregir» (aprobada → `en_curso`, conserva el
  revisor) y al mandarla otra vez entra en «Por revisar». El revisor y los
  demás siguen con «Reabrir revisión». Tests de la máquina de estados.
  Tras recuperarla, el autor también ve «Dar por corregida» (la OF ya pasó
  por revisión). Iván lo quiere así: hay pedidos que no se revisan, y el
  atajo tiene que seguir existiendo. Sin revisión previa, el botón es «Dar
  por bueno sin revisión».
- **Filas del Historial.** Una línea por pedido (40 px, antes 57), columna de
  tiempo de la sección, «Solo Taller» cuando el pedido no tiene tareas de la
  sección (SA.24.00312, AR.26.04474, SA.26.00939…), «revisó …» sin «Autor:»
  delante y fecha con año. La lista contaba dos veces el minutaje de una OF
  colgada de dos líneas de venta; ahora cada (OF, tarea, persona) cuenta una
  vez. Comprobado con RPS: 12 pedidos con el mismo tiempo en lista y ficha.
  Probado en claro a 1280 × 720: el código abre la ficha, el resto despliega.
- **«Dar por corregidas las N».** Iván lo pidió: el bloque del pedido lo
  ofrece desde dos OF que quien mira puede dar por corregidas (las suyas, ya
  revisadas), con confirmación en plural. Cada fila conserva su botón. Probado
  con test de renderizado (autor sí, revisor no, una sola OF no); no se ha
  pulsado en el navegador para no escribir estados ni fichaje.

- **Nombre y tiempo, sin rol (decidido por Iván).** La fila decía «Autor ·
  revisó» y la ficha enseñaba a más gente con horas. Ahora fila, ficha (por
  centro y por OF), OF desplegadas y «Tareas y tiempos» enseñan a cada persona
  con su tiempo, de más a menos. Manda RPS; si una OF no tiene horas en RPS
  pero se fichó en la web, se enseña ese reloj, sin sumar las dos fuentes.
  Comprobado con RPS (AR.26.04488, SA.24.00312): mismas personas y mismo
  orden en los cuatro sitios, y la suma cuadra con el tiempo de la fila.
  El caso raro de AR.26.04055 era una prueba de la base local (autor de 5 s el
  28/08), no un dato del servidor.

- **Sin repetir personas (decidido por Iván).** Un desglose solo sale si dice
  algo que el nivel de arriba no dice: fila siempre; OF desplegadas solo con
  varias OF; centro de la ficha siempre en el centro que cuenta (en un «Solo
  Taller», la gente de Taller); dentro de cada OF solo si el centro tiene
  varias; por tarea solo si la OF tiene varias tareas con tiempo. Comprobado
  con RPS en AR.26.04488 (1 OF), AR.26.04489 (2 OF) y SA.24.00312.

- **Lista por días y filtro por persona (decidido por Iván).** Separador por
  día con pedidos y tiempo de la sección; fila de una línea (código, cliente,
  «N OF» solo si son varias, familia, nombres, un tiempo); «Solo Taller» en
  gris. Filtros nuevos en la consulta: «Quién» y «Solo con trabajo de
  OT/Diseño». El calendario de fechas se queda como estaba (Iván no quiere
  botones de «hoy/esta semana»). Medido con RPS: 3,9 s sin filtros, 11,4 s
  por persona, 6 s persona + semana.

### Pendiente de decidir con Iván

- **Familia: dos vocabularios.** El filtro usa subfamilias de RPS
  (Reparaciones, Lonas nuevas, Puertas…) y los chips de la fila salen de otra
  clasificación (Remolques, Camiones, Carpa…). «Remolques» no se puede
  filtrar. Hay que decidir cuál manda.
- **Filtro por persona lento** (11 s solo, 6 s con fechas). Optimizar la
  consulta antes de desplegar o aceptar el tiempo.
- Cada OF desplegada enseña los chips de todos sus centros, también a cero
  («Diseño · 0m · Taller · 0m»). Se decidió conservar los centros con trabajo
  aunque tengan cero minutos; con la regla de «no repetir» quizá sobren.
