import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { asuntoCorreo, cuerpoCorreo, cuerpoCorreoHtml, esDePlanteamiento, type DatosCorreo } from "../correo-planteamiento";
import { getDb } from "./estado-db";
import { dirCopias, esperaTras, modoImpresion } from "./impresion-cola";
import { vaAdjunto } from "../planteamiento";
import { planteamientosDe } from "./planteamiento-pdf";

// ─── Cola del correo del planteamiento ───────────────────────────────────────
// Al pasar un pedido de OT, el planteamiento sale por correo desde coordina@
// a Oficina Técnica y Producción (spec 2026-10-14), en vez del que cada uno
// mandaba a mano. Se encola por lo mismo que la impresión: Microsoft puede no
// responder, y pasar el pedido no puede depender de eso.
//
// Todo se CONGELA al encolar —los PDF copiados, el asunto, el cuerpo y a quién
// va—: un reintento manda exactamente el mismo correo, aunque RPS ya se haya
// llevado el fichero o alguien haya cambiado el modo entretanto.

export type ModoCorreo = "off" | "ensayo" | "activo";

/** Apagado salvo que se pida: un correo a Producción por error es ruido para
 *  toda la fábrica. `ensayo` solo le llega a Iván. */
export function modoCorreo(): ModoCorreo {
  const v = process.env.CORREO_PLANTEAMIENTO;
  return v === "activo" || v === "ensayo" ? v : "off";
}

const lista = (v: string | undefined, porDefecto: string[]) =>
  v ? v.split(",").map((s) => s.trim()).filter(Boolean) : porDefecto;

export function destinatariosCorreo(modo: ModoCorreo): string[] {
  if (modo === "activo") return lista(process.env.CORREO_PARA, ["of.tecnica@toldosgomez.com", "produccion@toldosgomez.com"]);
  if (modo === "ensayo") return lista(process.env.CORREO_ENSAYO_PARA, ["ivan.sanchez@toldosgomez.com"]);
  return [];
}

export type EstadoCorreo = "pendiente" | "enviado" | "sin_planteamiento" | "descartado";

export interface FilaCorreo {
  id: number;
  pedidoId: string;
  ficheros: string[];
  para: string[];
  asunto: string | null;
  estado: EstadoCorreo;
  intentos: number;
  error: string | null;
  modo: ModoCorreo | null;
  pasadoPor: string | null;
  creadoAt: string;
  enviadoAt: string | null;
}

interface FicheroCopiado {
  nombre: string;
  copia: string;
}

interface FilaDb {
  id: number; pedido_id: string; ficheros: string; para: string; asunto: string | null; cuerpo: string | null; cuerpo_html: string | null;
  estado: EstadoCorreo; intentos: number; error: string | null; modo: ModoCorreo | null;
  pasado_por: string | null; creado_at: string; enviado_at: string | null;
}

const parsear = <T>(json: string, porDefecto: T): T => {
  try { return JSON.parse(json) as T; } catch { return porDefecto; }
};

const aFila = (r: FilaDb): FilaCorreo => ({
  id: r.id,
  pedidoId: r.pedido_id,
  ficheros: parsear<FicheroCopiado[]>(r.ficheros, []).map((f) => f.nombre),
  para: parsear<string[]>(r.para, []),
  asunto: r.asunto,
  estado: r.estado,
  intentos: r.intentos,
  error: r.error,
  modo: r.modo,
  pasadoPor: r.pasado_por,
  creadoAt: r.creado_at,
  enviadoAt: r.enviado_at,
});

/** Copia cada PDF con un nombre único. Los que no se dejan copiar (RPS ya los
 *  movió, la red falla) se quedan fuera y se devuelven aparte para anotarlos:
 *  un fichero malo no puede tumbar el correo de los demás. */
function copiar(ficheros: Array<{ nombre: string; ruta: string }>): { copiados: FicheroCopiado[]; fallos: string[] } {
  mkdirSync(dirCopias(), { recursive: true });
  const copiados: FicheroCopiado[] = [];
  const fallos: string[] = [];
  for (const f of ficheros) {
    const copia = path.join(dirCopias(), `correo-${randomUUID()}-${f.nombre}`);
    try {
      copyFileSync(f.ruta, copia);
      copiados.push({ nombre: f.nombre, copia });
    } catch (e) {
      fallos.push(`${f.nombre} (${(e as Error).message})`);
    }
  }
  return { copiados, fallos };
}

