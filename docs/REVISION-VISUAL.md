# Revisión visual — septiembre 2026

Lista de tareas de la revisión de diseño (modo claro, pestañas y fichas del
pedido, en claro y en oscuro). Cada tarea hecha lleva el commit donde está.

- `[x]` hecha · `[ ]` pendiente · `[~]` descartada, con el motivo

---

## 1. Tema: relieve, fondo y contraste

- [x] Relieve en claro: filo de 1 px y sombra de apoyo (`--edge`, `--contact`) en paneles, tarjetas, filas, botones y menús — `a9ce6d8`
- [x] Fondo claro un punto más oscuro (`#d6dbe2`) para que el blanco se despegue — `3179d4e`
- [x] Cabecera del mismo color que la página, en claro y en oscuro — `3179d4e`
- [x] Fuera las rayas blancas entre cabecera, filtros y contenido (también en oscuro) — `3179d4e`
- [x] Más relieve en los botones (canto de tecla) y en los partes (`.parte-3d`) — `3179d4e`
- [x] Dorado como texto a `brand-800` (antes 2,5–4,2:1) — `a9ce6d8`
- [x] Botones activos dorados con tinta oscura (antes blanco sobre dorado, 2,2:1) — `a9ce6d8`
- [x] Iniciales de los avatares blancas u oscuras según el color de cada persona (`tintaSobre`) — `a9ce6d8`
- [x] Gris de texto secundario ajustado al fondo nuevo (`#565b65`, 4,9:1) — `3179d4e`
- [x] Contraste medido en las seis pestañas: nada por debajo del mínimo salvo controles desactivados — `a9ce6d8`

## 2. Pestañas

### Tipografía y títulos
- [x] Fuera los 9 px de lo que hay que leer en las pestañas (cliente y fecha bajo cada parte, chips, leyenda del recorrido, rótulos de fase) — `9c80319`
- [x] Fuera los 9 px del resto (desplegables, avisos, recuentos, días de la semana, columnas del tiempo) — `878bae6`
- [x] Sin títulos de página a la vista: Visitas pasa de portada a barra y Métricas deja de repetir el apartado — `9c80319`
- [x] Rótulos de sección con un solo estilo (11 px en mayúsculas), también en Métricas — `9c80319`, `878bae6`
- [x] Rótulos de control delante del control ("VER", "QUIÉN", "ENTRE FECHAS") — `9c80319`

### Textos
- [x] "OF" sin plural ("0 OFs" → "0 OF en total") — `9c80319`
- [x] Nombre del cliente que salía repetido como negocio (`negocioAparte`) — `9c80319`
- [x] Placeholder del Historial sin el prefijo "Buscar en el Historial:" — `9c80319`
- [x] Soluciones de visitas en minúsculas con la inicial en mayúscula (RPS las da en MAYÚSCULAS) — `65568e9`
- [x] "▲ 399 vs. anterior" contra un periodo sin datos → "sin datos del periodo anterior" — `a9ce6d8`
- [~] Mayúscula inicial en "sin datos…" / "nada ahora mismo": se quedan en minúscula porque se leen como continuación de lo de delante

### Maquetación
- [x] Columnas ajustadas en pantalla ancha: las cifras junto al pedido en Pendientes, Revisiones e Historial — `a9ce6d8`
- [x] Filtros del Historial sueltos, como en las demás pestañas — `a9ce6d8`
- [x] Filas de una línea a ~34 px (Revisiones, Historial) — `a9ce6d8`
- [x] Margen lateral de 20 px en todas las pestañas — `9c80319`
- [x] Hueco al final de las listas para que el reloj flotante no tape la última fila — `9c80319`
- [x] Cabecera de cada día del Historial más visible (12 px y más aire) — `9c80319`
- [x] Métricas alineada a la izquierda y a dos columnas en pantalla ancha — `9c80319`
- [x] Controles a la misma altura (buscador y botón de Visitas, pestañas de Métricas) — `9c80319`

### Panel y bandeja
- [x] La bandeja de Sin asignar sin caja: los partes sobre el fondo — `3179d4e`
- [x] Fuera el rótulo "Sin asignar" repetido en la barra de filtros — `3179d4e`
- [x] Partes más grandes (112 px mínimo en vez de 80) — `878bae6`
- [x] La prioridad solo aparece si es urgente o baja — `9c80319`
- [~] Barra vacía en la tarjeta de quien no tiene pedidos: se queda, dice "sin carga" y quitarla mueve la altura

