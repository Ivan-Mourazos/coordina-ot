# Modernizar las capas (ventanas, menús y desplegables)

Inventario del 17/11/2026, contrastado con `modern-web-guidance` (guías `dialog`,
`viewport-aware-dropdowns`, `light-dismiss-a-dialog`, `branded-select-styling`).
Fases 1 (ConfirmDialog) y 2 (`usePopover`) hechas el 17/11/2026; el resto, pendiente.

## Qué hay hoy

CoordinaOT no usa `<dialog>`, `popover` ni anchor positioning. Todo está hecho a mano:

| Pieza propia | Qué rehace | Lo da la plataforma |
|---|---|---|
| `lib/capas-escape.ts` + `useCapaEscape` (pila de capas, 13 componentes) | Escape cierra solo la de arriba | Pila de popovers/dialogs del navegador |
| `lib/usePopover.ts` (6 usuarios) + truco `[data-en-portal]` | Clic fuera cierra; excepción para portales | `popover="auto"` (light dismiss y anidado por jerarquía) |
| `lib/useFocoModal.ts` | Atrapar y devolver el foco | `showModal()` (página inerte y foco devuelto) |
| `createPortal` (10 componentes) | Sacar la capa por encima de todo | Top layer |
| `aria-modal` / `role="dialog"` (6) | Semántica de modal | `<dialog>` nativo (la guía prohíbe añadirlos) |
| `getBoundingClientRect` para colocar (Select, MenuAsignar, MenuAccionesOF, VentanaAnclada, Pista, AbrirCad) | Abrir arriba/abajo según el sitio | Anchor positioning, **ver soporte abajo** |

## Pieza por pieza

| Componente | Tipo según la guía | Sustituto | Riesgo |
|---|---|---|---|
| `ConfirmDialog` | Modal que bloquea (regla 1) | `<dialog>` + `showModal()`, `autofocus` en la acción segura | Bajo |
| `AbrirCad` | Modal | `<dialog>` | Bajo |
| `ScanViewer`, `VisorDocumento`, `QuickLook` | Modal a pantalla completa | `<dialog>`, `closedby="any"` | Bajo-medio |
| `PanelFlotante` | Modal a pantalla completa | `<dialog>` | Medio |
| `MarcoFicha` (fichas del pedido), `Drawer`, `HistorialDrawer` | Modal lateral | `<dialog>` + guía `navigation-drawer`; el Escape de lo que se escribe (motivo, nota) va en `cancel` | Alto: Drawer tiene 2.361 líneas |
| `Notificaciones`, `Herramientas`, `BuscadorGlobal`, `AvisosBelen` | No es diálogo (regla 3) | `popover="auto"` | Bajo |
| `MenuAccionesOF`, `MenuAsignar` | Menú (regla 3) | `popover="auto"`; posición, ver abajo | Medio |
| `VentanaAnclada` | Panel no modal colgado de un botón (regla 2) | `<dialog popover>` con botón de cerrar | Medio |
| `Pista` | Tooltip | `popover="hint"` (guía `interest-triggered-tooltips`) | Bajo |
| `Select` (329 líneas) | Select propio | `<select>` con `appearance: base-select` | Medio, se mira aparte |

## Soporte (datos de la guía)

- `<dialog>`, `showModal()` y `popover`: disponibles en Chrome y Brave. Sin polyfill.
- `closedby` (cerrar pinchando fuera): Chrome 134+. Sin él siguen funcionando Escape y el botón.
- `command` / `commandfor`: Chrome 135+.
- `appearance: base-select`: Chrome 135+. Sin soporte cae al select del sistema.
- **Anchor positioning: la guía lo da como NO soportado en Chrome/Edge/Firefox.**
  Para colocar menús junto a su botón hay dos opciones: el polyfill `@oddbird/css-anchor-positioning`,
  cargado solo si falta (es una dependencia nueva y hay que aprobarla), o mantener por ahora el
  cálculo con `getBoundingClientRect` dentro del popover. Recomendación: lo segundo, y quitarlo
  cuando Chrome lo soporte.

## Orden propuesto

1. ~~**`ConfirmDialog` → `<dialog>`.**~~ Hecho (17/11). Mientras convivan, `capas-escape` y `useFocoModal` se apartan si hay un `dialog:modal` abierto.
2. ~~**`usePopover` → `popover="auto"`.**~~ Hecho (17/11). Eran 4 usuarios, no 6: `Select` y `MenuAccionesOF` solo lo nombraban en un comentario y van en sus fases. El panel queda siempre montado (el contenido solo abierto) y los botones lo abren con `popovertarget`: con `showPopover({ source })` pinchar en el botón con el panel abierto lo cerraba por "clic fuera" y lo reabría (probado en Chrome 157). El buscador, cuyo disparador es un campo, lo reabre en su `onClick`. La colocación sigue en JS. `[data-en-portal]` sigue hasta que `PanelFlotante` (fase 3) deje de cerrar a mano.
3. Modales sencillos: `AbrirCad`, visores y `PanelFlotante`.
4. Menús (`MenuAccionesOF`, `MenuAsignar`, `VentanaAnclada`, `Pista`) manteniendo su colocación actual.
5. `Select` con `base-select`, aparte.
6. Fichas: `MarcoFicha`, `Drawer` y `HistorialDrawer`. Al final, junto con partir `Drawer`.
7. Cuando no quede nadie, borrar `capas-escape`, `useCapaEscape` y `useFocoModal`.

En cada fase: `pnpm test`, `pnpm lint`, `tsc` y capturas antes/después en claro y oscuro
(`DATASOURCE=mock`). Probar Escape con capas anidadas (ficha → desplegable → confirmar), Tab,
clic fuera y movimiento reducido. A la vista no debe cambiar nada.
