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
// · `nota_mencion` = a quién nombra con @. Decide la campana, junto con la
//   audiencia de PERSONAS (la de secciones no avisa, ver `leerAvisosNotas`).
//   Una nota sin mención ni restricción a una persona no avisa a nadie.

interface Fila {
  id: number;
  pedido: string;
  operario_id: string;
  texto: string;
  creado_at: string;
  editado_at: string | null;
  en_consulta_publica: number;
  nombre?: string | null;
  padre_id: number | null;
  raiz_id: number | null;
  resuelta_at: string | null;
  resuelta_por: string | null;
  borrado_at: string | null;
  padre_operario: string | null;
}

const COLUMNAS = `n.id, n.pedido, n.operario_id, n.texto, n.creado_at, n.editado_at, n.en_consulta_publica, p.nombre,
  n.padre_id, n.raiz_id, n.resuelta_at, n.resuelta_por, n.borrado_at, pa.operario_id AS padre_operario`;

/** De dónde salen las notas: con el nombre del autor y el autor de la nota a
 *  la que responden (para «te responde»). */
const DESDE = `nota_pedido n
  LEFT JOIN persona p ON p.id = n.operario_id
  LEFT JOIN nota_pedido pa ON pa.id = n.padre_id`;

/** La nota se ve si eres su autor, o si su RAÍZ es tuya, para todos, o te
 *  tiene en su público. Una respuesta hereda el público de la raíz y no lo
 *  puede ampliar: abrirla a más gente filtraría el contexto restringido.
 *  Parámetros con nombre: `@yo` y `@destinos` (JSON con las claves del lector). */
const VISIBLE = `(n.operario_id = @yo OR EXISTS (
  SELECT 1 FROM nota_pedido r WHERE r.id = COALESCE(n.raiz_id, n.id) AND (
    r.operario_id = @yo
    OR NOT EXISTS (SELECT 1 FROM nota_audiencia a WHERE a.nota_id = r.id)
    OR EXISTS (SELECT 1 FROM nota_audiencia a WHERE a.nota_id = r.id
               AND (a.tipo || ':' || a.destino) IN (SELECT value FROM json_each(@destinos))))))`;

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
  return filas.map((f) => {
    // Borrada con respuestas: solo el hueco. Ni texto ni destinos.
    const borrada = f.borrado_at !== null;
    return {
      id: f.id,
      pedido: f.pedido,
      operarioId: f.operario_id,
      texto: borrada ? "" : f.texto,
      creadoAt: f.creado_at,
      editadoAt: borrada ? null : f.editado_at,
      para: borrada ? [] : (para.get(f.id) ?? []),
      enConsultaPublica: !borrada && f.en_consulta_publica === 1,
      menciones: borrada ? [] : (menciones.get(f.id) ?? []),
      autor: f.nombre ?? null,
      padreId: f.padre_id,
      respondeA: f.padre_operario,
      resueltaAt: f.resuelta_at,
      resueltaPor: f.resuelta_por,
      ...(borrada ? { borrada: true } : {}),
    };
  });
}

/** El hilo de un pedido, de la más vieja a la más nueva: se lee como una
 *  conversación y lo último que pasó queda abajo del todo. El árbol de
 *  respuestas lo monta quien pinta, con `padreId`.
 *
 *  Las borradas no salen, salvo que tengan respuestas vivas debajo: entonces
 *  sale su hueco («nota borrada») para no dejar huérfanas las respuestas.
 *
 *  `lector` null = sin filtro de audiencia: es el login apagado, donde no hay
 *  sesión con la que decidir (como hasta ahora). */
