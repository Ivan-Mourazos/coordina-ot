import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  CODIGO_PEDIDO_RE,
  archivoDeRuta,
  comoServir,
  esImagen,
  segmentosEnShare,
} from "@/lib/historial";
import { CLAVE_DOCUMENTO_RE, documentoDePedido } from "@/lib/server/historial-db";
import { miniaturaCacheada, redimensionarImagen, renderizarPdf } from "@/lib/server/miniaturas";
import { soloConSesion } from "@/lib/server/sesion";

// ─── GET /api/historial/AR.26.03453/documento/0 ──────────────────────────────
// Sirve UNO de los documentos que RPS tiene colgados del pedido: el
// planteamiento, el presupuesto, las fotos del trabajo, el adjunto de una OF…
// El detalle del pedido (`HistorialPedidoDetalle.documentos`) enseña la lista y
// cada entrada trae ya su URL con el índice puesto.
//
// El cliente pide por ÍNDICE y nunca por ruta, que es la decisión de la que
// cuelga todo lo demás: la ruta al share es de uso interno del servidor y no
// sale en la respuesta del detalle (lo dice el tipo `DocumentoRps`). Ningún
// parámetro del cliente se concatena a una ruta de fichero.
//
// Las precauciones son las mismas que en /api/pedidos/[archivo], que ya sirve
// el PDF escaneado del pedido desde este mismo share, más las que pide el hecho
// de que aquí la ruta no la construye la app: la trae la BD, y `Path` es texto
// libre con veinte años de todo dentro (ver `segmentosEnShare`).

/** Índice del documento: como mucho 3 cifras, y nada más.
 *
 *  El pedido con más documentos que hay en RPS anda por los 60 y pico, así que
 *  con 999 sobra de largo. El límite es para que un `/documento/99999999…` no
 *  llegue siquiera a abrir la conexión con la BD. */
const INDICE_RE = CLAVE_DOCUMENTO_RE;

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
const RAIZ =
  process.platform === "win32"
    ? (process.env.RPS_DOCS_DIR_WIN ?? "\\\\192.168.0.128\\RPS")
    : (process.env.RPS_DOCS_DIR ?? "/mnt/rps");

/** Privada (lleva datos del cliente) y revalidando siempre: ver la `firma`. */
const CACHE_DOCUMENTO = "private, no-cache";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ pedido: string; indice: string }> },
) {
  const corte = soloConSesion(req);
  if (corte) return corte;

  const { pedido, indice } = await params;
  // ?mini=1 → la versión pequeña, para la rejilla de documentos de la ficha y
  // del Historial. Un parámetro y no otra ruta porque el fichero es EL MISMO y
  // se localiza igual: duplicar la ruta duplicaba también todas las
  // comprobaciones de abajo.
  const mini = new URL(req.url).searchParams.get("mini") === "1";
  if (!CODIGO_PEDIDO_RE.test(pedido)) {
    return new Response("Código de pedido no válido", { status: 400 });
  }
  if (!INDICE_RE.test(indice)) {
    return new Response("Índice de documento no válido", { status: 400 });
  }

  let doc;
  try {
    // El índice se resuelve contra la lista de documentos DE ESE PEDIDO: si el
    // pedido no tiene tantos, no hay fichero, y no hay forma de nombrar uno de
    // otro pedido desde aquí.
    doc = await documentoDePedido(pedido, indice);
  } catch (e) {
    console.error("[historial] documento: RPS falló:", (e as Error).message);
    return new Response("No se pudo consultar el documento", { status: 500 });
  }
  if (!doc) return new Response("Documento no encontrado", { status: 404 });

  // Única puerta entre lo que RPS tiene apuntado y lo que se lee del disco.
  // Devuelve null para todo lo que no cuelgue del share: los `gdoc://` (que no
  // son ficheros), los enlaces a otros servidores y —lo que importa— las rutas
  // locales `file://C:\Users\…` que hay a miles en la tabla y que resolverían
  // contra el disco DEL SERVIDOR WEB.
  const segmentos = segmentosEnShare(doc.ruta);
  if (!segmentos) {
    return new Response("Ese documento no está en el archivo de RPS", { status: 404 });
  }

  // Segmento a segmento, nunca una cadena: `path.join` con los trozos ya
  // validados no puede salir de RAIZ. La comprobación de abajo es el cinturón
  // sobre los tirantes — si algún día `segmentosEnShare` deja pasar algo, esto
  // lo para igual.
  const ruta = path.join(RAIZ, ...segmentos);
  if (!path.resolve(ruta).startsWith(path.resolve(RAIZ))) {
    console.error("[historial] documento fuera de la raíz del share:", doc.ruta);
    return new Response("Documento no encontrado", { status: 404 });
  }

  const archivo = archivoDeRuta(doc.ruta);
  const { tipo, incrustable } = comoServir(archivo);

  if (mini) return await miniatura(req, ruta, doc.ruta, archivo, tipo);

  // El navegador PREGUNTA cada vez si ha cambiado (19/10/2026). Antes lo
  // guardaba un día sin preguntar, y un planteamiento rehecho con el mismo
  // nombre se seguía viendo viejo. Si no ha cambiado, un 304 sin cuerpo.
  let firma: string;
  try {
    const st = await stat(ruta);
    firma = `"${Math.round(st.mtimeMs)}-${st.size}"`;
  } catch {
    return new Response("Documento no encontrado", { status: 404 });
  }
  if (req.headers.get("if-none-match") === firma) {
    return new Response(null, { status: 304, headers: { ETag: firma, "Cache-Control": CACHE_DOCUMENTO } });
  }

  let contenido: Buffer;
  try {
    contenido = await readFile(ruta);
  } catch {
    // Pasa de verdad y no es un fallo: la BD guarda el enlace para siempre y el
    // fichero puede haberse movido, renombrado o borrado del share.
    return new Response("Documento no encontrado", { status: 404 });
  }

  return new Response(new Uint8Array(contenido), {
    headers: {
      "Content-Type": tipo,
      // Solo se incrusta lo que el navegador pinta de forma segura (PDF e
      // imágenes). Lo demás baja como fichero: en la tabla hay .htm y .html, y
      // servir HTML ajeno desde nuestro propio origen sería un XSS almacenado.
      "Content-Disposition": `${incrustable ? "inline" : "attachment"}; filename="${nombreSeguro(archivo)}"`,
      // Con esto el navegador no adivina el tipo: si decimos octet-stream, no
      // se ejecuta como otra cosa aunque el contenido lo parezca.
      "X-Content-Type-Options": "nosniff",
      // Privada porque lleva datos del cliente y no debe quedarse en ninguna
      // caché compartida; y revalidando, que un planteamiento se rehace con el
      // mismo nombre (ver `firma`).
      ETag: firma,
      "Cache-Control": CACHE_DOCUMENTO,
    },
  });
}

