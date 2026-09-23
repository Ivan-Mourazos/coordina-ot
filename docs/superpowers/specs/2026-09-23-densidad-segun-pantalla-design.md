# La web se ajusta a la pantalla

Fecha: 23/09/2026. Aprobado por Iván el mismo día.

## El problema

Diseño Gráfico trabaja con monitores pequeños. Abren AR.26.04662 y la primera OF
ya llega al final de la pantalla; en el panel ven muy pocos partes. En OT, con
pantallas grandes, también se ve todo algo grande, pero tampoco se quiere que
quede enano.

Medido a 1362×611 (su monitor más pequeño) antes del cambio:

- **Panel:** unos 320 px se van antes del primer parte (menú, zona propia —95 px
  aunque diga "Sin pedidos asignados"—, tarjetas del equipo, filtros). Las
  miniaturas de "Sin asignar" miden 160 px: cabe **una fila**, 11 de 41 partes.
- **Ficha:** la cabecera ocupa 135 px, el recorrido 105 y notas, documentos y
  tareas unos 45 cada uno. La primera OF empieza en el píxel 430 y sus botones
  quedan debajo: el contenido mide 615 px y se ven 454. El parte escaneado se
  lleva 750 px de ancho y la ficha se queda con 500.

## Las pantallas (viewport del navegador)

| Alto | Quién |
|---|---|
| 928 (1910 de ancho) | Iván, la más grande de OT |
| 890 (1404) | Diseño, la que usa para la web |
| 785 (1685) | Diseño |
| 611 (1362) | Diseño, sus dos monitores |

## Lo que se hace

Dos capas. Ninguna crea un segundo diseño que mantener aparte.

### 1. Escala continua según el alto

El tamaño base del documento (`html { font-size }`) baja en línea recta con el
alto de la ventana: **16 px a 1080 de alto, 14 px a 611**, y no baja de 14 ni
sube de 16. Con Tailwind 4 los espacios (`--spacing`) y los textos en `rem`
(`text-xs`, `text-sm`…) siguen a la base; los textos en píxeles fijos
(`text-[11px]`, `text-[10px]`, más de 350 usos) **no cambian**, y son justo los
pequeños: así se aprieta el espacio sin que la letra menuda baje de lo legible.

Resultado aproximado: 928 → 15,4 px · 890 → 15,2 · 785 → 14,7 · 611 → 14.

### 2. Ajustes de pantalla baja (alto < 760 px)

Una variante de Tailwind (`bajo:`, `@media (max-height: 759px)`) para cambiar la
disposición donde encoger no basta. Afecta a los monitores de 611 y de 785.

- **Panel**
  - La zona propia sin pedidos se queda en una línea.
  - Las tarjetas del equipo, en una fila baja.
  - Miniaturas de "Sin asignar" más bajas, para que quepan al menos 2 filas.
- **Ficha del pedido**
  - Cabecera (código, cliente, autor) en dos líneas.
  - El recorrido del pedido en una franja fina.
  - Notas, documentos y tareas como una fila de botones plegados.
- **Parte escaneado:** algo más estrecho, y el ancho que suelta va a la ficha.

## Cómo se comprueba

Capturas antes/después a **1910×928, 1404×890 y 1362×611** del panel de Diseño,
el panel de OT y la ficha de AR.26.04662.

- A 611: la primera OF y su botón de fichar se ven sin bajar; "Sin asignar"
  enseña 2 filas.
- A 928: todo lo que se veía se sigue viendo, solo algo más compacto.

## Qué no entra

- Modo "compacto" a elegir por usuario: no hace falta si la pantalla lo decide.
- Tablets y móvil: no se usan (ver nota del proyecto).
- Rehacer vistas que no sean panel, ficha y parte. Revisiones, Historial y
  Métricas heredan la escala de la capa 1 y nada más.

## Orden

1. Capa 1 (escala), que lo mueve todo a la vez.
2. Ficha, que es donde más les molesta.
3. Panel y bandeja.
4. Parte escaneado.

Cada paso con sus capturas antes de pasar al siguiente.
