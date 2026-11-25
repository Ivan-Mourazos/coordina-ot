// ─── Medición de las consultas a SQL Server (RPS y OLANET) ──────────────────
//
// IT pidió (20/11/2026) la lista de consultas que hacemos a RPS con sus
// tiempos: hay lentitudes y sospechan que coinciden nuestras cargas con las de
// OLANET. Este módulo apunta cada consulta en un fichero diario, sin tocar las
// consultas: envuelve `Request.prototype.query/batch/execute` de mssql, por
// donde pasan todas, también las de dentro de una transacción.
//
// El MISMO fichero vive en las tres webs que consultan RPS (CoordinaOT,
// Planteamientos y materiales-ot). Si lo cambias, cópialo a las otras dos: el
// informe (`scripts/informe-consultas-sql.mjs` en coordina-ot) lee los tres.
//
// Una línea JSON por consulta en `<dir>/AAAA-MM-DD.jsonl`:
//   t      hora de inicio (ISO, UTC)
//   web    qué web la lanzó
//   bd     base de datos (RPSNext, OLANET…)
//   q      huella del texto SQL (los literales y listas se igualan, así la
//          misma consulta con otros valores tiene la misma huella)
//   obj    primera tabla o vista que nombra (orientativo)
//   ms     milisegundos hasta tener el resultado (incluye esperar conexión)
//   filas  filas devueltas o afectadas
//   sim    consultas de esta web en marcha a la vez al empezar esta
//   orig   fichero:línea que la lanzó (en el build de Next puede ser un chunk)
//   err    mensaje de error, si falló
// El texto SQL de cada huella se apunta una vez en `<dir>/catalogo.jsonl`.
// Nunca se guardan los valores de los parámetros.
//
// Apagar: MEDIR_CONSULTAS=false. Carpeta: CONSULTAS_SQL_DIR.

import sql from "mssql";
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";

const MARCA = Symbol.for("tgm.medirConsultas");
const VOLCADO_MS = 5_000;

/** Iguala la misma consulta con distintos valores: literales, números y
 *  listas de parámetros numerados (@p0, @p1…) quedan en una sola forma. */
