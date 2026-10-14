import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { getDb } from "./estado-db";
import { planteamientosDe } from "./planteamiento-pdf";

// ─── Cola de impresión de planteamientos ─────────────────────────────────────
// Al pasar un pedido de OT a Producción, su planteamiento de CAD sale solo en
// la impresora de arriba (spec 2026-10-13). Se encola en vez de imprimir en la
// petición por lo mismo que los bonos de OLANET: la impresora puede estar
// apagada, y pasar el pedido no puede depender de eso.
//
// Se COPIA el PDF al encolar: RPS mueve el fichero de Planteamientos a su
// archivo en pocos minutos, y lo que se imprime es lo que había al pasar.

export type ModoImpresion = "off" | "ensayo" | "activo";

/** Apagado salvo que se pida: imprimir en Producción por error es papel y un
 *  susto arriba. `ensayo` manda a la impresora de OT. */
export function modoImpresion(): ModoImpresion {
  const v = process.env.IMPRESION_PRODUCCION;
  return v === "activo" || v === "ensayo" ? v : "off";
}

export function impresoraDestino(modo: ModoImpresion): string | null {
  if (modo === "activo") return process.env.IMPRESORA_PRODUCCION ?? "ipp://192.168.4.245/ipp";
  if (modo === "ensayo") return process.env.IMPRESORA_ENSAYO ?? "ipp://192.168.4.249/ipp";
  return null;
}

export type EstadoImpresion = "pendiente" | "enviado" | "manual" | "sin_planteamiento" | "descartado";

export interface FilaImpresion {
  id: number;
  pedidoId: string;
  fichero: string | null;
  paginas: number | null;
  estado: EstadoImpresion;
  intentos: number;
  error: string | null;
  impresora: string | null;
  /** Con qué modo se envió (null si aún no salió). Permite al Historial decir
   *  «ensayo» sin deducirlo de la IP. */
  modo: ModoImpresion | null;
  pasadoPor: string | null;
  creadoAt: string;
  enviadoAt: string | null;
}

export function dirCopias(): string {
  return process.env.COORDINA_PLANTEAMIENTOS_COPIAS ?? path.join(process.cwd(), "data", "planteamientos");
}