const insertar = (
  pedido: string, ficheros: FicheroCopiado[], para: string[], asunto: string | null, cuerpo: string | null,
  html: string | null, estado: EstadoCorreo, error: string | null, modo: ModoCorreo, operarioId: string, ts: string,
) =>
  getDb()
    .prepare(
      `INSERT INTO planteamiento_correo (pedido_id, ficheros, para, asunto, cuerpo, cuerpo_html, estado, error, modo, pasado_por, creado_at, proximo_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(pedido, JSON.stringify(ficheros), JSON.stringify(para), asunto, cuerpo, html, estado,
      error?.slice(0, 500) ?? null, modo, operarioId, ts, estado === "pendiente" ? ts : null);

/** Dónde se imprimen los planteamientos, para decirlo en el correo. null si la
 *  impresión está apagada: entonces no se puede decir «impreso». */
function dondeSeImprime(): string | null {
  const m = modoImpresion();
  return m === "activo" ? "Producción" : m === "ensayo" ? "la impresora de OT (prueba)" : null;
}

/** Encola el correo del pase. Nunca lanza por un PDF que no se deja copiar.
 *
 *  La norma de la casa (Iván, 14/10/2026): siempre hay correo; los PDF de PVC
 *  (-10 en adelante) van ADJUNTOS y los de toldos y acrílico solo se imprimen,
 *  así que de esos el correo solo avisa. Sin ningún planteamiento no hay
 *  correo: no habría nada que contar. */
export async function prepararCorreo(
  datos: DatosCorreo,
  operarioId: string,
  ahora = new Date(),
  buscar: typeof planteamientosDe = planteamientosDe,
  /** Lo elegido a mano al pasar: qué va adjunto y qué se imprime. Lo que no
   *  venga, por la norma. `imprimir` vacío = no se imprime nada (y entonces el
   *  correo no puede decir «impreso»). */
  eleccion: { adjuntar?: ReadonlySet<string>; imprimir?: ReadonlySet<string> } = {},
): Promise<{ encolado: boolean; aviso: string | null }> {
  const modo = modoCorreo();
  const ts = ahora.toISOString();
  const para = destinatariosCorreo(modo);
  const { ficheros, aviso } = await buscar(datos.pedido);
  if (ficheros.length === 0) {
    insertar(datos.pedido, [], para, null, null, null, "sin_planteamiento", aviso, modo, operarioId, ts);
    return { encolado: false, aviso };
  }
  const adjunta = (n: string) => (eleccion.adjuntar ? eleccion.adjuntar.has(n) : vaAdjunto(n, datos.pedido));
  const imprime = (n: string) => (eleccion.imprimir ? eleccion.imprimir.has(n) : true);
  const paraAdjuntar = ficheros.filter((f) => adjunta(f.nombre));
  // Los adjuntos también se imprimen, pero el correo los cuenta como adjuntos.
  const soloImpresos = ficheros.filter((f) => !adjunta(f.nombre) && imprime(f.nombre));
  const { copiados, fallos } = copiar(paraAdjuntar);
  const error = fallos.length ? `No he podido copiar: ${fallos.join(", ")}` : null;
  // Tocaba adjuntar algo y no se ha podido nada: un correo de PVC sin su PDF
  // engañaría. Se descarta y se dice; «Reenviar» lo intenta de nuevo.
  if (paraAdjuntar.length > 0 && copiados.length === 0) {
    insertar(datos.pedido, [], para, null, null, null, "descartado", error, modo, operarioId, ts);
    return { encolado: false, aviso: error };
  }
  const listas = {
    adjuntos: copiados.map((c) => c.nombre),
    impresos: soloImpresos.filter((f) => f.todoA4).map((f) => f.nombre),
    aMano: soloImpresos.filter((f) => !f.todoA4).map((f) => f.nombre),
    dondeImprime: dondeSeImprime(),
  };
  insertar(datos.pedido, copiados, para, asuntoCorreo(datos, esDePlanteamiento(listas)), cuerpoCorreo(datos, listas),
    cuerpoCorreoHtml(datos, listas), "pendiente", error, modo, operarioId, ts);
  return { encolado: true, aviso };
}

export function leerCorreosDe(pedidoId: string): FilaCorreo[] {
  return (getDb()
    .prepare("SELECT * FROM planteamiento_correo WHERE pedido_id = ? ORDER BY id DESC LIMIT 20")
    .all(pedidoId) as FilaDb[]).map(aFila);
}

export interface CorreoPendiente {
  id: number;
  pedidoId: string;
  ficheros: FicheroCopiado[];
  para: string[];
  asunto: string;
  cuerpo: string;
  /** null en las filas de antes del HTML: esas salen en texto. */
  html: string | null;
  intentos: number;
}

export function correosParaEnviar(ahora: Date): CorreoPendiente[] {
  return (getDb()
    .prepare("SELECT * FROM planteamiento_correo WHERE estado = 'pendiente' AND proximo_at <= ? ORDER BY id LIMIT 20")
    .all(ahora.toISOString()) as FilaDb[]).map((r) => ({
    id: r.id,
    pedidoId: r.pedido_id,
    ficheros: parsear<FicheroCopiado[]>(r.ficheros, []),
    para: parsear<string[]>(r.para, []),
    asunto: r.asunto ?? `Planteamiento ${r.pedido_id}`,
    cuerpo: r.cuerpo ?? "",
    html: r.cuerpo_html,
    intentos: r.intentos,
  }));
}

const borrarCopias = (ficheros: FicheroCopiado[]) => {
  for (const f of ficheros) {
    try { rmSync(f.copia, { force: true }); }
    catch (e) { console.warn(`[correo] no pude borrar la copia ${f.copia}:`, (e as Error).message); }
  }
};

export function marcarCorreoEnviado(id: number, ahora: Date): void {
  const fila = getDb().prepare("SELECT ficheros FROM planteamiento_correo WHERE id = ?").get(id) as { ficheros: string } | undefined;
  getDb()
    .prepare("UPDATE planteamiento_correo SET estado = 'enviado', enviado_at = ?, error = NULL WHERE id = ?")
    .run(ahora.toISOString(), id);
  // Ya salió: borrar las copias es limpieza y no puede tocar el estado.
  if (fila) borrarCopias(parsear<FicheroCopiado[]>(fila.ficheros, []));
}

/** Lo que no se arregla reintentando (permisos, secreto caducado, copia
 *  perdida, demasiado grande): se para y se dice. */
export function descartarCorreo(id: number, error: string): void {
  getDb()
    .prepare("UPDATE planteamiento_correo SET estado = 'descartado', error = ? WHERE id = ?")
    .run(error.slice(0, 500), id);
}

export function marcarFalloCorreo(id: number, intentosAntes: number, error: string, ahora: Date): void {
  const intentos = intentosAntes + 1;
  getDb()
    .prepare("UPDATE planteamiento_correo SET intentos = ?, error = ?, proximo_at = ? WHERE id = ?")
    .run(intentos, error.slice(0, 500), new Date(ahora.getTime() + esperaTras(intentos)).toISOString(), id);
}

/** «Reenviar» desde el Historial: el último correo del pedido que llevaba PDF,
 *  otra vez, con el mismo asunto y cuerpo y a quien toque AHORA (si se probó en
 *  ensayo y ya está activo, va a Oficina Técnica y Producción). Los PDF se
 *  copian de nuevo: de las copias que queden o, si ya se borraron al enviarse,
 *  del planteamiento tal como esté hoy. false si no hay nada que reenviar. */
export async function reenviarUltimo(
  pedidoId: string,
  operarioId: string,
  ahora = new Date(),
  buscar: typeof planteamientosDe = planteamientosDe,
): Promise<boolean> {
  const fila = getDb()
    .prepare("SELECT * FROM planteamiento_correo WHERE pedido_id = ? AND asunto IS NOT NULL ORDER BY id DESC LIMIT 1")
    .get(pedidoId) as FilaDb | undefined;
  if (!fila) return false;
  const antes = parsear<FicheroCopiado[]>(fila.ficheros, []);
  // El de toldos no llevaba adjuntos (solo avisaba de lo impreso): se repite tal cual.
  let copiados: FicheroCopiado[] = [];
  let fallos: string[] = [];
  if (antes.length > 0) {
    const vivas = antes.filter((f) => existsSync(f.copia)).map((f) => ({ nombre: f.nombre, ruta: f.copia }));
    // Si las copias ya se borraron al enviarse, se vuelven a buscar los PDF, y
    // solo los que van adjuntos (PVC).
    const origen = vivas.length === antes.length
      ? vivas
      : (await buscar(pedidoId)).ficheros
        .filter((f) => vaAdjunto(f.nombre, pedidoId))
        .map((f) => ({ nombre: f.nombre, ruta: f.ruta }));
    if (origen.length === 0) return false;
    ({ copiados, fallos } = copiar(origen));
    if (copiados.length === 0) return false;
  }
  const modo = modoCorreo();
  insertar(pedidoId, copiados, destinatariosCorreo(modo), fila.asunto, fila.cuerpo, fila.cuerpo_html, "pendiente",
    fallos.length ? `No he podido copiar: ${fallos.join(", ")}` : null, modo, operarioId, ahora.toISOString());
  return true;
}
