import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
import { archivoDeRuta, comoServir, esImagen, segmentosEnShare } from "../historial";
import type { DocumentoRpsCrudo } from "./historial-db";
import { miniaturaCacheada, redimensionarImagen, renderizarPdf } from "./miniaturas";

// ─── Miniaturas de los documentos de RPS ─────────────────────────────────────
// Antes vivía dentro de /api/historial/[pedido]/documento/[indice]. Sale aquí
// para que la lista de documentos pueda PRECALENTARLAS (12/11/2026: «los
// documentos son lo más lento de la web»). Medido ese día: leer los 23
// ficheros de AR.26.03914 del share en frío, 8,4 s; en caliente, 45 ms. Lo
// lento es la primera lectura del share, no RPS (la lista sale en 20-110 ms).

/** Carpeta de caché de las miniaturas de documentos, dentro de la de Next.
 *  Aparte de la de los partes (`pedidos-thumbs`): allí la clave es el código
 *  del pedido y aquí la ruta del fichero, y mezclarlas invitaba a chocar. */
const CACHE_MINIATURAS = path.join(process.cwd(), ".next", "cache", "docs-thumbs");

// El share se llega distinto según dónde corra la app, igual que en
// /api/pedidos/[archivo]:
//   · Windows (desarrollo): ruta UNC \\192.168.0.128\RPS (por VPN).
//   · Linux (deploy): punto de montaje CIFS, p.ej. /mnt/rps.
// OJO: aquí la raíz es el share ENTERO y no la carpeta de pedidos, porque los
// documentos están repartidos por medio share (VENTAS\PLANTEAMIENTOS, OF\OF,
// VENTAS\FOTOS TRABAJOS…). Por eso `RPS_DOCS_DIR` es una variable aparte de
// `RPS_PEDIDOS_PDF_DIR` y no se deduce de ella.
export const RAIZ_DOCUMENTOS =
  process.platform === "win32"
    ? (process.env.RPS_DOCS_DIR_WIN ?? "\\\\192.168.0.128\\RPS")
    : (process.env.RPS_DOCS_DIR ?? "/mnt/rps");

/** La ruta en disco de un documento de RPS, o null si no es del archivo o se
 *  saldría de la raíz del share. */
export function rutaEnDisco(rutaRps: string): string | null {
  const segmentos = segmentosEnShare(rutaRps);
  if (!segmentos) return null;
  const ruta = path.join(RAIZ_DOCUMENTOS, ...segmentos);
  if (!path.resolve(ruta).startsWith(path.resolve(RAIZ_DOCUMENTOS))) {
    console.error("[historial] documento fuera de la raíz del share:", rutaRps);
    return null;
  }
  return ruta;
}

/** ¿Tiene miniatura? Los PDF (1.ª página) y las fotos. */
export function tieneMiniatura(archivo: string): boolean {
  return comoServir(archivo).tipo === "application/pdf" || esImagen(archivo);
}

/** La miniatura de un documento (de la caché o recién hecha) y su tipo. Lanza
 *  si el fichero no está o no se puede dibujar. `mtime` es el del original:
 *  si es más nuevo que la caché, se rehace. */
export async function miniaturaDeDocumento(
  ruta: string,
  rutaRps: string,
  mtime: number,
): Promise<{ bytes: Buffer; tipo: "image/png" | "image/jpeg" }> {
  const esPdf = comoServir(archivoDeRuta(rutaRps)).tipo === "application/pdf";
  const clave = createHash("sha1").update(rutaRps).digest("hex");
  const bytes = await miniaturaCacheada(
    CACHE_MINIATURAS,
    `${clave}.${esPdf ? "png" : "jpg"}`,
    mtime,
    () => (esPdf ? renderizarPdf(ruta) : redimensionarImagen(ruta)),
  );
  return { bytes, tipo: esPdf ? "image/png" : "image/jpeg" };
}

/** La fecha de modificación de un fichero del share, guardada un minuto.
 *  Preguntarla cuesta unos 200 ms por fichero (12/11/2026) y cada miniatura la
 *  necesita; con 21 a la vez se iban a 4 s solo en eso. Lanza si no existe. */
export async function mtimeDe(ruta: string): Promise<number> {
  const g = mtimes.get(ruta);
  if (g && Date.now() - g.at < VIDA_MTIME_MS) return g.mtime;
  const mtime = (await stat(ruta)).mtimeMs;
  mtimes.set(ruta, { at: Date.now(), mtime });
  if (mtimes.size > 5000) mtimes.delete(mtimes.keys().next().value!);
  return mtime;
}
const VIDA_MTIME_MS = 60_000;
const mtimes = new Map<string, { at: number; mtime: number }>();

/** Pedidos precalentados hace poco: abrir y cerrar el mismo pedido no vuelve
 *  a recorrer el share. */
const precalentados = new Map<string, number>();
const PRECALENTAR_CADA_MS = 10 * 60_000;

/** Deja hechas, por detrás, las miniaturas de los documentos del pedido (y
 *  de paso el share «caliente» para abrirlos). No espera ni falla: lo que no
 *  se pueda, se intentará cuando lo pida la pantalla. Los renders van por el
 *  mismo turno que los de la pantalla (4 a la vez), así que no la ahogan. */
export function precalentarMiniaturas(pedido: string, docs: readonly DocumentoRpsCrudo[]): void {
  const ahora = Date.now();
  if (ahora - (precalentados.get(pedido) ?? 0) < PRECALENTAR_CADA_MS) return;
  precalentados.set(pedido, ahora);
  if (precalentados.size > 500) precalentados.delete(precalentados.keys().next().value!);
  for (const d of docs) {
    if (!tieneMiniatura(archivoDeRuta(d.ruta))) continue;
    const ruta = rutaEnDisco(d.ruta);
    if (!ruta) continue;
    void mtimeDe(ruta)
      .then((mtime) => miniaturaDeDocumento(ruta, d.ruta, mtime))
      .catch(() => {});
  }
}