export async function prepararImpresion(
  codigo: string,
  operarioId: string,
  ahora = new Date(),
  buscar: typeof planteamientosDe = planteamientosDe,
  /** Solo estos PDF, si se eligieron a mano al pasar (ver `EleccionPase`). */
  solo?: ReadonlySet<string>,
): Promise<{ encolados: number; manuales: string[]; aviso: string | null }> {
  const encontrados = await buscar(codigo);
  const { aviso } = encontrados;
  const ficheros = solo ? encontrados.ficheros.filter((f) => solo.has(f.nombre)) : encontrados.ficheros;
  // Había planteamiento pero se quitó todo a mano: no es «sin planteamiento».
  if (solo && ficheros.length === 0 && encontrados.ficheros.length > 0) return { encolados: 0, manuales: [], aviso };
  const db = getDb();
  const ts = ahora.toISOString();
  const insertar = db.prepare(
    `INSERT INTO planteamiento_impresion (pedido_id, fichero, paginas, estado, error, pasado_por, creado_at, proximo_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  if (ficheros.length === 0) {
    insertar.run(codigo, null, null, "sin_planteamiento", aviso, operarioId, ts, null);
    return { encolados: 0, manuales: [], aviso };
  }
  const manuales: string[] = [];
  let encolados = 0;
  mkdirSync(dirCopias(), { recursive: true });
  for (const f of ficheros) {
    if (!f.todoA4) {
      insertar.run(codigo, f.nombre, f.paginas, "manual", null, operarioId, ts, null);
      manuales.push(f.nombre);
      continue;
    }
    // Se copia ANTES de insertar: si RPS ya movió el fichero o la red falla, la
    // fila no puede quedar «pendiente» sin copia reintentándose para siempre, ni
    // el fallo de un fichero cortar los demás. La copia lleva un prefijo único
    // en vez del id de la fila (que aún no existe).
    const copia = path.join(dirCopias(), `${randomUUID()}-${f.nombre}`);
    try {
      copyFileSync(f.ruta, copia);
    } catch (e) {
      insertar.run(codigo, f.nombre, f.paginas, "descartado", `No he podido copiar el PDF: ${(e as Error).message}`.slice(0, 500), operarioId, ts, null);
      continue;
    }
    db.prepare(
      `INSERT INTO planteamiento_impresion (pedido_id, fichero, copia, paginas, estado, pasado_por, creado_at, proximo_at)
       VALUES (?, ?, ?, ?, 'pendiente', ?, ?, ?)`,
    ).run(codigo, f.nombre, copia, f.paginas, operarioId, ts, ts);
    encolados += 1;
  }
  return { encolados, manuales, aviso };
}

interface FilaDb {
  id: number; pedido_id: string; fichero: string | null; copia: string | null; paginas: number | null;
  estado: EstadoImpresion; intentos: number; error: string | null; impresora: string | null;
  modo: ModoImpresion | null; pasado_por: string | null; creado_at: string; enviado_at: string | null;
}

const aFila = (r: FilaDb): FilaImpresion => ({
  id: r.id, pedidoId: r.pedido_id, fichero: r.fichero, paginas: r.paginas, estado: r.estado,
  intentos: r.intentos, error: r.error, impresora: r.impresora, modo: r.modo, pasadoPor: r.pasado_por,
  creadoAt: r.creado_at, enviadoAt: r.enviado_at,
});

export function leerImpresionesDe(pedidoId: string): FilaImpresion[] {
  return (getDb()
    .prepare("SELECT * FROM planteamiento_impresion WHERE pedido_id = ? ORDER BY id DESC LIMIT 20")
    .all(pedidoId) as FilaDb[]).map(aFila);
}

export function pendientesParaEnviar(ahora: Date): Array<FilaImpresion & { copia: string | null }> {
  return (getDb()
    .prepare("SELECT * FROM planteamiento_impresion WHERE estado = 'pendiente' AND proximo_at <= ? ORDER BY id LIMIT 20")
    .all(ahora.toISOString()) as FilaDb[]).map((r) => ({ ...aFila(r), copia: r.copia }));
}

export function marcarImpreso(
  id: number, trabajo: number | null, impresora: string, modo: ModoImpresion, ahora: Date, copia: string | null,
): void {
  getDb()
    .prepare("UPDATE planteamiento_impresion SET estado = 'enviado', trabajo_ipp = ?, impresora = ?, modo = ?, enviado_at = ?, error = NULL, copia = NULL WHERE id = ?")
    .run(trabajo, impresora, modo, ahora.toISOString(), id);
  // Ya se envió: borrar la copia es limpieza. Si falla no debe pasar por
  // marcarFallo, que reintentaría una fila que ya salió por la impresora.
  if (copia) {
    try { rmSync(copia, { force: true }); }
    catch (e) { console.warn(`[impresion] no pude borrar la copia ${copia}:`, (e as Error).message); }
  }
}

/** Fallo permanente (la copia no existe): reintentar no lo arregla. */
export function descartar(id: number, error: string): void {
  getDb()
    .prepare("UPDATE planteamiento_impresion SET estado = 'descartado', error = ?, copia = NULL WHERE id = ?")
    .run(error.slice(0, 500), id);
}

/** 30 s, 1 min, 2, 4, 8… hasta 10 minutos. Una impresora apagada no se
 *  arregla insistiendo cada medio minuto toda la noche. */
export function esperaTras(intentos: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, intentos - 1), 10 * 60_000);
}

export function marcarFallo(id: number, intentosAntes: number, error: string, ahora: Date): void {
  const intentos = intentosAntes + 1;
  getDb()
    .prepare("UPDATE planteamiento_impresion SET intentos = ?, error = ?, proximo_at = ? WHERE id = ?")
    .run(intentos, error.slice(0, 500), new Date(ahora.getTime() + esperaTras(intentos)).toISOString(), id);
}