### Revisiones
- [x] Conmutador "Solo mías / Todo el equipo" en dorado y delante, no en la otra punta — `a9ce6d8`, `9c80319`
- [x] Secciones vacías en una línea ("Por revisar · nada ahora mismo") — `a9ce6d8`

### Oscuro
- [x] Etiqueta de familia con un tinte de su color (el icono desaparecía sobre gris) — `9c80319`
- [x] Punto de "hoy" en gris claro en vez de casi blanco — `9c80319`
- [x] Y en claro, gris oscuro en vez de negro — `65568e9`
- [~] Logo: "Coordina" pisa el "OT" en el propio dibujo (`public/coordina-*.png`). Hay que rehacer la imagen, no el código

## 3. Ficha del pedido (Pendientes e Historial)

- [x] **Fallo:** partes escaneados en JBIG2 salían en blanco en el visor — `69abf61`
- [x] **Fallo:** con OLANET caído, la ficha decía que se habían retirado operaciones — `a9c4a4a`
- [x] Las dos fichas con el mismo orden: recorrido, notas, OF, comentario, documentos, tareas — `783d9f0`, `4451fb9`
- [x] Las notas antes que las OF, y en una línea cuando no hay — `4451fb9`
- [x] El autor del pedido en la cabecera, pegado a su rótulo — `783d9f0`, `c681aeb`
- [x] La regla de los roles pasa del pie fijo a un ⓘ junto al autor — `783d9f0`
- [x] Un solo estilo de rótulo para todos los bloques — `783d9f0`
- [x] Fuera "Fotos y adjuntos" y el código repetido junto a "Tareas y tiempos" — `783d9f0`
- [x] Comentario de venta plegado a dos líneas con "Ver más" — `783d9f0`
- [x] "P2 Normal" solo cuando la prioridad no es normal — `783d9f0`
- [x] Fechas del Historial con su nombre ("Solicitada … · Terminada …", dd/mm/aa) — `783d9f0`
- [x] Bloques grises mientras carga el Historial, en vez de "Cargando…" — `783d9f0`
- [x] "Volver a plantear el pedido" al final y con forma de botón — `a9ce6d8`, `783d9f0`
- [x] "+ Añadir" de las notas con forma de botón — `783d9f0`
- [x] Iconos de línea en vez de emoji (🏭 🧵 📌 🏷 📦) — `783d9f0`, `c681aeb`
- [x] El "·" ya no se queda suelto al partirse la línea de datos — `c681aeb`

### Tarjeta de cada OF
- [x] Autor y revisor en una sola línea — `c681aeb`
- [x] Líneas de datos (producción, material, rotulación, compras, avisos, devolución, descripción) con el icono en la misma columna — `c681aeb`
- [x] Con una sola persona, su tiempo no se repite al lado del total — `c681aeb`

### Visor del parte
- [x] Barra de desplazamiento solo al pasar el ratón (entre la hoja y el panel había dos) — `783d9f0`
- [x] Hoja con "Cargando parte…" mientras llega, en vez de un hueco vacío — `783d9f0`
- [x] Telón grafito en oscuro, en vez de casi negro — `783d9f0`
- [~] Botones del visor a 32 px: ya medían 32 px; la estimación salió de una captura reducida

## 4. Piezas que se abren (filas desplegadas, menús, buscador, Métricas)

Revisadas en claro y en oscuro: filas desplegadas de Pendientes, Historial y
Visitas; Devoluciones, Tiempos y Anuladas; buscador `Ctrl K`, notificaciones,
menú de herramientas, panel de un compañero, desplegables y calendario.

- [x] Códigos de los partes atrasados de la bandeja ilegibles en oscuro (rojo oscuro sobre grafito) — `c7b23a9`
- [x] Tiempos y Anuladas: la tarjeta a todo el ancho separaba cada explicación de su cifra; ahora con tope — `c7b23a9`
- [x] Candado de línea en vez de 🔒 en el panel del compañero y en las filas que no se pueden fichar — `c7b23a9`
- [x] Buscador, notificaciones, herramientas, desplegables y calendario: bien en los dos temas, sin cambios

## 5. Contraste en oscuro, portátil y pantallas sueltas

