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

**Los tres tipos, y en qué se diferencian:**

| Tipo | Cuándo | Cómo lo lee el equipo |
|---|---|---|
| `nuevo` | Antes no se podía hacer | "Ahora puedo hacer esto" |
| `arreglado` | Fallaba, y ya no | "Ah, era eso lo que pasaba" |
| `mejor` | Funcionaba, pero costaba más | "Esto va más rápido ahora" |

**Qué NO lleva línea:** refactors, tests, comentarios, arreglos internos que
nadie percibe, migraciones de base de datos. Llenar el log de cosas invisibles
enseña al equipo a saltárselo, y entonces no sirve para nada.

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
