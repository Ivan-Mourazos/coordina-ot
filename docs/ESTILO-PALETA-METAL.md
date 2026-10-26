# Estilo «paleta y metal» (octubre 2026): guía para ajustar toda la web

Encargo de Iván (26/10/2026): «deja las indicaciones necesarias para el agente de coordina para que ajuste todas las
partes de la web». La base ya está en `src/app/globals.css`; falta revisar **pantalla a pantalla** que todo la use y
que nada se quede con colores sueltos o con el estilo anterior. Planteamientos (`toldos-testar`) copia este mismo
estilo en `src/client/coordina/tokens.css` y `metal.css`: **cualquier cambio de colores se hace en las dos webs a la vez.**

## Lo que decidió Iván (con capturas, 15, 25 y 26/10/2026)

| Tema | Fondo de la página | Paneles, botones, filas | Textura |
|---|---|---|---|
| **Claro** | aluminio teñido con su paleta azul: `#e3e9f3 → #d2dae7`, `--bg #dce3ef` | blancos en relieve; bordes `#98a9c4`, texto `#111522`, secundario `#4a5a76` | grano fino gris azulado, **solo en el fondo de la página** |
| **Oscuro** | **grafito neutro, sin azul**: `#111214` con luz arriba a la izquierda y esquinas más oscuras | **gris carbón de siempre** (`#212225`, `#2a2c31`…) | grano fino neutro, **solo en el fondo de la página** |

- La paleta de Iván: `#111522 #1E263B #303D59 #536684 #98A9C4 #DCE3EF`. Se usa **solo en claro**. En oscuro la descartó
  dos veces: «demasiado azul», y el gris con un fondo negro azulado chocaba (eligió la opción «todo neutro»).
- **Grano, no vetas, y solo en el fondo.** El metal cepillado (rayas horizontales) se cambió por grano fino sin
  estirar. Y el 26/10/2026 Iván eligió con capturas quitarlo de paneles, filas, botones y campos: detrás del texto
  pequeño lo ensuciaba (en oscuro metía más del doble de ruido justo donde se lee). Solo lo lleva el fondo de la
  página y la cabecera (`--veta-fondo`); el token `--veta` ya no existe. El relieve y el hundido salen de las
  sombras y degradados (`--relieve`, `--hundir`), no del grano. Si aparece textura detrás de un texto, es un resto.
- **Sin recuadro dorado al pinchar en un campo.** Los campos de escribir se marcan con borde y anillo suaves del gris
  secundario (regla sin capa tras `:focus-visible` en `globals.css`). El dorado de foco queda para botones y enlaces,
  y solo sale con el teclado.
- **Buscador de la cabecera hundido** (`.campo-hundido`): un hueco donde se escribe, no una tecla.
- **La cabecera** lleva el mismo fondo que la página (`:root .glass-header`); las tiras de pestañas (`.tira-3d`), sin
  placa detrás.
- El **dorado de marca** (botones principales, lo activo) no cambia: sobre aluminio azulado y sobre grafito es lo que
  dice «aquí se pulsa».

## Reglas para el ajuste

1. **Solo tokens.** Ningún color en hexadecimal, `rgb()` o clase de paleta de Tailwind (`slate-`, `gray-`, `zinc-`,
   `neutral-`, `stone-`, `sky-`, `blue-`, `indigo-`…) para fondos, bordes o textos de interfaz. Usa `bg-bg`,
   `bg-surface`, `bg-surface-2`, `border-border`, `border-border-strong`, `text-text`, `text-text-muted`,
   `var(--recuadro)`, `var(--fila)`… Las excepciones son los colores con significado (estado de fase, centros, roles,
   avisos verde/ámbar/rojo) y los dibujos, que ya tienen sus propias variables.
   Punto de partida, al escribir esta guía: 15 componentes con hexadecimal o `rgba()` en el JSX
   (`grep -rlE "#[0-9a-fA-F]{6}\b|rgba?\(" src/components`) y clases sueltas `sky-*`, `indigo-*`, `gray-600`,
   `neutral-500` y `stone-950`. Revisa cada una: si es un color de interfaz, pásalo a token; si tiene significado,
   déjalo y comprueba que se lee en los dos temas.
