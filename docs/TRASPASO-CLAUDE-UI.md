# Traspaso a Claude: fichas, materiales y contraste

## Encargo vigente de Iván

«Haz lo de las fichas, materiales y contraste». Implementarlo, comprobarlo y
crear los commits con sus novedades. Esta parte NO se ha empezado: los dos
intentos anteriores se interrumpieron antes de ejecutar herramientas o editar.
La última petición fue preparar este traspaso por falta de cuota.

Trabajar en `C:\Users\ivan.sanchez\Documents\Proyectos DEV\coordina-ot`.
Leer `AGENTS.md`, `docs/PLAN-MEJORAS-UI.md` y el punto 10 de `docs/PENDIENTE.md`.
El plan contiene observaciones iniciales que ya se corrigieron: las entregas
documentadas al final y el código actual prevalecen sobre esos hallazgos antiguos.

## Estado comprobado antes de escribir esta guía

- Rama `main`, árbol limpio, seis commits por delante del `origin/main` local:
  - `f0cef06`: nombres y controles de consulta.
  - `759e07b`: publicación de esas novedades.
  - `126225b`: fichas compactas para 720p.
  - `16728ea`: publicación de ajuste 720p.
  - `0f3c319`: filtros del Historial y Escape en materiales.
  - `d2504cd`: publicación de filtros/materiales.
- No se ha hecho push ni despliegue de esos seis commits. Comprobar de nuevo
  el estado y remoto antes de operar: esta lista es una fotografía local.
- Última validación: 983 tests correctos, uno opcional SQL omitido, tipos,
  lint y build correctos. Build conserva un aviso previo de Turbopack/NFT
  desde `next.config.ts` por la ruta de documentos; no confundirlo con fallo nuevo.
- Esta guía se añade después de esa comprobación. No hay cambios de código
  sin terminar de fichas/materiales/contraste que haya que recuperar.

## Preferencias y límites que hay que respetar

- Solo PC: referencia **1280 × 720**, también 1280 × 630 de altura útil para
  tener en cuenta el navegador, y comprobar escritorio más grande.
  Iván ha descartado expresamente trabajar en adaptación móvil.
- Claro y oscuro tienen la misma prioridad. La clase `.dark` en `html`
  gobierna el tema; no asumir que sigue al sistema operativo.
- Interfaz compacta y operativa. No convertir las listas en tarjetas enormes,
  ni reducir el texto para encajar más datos, ni añadir pasos innecesarios.
- Nombre y primer apellido, conservando nombres compuestos; nunca códigos de
  operario. Ya se ha unificado el catálogo de personas.
- En Historial, nombre/código abre ficha; resto de cabecera y flecha despliegan.
  Ojo eliminado. No deshacer esta interacción.
- Documentos de RPS empieza plegado en ambas fichas; sus grupos también.
  Fotos agrupadas y primero; PDF del SAT conserva su grupo. Pendientes carga
  documentos al desplegar; Historial reutiliza los que ya recibió.
- El tiempo local y las imputaciones RPS son fuentes distintas: no sumarlas.
  Desglose de personas solo para la sección seleccionada, otras secciones total.
- No modificar reglas de finalización, clasificación OT/Diseño/Taller,
  autorización ni aprobación: aprobar no equivale a Pasar a Producción.
  El revisor no debe ganar el botón de Pasar por esta revisión visual.
- No escribir pedidos, fichajes, aprobaciones ni otras marcas en producción
  durante las pruebas. Las consultas a RPS sí se han usado para validar.

## 1. Fichas: trabajo concreto

Archivos principales:
`src/components/Drawer.tsx`, `HistorialDrawer.tsx`, `DocumentosPedido.tsx`,
`NotasPedido.tsx`, `TiempoOF.tsx`, `LineaTiempoPedido.tsx`, `src/app/globals.css`.

1. Comparar ambas fichas con pedidos reales equivalentes. Ya comparten ancho
   máximo de 32 rem, documentos y parte del estilo. Identificar diferencias
   reales de cabecera, metadatos, separación entre bloques, cierre y scroll.
2. Extraer un marco visual compartido pequeño si evita divergencias: cabecera,
   cuerpo desplazable y pie opcional. Mantener la lógica de negocio y datos
   de cada ficha en sus componentes. No construir una ficha universal con
   decenas de booleanos ni mover todo el código por estética.
3. Conservar los estilos `.pedido-panel` y `.pedido-contenido`: a ancho >=1024
   y altura <=800 reducen separación entre bloques y padding vertical.
   Cabecera/pie no se encogen; el cuerpo tiene `min-h-0` y scroll interior.
4. Revisar títulos largos, varios autores, varias OF, documentos abiertos y
   notas largas. Cierre visible, ningún control tapado y foco correcto.
5. Revisar que la lectura del parte y su ampliación siguen funcionando.
   En el navegador integrado algunos PDF se vieron en gris: eso no prueba
   que el fichero no exista; distinguir visor, descarga y respuesta del servidor.

## 2. Materiales: trabajo concreto

- Pendientes: `src/components/MaterialChip.tsx` (portal `MaterialPopover`).
- Historial: funciones `Materiales` y desplegable al final de
  `src/components/HistorialDrawer.tsx` (alrededor de líneas 550–700).
- Datos: `repartirMateriales` en `src/lib/historial.ts`; tipos en `src/lib/types.ts`.
- Posicionamiento compartido existente: `src/lib/menu-flotante.ts`.
- Revisar también `src/components/Select.tsx` y los hooks de foco/modal que
  importan las fichas para entender cómo interactúan las capas.

