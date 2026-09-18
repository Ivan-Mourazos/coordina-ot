# Visor de PDF propio

Escrito para quien vaya a implementarlo (Claude, Codex o quien toque el código
después), no para el equipo de OT.

## Qué problema resuelve

Hoy el PDF lo pinta el navegador dentro de un `<iframe>`. Funciona, pero:

- **El giro gira el scroll.** `ParteEscaneado` rota el iframe entero con
  `transform: rotate()`. A 90° la rueda del ratón mueve la hoja de lado en vez
  de hacia abajo, porque el eje de scroll gira con el elemento. Es el motivo
  principal de este trabajo.
- **Cambiar el encaje recarga el PDF.** `key={ajuste}` remonta el iframe a
  propósito: el visor del navegador no escucha cambios en el fragmento de la
  URL. Cada pulsación de «al ancho» / «al alto» es una navegación, y vuelve a
  la página 1.
- **`giroIntercambia()` y `containerType: size`** existen solo para compensar
  que `transform` no cambia cómo se mide un elemento. Son apaños de la
  solución, no del problema.

## Qué NO entra

- **Anotaciones y dibujos.** Se hablaron y se descartaron: como el visor del
  navegador sigue siendo una opción (ver más abajo), las marcas solo se verían
  en uno de los dos modos. Un bloc que aparece y desaparece según cómo abras el
  documento enseña a no fiarse de él.
- **Búsqueda de texto.** Los partes son escaneos —imagen, sin texto— y en los
  planteamientos nadie busca. Si algún día hace falta, se añade.
- **`ScanViewer`.** Se queda con su iframe.
- **Cambios en el servidor.** Ninguna tabla nueva, ninguna ruta nueva. Las dos
  rutas que sirven PDF ya mandan `Cache-Control: private, max-age=86400`.

## Decisión de fondo: pdf.js en el cliente, sin sustituir al navegador

`pdfjs-dist` ya está en el proyecto (lo usa `miniaturas.ts` en el servidor).
Se saca también al cliente para pintar en un `<canvas>` propio.

**Pero no sustituye al visor del navegador: convive con él.** Hay gente del
equipo con Firefox y la extensión de Adobe, que prefiere ese visor. Hoy lo
tiene porque el `iframe` deja que cada navegador pinte con lo que tenga
configurado. Quitarlo sería empeorarle la web a cambio de nada.

## Los dos motores

### Motor propio (por defecto)

Cada página en un `<canvas>` dentro de un contenedor con scroll vertical.

- **El giro** entra en `page.getViewport({ scale, rotation: giro })`. Gira el
  dibujo dentro del canvas; el contenedor no se toca, así que el scroll sigue
  bajando hacia abajo a 90° igual que a 0°. Esto es el arreglo.
- **El encaje** (`Fit` / `FitH` / `FitV`) deja de ser fragmento de URL y pasa a
  ser una `scale` calculada contra el hueco real, con `ResizeObserver` para
  cuando cambia de tamaño. Cambiar de encaje ya no descarga nada ni vuelve a la
  página 1.
- **El zoom** lo damos nosotros: Ctrl+rueda y pellizco cambian `scale`.
- **Imprimir**: un `<iframe>` oculto con el PDF y `print()`. Se imprime el PDF
  de verdad, no el canvas. **Probar en un PC real**: es lo que más papeletas
  tiene de salir regular.

### Motor navegador (el de hoy)

El `<iframe>` actual, tal cual, sin el apaño del giro: en este modo el giro lo
pone el visor de cada uno, que ya lo hace bien.

### Cómo se elige

- Un chip más en el carril izquierdo: «visor de CoordinaOT» / «visor del
  navegador».
- Guardado en `localStorage`, junto a `CLAVE_ENCAJE` y por el mismo motivo ya
  escrito allí: es preferencia de cómo se *mira*, va con la pantalla en la que
  estás sentado, no es un dato del trabajo.
- **Y un botón «Abrir en pestaña» visible en los dos modos.** Saca el PDF
  crudo y cada navegador hace lo suyo. Cubre el caso de que la extensión de
  Adobe no se meta dentro de un `iframe`, que depende de la versión.

## El worker de pdf.js

