# Login de operarios

Fecha: 2026-09-08 · Pedido por Esteban Raposo a través de Iván

## Por qué

CoordinaOT no tiene login. La identidad se elige en una rejilla de caras y se
guarda en `localStorage`; el navegador la manda en cada petición y **el servidor
se la cree**:

```
POST /api/estado { operarioId: "angel", motivo: "aprobar", … }
```

Cualquiera en la red puede fichar como otro, aprobar en su nombre o devolver una
OF firmándola con quien quiera. Hasta hoy daba igual: la usaban nueve personas
que se sientan juntas. Deja de dar igual ahora, porque Esteban ha pedido tres
cosas y las dos siguientes dependen de esta:

1. Acceso con login para los usuarios de OT, para que la usen como hasta ahora.
2. Acceso sin login, solo consulta, para toda la organización.
3. Una vista de supervisión para Cris, Carlos y Esteban: lo anterior más
   histórico de trabajos por técnico y fechas, y estadísticas de causas de
   rechazo.

Sin saber quién pregunta no se puede abrir la casa a los de fuera. **El login no
se hace para blindar nada: se hace para poder separar quién escribe de quién
solo mira.** Esto último lo dijo Iván y ordena todas las decisiones de abajo.

## Alcance

**Entra:** tabla de personas con PIN y roles · pantalla de PIN · sesión con
cookie · los endpoints sacando la identidad de la sesión en vez del cuerpo ·
salir · resetear el PIN de alguien.

**No entra:** la consulta sin login y la vista de supervisión. Se dejan para
cuando esté claro qué datos necesitan Cris, Carlos y Esteban, y qué se puede
enseñar a un invitado. Diseñar eso ahora sería adivinar (ver "Lo aplazado").

## Decisiones

### El PIN es el de la extensión del teléfono

Decidido por el equipo. Se dijo lo que hay que decir: **una extensión no es un
secreto** —está en la lista que tiene toda la casa—, así que como llave sirve
para "que no fiche otro por mí", no para probar que fue Tamara quien revisó. Se
propuso usar el PIN de extensión solo como valor inicial y cambiarlo al primer
acceso, y también validar contra el dominio de Windows (unas cincuenta líneas
con LDAP, pero depende de IT y deja el acceso colgando de que el dominio
responda).

Se acepta el PIN de extensión tal cual por un motivo que pesa más: **hoy no hay
nada**, así que ya es una mejora, y lo que se busca es la separación de accesos,
no la seguridad.

Aun así el PIN se guarda **cifrado** (hash), no en claro: no cuesta nada y evita
que quede en la base una lista legible de los PIN de todos.

### Roles acumulables, no un rol por persona

- `tecnico` — los nueve de OT y Diseño. Todo lo de hoy: fichar, plantear,
  revisar, aprobar, devolver.
- `supervisor` — Cris, Carlos, Esteban. Solo lectura, con más alcance (fase 3).
- Invitado no es un rol: es no tener sesión (fase 2).

Ángel lleva los dos, porque hace las dos cosas: revisa Y supervisa las dos
secciones. De ahí que una persona tenga una LISTA de roles y no uno solo.

### La sesión dura hasta que se cierra

Se entra una vez y ese navegador recuerda, como hoy, hasta pulsar "Salir".
Caducar cada día son cuatro dígitos más por persona y mañana; caducar por
inactividad echa a quien lleva dos horas planteando un toldo sin tocar la web,
que es justo cuando más molesta.

En un PC compartido, el segundo pulsa "Salir" y entra con el suyo — el mismo
gesto que hoy es cambiarse de nombre en el menú.

### Trabajo por técnico sí, fallos por persona no

Esteban pide "histórico de trabajos por técnico" y "estadísticas de causas de
rechazo". Son dos cosas distintas y solo una es inocua:

- **Qué hizo cada uno y cuándo** ("Tamara, martes: 6 OF, 4h 10m"): es supervisar,
  y entra.
- **A quién le devuelven más**: no entra. Las Métricas se hicieron dejándolo
  fuera a propósito, y el motivo sigue escrito en `lib/metricas.ts`: un tablero
  de "quién falla más" cambia cómo se usa la herramienta —se devuelve menos para
  no señalar a nadie— y entonces ni el número ni las revisiones sirven. Las
  causas se enseñan del equipo entero, sin nombres.

## Cómo

### Las personas pasan a la base

Hoy son una constante en el código (`OPERARIOS`, nueve técnicos). No aguanta lo
que viene: Cris, Carlos y Esteban tienen que entrar sin aparecer en el tablero
como si plantearan toldos.

```sql
CREATE TABLE persona (
  id        TEXT PRIMARY KEY,   -- angel, tamara… los MISMOS de ahora
  nombre    TEXT NOT NULL,
  pin_hash  TEXT NOT NULL,
  roles     TEXT NOT NULL,      -- "tecnico" | "supervisor" | "tecnico,supervisor"
  seccion   TEXT,               -- solo la usan los técnicos
  activo    INTEGER NOT NULL DEFAULT 1
);
```

**El `id` no cambia.** Todo lo guardado —fichajes, autorías, notas, causas,
marcas de revisión— apunta a esos ids, así que no hay que migrar nada.

**Las bajas se desactivan, no se borran.** El histórico está lleno de "planteó
Jaime"; si Jaime desaparece de la tabla, el histórico deja de saber quién fue.

Migración que siembra las nueve personas de `OPERARIOS` con su PIN de extensión
y rol `tecnico`, más Cris, Carlos y Esteban como `supervisor`. Ángel, con los
dos. Los PIN reales los aporta Iván; la migración no lleva PINs escritos en el
código.

