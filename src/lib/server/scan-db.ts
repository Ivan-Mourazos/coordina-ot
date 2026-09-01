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
  mtime_actual: number | null;
  huella_actual: string | null;
  huella_vista: string | null;
}

/** Lo que el vigilante acaba de ver en el disco. */
export interface Vistazo {
  /** mtime del PDF, o null si no está o no se pudo mirar. */
  mtimeMs: number | null;
  /** Huella (sha1) del contenido. null cuando NO se ha calculado —el mtime no
   *  había cambiado, así que no hacía falta leerse los megas por red— o cuando
   *  no se pudo leer el fichero. */
  huella: string | null;
}

/** El último mtime que se le vio a este parte, para decidir si hace falta
 *  volver a calcular la huella. null = nunca se ha mirado.
 *
 *  Existe para no leer el fichero entero en cada vuelta: el mtime sale de un
 *  `stat` y la huella de traerse los megas por red. */
export function mtimeConocido(pedido: string): number | null {
  const f = getDb()
    .prepare("SELECT mtime_actual FROM pedido_scan WHERE pedido = ?")
    .get(pedido) as { mtime_actual: number | null } | undefined;
  return f?.mtime_actual ?? null;
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
 *  Devuelve `true` SOLO cuando el CONTENIDO del parte ha cambiado, que es
 *  cuando el vigilante escribe la nota del hilo. Un mtime nuevo con el mismo
 *  contenido —el proceso del share re-copiando el fichero cada media hora— no
 *  es noticia y no escribe nada.
 *
 *  El primer vistazo a un pedido fija las dos huellas iguales y no avisa (ver
 *  `hayCambio`): si no, al desplegar esto saltarían de golpe los avisos de
 *  todos los pedidos vivos. */
export function anotarVistazo(
  pedido: string,
  vistazo: Vistazo,
  ahora = new Date().toISOString(),
): boolean {
  const db = getDb();
  const previo = db
    .prepare(
      `SELECT pedido, mtime_actual, huella_actual, huella_vista
         FROM pedido_scan WHERE pedido = ?`,
    )
    .get(pedido) as Fila | undefined;
  if (!previo) return false;

  const soloApuntarQueSeMiro = () => {
    db.prepare(`UPDATE pedido_scan SET revisado_at = ? WHERE pedido = ?`).run(ahora, pedido);
    return false;
  };

  // Sin PDF (todavía sin escanear, o el share caído) no se toca la referencia:
  // solo se apunta que se miró. Poner las marcas a cero aquí haría que, al
  // volver el fichero, pareciera un cambio y avisara sin motivo.
  if (vistazo.mtimeMs === null) return soloApuntarQueSeMiro();

  // Sin huella hay dos casos, y se responden igual: no mover la referencia.
  //   · El mtime no había cambiado y por eso no se calculó: el contenido
  //     guardado ya es el bueno, no hay nada que anotar.
  //   · El mtime cambió pero el fichero no se pudo leer: no se sabe si hay
  //     noticia, así que no se inventa ninguna. La siguiente vuelta reintenta.
  if (vistazo.huella === null) return soloApuntarQueSeMiro();

  const esElPrimero = previo.huella_vista === null;
  db.prepare(
    `UPDATE pedido_scan
        SET mtime_actual = ?,
            huella_actual = ?,
            huella_vista = COALESCE(huella_vista, ?),
            revisado_at = ?
      WHERE pedido = ?`,
  ).run(vistazo.mtimeMs, vistazo.huella, vistazo.huella, ahora, pedido);

  if (esElPrimero) return false;
  // La referencia para la NOTA es lo ultimo que vio el vigilante, no lo ultimo
  // que dio por visto una persona: dos re-escaneos seguidos sin que nadie mire
  // el aviso son dos noticias, y el hilo tiene que guardar las dos.
  //
  // El distintivo del tablero es otra cosa y va por `huella_vista`: lo pinta
  // `pedidosCambiados()` y lo apaga `marcarVisto` igualando las dos huellas.
  return hayCambio({
    pedido: previo.pedido,
    huellaVista: previo.huella_actual,
    huellaActual: vistazo.huella,
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
            WHERE huella_vista IS NOT NULL AND huella_actual IS NOT NULL
              AND huella_actual <> huella_vista`,
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
        `UPDATE pedido_scan
            SET huella_vista = huella_actual, mtime_visto = mtime_actual, revisado_at = ?
          WHERE pedido = ? AND huella_actual IS NOT NULL`,
      )
      .run(ahora, pedido).changes > 0
  );
}