pdf.js necesita su worker como fichero suelto. `scripts/copiar-worker.mjs`
copia `pdfjs-dist/build/pdf.worker.min.mjs` a `public/pdf.worker.mjs` en
`prebuild`, y el cliente pone `GlobalWorkerOptions.workerSrc` a
`/pdf.worker.mjs`.

Copiado por script y no a mano: así la versión del worker va siempre con la del
paquete. Es el mismo motivo por el que `miniaturas.ts` importa pdf.js en
runtime desde `node_modules` — Turbopack no lo empaqueta bien.

**Si algún PC del equipo tiene un Chrome viejo** y la build estándar no arranca,
se cambia a `pdfjs-dist/legacy/build/`. Es una línea en `pdfjs-cliente.ts`.

## Rendimiento

**Cargar**

- `getDocument({ url, disableRange: true, disableStream: true })`. Las rutas no
  entienden `Range`; pidiéndolo entero en un GET normal, la caché del navegador
  (24 h, ya configurada) lo sirve de disco a la segunda apertura. Con `Range`
  activado pdf.js haría un sondeo que aquí no compra nada.
- El módulo pdf.js se carga con `import()` al abrir el primer visor. No lastra
  el bundle del tablero.
- **Un `PDFWorker` compartido** entre documentos. Por defecto pdf.js levanta uno
  por documento: paseando con las flechas de `VisorDocumento` serían arranques
  de worker en cadena.
- Caché de documentos ya abiertos (`Map` con tope de 5). Volver atrás con la
  flecha es instantáneo.
- Precarga del siguiente y el anterior de la lista: las flechas son un paseo,
  no un salto.

**Pintar**

- Solo las páginas visibles, con `IntersectionObserver`. Un planteamiento de 40
  páginas no pinta 40 canvas.
- `devicePixelRatio` **con tope en 2**. Sin tope, una pantalla 4K pide canvas de
  8 000 px y se arrastra.
- Renders obsoletos cancelados con `renderTask.cancel()`. Sin esto, tres golpes
  de zoom encolan tres renders y el último llega tarde.
- Zoom en dos tiempos: mientras se mueve, se estira con CSS el canvas ya
  pintado (instantáneo, borroso un momento); al parar, re-render nítido.

**Arrancar sin pantalla en blanco**

La miniatura de la primera página ya se genera en el servidor y se cachea en
disco (`miniaturas.ts`, `?mini=1`). Se pinta de fondo mientras pdf.js monta: se
ve el parte al instante, borroso, y se afina solo.

## Estructura

```
src/components/VisorPdf/
  VisorPdf.tsx        el hueco con scroll, los canvas, zoom y giro
  usePdfDoc.ts        carga, caché de documentos, worker compartido
  pdfjs-cliente.ts    import perezoso + workerSrc
  MotorNavegador.tsx  el iframe de hoy, tal cual
  preferencia.ts      propio/navegador en localStorage
scripts/copiar-worker.mjs
```

`ParteEscaneado` y `VisorDocumento` eligen motor y ponen sus botones.
`ScanViewer` no se toca.

Lo que se borra: `giroIntercambia()`, el `containerType: size` y el
`key={ajuste}` del iframe — los tres son apaños del camino viejo.

## Pruebas

Vitest, sin navegador:

- `siguienteGiro` se queda como está.
- Nuevas: el cálculo de `scale` según encaje, giro y tamaño del hueco (es donde
  se esconden los errores de «sale recortado»).
- La preferencia de motor: leer basura de `localStorage` no debe reventar, como
  ya hace `encajeGuardado()`.

El render en canvas no se prueba en unitario. Se mira a ojo en los dos sitios
del parte (Historial y tablero) y en el visor de documentos, y se imprime un
parte desde un PC real.

## Riesgos, dichos claros

1. **El zoom y el scroll los escribimos nosotros.** Chrome lleva años
   puliéndolos; la primera versión irá bien pero no igual de fina. Red de
   seguridad: el interruptor.
2. **Chrome viejo en algún PC**: se cambia a la build `legacy`.
3. **Imprimir** pasa a hacerse desde un iframe oculto. Probar pronto.

Ninguno rompe lo que hoy funciona: el camino del `iframe` sigue vivo y a un
clic.
