# Estilo «paleta y metal» (octubre 2026): guía para ajustar toda la web

Encargo de Iván (26/10/2026): «deja las indicaciones necesarias para el agente de coordina para que ajuste todas las
partes de la web». La base ya está en `src/app/globals.css`; falta revisar **pantalla a pantalla** que todo la use y
que nada se quede con colores sueltos o con el estilo anterior. Planteamientos (`toldos-testar`) copia este mismo
estilo en `src/client/coordina/tokens.css` y `metal.css`: **cualquier cambio de colores se hace en las dos webs a la vez.**

## Lo que decidió Iván (con capturas, 15, 25 y 26/10/2026)

| Tema | Fondo de la página | Paneles, botones, filas | Textura |
|---|---|---|---|
| **Claro** | aluminio teñido con su paleta azul: `#e3e9f3 → #d2dae7`, `--bg #dce3ef` | blancos en relieve; bordes `#98a9c4`, texto `#111522`, secundario `#4a5a76` | grano fino gris azulado |
| **Oscuro** | **grafito neutro, sin azul**: `#111214` con luz arriba a la izquierda y esquinas más oscuras | **gris carbón de siempre** (`#212225`, `#2a2c31`…) | grano fino neutro |

- La paleta de Iván: `#111522 #1E263B #303D59 #536684 #98A9C4 #DCE3EF`. Se usa **solo en claro**. En oscuro la descartó
  dos veces: «demasiado azul», y el gris con un fondo negro azulado chocaba (eligió la opción «todo neutro»).
- **Grano, no vetas.** El metal cepillado (rayas horizontales) se cambió por grano fino sin estirar en `--veta` y
  `--veta-fondo`. Si aparece una textura rayada en algún sitio, es un resto: cámbiala.
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

## Pantallas a revisar (claro y oscuro, a 1280 × 720 y a 1920 × 1080; solo escritorio)

Marca cada una con el commit cuando esté.

- [ ] Cabecera: logo, `ViewSwitcher`, `BuscadorGlobal` y resultados, `Notificaciones`, `Herramientas`, `ThemeToggle`, `ZonaPersonal`, `MiFichaje`
- [ ] Tablero (`Board`): `ListaView`, `PedidoCard`, `TecnicoCard`, `FilaOF`, `FilaDesplegable`, `PedidoLinea`, `FilterBar`, `Bandeja`
- [ ] Ficha del pedido (`Drawer`, `MarcoFicha`): `LineaTiempoPedido`, `DocumentosPedido`, `DocumentosRps`, `DocumentosEnCurso`, `NotasPedido`, `NotasPublicas`, `PlanteamientoPedido`, `DetalleVenta`, `TiempoOF`, menús (`MenuAccionesOF`, `MenuAsignar`)
- [ ] Acciones en línea: `AprobarInline`, `DevolverInline`, `AnularInline`, `CerrarEnRpsInline`, `ReintentarGemelaInline`, `ConfirmDialog`, `NotaDevolucion`, `PedirRevisor`
- [ ] Revisión: `RevisionView`, `LineaRevisar`, `GuiaRevision`, `PanelGuiaRevision`
- [ ] Historial: `HistorialView`, `HistorialDrawer`, `HistorialCentros`, `HistorialOFsCompactas`, `HistorialQuien`, `HistorialTareas`
- [ ] Consulta: `Consulta`, `ConsultaEnCurso`, `ConsultaPedidos`
- [ ] Métricas: `MetricasView`, `MetricasGrafica` (los colores de las gráficas, a tokens que se lean en los dos temas)
- [ ] Visitas: `VisitasCotView`, `CalendarioVisitas`, `SelectorFecha`
- [ ] Visores: `VisorPdf`, `VisorDocumento`, `ScanViewer`, `ParteEscaneado`, `QuickLook`, `FotoConZoom`, `PedidoScan`
- [ ] Paneles flotantes y avisos: `PanelFlotante`, `PanelCompanero`, `PanelNovedades`, `VersionNueva`, `AvisoParteNuevo`, `SoloLectura`, `ErrorCarga`, `BotonArriba`
- [ ] Entrada: `LoginGate`, `IdentityGate`, `ResetPin`
- [ ] Controles comunes: `Select`, `Desplegable`, `Acordeon`, `BloqueDesplegable`, `BloqueLista`, `SelectorOFs`, `SelectorSeccion`, `RolChip`, `FamiliaTag`, `MaterialChip`, `LiveBadge`, `Pista`

## Cómo comprobarlo

- **Capturas de antes y después** de cada pantalla, en claro y en oscuro, con datos de prueba y no de producción.
  Mira cada captura entera: fondo, cabecera, paneles, campos con el foco puesto y menús abiertos.
- `pnpm lint`, `pnpm test` y `pnpm build` antes de cada commit.
- **Commits pequeños por zona**, con la línea `Novedad:` cuando el cambio se note (ver `AGENTS.md`), por ejemplo:
  `Novedad: mejora | El Historial con el mismo metal y colores que el resto`.
- No se fusiona en `main` ni se despliega sin el visto bueno de Iván.
