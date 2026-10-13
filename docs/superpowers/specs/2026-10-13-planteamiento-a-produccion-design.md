# Planteamiento de CAD impreso en Producción al pasar el pedido — diseño

Fecha: 2026-10-13 · Pide: Ángel (idea) e Iván (alcance) · Para: Oficina Técnica

## Por qué

Los pedidos que no salen de la web de planteamientos (`toldos-testar`) se plantean
en CAD. Oficina Técnica guarda el PDF a mano en la carpeta **Planteamientos**, con
el mismo nombre que usa `toldos-testar`: `AR2605016-10.pdf` (PVC) o
`AR2605016-1.pdf` (toldos). RPS lo procesa en pocos minutos y lo asocia al pedido.

Además, cada técnico manda a mano un correo a «Oficina Técnica; Producción» con el
PDF adjunto y el cuerpo «PLANTEAMENTO», y Producción lo imprime arriba. Es trabajo
repetido en cada pedido, y se olvida.

Esta funcionalidad hace que, **al pasar el pedido a Producción en CoordinaOT, el
planteamiento salga impreso en la impresora de Producción** sin que nadie lo mande.
El correo queda para una segunda fase (ver «Fuera de alcance»).

Este diseño sustituye al informe de Codex del mismo día, que proponía subir los PDF
a la web, guardar versiones y montar un servicio de publicación: nada de eso hace
falta, porque el PDF ya lo deja OT en su sitio desde CAD.

## Datos comprobados (13/10/2026)

- **Impresora de Producción** («arriba»): Konica Minolta bizhub 551i,
  `ipp://192.168.4.245/ipp`. Acepta `application/pdf` directamente por IPP, así que
  no hace falta instalar CUPS ni controladores en el servidor. Imprime A3/A4 y a
  doble cara. El servidor 192.168.0.90 llega a ella (probado con `curl`).
- **Impresora de OT**: `ipp://192.168.4.249/ipp`, Konica, también acepta PDF. Es la
  del modo ensayo.
- `toldos-testar` corre en el **mismo servidor** y usa las mismas carpetas:
  - `PLANTEAMIENTOS_DIRECTORY=/mnt/escaner/Planteamientos` (valor real en el
    servidor, 13/10/2026): carpeta ÚNICA, sin año, donde se deja el PDF para que RPS
    lo procese. Nombre compacto: `AR2605016-10.pdf`.
  - `RPS_PLANTEAMIENTOS_DIRECTORY=/mnt/rps/VENTAS/PLANTEAMIENTOS/{YYYY}`: el
    archivo de RPS, ya procesado, con nombre con puntos: `AR.26.05016-10.pdf`. Es el
    mismo montaje `/mnt/rps` que CoordinaOT ya usa (`RPS_DOCS_DIR`).
  - `RPS_UPLOAD_DIRECTORY` (`/mnt/toldos/rps`) es la subida de MATERIAL (los .xls).
    No tiene nada que ver con esto.
- Los PDF que genera `toldos-testar` llevan dentro sus datos como fichero adjunto:
  `AR2605016.toldos.json` o `AR2605016.remolques.json`. Los de CAD no.

## Decisiones

1. Solo pedidos de **Oficina Técnica** (sección `ot`), al pasarlos a Producción.
   Diseño e Impresión no imprimen nada.
2. Los PDF de `toldos-testar` (toldos y remolques) **no se imprimen**: CoordinaOT no
   hace nada con ellos.
3. **Una copia, a una cara, en A4.**
4. Si **todas** las páginas son A4, se imprime **solo**. Si alguna no lo es (a veces
   el PDF lleva una A5 que se imprime en OT), **no** se manda: se abre el cuadro de
   imprimir del navegador con el PDF y lo configura quien pasa el pedido.
5. Si no hay planteamiento, el pedido **se pasa igual**, avisando en el diálogo y
   dejándolo anotado.
6. Lo que se imprime es lo que había **en el momento de pasar**: el PDF se copia
   entonces, para que RPS no se lo lleve a medias.

## Diseño

### Qué PDF es el planteamiento de un pedido

Una función de servidor, `planteamientosDe(pedido)`:

1. Calcula el **nombre compacto** (`AR.26.05016` → `AR2605016`) y el **año** por las
   dos cifras tras la serie (`26` → 2026), igual que `toldos-testar`
   (`sanitizeOrderCode`, `anioDelPlanteamiento`).
