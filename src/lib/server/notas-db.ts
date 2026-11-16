import {
  claveDestino,
  esSeccionMencionable,
  extraerMenciones,
  type Destino,
  type NotaPedido,
  type NotaPublica,
} from "../nota-pedido";
import { OPERARIO_SISTEMA } from "../pedido-scan";
import { getDb } from "./estado-db";
import type { Lector } from "./lector-notas";

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
// se puede saltar.
//
// Quién ve cada nota y a quién avisa (16/11/2026, docs/NOTAS-MENCIONES.md)
// también se decide aquí, en SQL, con el `Lector` que resuelve el servidor a
// partir de la sesión:
// · `nota_audiencia` vacía = para todos; con filas, solo esos destinos y el
//   autor.
// · `nota_mencion` = a quién nombra con @. Junto con la audiencia, decide la
//   campana. Una nota sin mención ni restricción no avisa a nadie.

interface Fila {
  id: number;
  pedido: string;
  operario_id: string;
  texto: string;
  creado_at: string;
  editado_at: string | null;
  en_consulta_publica: number;
  nombre?: string | null;
}

const COLUMNAS = `n.id, n.pedido, n.operario_id, n.texto, n.creado_at, n.editado_at, n.en_consulta_publica, p.nombre`;

/** La nota se ve si eres el autor, si es para todos o si estás en su público.
 *  Parámetros con nombre: `@yo` y `@destinos` (JSON con las claves del lector). */
const VISIBLE = `(n.operario_id = @yo
  OR NOT EXISTS (SELECT 1 FROM nota_audiencia a WHERE a.nota_id = n.id)
  OR EXISTS (SELECT 1 FROM nota_audiencia a WHERE a.nota_id = n.id
             AND (a.tipo || ':' || a.destino) IN (SELECT value FROM json_each(@destinos))))`;

const paramsLector = (l: Lector) => ({ yo: l.id, destinos: JSON.stringify(l.destinos) });

const aDestino = (tipo: string, destino: string): Destino | null =>
  tipo === "persona"
    ? { tipo: "persona", id: destino }
    : esSeccionMencionable(destino)
      ? { tipo: "seccion", id: destino }
      : null;

/** Convierte las filas en notas, con su público y sus menciones. */
function completar(filas: Fila[]): NotaPedido[] {
  if (filas.length === 0) return [];
  const ids = JSON.stringify(filas.map((f) => f.id));
  const db = getDb();
  const agrupar = (tabla: "nota_audiencia" | "nota_mencion") => {
    const mapa = new Map<number, Destino[]>();
    const rs = db
      .prepare(
        `SELECT nota_id, tipo, destino FROM ${tabla}
          WHERE nota_id IN (SELECT value FROM json_each(?)) ORDER BY rowid`,
      )
      .all(ids) as { nota_id: number; tipo: string; destino: string }[];
    for (const r of rs) {
      const d = aDestino(r.tipo, r.destino);
      if (!d) continue;
      const lista = mapa.get(r.nota_id) ?? [];
      lista.push(d);
      mapa.set(r.nota_id, lista);
    }
    return mapa;
  };
  const para = agrupar("nota_audiencia");
  const menciones = agrupar("nota_mencion");
  return filas.map((f) => ({
    id: f.id,
    pedido: f.pedido,
    operarioId: f.operario_id,
    texto: f.texto,
    creadoAt: f.creado_at,
    editadoAt: f.editado_at,
    para: para.get(f.id) ?? [],
    enConsultaPublica: f.en_consulta_publica === 1,
    publica: f.en_consulta_publica === 1,
    menciones: menciones.get(f.id) ?? [],
    autor: f.nombre ?? null,
  }));
}

/** El hilo de un pedido, de la más vieja a la más nueva: se lee como una
 *  conversación y lo último que pasó queda abajo del todo. Las borradas no
 *  salen.
 *
 *  `lector` null = sin filtro de audiencia: es el login apagado, donde no hay
 *  sesión con la que decidir (como hasta ahora). */
export function leerNotas(pedido: string, lector: Lector | null = null): NotaPedido[] {
  const filtro = lector ? `AND ${VISIBLE}` : "";
  return completar(
    getDb()
      .prepare(
        `SELECT ${COLUMNAS}
           FROM nota_pedido n LEFT JOIN persona p ON p.id = n.operario_id
          WHERE n.pedido = @pedido AND n.borrado_at IS NULL ${filtro}
          ORDER BY n.creado_at, n.id`,
      )
      .all({ pedido, ...(lector ? paramsLector(lector) : {}) }) as Fila[],
  );
}