/** La versión pequeña del documento: la 1ª página si es PDF, la foto encogida
 *  si es imagen.
 *
 *  Un 415 (y no un 500) para todo lo demás: un `.dwg` o un `.msg` no tienen
 *  miniatura y eso no es un fallo — la rejilla lo pinta con su icono y sigue.
 *  Lo mismo si el decodificador se atraganta con un `.tif` raro de los que hay
 *  en el share: mejor un hueco con icono que la ficha entera en rojo.
 *
 *  La clave de caché es el hash de la RUTA del fichero, no el índice: el índice
 *  cambia en cuanto RPS cuelga un documento más del pedido, y entonces la
 *  miniatura cacheada sería la del documento de al lado. */
async function miniatura(
  req: Request,
  ruta: string,
  rutaOriginal: string,
  archivo: string,
  tipo: string,
): Promise<Response> {
  const esPdf = tipo === "application/pdf";
  if (!esPdf && !esImagen(archivo)) {
    return new Response("Ese documento no tiene miniatura", { status: 415 });
  }

  let mtime: number;
  try {
    mtime = (await stat(ruta)).mtimeMs;
  } catch {
    return new Response("Documento no encontrado", { status: 404 });
  }
  const firma = `"m-${Math.round(mtime)}"`;
  if (req.headers.get("if-none-match") === firma) {
    return new Response(null, { status: 304, headers: { ETag: firma, "Cache-Control": CACHE_DOCUMENTO } });
  }

  const clave = createHash("sha1").update(rutaOriginal).digest("hex");
  try {
    const bytes = await miniaturaCacheada(
      CACHE_MINIATURAS,
      `${clave}.${esPdf ? "png" : "jpg"}`,
      mtime,
      () => (esPdf ? renderizarPdf(ruta) : redimensionarImagen(ruta)),
    );
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": esPdf ? "image/png" : "image/jpeg",
        "X-Content-Type-Options": "nosniff",
        // Privada: lleva datos del cliente y no puede quedarse en ninguna
        // caché compartida. Revalida igual que el documento entero.
        ETag: firma,
        "Cache-Control": CACHE_DOCUMENTO,
      },
    });
  } catch (e) {
    console.error("[historial] miniatura fallida:", archivo, (e as Error).message);
    return new Response("No se pudo generar la miniatura", { status: 415 });
  }
}

/** Nombre para la cabecera `Content-Disposition`.
 *
 *  Los nombres de RPS llevan tildes, comas y comillas ("CERTIFICADO _ 24A.pdf"),
 *  y una comilla suelta rompe la cabecera y deja meter directivas de más. Se
 *  quedan las letras ASCII, los dígitos y cuatro signos; el resto pasa a "_". */
function nombreSeguro(archivo: string): string {
  const limpio = archivo.replace(/[^\w.\- ]+/g, "_").trim();
  return limpio || "documento";
}