export function normalizarSql(texto) {
  return String(texto)
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/N?'(?:[^']|'')*'/g, "?")
    .replace(/(@[A-Za-z_]+?)\d+\b/g, "$1#")
    .replace(/\b\d+(?:\.\d+)?\b/g, "0")
    .replace(/\s+/g, " ")
    .replace(/(\?|0|@\w+#)(?:\s*,\s*(?:\?|0|@\w+#))+/g, "$1…")
    .trim();
}

export function huellaSql(normalizado) {
  return createHash("sha1").update(normalizado).digest("hex").slice(0, 10);
}

/** Primera tabla, vista o procedimiento que nombra la consulta. */
export function objetoSql(normalizado) {
  const m = normalizado.match(
    /\b(?:FROM|UPDATE|INSERT\s+INTO|MERGE\s+(?:INTO\s+)?|DELETE\s+FROM|EXEC(?:UTE)?)\s+((?:\[?[\w.]+\]?\.?)+)/i,
  );
  return m ? m[1].replace(/[[\]]/g, "") : "";
}

function bdDe(req) {
  let p = req.parent;
  for (let i = 0; p && i < 4; i++, p = p.parent) {
    if (p.config) return p.config.database ?? "";
  }
  return "";
}

// La pila se toma DENTRO del envoltorio: la línea 0 es "Error", la 1 el propio
// envoltorio y desde la 2 quien llamó. Se salta por posición y no por nombre de
// fichero porque en el build de Next este módulo va empaquetado dentro del
// chunk de db.ts, junto a otros módulos que sí son quien llama.
function origenDe(pila) {
  const lineas = String(pila ?? "").split("\n").slice(2);
  for (const l of lineas) {
    if (/node_modules|node:internal|\(node:/.test(l)) continue;
    const m = l.match(/\(?((?:[A-Za-z]:)?[^():]+):(\d+):\d+\)?\s*$/);
    if (!m) continue;
    const base = path.basename(m[1]);
    // Chunk de Turbopack: "src_lib_server_rps_ts_1bm9ey3zgwln6._.js" → rps.ts
    // (la línea no sirve: el chunk va minificado en una sola línea).
    const chunk = base.match(/^(?:.*_)?([^_]+)_(ts|tsx|js|mjs)_[0-9a-z]+\._\.js$/);
    return chunk ? `${chunk[1]}.${chunk[2]}` : `${base}:${m[2]}`;
  }
  return "";
}

function filasDe(res) {
  if (!res) return 0;
  if (Array.isArray(res.recordsets) && res.recordsets.length) {
    return res.recordsets.reduce((n, r) => n + (r?.length ?? 0), 0);
  }
  return Array.isArray(res.rowsAffected) ? res.rowsAffected.reduce((a, b) => a + b, 0) : 0;
}

/**
 * Empieza a medir. Llamar una vez al arrancar, antes de la primera consulta;
 * las llamadas siguientes no hacen nada.
 * @param {{ web: string, dir?: string, diasGuardados?: number }} opciones
 */
export function medirConsultas({ web, dir, diasGuardados = 30 }) {
  if (process.env.MEDIR_CONSULTAS === "false") return;
  const proto = sql.Request.prototype;
  if (proto[MARCA]) return;
  proto[MARCA] = true;

  const carpeta = path.resolve(/*turbopackIgnore: true*/ process.env.CONSULTAS_SQL_DIR || dir || "logs/consultas-sql");
  const catalogo = path.join(carpeta, "catalogo.jsonl");
  const conocidas = new Set();
  let pendientes = [];
  let nuevasCatalogo = [];
  let enMarcha = 0;

  const listo = (async () => {
    await mkdir(carpeta, { recursive: true });
    try {
      for (const l of (await readFile(catalogo, "utf8")).split("\n")) {
        if (l) conocidas.add(JSON.parse(l).q);
      }
    } catch {
      /* sin catálogo todavía */
    }
    const limite = new Date(Date.now() - diasGuardados * 86_400_000).toISOString().slice(0, 10);
    for (const f of await readdir(/*turbopackIgnore: true*/ carpeta)) {
      if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) && f.slice(0, 10) < limite) {
        await unlink(path.join(/*turbopackIgnore: true*/ carpeta, f)).catch(() => {});
      }
    }
  })().catch((e) => console.error("[medir-consultas] no se puede preparar", carpeta, e.message));

  async function volcar() {
    if (!pendientes.length && !nuevasCatalogo.length) return;
    const lineas = pendientes;
    const cat = nuevasCatalogo;
    pendientes = [];
    nuevasCatalogo = [];
    try {
      await listo;
      if (cat.length) await appendFile(catalogo, cat.map((c) => JSON.stringify(c)).join("\n") + "\n");
      const porDia = new Map();
      for (const l of lineas) {
        const dia = l.t.slice(0, 10);
        porDia.set(dia, (porDia.get(dia) ?? "") + JSON.stringify(l) + "\n");
      }
      for (const [dia, texto] of porDia) await appendFile(path.join(carpeta, `${dia}.jsonl`), texto);
    } catch (e) {
      console.error("[medir-consultas] no se pudo escribir", e.message);
    }
  }
  setInterval(() => void volcar(), VOLCADO_MS).unref();

  function envolver(nombre) {
    const original = proto[nombre];
    if (typeof original !== "function") return;
    proto[nombre] = function (comando, callback, ...resto) {
      // Con callback o en modo stream no se mide: aquí no se usa, y así no se
      // cambia su comportamiento.
      if (typeof callback === "function" || this.stream) {
        return original.call(this, comando, callback, ...resto);
      }
      const crudo =
        typeof comando === "string"
          ? comando
          : Array.isArray(comando)
            ? comando.join("?")
            : String(comando?.name ?? comando ?? "");
      const texto = nombre === "execute" ? `EXEC ${crudo}` : crudo;
      const pila = new Error().stack;
      const inicio = performance.now();
      const t = new Date().toISOString();
      const sim = enMarcha++;
      const apuntar = (res, err) => {
        enMarcha--;
        try {
          const norm = normalizarSql(texto);
          const q = huellaSql(norm);
          if (!conocidas.has(q)) {
            conocidas.add(q);
            nuevasCatalogo.push({ q, web, obj: objetoSql(norm), sql: norm.slice(0, 4000), desde: t });
          }
          const linea = {
            t,
            web,
            bd: bdDe(this),
            q,
            obj: objetoSql(norm),
            ms: Math.round(performance.now() - inicio),
            filas: filasDe(res),
            sim,
            orig: origenDe(pila),
          };
          if (err) linea.err = String(err.message ?? err).slice(0, 200);
          pendientes.push(linea);
        } catch {
          /* medir nunca debe romper una consulta */
        }
      };
      let promesa;
      try {
        promesa = original.apply(this, arguments);
      } catch (e) {
        apuntar(null, e);
        throw e;
      }
      if (!promesa || typeof promesa.then !== "function") {
        enMarcha--;
        return promesa;
      }
      return promesa.then(
        (res) => {
          apuntar(res, null);
          return res;
        },
        (err) => {
          apuntar(null, err);
          throw err;
        },
      );
    };
  }

  envolver("query");
  envolver("batch");
  envolver("execute");
}