/** ¿Puede este lector ver esta nota (no borrada)? */
export function puedeVer(id: number, lector: Lector | null): boolean {
  const filtro = lector ? `AND ${VISIBLE}` : "";
  return (
    getDb()
      .prepare(`SELECT 1 FROM nota_pedido n WHERE n.id = @id AND n.borrado_at IS NULL ${filtro}`)
      .get({ id, ...(lector ? paramsLector(lector) : {}) }) !== undefined
  );
}

export interface OpcionesNota {
  /** Vacío = para todos. */
  para: Destino[];
  /** Solo cuenta si `para` está vacío: restringida nunca es pública. */
  enConsultaPublica: boolean;
}

/** Reescribe público y menciones de una nota.
 *
 *  Lo que ya estaba conserva su fecha (INSERT OR IGNORE): así, al editar, solo
 *  avisan los recién añadidos. Lo que se quita, se borra. `para` undefined =
 *  el público no cambia. */
function guardarDestinos(id: number, texto: string, para: Destino[] | undefined, ahora: string): void {
  const db = getDb();
  const sincronizar = (tabla: "nota_audiencia" | "nota_mencion", lista: Destino[]) => {
    const claves = JSON.stringify(lista.map(claveDestino));
    db.prepare(
      `DELETE FROM ${tabla} WHERE nota_id = ?
         AND (tipo || ':' || destino) NOT IN (SELECT value FROM json_each(?))`,
    ).run(id, claves);
    const ins = db.prepare(`INSERT OR IGNORE INTO ${tabla} (nota_id, tipo, destino, creado_at) VALUES (?, ?, ?, ?)`);
    for (const d of lista) ins.run(id, d.tipo, d.id, ahora);
  };
  if (para !== undefined) sincronizar("nota_audiencia", para);
  sincronizar("nota_mencion", extraerMenciones(texto));
}