- [x] Contraste medido en oscuro en las seis pestañas: todo por encima del mínimo salvo controles desactivados
- [x] Icono de rotulación de las miniaturas blanco sobre blanco en oscuro → iconos de línea con tinta fija — db78514
- [x] Últimos emoji fuera (Gastado, Notas de Producción, avisos de la lista, compras por llegar) — db78514
- [x] Portátil 1366×768: ninguna pestaña desborda en horizontal; ficha y Métricas a dos columnas caben
- [x] Consulta pública: cabecera, filtros y buscador con el mismo diseño que la web del equipo — db78514
- [x] Pantalla del PIN: bien en los dos temas, sin cambios

## 6. Despliegue

- [x] Entrada de novedades escrita (19/09, 12 cambios) — `49830f6`, `f25ebf4`, `8045794`, `3e72188`
- [x] `git push origin main` — subido hasta `3e72188`
- [x] En el servidor: `cd /webs/coordina-ot && git pull && pnpm install && pnpm build && pm2 restart coordina-ot` — desplegado por Iván el 19/09
- [x] `/api/health` → `{"ok":true,"source":"rps"}`; `public/pdfjs/wasm/jbig2.wasm` servido (200) y el CSS nuevo en producción. `pm2 status` queda para Iván
- [x] Revisión posterior al despliegue: sección 7

## 7. Segunda auditoría (tras el despliegue, 19/09)

Seis pestañas, fila desplegada y las dos fichas, en claro y en oscuro, midiendo
contraste, letra por debajo de 10 px, emoji y desbordes. Y la bandeja agrupada.

- [x] Iniciales de los desplegables de persona blancas sobre dorado (2,5:1) → `tintaSobre` — `8505dee`
- [x] Rótulo "Normal" de la bandeja agrupada por prioridad a 1,8:1 → color de texto — `8505dee`
- [x] 📥 del título de la bandeja → icono de línea — `8505dee`
- [x] Comentario del comercial plegado en la fila desplegada de Pendientes — `8505dee`
- [x] Letra: nada por debajo de 10 px salvo dentro de círculos y cajas pequeñas
- [x] Sin desbordes en horizontal; contraste OK en todo salvo controles desactivados (a propósito)
- [~] Flechas ↔ ↕ ↗ de los botones del visor y de los enlaces: son caracteres de texto, no emoji a color, y se leen bien
- [~] En la bandeja agrupada por prioridad, "URGENTE" se repite en cada parte del grupo Urgente: redundante pero inofensivo

## 8. Pantallas pequeñas y anchas

- [x] 1024×768 y 1280×1024 (monitor antiguo cuadrado): nada desborda en horizontal
- [x] Pendientes a 1024: el cliente se partía en dos líneas y la familia en una tercera → suelo de 220 px — `23b9b9e`
- [x] Panel a 1024: la quinta tarjeta del equipo bajaba sola a otra fila → mínimo de 170 px — `23b9b9e`
- [x] Pantallas anchas: toda la web centrada a 1.800 px (cabecera y pestañas) — `7d4b105`
- [x] Métricas a todo el ancho de la pestaña, sin quedarse pegada a la izquierda — `7d4b105`
- [x] Pendientes: columna de Material desde 1.440 px — `7d4b105`
- [~] Ficha a 1024: con "ajustar al alto" (↕) el parte es más ancho que el hueco y se desplaza en horizontal; es lo que hace ese modo. Con ↔ encaja
- [x] Métricas: Tiempos en tres tarjetas lado a lado y Anuladas a dos columnas (se quedaban estrechas y a la izquierda) — `fe0317e`

## 9. Apuntes de Iván (19/09)

- [x] Visitas en filas sueltas, como las demás pestañas — `7ee124b`
- [x] Métricas sin huecos: Devoluciones en dos columnas; Trabajo y Anuladas con la cifra en un tercio — `7ee124b`
- [x] Ficha con muchas OF: desde tres, cada una plegada a su cabecera; "Abrir todas / Plegar todas" — `6b53380`
- [x] Bloques pegados en la ficha (lista de OF, OF ocultas, Tareas del Historial) — `58f9f57`
- [x] Documentos y Tareas y tiempos antes que las OF, en Pendientes y en el Historial — `58f9f57`
- [x] Los bloques de la ficha, todos con el mismo relieve; Documentos y Tareas comparten componente — `fee306d`
- [x] Recuperar para plantear del pedido entero (iba OF por OF desde el «⋯») — `fee306d`
