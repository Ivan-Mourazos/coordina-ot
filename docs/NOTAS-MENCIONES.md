# Notas: para quién, menciones y conversaciones

Diseño acordado con Iván el 16/11/2026. Sustituye el «Solo OT / Para todos» actual.

**Fase 1 hecha (16/11/2026):** para quién, consulta pública aparte, `@` y campana filtrada.
Plan en `docs/superpowers/plans/2026-11-16-notas-menciones-fase1.md`. Desvío: las filas de
`nota_audiencia` migradas tienen `creado_at` NULL y no avisan (si no, la campana de Diseño,
Impresión y Dirección se habría llenado con todas las notas internas viejas).

## Problema

Hoy la campana avisa de cualquier nota de otra persona en cualquier pedido de tu lista
(`Board.tsx`, bucle de `notasRecientes`). Con todo el equipo escribiendo, la campana se
llena de recados que no son para ti y se deja de mirar. Las notas tampoco tienen forma de
dirigirse a alguien ni de contestar a una en concreto.

## Reglas

### 1. Quién ve una nota

- **Por defecto, todos los que tienen cuenta** en Coordina (todas las secciones y Dirección).
- **«Solo para…»** opcional: una o varias personas y/o secciones. Solo ellas la ven.
  El autor la ve siempre.
- **Consulta pública (sin login)**: casilla aparte, «Visible en la consulta pública»,
  **desmarcada por defecto**. Que una nota sea «para todos» ya no la expone sin login.
- Una **respuesta hereda la visibilidad** de la nota raíz del hilo y no se puede ampliar:
  abrir una respuesta a más gente filtraría el contexto restringido.

### 2. A quién avisa (campana)

Una nota avisa SOLO a:

- quien se **menciona** con `@persona`;
- todos los de una **sección mencionada** con `@sección`;
- el **público de «Solo para…»** (si te la restringen a ti, es para ti), sin necesitar `@`;
- el **autor de la nota a la que se responde**.

Nunca al propio autor. **Una nota sin mención, sin restricción y que no es respuesta no
avisa a nadie**: es una nota del autor, sin más, que queda en el hilo para quien lo abra.

### 3. Secciones mencionables

| Mención | A quién llega |
|---|---|
| `@Oficina Técnica` | toda la sección `ot`, Ángel incluido |
| `@Diseño` | sección `diseno` |
| `@Impresión` | sección `impresion` (y quien la tenga en `tambienEn`) |
| `@Producción` | rol `produccion`: Belén Alamancos, Cristina Rivas, Miguel Tato, Belén Quintela y Carlos Veiga (encargado) |
| `@Dirección` | rol `direccion` |

Las secciones se resuelven por `persona.seccion`/`tambienEn` y los roles, nunca por
listas de nombres: quien entre mañana en una sección recibe sus avisos solo.
Dirección **no** recibe los avisos de las demás secciones; solo cuando la mencionan.

### 4. Conversaciones

- Se puede responder a cualquier nota, también a una respuesta, **sin límite de nivel**.
- La sangría visual se corta en el nivel 3; por debajo, mismo margen con
  «↳ respondiendo a Fulano» (el panel del pedido es estrecho).
- Un hilo se puede **plegar** y marcar **«resuelto»** (se queda plegado para todos).
- Borrar una nota con respuestas deja «nota borrada» en su sitio para no romper el hilo.

### 5. Editar

Editar puede añadir menciones o cambiar el público de una nota raíz. Solo avisan los
**recién añadidos**; los que ya tenían el aviso no lo reciben otra vez.

## Datos

```sql
ALTER TABLE nota_pedido ADD COLUMN padre_id INTEGER REFERENCES nota_pedido(id);
ALTER TABLE nota_pedido ADD COLUMN en_consulta_publica INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nota_pedido ADD COLUMN resuelta_at TEXT;   -- solo en la raíz
-- `publica` queda obsoleta tras migrar (no se borra la columna).

-- Público restringido. Sin filas = para todos.
CREATE TABLE nota_audiencia (
  nota_id INTEGER NOT NULL REFERENCES nota_pedido(id),
  tipo    TEXT NOT NULL CHECK (tipo IN ('persona','seccion')),
  destino TEXT NOT NULL,           -- id de persona o SeccionId/'produccion'/'direccion'
  PRIMARY KEY (nota_id, tipo, destino)
);

-- Menciones con @.
CREATE TABLE nota_mencion (
  nota_id INTEGER NOT NULL REFERENCES nota_pedido(id),
  tipo    TEXT NOT NULL CHECK (tipo IN ('persona','seccion')),
  destino TEXT NOT NULL,
  creado_at TEXT NOT NULL,         -- para saber qué menciones son nuevas al editar
  PRIMARY KEY (nota_id, tipo, destino)
);
```

En el texto, la mención se guarda como token estable (`@[persona:146]`,
`@[seccion:produccion]`) y se pinta como etiqueta con el nombre actual. La tabla es la
fuente para avisos; el token, para pintar.

### Migración de las notas existentes (sin exponer nada)

| Hoy | Pasa a |
|---|---|
| `publica = 0` (interna) | audiencia = secciones `ot`, `diseno`, `impresion` + `direccion` (quien la veía: todos menos Producción) |
| `publica = 1` | para todos, `en_consulta_publica = 1` (sigue saliendo donde salía) |

Nadie gana ni pierde visibilidad sobre notas viejas.

## Seguridad: el filtro vive en el servidor

- `leerNotas`, `leerNotasRecientes` (`/api/notas-recientes`) y la vista de Belén filtran
  por audiencia **en SQL**, con la persona de la sesión. Hoy `notas-recientes` devuelve
  el texto de todas las notas: con notas restringidas, eso sería una fuga.
- La consulta pública (`leerNotasPublicas`, `contarNotasPublicas`) pasa a mirar
  `en_consulta_publica = 1` y además «sin audiencia restringida».
- Los avisos se calculan en el servidor («notas que me avisan»), no en el navegador
  filtrando una lista completa.
- Responder a una nota que no ves = 404.

## Fases

1. **Visibilidad + menciones + campana filtrada.** Migración, selector «Para: todos /
   solo para…», casilla de consulta pública, autocompletado `@`, etiquetas, nueva
   regla de la campana (también en `AvisosBelen`). Es lo que quita el ruido.
2. **Respuestas anidadas**, plegar y «resuelto».
3. **Leído en servidor** (opcional): los avisos personales marcados como leídos en la BD
   en vez de en `localStorage`, para que no vuelvan a sonar en otro PC.

## Fuera de alcance

- Chat general o directo entre personas sin pedido (Iván, 16/11: «solo las notas, por
  ahora nada de chat aparte»). Cada cuenta es mencionable y pertenece a su sección; con eso basta.
- Bandeja propia «Para mí / Mi sección» con todas las conversaciones: idea aparcada, no pedida.
- Avisos por correo de las menciones (se puede valorar más adelante).