/** Añade una nota y devuelve la que quedó guardada, ya con su id. */
export function crearNota(
  pedido: string,
  operarioId: string,
  texto: string,
  ahora = new Date().toISOString(),
  { para = [], enConsultaPublica = false }: Partial<OpcionesNota> = {},
): NotaPedido {
  const db = getDb();
  const publica = para.length === 0 && enConsultaPublica;
  return db.transaction(() => {
    // `publica` se sigue rellenando igual que `en_consulta_publica`: la columna
    // vieja queda obsoleta, pero así no miente si alguien la mira.
    const r = db
      .prepare(
        `INSERT INTO nota_pedido (pedido, operario_id, texto, creado_at, publica, en_consulta_publica)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(pedido, operarioId, texto, ahora, publica ? 1 : 0, publica ? 1 : 0);
    const id = Number(r.lastInsertRowid);
    guardarDestinos(id, texto, para, ahora);
    return {
      id,
      pedido,
      operarioId,
      texto,
      creadoAt: ahora,
      editadoAt: null,
      para: [...para],
      enConsultaPublica: publica,
      publica,
      menciones: extraerMenciones(texto),
    };
  })();
}

/** Cambia el texto de una nota PROPIA, y si se dice, su público. Devuelve si
 *  se tocó alguna fila: false es "no era tuya", "no existe" o "ya estaba
 *  borrada", y las tres se contestan igual desde fuera. */
export function editarNota(
  id: number,
  operarioId: string,
  texto: string,
  ahora = new Date().toISOString(),
  opc: Partial<OpcionesNota> = {},
): boolean {
  const db = getDb();
  const consulta = opc.enConsultaPublica === undefined ? null : opc.enConsultaPublica ? 1 : 0;
  return db.transaction(() => {
    const cambio = db
      .prepare(
        `UPDATE nota_pedido SET texto = ?, editado_at = ?,
                en_consulta_publica = COALESCE(?, en_consulta_publica),
                publica = COALESCE(?, publica)
          WHERE id = ? AND operario_id = ? AND borrado_at IS NULL`,
      )
      .run(texto, ahora, consulta, consulta, id, operarioId).changes;
    if (cambio === 0) return false;
    guardarDestinos(id, texto, opc.para, ahora);
    // Restringida nunca es pública, la haya marcado o no.
    db.prepare(
      `UPDATE nota_pedido SET en_consulta_publica = 0, publica = 0
        WHERE id = ? AND EXISTS (SELECT 1 FROM nota_audiencia WHERE nota_id = ?)`,
    ).run(id, id);
    return true;
  })();
}

/** Lo que sale en la consulta pública: marcada para ella y sin público
 *  restringido. Las dos cosas: una restringida no sale nunca sin login. */
const EN_CONSULTA = `n.en_consulta_publica = 1 AND n.borrado_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM nota_audiencia a WHERE a.nota_id = n.id)`;

/** Las notas de la consulta pública de un pedido, como las ve quien no tiene
 *  sesión.
 *
 *  El nombre sale de la tabla de personas SIN filtrar las bajas: la nota de
 *  alguien que ya no está sigue valiendo, y su nombre también. */
export function leerNotasPublicas(pedido: string): NotaPublica[] {
  const filas = getDb()
    .prepare(
      `SELECT n.operario_id, n.texto, n.creado_at, n.editado_at, p.nombre
         FROM nota_pedido n LEFT JOIN persona p ON p.id = n.operario_id
        WHERE n.pedido = ? AND ${EN_CONSULTA}
        ORDER BY n.creado_at, n.id`,
    )
    .all(pedido) as { operario_id: string; texto: string; creado_at: string; editado_at: string | null; nombre: string | null }[];
  return filas.map((f) => ({
    texto: f.texto,
    autor: f.operario_id === OPERARIO_SISTEMA ? "Coordina" : (f.nombre ?? f.operario_id),
    creadoAt: f.creado_at,
    editadoAt: f.editado_at,
  }));
}

/** Cuántas notas de la consulta pública tiene cada pedido de la lista. Solo
 *  salen los que tienen alguna: es la marca de la lista de la consulta. */
export function contarNotasPublicas(pedidos: readonly string[]): Map<string, number> {
  const salida = new Map<string, number>();
  if (pedidos.length === 0) return salida;
  // En trozos: SQLite tiene tope de parámetros por sentencia.
  for (let i = 0; i < pedidos.length; i += 500) {
    const trozo = pedidos.slice(i, i + 500);
    const filas = getDb()
      .prepare(
        `SELECT n.pedido, COUNT(*) AS n FROM nota_pedido n
          WHERE ${EN_CONSULTA} AND n.pedido IN (${trozo.map(() => "?").join(",")})
          GROUP BY n.pedido`,
      )
      .all(...trozo) as { pedido: string; n: number }[];
    for (const f of filas) salida.set(f.pedido, f.n);
  }
  return salida;
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

/** Las notas que avisan a este lector en los últimos `dias`: las que lo
 *  mencionan (a él o a una sección suya) y las que lo tienen en su público.
 *  Nunca las suyas.
 *
 *  El instante del aviso (`avisoAt`) es cuándo entró ese destino —la mención o
 *  el público—, no cuándo se escribió la nota: una mención añadida al editar
 *  suena entonces. Las filas de público que vienen de la migración (sin fecha)
 *  no avisan.
 *
 *  La ventana es la misma que la de los avisos de movimiento
 *  (VENTANA_AVISOS_DIAS): dos plazos distintos harían que un traspaso y la nota
 *  que lo explica caducaran en días distintos. Salen de la más nueva a la más
 *  vieja. */
export function leerAvisosNotas(lector: Lector, dias: number, ahora = new Date()): NotaPedido[] {
  const desde = new Date(ahora.getTime() - dias * 86_400_000).toISOString();
  const filas = getDb()
    .prepare(
      `SELECT * FROM (
         SELECT ${COLUMNAS},
                (SELECT MAX(x.creado_at) FROM (
                   SELECT m.creado_at FROM nota_mencion m
                    WHERE m.nota_id = n.id AND (m.tipo || ':' || m.destino) IN (SELECT value FROM json_each(@destinos))
                   UNION ALL
                   SELECT a.creado_at FROM nota_audiencia a
                    WHERE a.nota_id = n.id AND a.creado_at IS NOT NULL
                      AND (a.tipo || ':' || a.destino) IN (SELECT value FROM json_each(@destinos))
                 ) x) AS aviso_at
           FROM nota_pedido n LEFT JOIN persona p ON p.id = n.operario_id
          WHERE n.borrado_at IS NULL AND n.operario_id <> @yo AND ${VISIBLE}
       ) WHERE aviso_at >= @desde
       ORDER BY aviso_at DESC, id DESC`,
    )
    .all({ ...paramsLector(lector), desde }) as (Fila & { aviso_at: string })[];
  const notas = completar(filas);
  return notas.map((n, i) => ({ ...n, avisoAt: filas[i].aviso_at }));
}
