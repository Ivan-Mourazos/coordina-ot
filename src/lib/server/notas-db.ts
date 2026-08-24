import type { NotaPedido } from "../nota-pedido";
import { getDb } from "./estado-db";

// ─── Notas de pedido (SQLite propio) ─────────────────────────────────────────
// La tabla se crea en estado-db.ts, con el resto del esquema: es una sola BD y
// un solo sitio donde mirar qué hay dentro.
//
// El borrado es BLANDO (`borrado_at`) y no un DELETE: una nota que alguien
// quita sin querer se puede devolver desde la BD, y el `acciones_log` —que ya
// guarda cada cambio del tablero— sigue teniendo sentido al lado.
//
// Editar y borrar llevan SIEMPRE `AND operario_id = ?` en la sentencia. No es
// solo que la interfaz no ofrezca el botón: la regla vive aquí, que es donde no
// se puede saltar. Ojo con lo que esto NO es: sin login, el `operarioId` lo
// manda el navegador (mismo modelo que el fichaje), así que esto impide el
// accidente, no al que quiera saltárselo a propósito.

interface Fila {
  id: number;
  pedido: string;
  operario_id: string;
  texto: string;
  creado_at: string;
  editado_at: string | null;
}

const aNota = (f: Fila): NotaPedido => ({
  id: f.id,
  pedido: f.pedido,
  operarioId: f.operario_id,
  texto: f.texto,
  creadoAt: f.creado_at,
  editadoAt: f.editado_at,
});

/** El hilo de un pedido, de la más vieja a la más nueva: se lee como una
 *  conversación y lo último que pasó queda abajo del todo. Las borradas no
 *  salen. */
export function leerNotas(pedido: string): NotaPedido[] {
  return (
    getDb()
      .prepare(
        `SELECT id, pedido, operario_id, texto, creado_at, editado_at
           FROM nota_pedido
          WHERE pedido = ? AND borrado_at IS NULL
          ORDER BY creado_at, id`,
      )
      .all(pedido) as Fila[]
  ).map(aNota);
}

/** Añade una nota y devuelve la que quedó guardada, ya con su id. */
export function crearNota(
  pedido: string,
  operarioId: string,
  texto: string,
  ahora = new Date().toISOString(),
): NotaPedido {
  const r = getDb()
    .prepare(
      `INSERT INTO nota_pedido (pedido, operario_id, texto, creado_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(pedido, operarioId, texto, ahora);
  return {
    id: Number(r.lastInsertRowid),
    pedido,
    operarioId,
    texto,
    creadoAt: ahora,
    editadoAt: null,
  };
}

/** Cambia el texto de una nota PROPIA. Devuelve si se tocó alguna fila: false
 *  es "no era tuya", "no existe" o "ya estaba borrada", y las tres se contestan
 *  igual desde fuera. */
export function editarNota(
  id: number,
  operarioId: string,
  texto: string,
  ahora = new Date().toISOString(),
): boolean {
  return (
    getDb()
      .prepare(
        `UPDATE nota_pedido SET texto = ?, editado_at = ?
          WHERE id = ? AND operario_id = ? AND borrado_at IS NULL`,
      )
      .run(texto, ahora, id, operarioId).changes > 0
  );
}

/** Quita una nota PROPIA del hilo. Ver arriba: blando, no DELETE. */
export function borrarNota(
  id: number,
  operarioId: string,
  ahora = new Date().toISOString(),
): boolean {
  return (
    getDb()
      .prepare(
        `UPDATE nota_pedido SET borrado_at = ?
          WHERE id = ? AND operario_id = ? AND borrado_at IS NULL`,
      )
      .run(ahora, id, operarioId).changes > 0
  );
}

/** Las notas escritas en los últimos `dias`, de todos los pedidos.
 *
 *  Es lo que alimenta la campana: una nota es un HECHO del que el resto se
 *  tiene que enterar, igual que un traspaso. Se limita por días —y no se
 *  traen todas— porque la campana avisa de lo que acaba de pasar; una nota de
 *  hace tres meses no es noticia y llenaría la lista de ruido.
 *
 *  La ventana es la misma que la de los avisos de movimiento
 *  (VENTANA_AVISOS_DIAS): dos plazos distintos harían que un traspaso y la nota
 *  que lo explica caducaran en días distintos. */
export function leerNotasRecientes(dias: number, ahora = new Date()): NotaPedido[] {
  const desde = new Date(ahora.getTime() - dias * 86_400_000).toISOString();
  return (
    getDb()
      .prepare(
        `SELECT id, pedido, operario_id, texto, creado_at, editado_at
           FROM nota_pedido
          WHERE creado_at >= ? AND borrado_at IS NULL
          ORDER BY creado_at DESC, id DESC`,
      )
      .all(desde) as Fila[]
  ).map(aNota);
}