2. **Todo lo que está encima lleva relieve; todo lo pulsado o desplegado, hundido.** Paneles, tarjetas, filas, botones
   y menús usan las clases del bloque «Metal y aluminio» (`glass-panel`, `glass-chip`, `chip-3d`, `bloque-3d`,
   `fila-sombra`, `pildora-*`…). Lo abierto o pulsado usa `glass-chip-activo`, `pestana-activa`, `bloque-3d-hundido`,
   `.recuadro` o `.detalle-hundido`. Un panel con su propio `bg-…` y `shadow-…` que no esté en esa lista es candidato
   a pasarse a una de estas clases.
3. **Campos de escribir:** fondo y borde de los tokens, sin `focus:border-brand-*` ni `focus-visible:ring-*` propios
   (la regla global ya los marca). Un campo sin borde dentro de su caja sigue el patrón de `.campo-hundido` del
   buscador.
4. **Contraste mínimo 4,5:1** para el texto y **3:1** para bordes de campos y lo que se pulsa. En claro, el
   secundario `#4a5a76` da unos 5,4:1 sobre `--bg` y unos 5,1:1 sobre `--recuadro`. No le pongas alfa (`/50`, `/60`).
5. **No inventes estilo nuevo.** Si una pantalla necesita algo que no está en `globals.css`, añádelo allí como token o
   clase, y apúntalo aquí para copiarlo también en Planteamientos.

## Cambios en tokens y reglas (para copiar en Planteamientos)

**26/10/2026, rama `estilo-toda-la-web`:**

| Qué | Claro | Oscuro | Para qué |
|---|---|---|---|
| `--borde-campo` (`border-borde-campo`) | `#6e7f9d` | `#70747e` | Borde de un campo de escribir con borde: 4,1:1 sobre blanco y 3,1:1 sobre `--bg` en claro; 3,4:1 sobre `--surface` en oscuro. `--border-strong` daba 2,4:1. |
| `--color-brand-950` (`text-brand-950`) | `#231903` | igual | Tinta sobre el dorado (botones principales, el día elegido). 9,2:1 sobre `brand-400`. Antes iba escrita en hexadecimal en 9 sitios. |
| `text-error` en vez de `text-red-600/700 dark:text-red-400` | `red-700` | `red-300` | Atrasado, fuera de plazo, errores, «peligro» en los menús. El `red-400` daba 4,2:1 sobre la fila oscura. |
| Sin `--veta` (fuera el token y sus 8 usos) | — | — | Paneles, filas, botones, pestañas, píldoras, campos hundidos y `.recuadro` sin grano: `background-image: var(--relieve)` o `var(--hundir)` a secas. `--veta-fondo` se queda en `body` y en `.glass-header`. |

- **La regla global del foco de los campos va con `:where(...)`**, no con `:is(...)`. Con `:is` puntuaba (0,4,1),
  ganaba a `.campo-hundido input` y el buscador de la cabecera sacaba un anillo dentro del hueco.
- **`.campo-hundido` vale también en el propio campo**, no solo en la caja que lo envuelve: los buscadores de
  Pendientes, Revisiones, Historial, Visitas, Consulta y Toda la casa son un `input.campo-hundido` suelto.
- Color de Carrón: `#0f8a8a` → `#0d7f7f` (las iniciales no llegaban a 4,5:1 con ninguna tinta).

## Pantallas a revisar (claro y oscuro, a 1280 × 720 y a 1920 × 1080; solo escritorio)

Marca cada una con el commit cuando esté. `[x]` revisada con capturas y con la pasada de contraste en el navegador;
`[~]` arreglada en el código, pero sin ver la pantalla abierta en ese estado (con los datos de prueba no sale, o hay
que provocarla a mano).

