<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# El log de novedades: obligatorio en cada commit que se note

CoordinaOT enseña al equipo qué ha cambiado en cada actualización (la campana
avisa, y el menú de herramientas lo abre siempre). **Ese log se alimenta de los
mensajes de commit**, así que si la línea no se escribe, el cambio no existe
para quien usa la web.

Cuando un commit cambie algo que un técnico de Oficina Técnica pueda notar,
termina el mensaje con:

```
Novedad: nuevo | Al devolver una OF ahora dices por qué vuelve
Detalle: Marcas una o varias causas y escribes qué hay que corregir.
```

- **La línea empieza en la primera columna.** Sangrada no se recoge (así se
  pueden poner ejemplos dentro del propio mensaje sin que se cuelen).
- `Detalle:` es opcional y acompaña a la `Novedad:` de encima.
- Un commit puede llevar varias.

**Destinatario:** `Novedad[produccion]: mejor | …` avisa solo a Producción.
Los apartados válidos son `ot`, `diseno`, `impresion` y `produccion`. Sin
corchetes sigue siendo para todos. Cada persona lee lo suyo y lo general;
lo de otros apartados aparece plegado y no cuenta en su campana. Dirección
recibe todo. Elige el apartado de quien usa el cambio: una mejora en la
pantalla de Belén es de Producción; imprimir desde OT sigue siendo de OT.

**Los tres tipos, y en qué se diferencian:**

| Tipo | Cuándo | Cómo lo lee el equipo |
|---|---|---|
| `nuevo` | Antes no se podía hacer | "Ahora puedo hacer esto" |
| `arreglado` | Fallaba, y ya no | "Ah, era eso lo que pasaba" |
| `mejor` | Funcionaba, pero costaba más | "Esto va más rápido ahora" |

**Solo lo importante (Iván, 12/11/2026).** El log se estaba convirtiendo en algo
que nadie lee. Lleva línea únicamente:

- una **función nueva** (`nuevo`): algo que antes no se podía hacer;
- un **cambio importante** en cómo se trabaja: una pantalla que cambia de
  sitio, un paso que desaparece o se añade, un fallo que hacía perder trabajo
  o daba datos falsos.

**No lleva línea:** retoques de diseño, colores, espaciados, textos, orden de
columnas, ajustes de filtros, arreglos pequeños, refactors, tests, comentarios,
migraciones. Ante la duda, sin línea. Mejor tres novedades al mes que se leen
que treinta que se saltan. Varios commits de la misma función: una sola línea,
en el que la deja usable.

La vista de Producción (Belén) no enseña novedades por ahora (12/11/2026):
`Novedad[produccion]:` solo para algo que Producción deba saber de verdad.

**Cómo se escribe la frase.** En el idioma de quien la va a leer, no en el del
código. Cuéntalo como se lo contarías a un compañero en el pasillo: qué cambia
para él y qué tiene que hacer, si es que tiene que hacer algo. Nada de nombres
de ficheros, de campos ni de estados internos. Compara:

- ❌ `"ya revisada" deja de ser "tiene revisor nombrado"`
- ✅ `Una OF podía figurar como revisada sin que nadie la revisara`

Antes de desplegar, `pnpm novedades` recoge las líneas de todos los commits
desde la última entrada publicada y escribe la entrada nueva en
`src/lib/novedades-datos.json`. Con `--ver` enseña lo que haría sin tocar nada.
La FECHA no se pone a mano: la sella el servidor al estrenar la versión.

# Estilo: paleta y metal (octubre 2026)

**Sustituido por HeroUI (26/10/2026): lee `docs/ESTILO-HEROUI.md`.** La referencia aprobada es
Planteamientos con `data-estilo="hero"`: fondos lisos, tarjetas sin borde y píldora deslizante.
La guía de metal de abajo queda únicamente como historial; no se aplica a cambios nuevos.

Antes de tocar colores, paneles, botones o campos, lee `docs/ESTILO-PALETA-METAL.md`: qué eligió Iván (claro
con su paleta azul, oscuro en grafito neutro, grano y no vetas, sin recuadro dorado al pinchar en un campo), las
reglas (solo tokens, relieve y hundido con las clases del metal) y la lista de pantallas que faltan por ajustar.
Planteamientos (`toldos-testar`) copia este estilo: un cambio de colores va en las dos webs a la vez.
