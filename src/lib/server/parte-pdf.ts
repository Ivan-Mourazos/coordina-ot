import { PDFDocument, degrees } from "pdf-lib";
import { PAPELES, type Papel } from "../planteamiento";

// ─── Sacar unas páginas de un PDF ────────────────────────────────────────────
// Para imprimir en cada impresora lo que le toca (ver `trabajosDe`): un PDF
// nuevo con solo esas páginas. No se toca el original.

export async function extraerPaginas(original: Uint8Array, paginas: readonly number[], girar = false): Promise<Uint8Array> {
  return componerTrabajo(original, paginas.map((pagina) => ({ pagina, girar, ajustar: false })), "A4");
}

/** Las páginas de un trabajo, en su orden:
 *  · `girar`: un cuarto de vuelta en el sentido de las agujas del reloj.
 *  · `ajustar`: la página no es de este papel (el A5 que sale en Producción):
 *    se coloca entera y centrada en una hoja de `papel`, ampliada o reducida, y
 *    la hoja se pone en vertical u horizontal según quede el dibujo. */
export async function componerTrabajo(
  original: Uint8Array,
  paginas: readonly { pagina: number; girar: boolean; ajustar: boolean }[],
  papel: Papel,
): Promise<Uint8Array> {
  const fuente = await PDFDocument.load(original, { ignoreEncryption: true });
  const nuevo = await PDFDocument.create();
  const total = fuente.getPageCount();
  const validas = paginas.filter((p) => Number.isInteger(p.pagina) && p.pagina >= 1 && p.pagina <= total);
  if (validas.length === 0) throw new Error("Ninguna de esas páginas existe en el PDF");
  const copias = await nuevo.copyPages(fuente, validas.map((p) => p.pagina - 1));
  for (const [i, p] of validas.entries()) {
    const copia = copias[i];
    const giroPropio = ((copia.getRotation().angle % 360) + 360) % 360;
    if (!p.ajustar) {
      if (p.girar) copia.setRotation(degrees((giroPropio + 90) % 360));
      nuevo.addPage(copia);
      continue;
    }
    // Giro total, en el sentido del reloj: el que ya traía la página más el elegido.
    const t = (giroPropio + (p.girar ? 90 : 0)) % 360;
    const original = fuente.getPage(p.pagina - 1);
    // Una página sin contenido no se puede incrustar: sale la hoja en blanco.
    const embebida = original.node.Contents() ? await nuevo.embedPage(original) : null;
    const { width: w, height: h } = embebida ?? original.getSize();
    const [cw, ch] = t === 90 || t === 270 ? [h, w] : [w, h];
    const [corto, largo] = PAPELES[papel];
    const [W, H] = cw > ch ? [largo, corto] : [corto, largo];
    const s = Math.min(W / cw, H / ch);
    const ox = (W - cw * s) / 2;
    const oy = (H - ch * s) / 2;
    // drawPage gira en sentido CONTRARIO al reloj alrededor de (x, y): se
    // coloca ese punto para que el dibujo girado caiga en su caja centrada.
    const a = (360 - t) % 360;
    const [x, y] =
      a === 90 ? [ox + h * s, oy] : a === 180 ? [ox + w * s, oy + h * s] : a === 270 ? [ox, oy + w * s] : [ox, oy];
    const hoja = nuevo.addPage([W, H]);
    if (embebida) hoja.drawPage(embebida, { x, y, xScale: s, yScale: s, rotate: degrees(a) });
  }
  return nuevo.save();
}
