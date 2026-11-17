# Bizneo en CoordinaOT: disponibilidad del equipo (estudio, 17/11/2026)

Fuente: documentación pública `https://connect.bizneo.com/hcm/v1/` (HCM API v1).
Todavía no se ha probado contra la cuenta real: nada de esto está verificado con un token.

**Alcance:** solo DISPONIBILIDAD. Quién trabaja, quién falta, cuándo vuelve y desde dónde trabaja. Ni
nóminas, ni proyectos, ni formación, ni control de horas: eso queda fuera a propósito.

## Cómo funciona la API

- REST + JSON. Cabecera `Accept: application/json` obligatoria.
- **Autenticación: token en la URL** (`?token=…`), creado en Bizneo. No hay OAuth ni permisos por endpoint
  documentados: hay que suponer que el token ve todo lo que vea su usuario.
- Paginación por página: máximo 100 (`page`, `page_size`). La respuesta trae `pagination`.
- Base: `{{domain}}/api/v1/...` (el dominio de nuestra cuenta está pendiente de confirmar).
- No documenta webhooks ni límites de peticiones: hay que leer y guardar en caché.

## Lo que hace falta de Bizneo para la disponibilidad

### 1. `GET /api/v1/timeline`: la pieza clave
Una sola llamada da, por persona y día, qué tipo de día es (`working_day`, `day_off`, `non_working_day`,
`absence`, `partial_absence`, `one_time_day_off`…). Incluye los turnos con sus horas y el teletrabajo, las
ausencias del día (tipo y duración) y los festivos.
Filtros: `start_date` y `end_date` (**máximo un mes por petición**), `user_ids[]`, `shift_locations[]`.

Con esto sale casi todo sin cruzar nada: quién trabaja, quién está de vacaciones o fuera, quién teletrabaja,
qué días son festivos y su horario.

### 2. `GET /api/v1/users` (y `taxons`)
Plantilla con nombre, **email** y departamento principal. Sirve para dos cosas:
- **Casar cada persona de Bizneo con la de Coordina** por el email. RPS ya tiene el correo de cada técnico en
  `GENEmployee.Email`. Ángel no tiene email en RPS, así que va a mano.
- **Agrupar por departamento**: OT, Diseño, Impresión, Producción, Comerciales.

### 3. `GET /api/v1/absences` + `absence-kinds`: solo si se quiere mirar lejos
Solicitudes con estado (aprobada / **pendiente** / rechazada) y fechas. Los tipos traen un indicador
`coworkers_visible`. El timeline ya da las aprobadas mes a mes; esto añade las **pendientes de aprobar** y
permite ver varios meses de golpe.

### 4. `GET /api/v1/started_chronos`: «está aquí ahora», solo si se ficha en Bizneo
Quién tiene el fichaje abierto y si está en pausa. Una llamada para todo el equipo. Solo vale si la gente ficha
en Bizneo; si no, no aporta nada.

## Qué merece la pena en Coordina, por orden de valor

1. **Aviso al repartir trabajo (el que más se nota).** En la tarjeta de cada técnico del Panel: «Vacaciones ·
   vuelve el lun 24», «Ausente», «Fuera desde las 12:00», «Teletrabajo». También en la lista de «Libres», que
   hoy da por libre a quien está de vacaciones. Así nadie asigna una OF a quien no está.
2. **«Hoy fuera» en Producción (Belén).** Una tira con quién falta hoy y cuándo vuelve, sin teletrabajo:
   a Producción le importa quién no está. Si no falta nadie, no se enseña.
3. **Calendario del equipo**, la idea apuntada el 24/08: personas × días del mes, por departamento, con
   vacaciones, ausencias, teletrabajo y festivos. Sirve para planificar la semana y ver solapes de vacaciones
   en una misma sección.
4. **Comerciales:** saber si están en la oficina, fuera o de vacaciones antes de pasarles una consulta o una
   visita. Depende de que tengan horario en Bizneo; si solo registran vacaciones, basta con el calendario.

Lo mínimo útil son los puntos 1 y 2. Solo necesitan `timeline` y `users`.

## Ideas para más adelante (siempre sobre disponibilidad)

