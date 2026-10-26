# Estilo HeroUI — CoordinaOT y Planteamientos

Iván lo eligió con capturas el 26/10/2026. Sustituye el acabado de aluminio de
`ESTILO-PALETA-METAL.md`. Solo cambia la presentación: textos, estructura, datos,
fuente Geist y comportamiento de las pantallas se conservan.

La referencia aprobada está en Planteamientos, `src/client/coordina/hero.css` y
`src/client/pildoraDeslizante.ts`. Ambas webs activan el acabado con
`data-estilo="hero"` en `<html>`; CoordinaOT conserva su clase `.dark` para el tema.
No hace falta instalar componentes de HeroUI para reproducir este acabado.

## Tokens y acabados

Los tokens se definen en `src/app/hero.css`, importado después de `globals.css`
en el layout raíz. Las clases históricas siguen funcionando como compatibilidad:
no vuelvas a introducir degradados, textura, cantos metálicos ni sombras interiores.
No añadas `!important`: usa el ámbito explícito del estilo y respeta la cascada.

| Elemento | Claro | Oscuro |
|---|---|---|
| Fondo `--bg` | `#f4f4f5` liso | `#000` liso |
| Panel y fila `--surface`, `--fila` | `#fff` | `#18181b` |
| Secundario `--hero-relleno` | `#e9e9ec` | `#2a2a2e` |
| Encima `--hero-relleno-encima` | `#dedee3` | `#34343a` |
| Carril `--hero-carril` | `#e9e9ec` | `#222225` |
| Elegida `--hero-pildora` | `#fff` | `#52525b` |
| Texto / secundario | `#18181b` / `#52525b` | `#fafafa` / `#a1a1aa` |

- Paneles y filas: radio 24 px, sin borde, sombra `--hero-sombra-panel`.
  Claro: `0 1px 2px rgba(0,0,0,.04), 0 10px 30px -14px rgba(0,0,0,.12)`.
  Oscuro: `0 0 0 1px rgba(255,255,255,.06)`.
- Botones: radio 999 px, sin borde; principal macizo `brand-400` con tinta
  `brand-950`. Secundarios grises. Al pulsar, escala `.97`; no suben ni se hunden.
- Campos y desplegables: superficie blanca/carbón, radio 14 px, sombra mínima
  `--hero-sombra-campo`. Foco de 2 px con `--hero-anillo` de marca.
  El buscador con caja aplica el foco a la caja, evitando anillos duplicados.
- Pestañas: carril gris ajustado al contenido, elegida con sombra
  `--hero-sombra-pildora`; en oscuro siempre más clara que el carril.
- Conservar colores que comunican estados, personas, familias y fichaje.
  Para colores de interfaz, usar tokens. Texto AA en ambos temas: no atenuar
  `text-muted` con opacidades que pierdan contraste.
- Foco visible con teclado en botones, enlaces, menús y controles. Respetar
  `prefers-reduced-motion` tanto en la píldora como al pulsar.

## Píldora que se desliza

`PildorasDeslizantes` se monta una sola vez en el layout y no dibuja nodos.
Mide la opción directa `.pestana-activa`, `.glass-chip-activo` o
`[aria-pressed=true]` dentro de `.tira-3d` y actualiza `--px`, `--py`, `--pw`,
`--ph`. El `::before` del carril se mueve entre posiciones. No uses ese
pseudoelemento para otra decoración. Sin JavaScript la elegida conserva su fondo.

La primera medición no anima. Cambios de clase, opción, tamaño y carga de fuentes
recolocan la píldora. Los observadores y eventos se limpian al desmontar.
Los filtros independientes conservan su aspecto elegido; no agrupar toggles
independientes bajo una sola píldora porque pueden estar activos a la vez.

## Verificación local

Usar `pnpm`, Node 22 o posterior y datos `DATASOURCE=mock`; nunca reutilizar
credenciales de producción. `COORDINA_LOGIN=off` muestra el tablero; `activo`
con una clave local `COORDINA_SESION_SECRET` muestra Consulta a quien no tiene
cookie. Mantener `FICHAJE_OLANET=sombra`, `IMPRESION_PRODUCCION=off` y
`CORREO_PLANTEAMIENTO=off`. La SQLite de desarrollo vive dentro de este worktree.

Capturas en `tmp/hero/antes` y `tmp/hero/despues`, a 1280×720 y 1600×900, temas
claro y oscuro: En curso, Pedidos, Consultas con OT, Pendientes, ficha y menú.
Mirar cada captura, probar teclado, cambio de opción y movimiento reducido.
Ejecutar `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit` y `pnpm build`.
Los commits visibles llevan `Novedad:` en castellano según `AGENTS.md`.
No publicar, fusionar ni desplegar como parte del ajuste visual.