- [x] Cabecera: logo, `ViewSwitcher`, `BuscadorGlobal` y resultados, `Notificaciones`, `Herramientas`, `ThemeToggle`, `ZonaPersonal`, `MiFichaje` — `1104c69`, `663d01e`
- [x] Tablero (`Board`): `ListaView`, `PedidoCard`, `TecnicoCard`, `FilaOF`, `FilaDesplegable`, `PedidoLinea`, `FilterBar`, `Bandeja` — `1104c69`, `663d01e`, `b1b6f55`
- [x] Ficha del pedido (`Drawer`, `MarcoFicha`): `LineaTiempoPedido`, `DocumentosPedido`, `DocumentosRps`, `DocumentosEnCurso`, `NotasPedido`, `NotasPublicas`, `PlanteamientoPedido`, `DetalleVenta`, `TiempoOF`, menús (`MenuAccionesOF`, `MenuAsignar`) — `663d01e`, `b1b6f55`, `234aa53`
- [~] Acciones en línea: `AprobarInline`, `DevolverInline`, `AnularInline`, `CerrarEnRpsInline`, `ReintentarGemelaInline`, `ConfirmDialog`, `NotaDevolucion`, `PedirRevisor` — campos y rojos en `1104c69`, `b1b6f55`; falta verlas abiertas
- [x] Revisión: `RevisionView`, `LineaRevisar` — `663d01e`, `234aa53`. [~] `GuiaRevision`, `PanelGuiaRevision`: campos en `1104c69`; falta verlas abiertas
- [~] Historial: `HistorialView` vista vacía (los datos de prueba no traen historial); `HistorialDrawer`, `HistorialCentros`, `HistorialOFsCompactas`, `HistorialQuien`, `HistorialTareas` sin ver — `1104c69`, `234aa53`
- [~] Consulta: `Consulta`, `ConsultaEnCurso`, `ConsultaPedidos` — buscador hundido en `1104c69`; falta verla
- [x] Métricas: `MetricasView`, `MetricasGrafica` — ya usaban variables (`--fase-*-relleno`, `--text-muted`, `--border`); sin cambios
- [x] Visitas: `VisitasCotView`, `CalendarioVisitas`, `SelectorFecha` — `1104c69`, `663d01e`, `234aa53`
- [~] Visores: `VisorPdf`, `VisorDocumento`, `ScanViewer`, `ParteEscaneado`, `QuickLook`, `FotoConZoom`, `PedidoScan` — sin el gris de Chrome detrás de la réplica del parte (`663d01e`). El resto lleva colores de papel o el negro del visor de fotos: son dibujos, se dejan
- [~] Paneles flotantes y avisos: `PanelNovedades`, `ErrorCarga`, `BotonArriba` vistos o arreglados (`663d01e`, `234aa53`); `PanelFlotante`, `PanelCompanero`, `VersionNueva`, `AvisoParteNuevo`, `SoloLectura` sin ver
- [x] Entrada: `LoginGate` (`/entrar`) — `663d01e`. [~] `IdentityGate`, `ResetPin` sin ver
- [x] Controles comunes: `Select`, `Desplegable`, `SelectorSeccion`, `FamiliaTag`, `MaterialChip`, `RolChip` vistos en el tablero y la ficha. `MaterialChip` deja `bg-gray-600` a propósito: es el estado «nada reservado», junto al verde y el ámbar, y el blanco encima da 7,5:1

Lo que se deja con color propio porque tiene significado: avisos de Producción en índigo, nota «Visible para todos» y
«Siguiente» de la Consulta en azul cielo, colores de persona (`lib/mock.ts`) y de familia, y los dibujos del parte.

## Cómo comprobarlo

- **Capturas de antes y después** de cada pantalla, en claro y en oscuro, con datos de prueba y no de producción.
  Mira cada captura entera: fondo, cabecera, paneles, campos con el foco puesto y menús abiertos.
- `pnpm lint`, `pnpm test` y `pnpm build` antes de cada commit.
- **Commits pequeños por zona**, con la línea `Novedad:` cuando el cambio se note (ver `AGENTS.md`), por ejemplo:
  `Novedad: mejor | El Historial con el mismo metal y colores que el resto`.
- No se fusiona en `main` ni se despliega sin el visto bueno de Iván.
