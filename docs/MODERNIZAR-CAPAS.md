# Modernizar las capas (ventanas, menús y desplegables)

Inventario del 17/11/2026, contrastado con `modern-web-guidance` (guías `dialog`,
`viewport-aware-dropdowns`, `light-dismiss-a-dialog`, `branded-select-styling`).
Fases 1 (ConfirmDialog), 2 (`usePopover`) y 3 (AbrirCad) hechas el 17/11/2026; el resto, pendiente.

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
3. ~~**`AbrirCad`.**~~ Hecho (17/11). No era un modal sino un selector colgado de su botón: ahora es un panel de `usePopover`. De paso, dos arreglos en `usePopover` que afectaban también a la fase 2: al cerrar, el foco caía en el `body` en vez de volver al botón (React desmontaba lo enfocado antes de que el navegador terminara de cerrar; ahora se vacía en `toggle` y el `setOpen(false)` del hook pasa por `hidePopover()`). Y `useFocoModal` respeta un Tab con `preventDefault`.
   **Lo demás de esta fase se aplaza**, porque un `<dialog>` modal deja inerte todo lo que no cuelga de él en el DOM:
   - ~~`VisorDocumento`~~ Hecho (17/11), junto con `Pista` (adelantada de la fase 4). La pista es `popover="hint"` (en Safari queda `manual` y Escape lo escucha ella): va a la capa superior, sale encima del visor, no cierra los desplegables `auto` y Escape la cierra solo a ella. Sigue colocada en JS y en un portal (no cabe un `div` dentro del `span` del botón). El visor es un `<dialog>` modal a pantalla completa con el telón en el propio cuadro; cerrar pasa siempre por `close()` (si no, el foco no vuelve) y el foco al abrir va al cuadro, no al primer botón, para que no salte su pista.
   - `PanelFlotante` lleva `Select` (guía de revisión) y menús en portal: no se podrían pulsar. Va detrás de la fase 5.
   - ~~`ScanViewer`~~ no lo usaba nadie: borrado (17/11), no migrado. `QuickLook` no es un modal (vista previa al pasar el ratón, sin foco): se queda.
4. ~~Menús (`MenuAccionesOF`, `MenuAsignar`, `VentanaAnclada`)~~ Hecho (17/11), con su colocación de siempre (`sitioDeMenu`, volteo hacia arriba).
   - Los dos menús usan `usePopover` con la opción nueva `colocar` (y `aplicarSitio` de `menu-flotante`). Siguen dentro de la ficha o la tarjeta en el DOM: la trampa de foco del drawer los ve dentro y `PanelFlotante` no los toma por clic fuera. `MenuAsignar` corta `click` y `keydown` en el panel para que la tarjeta no abra el parte. Elegir una opción cierra primero (el foco vuelve al ⋯) y luego actúa: el ConfirmDialog ya devuelve el foco al ⋯.
   - `VentanaAnclada` mantiene su API (montada = abierta): `popover="auto"` en su sitio, se abre en un layout effect y avisa al padre en `toggle` (no en `beforetoggle`: el clic fuera salta antes del `click` del botón, que la reabriría). Al desmontarse con el foco dentro lo devuelve al botón. Se sigue cerrando al hacer scroll fuera de ella.
   - Choque encontrado: el `flushSync` de `usePopover` dentro de `beforetoggle` pintaba también el globo de `Pista` pendiente (el ⋯ lleva `title`) y su `showPopover()` lanzaba «Invalid to show a popover during another show operation», que tumbaba la ficha. `Pista` ahora reintenta en el siguiente fotograma.
5. `Select` con `base-select`, aparte. Después, `PanelFlotante` → `<dialog>` y fuera `[data-en-portal]`.
6. Fichas: `MarcoFicha`, `Drawer` y `HistorialDrawer`. Al final, junto con partir `Drawer`.
7. Cuando no quede nadie, borrar `capas-escape`, `useCapaEscape` y `useFocoModal`.

En cada fase: `pnpm test`, `pnpm lint`, `tsc` y capturas antes/después en claro y oscuro
(`DATASOURCE=mock`). Probar Escape con capas anidadas (ficha → desplegable → confirmar), Tab,
clic fuera y movimiento reducido. A la vista no debe cambiar nada.