### La sesión

Al acertar el PIN, el servidor deja una cookie **firmada y httpOnly** con el id
de la persona. httpOnly importa: sin ella, el JavaScript de la página puede
leerla y cambiarla desde la consola, que es exactamente el agujero que se viene
a cerrar.

La firma usa un secreto en `.env.local` (`COORDINA_SESION_SECRET`), como las
credenciales de RPS. Si falta, la app no arranca: sin secreto la cookie se puede
falsificar, y arrancar "sin seguridad pero funcionando" es peor que no arrancar.
Cambiarlo cierra todas las sesiones abiertas, que es justo lo que se quiere el
día que haga falta echar a todo el mundo.

### El servidor deja de fiarse del cliente

Es el grueso del trabajo, más que la pantalla del PIN. Diez endpoints aceptan
hoy `operarioId` del cuerpo: `estado`, `fichaje`, `fichaje/latido`,
`fichaje/aviso-visto`, `notas`, `avisos`, `causas`, `fases`, `pedido-scan`,
`revision/marcas`.

Todos pasan a:

1. Sacar la identidad de la sesión. El campo `operarioId` del cuerpo se ignora
   (y se quita de las llamadas del cliente).
2. Declarar qué rol necesitan. Escribir es de `tecnico`; leer, de cualquiera con
   sesión.

Un ayudante único (`quienEs(req)`) para no repetir la comprobación diez veces y
que no se olvide en el endpoint número once.

Esto es lo que hace pequeñas las fases 2 y 3: cuando se abra la consulta sin
login, los endpoints de escritura ya rechazan solos a quien no es técnico.

### La pantalla

La rejilla de caras se queda —funciona y el equipo la conoce— y pide el PIN
después de elegirse:

```
¿Quién eres?          →     Ángel
[AL] [JA] [TA]              PIN  ● ● ● ●
[AD] [IV] [AN]              Entrar        ...o "no soy yo"
```

Cuatro dígitos, teclado numérico en el móvil, y entra al cuarto sin pulsar nada
más.

- **Salir**, en el menú donde hoy está "Cambiar": es donde el equipo ya busca su
  nombre.
- **Los supervisores no salen en la rejilla.** No son caras del tablero: entran
  por un enlace discreto ("Entrar con otro usuario") con nombre y PIN.
- **PIN olvidado:** lo resetea un supervisor desde la web y vuelve a ser el de la
  extensión. Sin eso, cada olvido acaba en un UPDATE a mano en la base. Un
  supervisor puede resetear el de cualquiera, incluido el de otro supervisor: con
  cuatro personas en ese papel, montar una jerarquía para esto sería inventarse
  un problema.

## Qué se prueba

- Un PIN correcto abre sesión; uno incorrecto no, y no dice si el fallo fue el
  nombre o el PIN.
- Una petición de escritura sin sesión se rechaza (401), aunque lleve un
  `operarioId` válido en el cuerpo — que es el agujero de hoy.
- Una petición de escritura con sesión de `supervisor` se rechaza (403).
- La acción queda registrada con quien dice la SESIÓN, no con lo que mande el
  cuerpo.
- Una persona desactivada no entra, y el histórico sigue enseñando su nombre.
- El PIN nunca viaja de vuelta ni aparece en ninguna respuesta.

## El día del despliegue

Todos los navegadores del equipo pierden su identidad guardada y ven la pantalla
del PIN. Hay que avisar antes y tener a mano la lista de extensiones: si alguien
no se acuerda del suyo, se queda fuera de su herramienta de trabajo.

## Lo aplazado, y qué hay que aclarar antes

**Fase 2 — consulta sin login.** Antes de construirla hay que responder: ¿ve un
invitado los nombres del equipo y quién tiene cada trabajo? ¿Los tiempos
imputados por persona? ¿Los comentarios y notas internas de un pedido, que están
escritos entre nosotros y no para leerse fuera? ¿Y los datos del cliente?

**Fase 3 — vista de supervisión.** Las Métricas y el Historial ya existen; falta
el corte por técnico y fechas y una pantalla que los junte. Antes hay que saber
qué preguntas quieren responder Cris, Carlos y Esteban de verdad, para no
construir una pantalla que se mire una vez.

## Lo que cambió al implementarlo

- **El PIN no se siembra: lo elige cada uno la primera vez**, tecleándolo dos
  veces. La spec decía que los PIN los aporta Iván y que la migración no lleva
  ninguno escrito; esto cumple las dos cosas sin traspaso de datos previo al
  despliegue. La convención "tu PIN es tu extensión" sigue en pie, en la cabeza
  del equipo y no en la base.
- **Resetear deja SIN PIN**, en vez de restaurar el de la extensión: para
  restaurarlo habría que guardarlo en claro, que es justo lo que se evitaba.
- **Cris, Carlos y Esteban se siembran DESACTIVADOS.** Las fases 2 y 3 están
  aplazadas y hoy no tendrían nada que mirar. Ángel lleva el rol de supervisor,
  que es quien lo necesita para resetear PINs.
- **Añadido un freno a la fuerza bruta** (5 fallos → 60 s). No estaba en la
  spec, pero un PIN de cuatro dígitos son 10 000 combinaciones y sin freno se
  prueban enteras en segundos.
- **El enlace "Entrar con otro usuario" no se construyó.** Era para que los
  supervisores entrasen sin salir en la rejilla, y hoy los tres supervisores
  puros están desactivados: sería una puerta a un cuarto vacío. Se añade el día
  que se abra la fase 3, junto a lo que van a mirar.
