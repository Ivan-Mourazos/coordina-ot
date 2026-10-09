# Cuenta de Dirección: toda la web, en solo lectura

Fecha: 2026-10-09 · Pedido por Esteban Raposo a través de Iván

## Por qué

El 09/10/2026 Esteban pasó tres peticiones (en gallego):

1. Vista pública separando el histórico del trabajo en curso en OT: quién está
   planteando, en qué fecha llegó, etc.
2. **Vista completa de solo lectura para Carlos y para él** («más adelante
   decidimos si Carlos imputa tiempos»).
3. Poner datos de WF (workflows de RPS) en solo lectura; él enviará propuesta.

Esta spec es **solo la 2**. La 1 lleva spec propia, después de esta. La 3 queda
aparcada hasta que llegue la propuesta: sin ella no se sabe qué datos trae.

Es la «vista de supervisión» que se aplazó en septiembre
(`2026-09-08-login-operarios-design.md`, fase 3). Cambia el planteamiento: no es
una pantalla nueva con estadísticas, es **la web del equipo entera, sin poder
escribir**.

## Lo que ya hay

- Carlos, Esteban y Cris **existen en la tabla `persona`** desde la migración 7,
  con rol `supervisor` y **desactivados** a propósito: se sembraron para que el
  día de abrirles no hubiera que migrar personas.
- **El servidor ya les cierra la escritura.** Todas las rutas que escriben piden
  rol `tecnico` (`identidad(req, …, "tecnico")` o `exigir(req, "tecnico")`), y
  sin él responden 403 «Esta cuenta es de solo lectura». Las lecturas del equipo
  piden sesión sin rol (`soloConSesion`).
- **La pantalla no está preparada**, y es casi todo el trabajo:
  - La rejilla de entrar (`LoginGate`) solo enseña a quien tiene `tecnico`.
  - El tablero da por hecho que quien entra es un operario del tablero: `yo` sale
    de la lista de operarios (`Board.tsx`, `TODOS_LOS_OPERARIOS.find(…)`), y con
    Carlos sería `undefined`.
  - Los controles que escriben están repartidos: Board, NotasPedido,
    CerrarEnRpsInline, RecuperarPedido, ReintentarGemelaInline,
    FasesSinFinalizar, AvisoParteNuevo, el reloj de fichaje y el arrastre del
    Panel.

## Decisiones

### Un rol nuevo, `direccion`, y no reutilizar `supervisor`

Hoy `supervisor` solo sirve para una cosa: resetear el PIN de otro. Si Carlos y
Esteban lo conservaran, podrían dejar fuera a un técnico por error. Se separa
**mirar todo** de **arreglar cuentas**:

| Rol | Qué da |
|---|---|
| `tecnico` | Trabajar: plantear, revisar, fichar, notas… |
| `supervisor` | Resetear PINs |
| `direccion` | Entrar y verlo todo, sin escribir |

Siguen siendo acumulables. **Solo lectura = no tener `tecnico`**: no hace falta
una regla nueva en el servidor, ya funciona así.

### Quién lo tiene

- **Carlos y Esteban**: pasan de `supervisor` a `direccion` y se activan.
- **Cris**: no cambia. Sigue desactivada hasta que alguien lo pida.
- **Iván, mientras dura el desarrollo**: se le *añade* `direccion` a `tecnico` y
  `supervisor`. No pierde nada. Ver «Ver como Dirección».

### Qué ven

**Todo lo que ve el equipo**: Panel, Pendientes, Revisiones, Visitas, Historial y
Métricas, con notas del pedido, notas de devolución, causas de rechazo y marcas
de revisión. Es la vista de supervisión; esconderles algo no tiene sentido.

Cambian de sección (OT / Diseño Gráfico) desde Herramientas, como ya se hace.
Entran en Oficina Técnica.

La regla de septiembre se mantiene: **en Métricas no hay devoluciones por
persona**. No es por quien mira, es por lo que hace el dato cuando existe.

### Qué no ven

Ningún control que escriba:

- El reloj y todo el fichaje (MiFichaje, avisos de fichaje cerrado solo).
- Plantear, Mandar a revisión, Revisar, Aprobar, Devolver, Dar por buenas,
  Pasar a Producción, Recuperar, Quitar autor.
- Arrastrar tarjetas en el Panel.
- Escribir o borrar notas.
- Cerrar en RPS y reintentar envíos.
- Editar causas de devolución y marcar el parte revisado.
- Escanear el parte.
- Resetear PINs (no tienen `supervisor`).

Y lo que es **de una persona** no aplica: no tienen columna propia en el Panel,
ni «lo que te toca revisar», ni campana de avisos personales. **Las novedades
sí**: la campana de novedades es de todos.

En la cabecera, una marca discreta: **«Solo lectura»**.

### Cómo se oculta: un interruptor dentro de la web del equipo

Un contexto de React, `SoloLectura`, que cada control de escribir consulta para
no pintarse. Los componentes lo leen con un hook (`useSoloLectura()`), no por
props, para no atravesar diez niveles de Board.

Se descartó hacer una pantalla aparte, como la del invitado. Allí la decisión fue
la contraria («pantalla aparte, NO un `soloLectura` dentro de Board»), y la
razón no aplica aquí:

