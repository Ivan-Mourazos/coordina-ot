import { hayCambio } from "../pedido-scan";
import { getDb } from "./estado-db";

// ─── Vigilancia del PDF de cada pedido (SQLite propio) ───────────────────────
// La tabla se crea en estado-db.ts, con el resto del esquema.
//
// Quién registra a quién: los pedidos entran aquí desde `getTablero()`, que ya
// los tiene cargados. Así el vigilante NO necesita preguntarle a RPS quién está
// vivo —esa consulta tarda de 7 a 15 s— y se limita a mirar el disco de lo que
// ya está apuntado.
//
// Los pedidos no se borran de aquí al salir del tablero: la marca de "visto"
// tiene que sobrevivir al paso al Historial, igual que las notas. Son unas
// pocas filas de texto al año.

interface Fila {
  pedido: string;
  mtime_visto: number | null;
  mtime_actual: number | null;
}

/** Apunta estos pedidos para que el vigilante les mire el PDF.
 *
 *  `ON CONFLICT DO NOTHING`: los que ya están se dejan como están. Sin eso,
 *  cada vuelta del tablero (cada 30 s) borraría las marcas de "visto" y el
 *  aviso no se apagaría nunca. */
export function registrarPedidos(codigos: readonly string[], ahora = new Date().toISOString()) {
  if (codigos.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO pedido_scan (pedido, registrado_at) VALUES (?, ?)
     ON CONFLICT(pedido) DO NOTHING`,
  );
  db.transaction(() => {
    for (const c of codigos) stmt.run(c, ahora);
  })();
}

/** Los pedidos a los que les toca vistazo, del más antiguo sin revisar al más
 *  reciente. Los que nunca se han mirado van primero (`revisado_at` nulo).
 *
 *  Va con tope porque cada uno cuesta un `stat` contra el share por red: es
 *  mejor mirar unos pocos a menudo que los 81 de golpe y dejar el disco
 *  ocupado. */
export function pedidosParaRevisar(limite: number): string[] {
  return (
    getDb()
      .prepare(
        `SELECT pedido FROM pedido_scan
          ORDER BY revisado_at IS NOT NULL, revisado_at
          LIMIT ?`,
      )
      .all(limite) as { pedido: string }[]
  ).map((f) => f.pedido);
}

/** Guarda lo que el vigilante acaba de ver en el disco.
 *
 *  Devuelve `true` SOLO cuando esto estrena un aviso: el parte es más nuevo que
 *  la referencia y antes no había aviso puesto. Así el vigilante sabe cuándo
 *  escribir la nota del hilo y no la repite en cada vuelta.
 *
 *  El primer vistazo a un pedido fija las dos marcas iguales y no avisa (ver
 *  `hayCambio`): si no, al desplegar esto saltarían de golpe los avisos de
 *  todos los pedidos vivos. */
export function anotarMtime(
  pedido: string,
  mtimeMs: number | null,
  ahora = new Date().toISOString(),
): boolean {
  const db = getDb();
  const previo = db
    .prepare(`SELECT pedido, mtime_visto, mtime_actual FROM pedido_scan WHERE pedido = ?`)
    .get(pedido) as Fila | undefined;
  if (!previo) return false;

  // Sin PDF (todavía sin escanear, o el share caído) no se toca la referencia:
  // solo se apunta que se miró. Poner las marcas a cero aquí haría que, al
  // volver el fichero, su mtime pareciera un cambio y avisara sin motivo.
  if (mtimeMs === null) {
    db.prepare(`UPDATE pedido_scan SET revisado_at = ? WHERE pedido = ?`).run(ahora, pedido);
    return false;
  }

  const esElPrimero = previo.mtime_visto === null;
  db.prepare(
    `UPDATE pedido_scan
        SET mtime_actual = ?,
            mtime_visto = COALESCE(mtime_visto, ?),
            revisado_at = ?
      WHERE pedido = ?`,
  ).run(mtimeMs, mtimeMs, ahora, pedido);

  if (esElPrimero) return false;
  // Un re-escaneo es que el parte sea mas nuevo QUE LA ULTIMA VEZ QUE SE MIRO
  // (`mtime_actual`), no que la ultima vez que alguien lo dio por visto.
  //
  // Se comparaba contra `mtime_visto` y ademas se exigia que no hubiera aviso
  // puesto ya (`!avisabaYa`), asi que un SEGUNDO escaneo con el primer aviso
  // todavia sin ver no escribia nota: el "registro permanente" se quedaba solo
  // con la fecha del primero, justo lo que la nota lleva hora para distinguir.
  //
  // El distintivo no cambia: lo pinta `pedidosCambiados()`, que sigue
  // comparando contra `mtime_visto` —lo que nadie ha dado por visto—, y
  // `marcarVisto` lo apaga igualando las dos marcas.
  return hayCambio({
    pedido: previo.pedido,
    // La referencia aqui es lo ultimo que vio el vigilante, no lo ultimo que
    // vio una persona.
    mtimeVisto: previo.mtime_actual,
    mtimeActual: mtimeMs,
  });
}

/** Los pedidos con el parte re-escaneado y todavía sin dar por visto.
 *
 *  Es lo que pinta el distintivo, y lo lee `getTablero()` en cada vuelta, así
 *  que la comparación va en SQL y no trayéndose la tabla entera. */
export function pedidosCambiados(): Set<string> {
  return new Set(
    (
      getDb()
        .prepare(
          `SELECT pedido FROM pedido_scan
            WHERE mtime_visto IS NOT NULL AND mtime_actual IS NOT NULL
              AND mtime_actual > mtime_visto`,
        )
        .all() as { pedido: string }[]
    ).map((f) => f.pedido),
  );
}

/** Da por visto el parte nuevo. Apaga el distintivo PARA TODOS: lo acordado es
 *  que el aviso es del pedido, no de cada persona — quien lo mira, lo mira por
 *  el equipo. La nota del hilo se queda: ese es el registro permanente. */
export function marcarVisto(pedido: string, ahora = new Date().toISOString()): boolean {
  return (
    getDb()
      .prepare(
        `UPDATE pedido_scan SET mtime_visto = mtime_actual, revisado_at = ?
          WHERE pedido = ? AND mtime_actual IS NOT NULL`,
      )
      .run(ahora, pedido).changes > 0
  );
}
