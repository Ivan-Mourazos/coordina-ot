# Notas en los pedidos

Fecha: 2026-08-23 · Acordado con Iván (a partir de la petición de Ángel por Teams)

## El problema

Ángel lo pidió así:

> Creo que en CoordinaOT estaría ben poder deixar notas nos pedidos (coma cando
> deixamos un post-it) para que se llo mandamos a outra persoa ou calquera cousa
> quede esa información.

Hoy no hay ningún sitio donde escribir. La ficha del pedido tiene tres textos y
los tres son de RPS y de solo lectura: el comentario del comercial, los avisos
de Producción y la rotulación. Lo que OT sabe —"falta confirmar el color",
"hablar con Juan José antes de cortar"— se dice de palabra y se pierde en cuanto
el trabajo cambia de manos.

El campo que más se le parece, `of_overlay.observacion`, no vale: ya está
ocupado con dos cosas —la nota del revisor al devolver y el motivo de anulación,
codificado— y las dos van atadas a un cambio de estado. Una nota libre no es un
cambio de estado.

## Qué se construye

Un hilo de notas por PEDIDO, dentro de su ficha. Cada uno añade la suya, con su
nombre y la fecha. No se pisa lo de nadie.

### Decisiones y por qué

**Hilo, no post-it.** Un solo texto que se reescribe haría que el segundo que
escribe borrase al primero, y sin saber quién puso qué. Para un traspaso hace
falta justo eso: quién dijo qué y cuándo.

**Del pedido, no de la OF.** Es como lo pidió Ángel y es la unidad del traspaso:
el autor se asigna al pedido entero. Lo que se cuenta al pasar el trabajo suele
ser del parte, no de una pieza suelta.

**La clave es el CÓDIGO del pedido (`AR.26.03914`), no su id interno.** En el
tablero el id sale del agrupado de RPS y en el Historial es `hist:…`: son
distintos. Colgando la nota del id se perdería justo cuando el pedido pasa a
Producción, que es cuando más se quiere leer.

**Se puede editar y borrar LO TUYO, nunca lo de otro.** Las editadas quedan
marcadas. Borrado blando (`borrado_at`), no `DELETE`: una nota borrada sin
querer se recupera, y encaja con el `acciones_log`, que ya guarda cada cambio.

**El tablero NO carga las notas.** Se refresca cada 30 s y ya lleva 81 pedidos;
mandar los hilos en cada vuelta es peso muerto. El hilo se pide al abrir el
pedido, igual que el Historial carga las OF al desplegar la fila.

**Sin chincheta en las filas, de momento.** Se valoró un contador en la fila del
Panel y de Pendientes para saber que hay nota sin abrir. Se deja fuera a
propósito: el equipo todavía se está acostumbrando al fichaje, y es mejor sacar
esto pequeño y decidir la chincheta con datos. Riesgo asumido y conocido: la
fila del Panel tiene botón de fichar al pasar el ratón (`PedidoLinea`), así que
se puede arrancar un pedido sin abrirlo y sin leer la nota. En la práctica se
abre igualmente para pasar a revisión o ver el parte. Si se ve que no se leen,
añadir el contador es un campo en el overlay y dos componentes de fila.

## Datos

Tabla nueva en el SQLite de CoordinaOT. Es dato nuestro: RPS no tiene sitio para
esto y no le escribimos.

```sql
CREATE TABLE IF NOT EXISTS nota_pedido (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido      TEXT NOT NULL,     -- el CÓDIGO: AR.26.03914
  operario_id TEXT NOT NULL,
  texto       TEXT NOT NULL,
  creado_at   TEXT NOT NULL,
  editado_at  TEXT,              -- null = nunca se tocó
  borrado_at  TEXT               -- null = viva
);
CREATE INDEX IF NOT EXISTS idx_nota_pedido ON nota_pedido(pedido);
```

Los pedidos sin código de venta (trabajo interno, OF suelta) llevan un código
sintético estable —`OF 0231158`, ver `rps.ts`— que sirve igual de clave.

## API

Cuatro verbos en un solo fichero de ruta, como hace `/api/fichaje`:

```
GET    /api/notas?pedido=AR.26.03914   → { notas: [...] }
POST   /api/notas                      → { pedido, texto, operarioId }
PATCH  /api/notas                      → { id, texto, operarioId }
DELETE /api/notas                      → { id, operarioId }
```

`PATCH` y `DELETE` llevan `AND operario_id = ?` en la sentencia, así que desde
la interfaz no se toca lo de otro.

**Limitación conocida:** sin login, el `operarioId` lo manda el navegador y
quien quiera saltárselo puede. Es el mismo modelo de confianza que ya tiene el
fichaje (ver la cabecera de `/api/fichaje`), no una puerta nueva.

Validación: texto recortado, vacío rechazado, tope de 2000 caracteres.

## Interfaz

El hilo va en el Drawer del pedido, debajo del comentario del comercial y encima
de "Asignar autor": primero se lee el contexto, después se actúa.

Panel, Pendientes y Revisiones abren el MISMO Drawer (`onOpen` → `abrirPedido`
en las tres), así que el revisor ve el hilo al abrir el pedido sin trabajo extra.

```
NOTAS (2)                                        + Añadir

 JA  Jaime · ayer 11:04
     Falta confirmar el color con el cliente.
     Hablar con Juan José antes de cortar.

 IV  Iván · hoy 08:12 · editado                  Editar  Borrar
     Confirmado: RAL 7016. Ya se puede seguir.
```

- Sin notas el bloque sigue estando, con su "+ Añadir": si no, nadie descubre
  que existe.
- Cada nota lleva la cara y el color de quien la escribió (`OpDot`), que es el
  idioma que ya habla la app. Así se distingue sola de los textos de RPS.
- "Editar" y "Borrar" solo en las tuyas. Borrar pasa por el `ConfirmDialog`.
- Texto multilínea (`whitespace-pre-line`).
- El hilo se recarga al guardar. **No hay sondeo**: si otro escribe mientras lo
  tienes abierto, lo ves al volver a abrirlo. Para seis personas y notas de dos
  líneas, el tiempo real no compensa.
- En el `HistorialDrawer`, el hilo es de SOLO LECTURA: el pedido ya está cerrado
  para OT. El momento de dejar el recado es antes de pasarlo.

## Lo que NO hace

- No avisa por la campana. Mezclar notas con "te devolvieron una OF" diluye las
  dos cosas.
- No va a RPS. Es un recado interno de OT.
- No se cita una OF concreta: el hilo es del pedido.
- No hay contador en las filas (ver arriba).

## Pruebas

| Qué | Cómo |
|---|---|
| `nota-pedido.test.ts` | validación y recorte del texto, puro |
| capa de datos | SQLite temporal, patrón de `estado-db.test.ts`: crear, editar la tuya, NO poder editar la de otro, borrado blando, el listado excluye borradas |
| `api-notas.test.ts` | los cuatro verbos y sus rechazos, patrón de `api-estado.test.ts` |

## Alcance

Ficheros nuevos: `lib/nota-pedido.ts`, `lib/server/notas-db.ts`,
`app/api/notas/route.ts`, el componente del hilo, y sus tres tests.
Tocados: `estado-db.ts` (la tabla), `Drawer.tsx`, `HistorialDrawer.tsx`.