Unificar aspecto y vocabulario de botones/contadores, sin inventar equivalencias:
«Apuntado» es material indicado en la OF; «Apartado» refleja una reserva viva.
Que hoy no quede reserva NO demuestra que nunca se haya reservado.
Asignación, reserva y compra son etapas distintas, y las compras no siempre
corresponden uno a uno con los materiales asignados.

Mantener el detalle tras botones compactos con cantidad. Revisar ancho, altura
máxima, anclaje junto a bordes, scroll y clic fuera. Los encabezados no deben
decir siempre Oficina Técnica cuando el contexto sea Diseño sin verificar
qué información de origen representan.

**Ya arreglado y probado:** en `MaterialPopover`, Escape se escucha en captura,
se cancela la propagación, se cierra solo el portal y se devuelve foco al
disparador. Una segunda pulsación cierra la ficha. No volver a introducir
un cierre doble al extraer componentes. Comprobar el mismo recorrido para
materiales históricos, Select y otras ventanas de la ficha.

## 3. Contraste: trabajo concreto

Base: `src/app/globals.css`, variables `--text`, `--text-muted`, `--surface`,
`--surface-2`, bordes y clases `.glass-*`. Existen transparencias y degradados;
medir el resultado sobre el fondo real, no solo dos hex de variables.

1. Medir textos normales/secundarios, fechas, chips de estado/rol, nombres,
   placeholders, botones y foco en ambos temas. Referencia: texto normal
   4,5:1; grande 3:1; controles/foco relevantes 3:1.
2. Preferir corregir tokens compartidos cuando el problema sea común. Si es
   un estado concreto, corregir su pareja claro/oscuro. Evitar un color fijo
   que arregle oscuro y empeore claro.
3. Preservar significado de colores y etiquetas. No depender solo del color.
4. Registrar pares medidos y ratios, y distinguir los realmente medidos de
   una simple inspección visual. No afirmar «contraste validado» solo por screenshot.

## Pruebas y cierre de esta entrega

- Usar el servidor local, por ejemplo `pnpm dev --port 4305`. `.env.local`
  existe aquí y permite lectura RPS. No imprimir sus secretos.
- Para navegador, reutilizar herramientas disponibles; abrir una pestaña local
  propia. No manipular la pestaña de producción ni tareas reales para probar.
- Casos útiles observados (pueden haber cambiado de estado):
  - AR.26.04082: ficha OT con un botón Material y una compra; se probó el doble Escape.
  - AR.26.04463: Diseño, tres OF, nombres largos y contenido con scroll.
  - AR.26.04465 / AR.26.04467: histórico Diseño con tiempos y otros centros.
- Probar ratón y teclado: abrir, Tab, Escape por capas, foco de vuelta, cerrar
  sin perder la lista. Claro/oscuro y 720p; también una pantalla de PC más alta.
- Ejecutar `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build` y
  `git diff --check`. Añadir tests de comportamiento cuando cambie interacción;
  no crear tests que solo copien clases CSS.
- Detener servidor de desarrollo antes de compilar y cerrar pestañas propias
  antes de detenerlo para evitar páginas de error. No matar procesos ajenos.
- Actualizar plan y pendientes con hechos, límites y validaciones reales.
- Crear commits concretos. Los visibles llevan `Novedad: mejor|arreglado|nuevo`
  y opcional `Detalle:` al inicio de línea, conforme a AGENTS.md.
- Ejecutar `pnpm novedades --ver`, revisar las frases, ejecutar `pnpm novedades`
  y commitear `src/lib/novedades-datos.json`. No poner fechas a mano.
- Push/despliegue: Iván dijo «si no queda nada, pushea todo y desplegamos»;
  aún quedaba trabajo y se le informó de que NO se hizo push. No interpretar
  este traspaso como autorización nueva para desplegar trabajo incompleto.
  Informar exactamente qué queda y el estado de commits al terminar.

## Pendientes del plan fuera de este encargo inmediato

- Conservar páginas ya cargadas y posición de scroll al cambiar de pestaña.
- Completar coherencia/persistencia de filtros en Visitas y Métricas.
- Revisión de teclado/contraste del resto de pantallas, más allá de estas fichas.

El Historial YA conserva filtros en memoria de Board, separados por sección,
y ofrece vaciar texto o limpiar todo. No persiste tras recargar la página y
recarga resultados desde página 0 al regresar. En navegador se verificaron
búsqueda y familia, incluyendo OT/Diseño independientes. La automatización
del input nativo de fecha no confirmó su edición en React: no contar ese caso
como prueba visual superada aunque las fechas compartan el estado conservado.

## Entorno de despliegue (solo como referencia)

Servidor `192.168.0.90`, SSH root con contraseña que maneja Iván.
Proyecto `/webs/coordina-ot`, archivo **`.env`**, no `.env.local`.
PM2 `coordina-ot`, puerto 4300. Backup antes de desplegar, montaje
`/mnt/oftecnica` y destino `/mnt/oftecnica/coordina-backups`.
No inventar acceso SSH ni usar credenciales de otros proyectos.

## Instrucción lista para pegar a Claude

> Continúa en este repositorio leyendo `docs/TRASPASO-CLAUDE-UI.md`, AGENTS.md
> y el plan enlazado. Implementa las mejoras pendientes de fichas, materiales
> y contraste, respetando las decisiones ya tomadas y los commits locales.
> Trabajamos solo en PC desde 1280 × 720, en claro y oscuro. Valida en navegador
> además de tests, conserva reglas de negocio y no escribas datos de producción.
> Haz los commits y ejecuta pnpm novedades. Actualiza la guía de pendientes
> con lo realmente terminado y lo que siga faltando. No des por completado
> todo el plan si solo has resuelto una parte.