- **Lo que se escaparía es distinto.** Al invitado, un descuido le enseña notas
  internas. A Dirección, un botón olvidado le da un 403: se ve feo y no hace
  nada, porque el servidor ya lo para.
- **«Vista completa» es la web entera.** Una pantalla aparte se quedaría sin
  Panel, sin Revisiones y sin la ficha completa, y cada cambio del equipo habría
  que hacerlo dos veces.

### El tablero sin «yo»

Hoy `yo` es siempre un `Operario`. Para una cuenta sin `tecnico` pasa a ser un
**espectador**: id y nombre de la sesión, sin sección propia y sin columna. Todo
lo que cuelga de `miId` para trabajar (fichaje, avisos personales, latido,
«tu zona») no arranca para un espectador.

Con el login apagado no hay cuentas de Dirección: la identidad se elige en la
rejilla del tablero, que solo tiene operarios. No cambia nada.

### Entrar

La rejilla de `LoginGate` añade un grupo **«Dirección»** debajo de las
secciones, con quien tenga `direccion` y no `tecnico`. Mismo PIN de siempre: cada
uno lo elige la primera vez que entra, tecleándolo dos veces.

### Ver como Dirección (Iván, mientras se desarrolla)

Quien tiene `tecnico` **y** `direccion` ve en Herramientas un interruptor **«Ver
como Dirección»**:

- Encendido, la pantalla se pinta en solo lectura, igual que la de Carlos.
- Apagado, trabaja como siempre.
- Se recuerda en el navegador (`localStorage`), como la sección vista.

**Solo cambia lo que se pinta.** La cuenta sigue pudiendo escribir en el
servidor: no protege nada, sirve para ver lo que ven ellos sin cambiar de
cuenta.

**Paso de cierre:** cuando Carlos y Esteban den el visto bueno, una migración le
quita `direccion` a Iván. El interruptor desaparece solo, porque nadie más tiene
los dos roles. No se borra el código del interruptor: sirve el día que Carlos
impute.

### Para después

- **Carlos imputa tiempos**: se le añade `tecnico` y su sección. Entonces sale en
  el tablero como operario y con el interruptor para mirar como Dirección.
  Nada de esta pieza lo bloquea.
- **Cris**: activarla es poner `activo = 1` y cambiarle el rol, igual que a
  ellos.

## Cómo

### Datos — migración 11, `cuentas_de_direccion`

- `RolAcceso` admite `"direccion"` (`lib/personas.ts`: tipo, `ROLES_ACCESO`,
  `esRolAcceso`).
- `carlos` y `esteban`: se les quita `supervisor`, se les pone `direccion`,
  `activo = 1`.
- `ivan`: se le **añade** `direccion` si no lo tiene, sin tocar los demás roles
  (mismo patrón que `rolesDeSupervisor`).
- Se puede repetir sin estropear nada, y no toca `pin_hash`.

### Servidor

Sin cambios de permisos. `GET /api/sesion` ya devuelve `roles`; la pantalla
saca de ahí si es solo lectura.

### Pantalla

- `SoloLecturaProvider` en Board: `true` si la sesión no tiene `tecnico`, o si
  tiene `direccion` y el interruptor está encendido.
- Cada control de la lista de «Qué no ven» comprueba `useSoloLectura()`.
- `yo` deja de suponer `Operario` para el espectador; lo que depende de `miId`
  para trabajar se salta.
- `LoginGate`: grupo «Dirección».
- `Herramientas`: interruptor «Ver como Dirección» y marca «Solo lectura» en la
  cabecera.

## Qué se prueba

- **Servidor:** una sesión `direccion` recibe **403** en cada ruta de escritura
  (estado, fases, fases/cerrar-of y sus reintentos, fichaje, fichaje/latido,
  fichaje/aviso-visto, notas, avisos POST, causas POST/PATCH, pedido-scan,
  revision/marcas PUT, historial/recuperar, personas PATCH) y **200** en las
  lecturas (tablero, historial, métricas, notas GET, causas GET, revision/marcas
  GET).
- **Migración:** Carlos y Esteban quedan con `direccion`, activos y sin
  `supervisor`. Iván conserva `tecnico` y `supervisor` y gana `direccion`. Cris
  no cambia. Repetirla no cambia nada. Un PIN ya puesto sigue puesto.
- **Login:** la rejilla enseña el grupo Dirección con Carlos y Esteban, y no
  enseña a Cris.
- **Pantalla, como Carlos:** se ven las seis pestañas, se cambia de sección, la
  ficha de un pedido abre con notas y causas, y no hay ni un botón de escribir,
  ni reloj, ni arrastre. Recorrido a mano con Playwright contra el servidor de
  desarrollo.
- **Pantalla, como Iván:** con el interruptor apagado, todo igual que hoy. Con él
  encendido, igual que Carlos.
- **Con `COORDINA_LOGIN` apagado:** la web del equipo no cambia.

## Novedad

No lleva línea en el log: los técnicos no notan nada. La lleva, si acaso, el
día que se activen sus cuentas en producción, y va dirigida a ellos.