2. Busca `AR2605016-*.pdf` en la carpeta Planteamientos (única, sin año), y
   `AR.26.05016-*.pdf` en el archivo de RPS del año.
3. Une las dos listas por sufijo (`-1`, `-10`…): si un mismo sufijo está en los dos
   sitios, vale el de Planteamientos, que es el más reciente.
4. Descarta los que llevan adjunto `.toldos.json` o `.remolques.json`.
5. De cada uno, cuenta las páginas y mira si son A4. A4 son 595 × 842 puntos, con
   unos 3 puntos de margen y en cualquier orientación.

Se leen con `pdfjs-dist`, que ya es dependencia (adjuntos con `getAttachments`,
tamaños con `getPage(n).view`).

Devuelve `{ ficheros: [{ nombre, ruta, paginas, todoA4 }], ... }`. Una carpeta sin
montar o ilegible no lanza: devuelve lista vacía con el motivo, para que el diálogo
diga «no puedo leer Planteamientos» en vez de «no hay planteamiento».

### Antes de pasar: el diálogo

El diálogo de «Pasar a Producción» (Board, `pasarPendiente`), solo en la sección OT
y con la impresión activada, pide al servidor `GET /api/planteamiento?pedido=…` y
añade una línea:

| Caso | Texto |
|---|---|
| Todo A4 | «Se imprimirá en Producción: AR2605016-10.pdf (1 pág.)» |
| Alguna página no A4 | «AR2605016-10.pdf lleva una página que no es A4: al pasar se abrirá el cuadro de imprimir» |
| No hay | «No encuentro el planteamiento en Planteamientos: se pasará sin imprimir» |
| Carpeta ilegible | «No puedo leer la carpeta Planteamientos: se pasará sin imprimir» |
| Ya se imprimió antes | Lo de arriba y «Ya se imprimió el 13/10 a las 13:05» |

Una casilla «Imprimir en Producción», marcada por defecto, permite no imprimir esta
vez: por ejemplo, al volver a pasar un pedido recuperado del Historial.

### Al pasar: el servidor decide

El servidor **no se fía de lo que diga el navegador**. En el camino `completar` de
`/api/estado`, justo después de `encolarFinalizacion` y sin bloquear la respuesta:

1. Si la sección no es `ot`, la impresión está apagada o la casilla venía
   desmarcada, no hace nada.
2. Vuelve a llamar a `planteamientosDe(pedido)`.
3. Por cada fichero:
   - **todo A4** → copia el PDF a `data/planteamientos/` y lo encola para imprimir;
   - **alguna página no A4** → lo anota como «impresión manual».
4. Si no hay ninguno → anota «pasado sin planteamiento».

La respuesta trae los ficheros de impresión manual. Con ellos, el navegador abre el
PDF (`GET /api/planteamiento/fichero?…`) en una pestaña con el cuadro de imprimir.
Que se imprima de verdad ya depende de esa persona, y así consta: «impresión
manual», no «impreso».

### La cola de impresión

Tabla `planteamiento_impresion`, siguiendo el patrón de la cola de OLANET
(`olanet-outbox.ts`):

| Columna | Para qué |
|---|---|
| `id`, `pedido_id`, `fichero` | Qué se imprime. |
| `copia` | Ruta de la copia en `data/planteamientos/`. |
| `paginas` | Para el texto «1 pág.». |
| `estado` | `pendiente`, `enviado`, `error`, `manual`, `sin_planteamiento`, `descartado`. |
| `intentos`, `error` | Reintentos y último fallo. |
| `trabajo_ipp` | El número de trabajo que devolvió la impresora. |
| `pasado_por`, `creado_at`, `enviado_at` | Quién y cuándo. |

Un trabajador arranca desde `instrumentation.ts`, como el de OLANET:

- cada 30 s manda los pendientes con un `Print-Job` IPP: `application/pdf`,
  `copies=1`, `sides=one-sided`, `media=iso_a4_210x297mm`, `job-name` =
  «Planteamiento AR.26.05016», `requesting-user-name` = «CoordinaOT»;
- si la impresora acepta, el estado pasa a `enviado` con el número de trabajo y se
  borra la copia;