export function leerNotas(pedido: string, lector: Lector | null = null): NotaPedido[] {
  const filtro = lector ? `AND ${VISIBLE}` : "";
  const filas = getDb()
    .prepare(
      `SELECT ${COLUMNAS}
         FROM ${DESDE}
        WHERE n.pedido = @pedido ${filtro}
        ORDER BY n.creado_at, n.id`,
    )
    .all({ pedido, ...(lector ? paramsLector(lector) : {}) }) as Fila[];
  const porId = new Map(filas.map((f) => [f.id, f]));
  const conservar = new Set<number>();
  for (const f of filas) {
    if (f.borrado_at !== null) continue;
    // Una viva se queda, y con ella toda su cadena de padres.
    for (let x: Fila | undefined = f; x && !conservar.has(x.id); x = x.padre_id ? porId.get(x.padre_id) : undefined)
      conservar.add(x.id);
  }
  return completar(filas.filter((f) => conservar.has(f.id)));
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

/** El pedido del que cuelga una nota, o undefined si no existe. */
export function pedidoDeNota(id: number): string | undefined {
  return (getDb().prepare(`SELECT pedido FROM nota_pedido WHERE id = ?`).get(id) as { pedido: string } | undefined)
    ?.pedido;
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
  opc: Partial<OpcionesNota> & { padreId?: number } = {},
): NotaPedido {
  const db = getDb();
  return db.transaction(() => {
    // Una respuesta hereda el público de la raíz: no lleva el suyo ni sale
    // por su cuenta en la consulta pública (lo decide la raíz).
    let padre: { id: number; raiz_id: number | null; operario_id: string } | undefined;
    if (opc.padreId !== undefined) {
      padre = db
        .prepare(`SELECT id, raiz_id, operario_id FROM nota_pedido WHERE id = ? AND pedido = ?`)
        .get(opc.padreId, pedido) as typeof padre;
      if (!padre) throw new Error(`La nota ${opc.padreId} no es de ${pedido}`);
    }
    const para = padre ? [] : (opc.para ?? []);
    const publica = !padre && para.length === 0 && (opc.enConsultaPublica ?? false);
    const raiz = padre ? (padre.raiz_id ?? padre.id) : null;
    // `publica` se sigue rellenando igual que `en_consulta_publica`: la columna
    // vieja queda obsoleta, pero así no miente si alguien la mira.
    const r = db
      .prepare(
        `INSERT INTO nota_pedido (pedido, operario_id, texto, creado_at, publica, en_consulta_publica, padre_id, raiz_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(pedido, operarioId, texto, ahora, publica ? 1 : 0, publica ? 1 : 0, padre?.id ?? null, raiz);
    const id = Number(r.lastInsertRowid);
    guardarDestinos(id, texto, para, ahora);
    // Quien responde reabre la conversación: si sigue hablándose, no está resuelta.
    if (raiz !== null)
      db.prepare(`UPDATE nota_pedido SET resuelta_at = NULL, resuelta_por = NULL WHERE id = ?`).run(raiz);
    return {
      id,
      pedido,
      operarioId,
      texto,
      creadoAt: ahora,
      editadoAt: null,
      para: [...para],
      enConsultaPublica: publica,
      menciones: extraerMenciones(texto),
      padreId: padre?.id ?? null,
      respondeA: padre?.operario_id ?? null,
      resueltaAt: null,
      resueltaPor: null,
    };
  })();
}

/** Da por resuelta (o reabre) una conversación. Solo la raíz y viva; quien la
 *  pueda ver (la ruta lo comprueba antes). Devuelve si cambió algo. */
export function marcarResuelta(
  id: number,
  operarioId: string,
  resuelta: boolean,
  ahora = new Date().toISOString(),
): boolean {
  return (
    getDb()
      .prepare(
        `UPDATE nota_pedido SET resuelta_at = ?, resuelta_por = ?
          WHERE id = ? AND raiz_id IS NULL AND borrado_at IS NULL`,
      )
      .run(resuelta ? ahora : null, resuelta ? operarioId : null, id).changes > 0
  );
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
  return db.transaction(() => {
    // Una respuesta no tiene público propio: lo que llegue de él se ignora.
    const esRespuesta =
      (db.prepare(`SELECT raiz_id FROM nota_pedido WHERE id = ?`).get(id) as { raiz_id: number | null } | undefined)
        ?.raiz_id != null;
    if (esRespuesta) opc = {};
    const consulta = opc.enConsultaPublica === undefined ? null : opc.enConsultaPublica ? 1 : 0;
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

/** Lo que sale en la consulta pública: lo decide la RAÍZ de la conversación,
 *  que tiene que estar marcada para ella, viva y sin público restringido (una
 *  restringida no sale nunca sin login). Sus respuestas vivas salen con ella. */
const EN_CONSULTA = `n.borrado_at IS NULL AND EXISTS (
  SELECT 1 FROM nota_pedido r WHERE r.id = COALESCE(n.raiz_id, n.id)
    AND r.en_consulta_publica = 1 AND r.borrado_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM nota_audiencia a WHERE a.nota_id = r.id))`;

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
 *  mencionan (a él o a una sección suya) y las que son «Solo para» él en
 *  persona. Nunca las suyas.
 *
 *  «Solo para» una SECCIÓN decide quién la VE, no a quién avisa (Iván,
 *  26/11/2026): sonaba en la campana de toda la sección por cada nota que se
 *  le restringía. A una sección se le avisa nombrándola con @; a una persona,
 *  con @ o restringiéndole la nota a ella.
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
                    WHERE a.nota_id = n.id AND a.creado_at IS NOT NULL AND a.tipo = 'persona'
                      AND (a.tipo || ':' || a.destino) IN (SELECT value FROM json_each(@destinos))
                   UNION ALL
                   SELECT n.creado_at WHERE pa.operario_id = @yo AND pa.borrado_at IS NULL
                 ) x) AS aviso_at
           FROM ${DESDE}
          WHERE n.borrado_at IS NULL AND n.operario_id <> @yo AND ${VISIBLE}
       ) WHERE aviso_at >= @desde
       ORDER BY aviso_at DESC, id DESC`,
    )
    .all({ ...paramsLector(lector), desde }) as (Fila & { aviso_at: string })[];
  const notas = completar(filas);
  return notas.map((n, i) => ({ ...n, avisoAt: filas[i].aviso_at }));
}
