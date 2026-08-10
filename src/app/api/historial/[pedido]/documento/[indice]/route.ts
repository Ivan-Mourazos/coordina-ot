import { readFile } from "node:fs/promises";
import path from "node:path";
import { CODIGO_PEDIDO_RE, archivoDeRuta, comoServir, segmentosEnShare } from "@/lib/historial";
import { documentoDePedido } from "@/lib/server/historial-db";

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
const INDICE_RE = /^\d{1,3}$/;

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

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pedido: string; indice: string }> },
) {
  const { pedido, indice } = await params;
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
    doc = await documentoDePedido(pedido, Number(indice));
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
      // Un documento de un pedido cerrado no cambia. Privada porque lleva datos
      // del cliente y no debe quedarse en ninguna caché compartida.
      "Cache-Control": "private, max-age=86400",
    },
  });
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
