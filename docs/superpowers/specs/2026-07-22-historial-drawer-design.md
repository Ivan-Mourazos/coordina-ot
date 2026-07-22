# Abrir pedido desde el Historial (drawer read-only) — Diseño

Fecha: 2026-07-22
Estado: aprobado (pendiente de plan de implementación)
Sub-proyecto 1 de 2 (el 2 = filtros v2: familia/subfamilia, cliente seleccionable).

## Problema

El Historial permanente lista pedidos finalizados, pero solo se pueden ver sus
OFs en una fila expandible. No se puede "abrir" un pedido para ver su PDF
escaneado ni sus datos, como sí se hace en la lista de Asignar (que abre un
`Drawer` con el PDF grande + datos + acciones).

Se quiere abrir el pedido desde el Historial con una vista **parecida a la de
Asignar pero read-only y con menos detalle**: PDF (tamaño mediano, ampliable) a
un lado y los datos del pedido + sus OFs con tiempos al otro. Sin acciones (el
pedido está finalizado).

## Alcance

**Este sub-proyecto (1):** abrir el pedido → drawer read-only con PDF + datos +
OFs. Cambia la interacción de la lista: clic en una fila **abre el drawer** (en
vez de desplegar las OFs inline).

**Fuera (sub-proyecto 2):** filtros de familia/subfamilia, cliente seleccionable
de la BD, refinamiento de paginación. La búsqueda por AR/cliente actual se
mantiene.

## Decisiones de diseño (acordadas)

1. **Clic en fila → drawer.** Se elimina el desplegable inline de OFs de la Task 4
   anterior; el drawer pasa a ser la forma de ver el detalle.
2. **PDF tamaño mediano, ampliable.** En el drawer el PDF ocupa un panel medio,
   con un botón "Ampliar" que reutiliza el `ScanViewer` existente (zoom/pantalla
   completa). Series sin PDF disponible (la ruta `/api/pedidos` solo resuelve
   `AR.*`) muestran un aviso "PDF no disponible", nunca rompen.
3. **Read-only.** Ninguna acción (asignar, fichar, aprobar…). Solo consulta.
4. **Datos mínimos pero útiles**: cabecera (AR, cliente, negocio, prioridad,
   ciudad de entrega, fecha de solicitud y de finalización, piezas, familias),
   comentario del pedido de venta si existe, y las OFs (descripción, familia,
   tiempo imputado, quién) — lo que ya devuelve el detalle más la cabecera.

## Arquitectura

### Backend: ampliar `GET /api/historial/[pedido]`

Hoy devuelve `{ pedido: string, ofs: HistorialOF[] }`. Pasa a devolver la
cabecera completa del pedido finalizado:

```ts
interface HistorialPedidoDetalle {
  codigo: string;
  cliente: string | null;
  negocio: string | null;
  ciudadEntrega: string | null;
  prioridad: Prioridad;          // 1|2|3, con el mismo prioridadDe() de rps.ts
  fechaSolicitud: string | null; // ISO yyyy-mm-dd
  fechaFinalizacion: string | null; // ISO (de tgm_estadosof_olanet idestadoof=3)
  piezas: number;
  familias: string[];            // catálogo visual derivado (familiaDeTexto)
  comentarioVenta: string | null;
  scanUrl: string;               // /api/pedidos/{codigo}.pdf (puede dar 404)
  ofs: HistorialOF[];            // ya existente
}
```

La capa `historial-db.ts` gana `leerHistorialPedidoDetalle(pedido)` que:
- Reutiliza los patrones de `rps.ts` para la cabecera del pedido de venta
  (`FACOrderSL`/`FACOrderLineSL`/`FACCustomer`/`FACCustomerDeliveryAddress`:
  comentario, ciudad, negocio, fecha solicitada, prioridad) y para piezas/
  familias (agregando sobre las MO de OT del pedido, `familiaDeTexto` +
  `prioridadDe` reutilizados — se exportan desde `rps.ts` o se mueven a un
  helper compartido si conviene, sin duplicar la lógica).
- La fecha de finalización sale del `MAX(fecha_cambio)` de `tgm_estadosof_olanet`
  (idestadoof=3) del pedido.
- `ofs` = el `leerHistorialPedido` actual (tiempos imputados + quién).
- Fallback mock coherente (deriva de `PEDIDOS`).

**Validación en vivo (spike)** en el plan: confirmar la query de cabecera
(campos, fan-out, rendimiento) contra la BD real antes de fijarla, como se hizo
con la página y el detalle.

El route handler `GET /api/historial/[pedido]` pasa a devolver
`HistorialPedidoDetalle` (misma validación de código `CODIGO_PEDIDO_RE`).

### Frontend: `HistorialDrawer` + cambio en la lista

- **Nuevo componente `HistorialDrawer`** (read-only), inspirado en `Drawer` pero
  sin props de acciones:
  - Panel izquierdo: PDF a tamaño medio (iframe de `scanUrl` si es `.pdf`
    disponible; si 404/serie no soportada, aviso). Botón "Ampliar" que abre el
    `ScanViewer` existente (zoom/pantalla completa).
  - Panel derecho: cabecera (código, prioridad, cliente/negocio), meta
    (solicitud/finalización/piezas/entrega/familias), comentario de venta, y la
    lista de OFs (código, familia, descripción, tiempo imputado, quién). Sin
    botones.
  - Cerrar con ✕ o Escape (mismo patrón que `Drawer`).
- **`HistorialView`**: la fila (`FilaHistorial`) deja de expandir OFs inline; al
  hacer clic, guarda el pedido abierto en estado (`abierto: string | null`) y
  monta `<HistorialDrawer pedido={abierto} onClose=… />`. El drawer hace el
  `GET /api/historial/[pedido]` al abrirse (lazy), con estados cargando/error.
- Se reutilizan piezas visuales existentes donde encajen (`FamiliaTag`,
  `ScanViewer`, formato de fecha, `fmtMin`).

## Manejo de errores

- Detalle no carga (red/BD): el drawer muestra "No se pudo cargar el pedido" con
  reintentar; el resto de la app sigue.
- PDF 404 o serie no soportada: panel izquierdo con aviso "PDF no disponible",
  el resto del drawer (datos + OFs) se ve igual.
- Pedido sin OFs con imputaciones: se listan las OFs igualmente (tiempo 0) o, si
  no hay, "Sin imputaciones de OT registradas".

## Testing

- **Puro (Vitest)**: mapeo fila→`HistorialPedidoDetalle` (cabecera) — la parte
  con lógica; la SQL se valida por spike.
- **API**: en modo mock, `GET /api/historial/[pedido]` devuelve la forma nueva
  (`codigo`, `ofs`, y los campos de cabecera presentes aunque sean null).
- **UI**: sin RTL; build + comprobación manual (abrir un pedido, ver PDF mediano,
  ampliar, cerrar; caso sin PDF; caso error).

## Fuera de alcance

- Filtros de familia/subfamilia y cliente seleccionable (sub-proyecto 2).
- Cualquier acción sobre el pedido (es solo lectura).
- Soporte de PDF para series distintas de `AR.*` (la ruta de PDFs no las resuelve
  hoy; se muestra aviso).