- si falla (impresora apagada, sin red), reintenta con esperas crecientes. Pasados
  15 minutos sin éxito, avisa en la campana a quien pasó el pedido, con el mismo
  mecanismo que el aviso de parte re-escaneado. Sigue reintentando, y se puede
  descartar a mano.

«Enviado» quiere decir que **la impresora aceptó el trabajo**, no que el papel haya
salido: si se queda sin papel, lo resuelve allí quien esté. No se consulta el estado
del trabajo en esta versión.

El cliente IPP se escribe a mano: un `Print-Job` y su respuesta son unos pocos bytes
(cabecera, atributos y el PDF detrás), y probarlo es fácil con bytes fijos. No se
añade dependencia.

### En el Historial

La ficha del pedido en el Historial enseña el estado:

- «Impreso en Producción el 13/10 a las 13:05 (AR2605016-10.pdf)»;
- «Pendiente: la impresora no responde (3 intentos)»;
- «Impresión manual», «Pasado sin planteamiento».

Tiene un botón **«Reimprimir»**: vuelve a buscar el planteamiento y lo encola. Lo
puede usar quien tenga rol técnico; Dirección, que solo consulta, no.

### Modos y configuración

Como `FICHAJE_OLANET`, un modo explícito y apagado por defecto:

| Variable | Valor |
|---|---|
| `IMPRESION_PRODUCCION` | `off` (por defecto), `ensayo` o `activo`. |
| `IMPRESORA_PRODUCCION` | `ipp://192.168.4.245/ipp` |
| `IMPRESORA_ENSAYO` | `ipp://192.168.4.249/ipp` (la de OT) |
| `PLANTEAMIENTOS_DIR` | `/mnt/escaner/Planteamientos` (el `PLANTEAMIENTOS_DIRECTORY` de `toldos-testar`). Admite `{YYYY}` por si algún día cambia. |
| `PLANTEAMIENTOS_ARCHIVO_DIR` | `/mnt/rps/VENTAS/PLANTEAMIENTOS/{YYYY}` (su `RPS_PLANTEAMIENTOS_DIRECTORY`). |

- **`off`**: nada cambia; el diálogo no dice nada.
- **`ensayo`**: todo igual, pero imprime en la impresora de OT. Para probarlo con
  pedidos reales sin molestar arriba.
- **`activo`**: imprime en Producción.

## Fuera de alcance

- **El correo** a «Oficina Técnica; Producción» con el PDF adjunto. Espera al buzón
  `coordina@` (lo decide Esteban con David). Cuando exista, entra como otro tipo de
  trabajo en esta misma cola, con su propio estado y reintentos, sin rehacer nada.
- Comprobar que RPS ha asociado el PDF al pedido: ya se ve en «Documentos de RPS».
- Los PDF de `toldos-testar`.
- Imprimir la página A5 en OT automáticamente.

## Pruebas

- **Unitarias:**
  - nombre compacto, nombre del archivo y año, incluida otra serie (`SA.26.00498`);
  - unión por sufijo con preferencia por Planteamientos;
  - descarte por adjunto de `toldos-testar`;
  - detección de A4, en vertical y apaisado, con margen;
  - bytes del `Print-Job` y lectura de la respuesta (aceptado, rechazado, número de
    trabajo);
  - transiciones de la cola y esperas;
  - que el servidor no encole fuera de la sección OT, con la casilla desmarcada o en
    `off`.
- **Contra las carpetas reales** (opt-in, solo lectura): `planteamientosDe` sobre
  pedidos de CAD y de `toldos-testar` conocidos.
- **Contra la impresora** (opt-in y explícito): consulta de atributos (solo
  lectura); y, con una bandera aparte, un PDF de prueba de una página a la
  impresora de **OT**.
- **En la app**: modo `ensayo` unos días con pedidos reales; después `activo`.

## Novedad

```
Novedad: nuevo | Al pasar un pedido a Producción, su planteamiento se imprime solo arriba
Detalle: El PDF de CAD que guardas en Planteamientos sale en la impresora de Producción. Si lleva alguna página que no es A4, se abre el cuadro de imprimir.
```

## Por confirmar en el plan

- Que el aviso por campana del parte re-escaneado se puede reutilizar para «la
  impresión de tu pedido no ha salido». Si no, en esta versión basta con el estado
  en el Historial.