- **Vacaciones pendientes de aprobar** visibles para quien reparte, para anticiparse (`absences`).
- **Fecha comprometida:** al dar fecha de entrega, avisar si el técnico asignado está fuera esos días.
- **Ausencias próximas:** «Carrón se va de vacaciones el 20» en la tarjeta, unos días antes.
- **Métricas justas:** contar solo los días trabajados al medir rendimiento, para que las vacaciones y las bajas
  no cuenten como días sin trabajo.
- **Presencia en tiempo real** (`started_chronos`), si algún día se ficha en Bizneo.

## Lo que NO se enseña ni se toca

- **El motivo de una ausencia.** Una baja médica es un dato de salud (RGPD). En Coordina solo aparecen
  «Vacaciones», «Ausente», «Fuera unas horas», «Teletrabajo» y «Festivo».
- **Nada de escribir en Bizneo.** Las ausencias se piden y se aprueban allí; Coordina solo lee.
- Nóminas, contratos, documentos y demás datos de RR. HH.: fuera del alcance.

## Riesgos y decisiones previas

- **Token con permisos amplios:** solo en el servidor (`.env`), nunca en el navegador ni en los logs, porque va
  en la URL. Pedir a RR. HH. un usuario de API con el rol mínimo (horarios y ausencias).
- **Autorización:** integrar datos de RR. HH. lo tiene que aprobar RR. HH. o Dirección (Esteban).
- **Rendimiento:** el timeline va de mes en mes y de 100 en 100 personas. Guardarlo en el servidor unos
  15–30 min y no llamar desde cada pantalla.
- **Si Bizneo no responde,** Coordina sigue igual, solo sin ese aviso.

## Qué pedir a RR. HH. / Bizneo

Un **token de API de solo lectura**, de un usuario con el rol mínimo, que pueda leer esto:

| Endpoint | Para qué | ¿Hace falta? |
|---|---|---|
| `GET /api/v1/timeline` | Día a día: trabaja, vacaciones, ausente, horas fuera, teletrabajo, festivo y horario | **Sí** (todo sale de aquí) |
| `GET /api/v1/users` | Nombre, **email** y departamento, para casar con Coordina y agrupar | **Sí** |
| `GET /api/v1/taxons` | Nombres de departamentos y sedes, si `users` no los trae completos | Probablemente no |
| `GET /api/v1/absences` + `absence-kinds` | Vacaciones **pendientes** de aprobar y ver varios meses de golpe | Opcional (ideas de más adelante) |
| `GET /api/v1/started_chronos` | Quién está fichado ahora | Solo si se ficha en Bizneo |

**Qué personas:** las de OT, Diseño, Impresión, Producción y Comerciales. Si el rol se puede limitar por
departamento, con esas basta.

**Qué NO necesitamos** (y mejor que el usuario no lo vea): nóminas, salarios, contratos, documentos, gastos,
evaluaciones y datos personales más allá de nombre, email y departamento. Ningún permiso de escritura.

**Aviso para RR. HH.:** el timeline trae el tipo de cada ausencia (por ejemplo «Baja médica»). Coordina lo descarta
en el servidor y solo enseña «Vacaciones» o «Ausente», pero el dato llega. Si Bizneo permite que el rol vea solo
ausencias marcadas como visibles para compañeros (`coworkers_visible`), mejor.

**Preguntas que tienen que contestar:**
1. **Dominio** de nuestra cuenta (la URL base de la API).
2. ¿Se puede crear un **usuario de API con rol limitado** (horarios y ausencias, solo lectura)? ¿O el token ve todo
   lo que ve el usuario que lo crea?
3. ¿Están en Bizneo **todos**, comerciales y taller incluidos, con su horario?
4. ¿Se registra el **teletrabajo** en Bizneo?
5. ¿Se **ficha** en Bizneo? (decide si `started_chronos` sirve para algo)
6. ¿El **email** de cada persona en Bizneo es el de la empresa, el mismo que en RPS?

## Primer paso, con el token

1. Leer `users` y el `timeline` del mes actual y comprobar las respuestas de arriba con datos reales:
   tipos de ausencia, cómo vienen festivos y departamentos, y si el email casa con el de RPS.
2. Con eso, montar los puntos 1 y 2 y, si convence, el calendario.
