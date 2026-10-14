# Correo del planteamiento al pasar a Producción — diseño

Fecha: 2026-10-14 · Pide: Iván (idea de Ángel) · Continúa: `2026-10-13-planteamiento-a-produccion-design.md`

## Por qué

Hoy, al terminar un planteamiento, cada técnico manda a mano un correo a
«Oficina Técnica; Producción» con el PDF adjunto y el cuerpo «PLANTEAMENTO». La
impresión automática ya está hecha (spec del 13/10). Esto es la otra mitad: al
pasar el pedido a Producción, CoordinaOT manda ese correo solo.

## Datos comprobados (13/10/2026)

- La empresa usa Microsoft 365. Hay buzón compartido **`coordina@toldosgomez.com`**
  (aprobado por Esteban) y una aplicación en Entra ID, «Coordina», con
  **Mail.Send de tipo Aplicación**. Un correo de prueba por Microsoft Graph
  (`POST /users/coordina@…/sendMail`) llegó bien.
  - Cliente `33563a1d-357d-41ca-8f7d-3f81dee4941c`.
  - Tenant `e14fdfc8-6713-46da-b5d3-ac73653cfca9`.
  - El secreto va solo en el `.env` del servidor y caduca hacia el 13/10/2027.
- Destinatarios de verdad: `of.tecnica@toldosgomez.com` y
  `produccion@toldosgomez.com`.

## Decisiones

1. Mismo disparo que la impresión: **pasar a Producción un pedido de la sección
   OT**. El servidor busca el planteamiento con `planteamientosDe`, igual que para
   imprimir y en la misma búsqueda.
2. **Se adjuntan todos los PDF del planteamiento**, incluidos los que no son A4:
   el correo no imprime, así que el tamaño da igual.
3. **Sin planteamiento no hay correo**: un correo sin el PDF no sirve de nada. Se
   anota «sin planteamiento», como en la impresión.
4. **Contenido** (decidido por Iván):
   - Asunto: «Planteamiento AR.26.05016 · Bar Central».
   - Cuerpo con el pedido, el cliente, las OF, la entrega solicitada, el tiempo de
     planteo y quién lo pasó.
   - «Responder a» `of.tecnica@`, para que si Producción contesta lo lea alguien.
5. **Modos**, como la impresión: `CORREO_PLANTEAMIENTO=off|ensayo|activo`,
   apagado por defecto. En **`ensayo` el correo va solo a Iván**
   (`CORREO_ENSAYO_PARA`, por defecto `ivan.sanchez@toldosgomez.com`).
6. El contenido se **congela al encolar**: un reintento manda exactamente lo mismo.
7. Una casilla en el diálogo de pasar, **«Mandar por correo»**, marcada por defecto,
   al lado de «Imprimir en Producción».
8. En la ficha del Historial se ve el estado del correo, con un botón «Reenviar».

## Diseño

- **`lib/server/graph-correo.ts`**: token de Microsoft (client credentials,
  guardado hasta que caduca) y `enviarCorreo` (Graph `sendMail` con adjuntos
  `fileAttachment` en base64 y `saveToSentItems`). Sin dependencias nuevas.
- **`lib/correo-planteamiento.ts`** (puro): `asuntoCorreo` y `cuerpoCorreo` a
  partir de los datos del pedido.
- **Cola**: tabla `planteamiento_correo`, una fila por pase, con los PDF copiados,
  asunto, cuerpo y destinatarios congelados. Mismos estados y mismas esperas
  crecientes que `planteamiento_impresion`. Es otra tabla porque la de impresión ya
  existe en producción y añadirle un tipo pediría migrarla.
- **Trabajador**: el mismo patrón que el de impresión. Si Microsoft no responde,
  se reintenta. Si rechaza el envío por algo que no se arregla reintentando (por
  ejemplo, permisos), se para y lo dice.
- **`/api/estado`**: junto a la impresión y sin esperar, `prepararCorreo` con los
  datos del pedido que el servidor ya tiene. Si el cuerpo trae
  `mandarCorreo === false`, no se manda.
- **Rutas**:
  - `GET /api/planteamiento` añade `correo: { modo, envios }`;
  - `POST /api/planteamiento/reenviar` (rol técnico) vuelve a mandar el último
    correo congelado del pedido.
- **Límite de tamaño**: si los adjuntos pasan de 3 MB, que es lo que admite un
  `sendMail` simple, se descarta con el motivo. Los PDF de CAD pesan KB.

## Configuración (`.env` del servidor)

| Variable | Valor |
|---|---|
| `CORREO_PLANTEAMIENTO` | `off` / `ensayo` / `activo` |
| `GRAPH_TENANT_ID` | `e14fdfc8-6713-46da-b5d3-ac73653cfca9` |
| `GRAPH_CLIENT_ID` | `33563a1d-357d-41ca-8f7d-3f81dee4941c` |
| `GRAPH_CLIENT_SECRET` | (solo en el servidor) |
| `CORREO_REMITENTE` | `coordina@toldosgomez.com` |
| `CORREO_PARA` | `of.tecnica@toldosgomez.com,produccion@toldosgomez.com` |
| `CORREO_RESPONDER_A` | `of.tecnica@toldosgomez.com` |
| `CORREO_ENSAYO_PARA` | `ivan.sanchez@toldosgomez.com` |

## Fuera de alcance

- Comprobar en RPS que el PDF quedó asociado.
- Adjuntos de más de 3 MB (sesión de subida de Graph).

## Novedad

```
Novedad: nuevo | Al pasar un pedido a Producción se manda solo el correo del planteamiento
Detalle: Llega a Oficina Técnica y a Producción con el PDF adjunto y los datos del pedido. Ya no hace falta mandarlo a mano.
```

## Cambio de Iván (14/10/2026): la norma de la casa

Sustituye a las decisiones 2, 4 y 7 de arriba.

- **Siempre se imprime y siempre se manda el correo.** Fuera las casillas del
  diálogo de pasar: solo informa de lo que va a pasar.
- **Qué va adjunto:**
  - Los PDF de **PVC** (`-10` en adelante: `-10`, `-11`, `-12`…) van adjuntos al
    correo.
  - Los de **toldos y acrílico** (`-1` a `-9`) solo se imprimen, y el correo avisa
    de que están impresos, sin adjunto. Es lo que se hacía a mano: responder
    «IMPRESO».
- **Cuerpo del correo:**
  - el pedido con su cliente;
  - una línea por OF con su descripción de catálogo;
  - debajo de cada OF, sus tiempos de planteo y revisión, con el autor y el
    revisor si los tiene (si no hubo revisión, «Sin revisión»);
  - qué se imprimió y qué va adjunto;
  - quién lo pasó.
  - Sin fecha de entrega.
- **Varios planteamientos del mismo pedido** (`-10`, `-11`, `-12`…): todos, en
  orden, en el mismo correo.
