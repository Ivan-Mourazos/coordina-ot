import { PDFDocument, degrees } from "pdf-lib";

// ─── Sacar unas páginas de un PDF ────────────────────────────────────────────
// Para imprimir cada tamaño en su impresora (ver `partesDe`): un PDF nuevo con
// solo esas páginas, giradas un cuarto de vuelta si se eligió la orientación
// contraria a como vienen. No se toca el original.

export async function extraerPaginas(original: Uint8Array, paginas: readonly number[], girar = false): Promise<Uint8Array> {
  const fuente = await PDFDocument.load(original, { ignoreEncryption: true });
  const nuevo = await PDFDocument.create();
  const total = fuente.getPageCount();
  const indices = paginas.filter((n) => Number.isInteger(n) && n >= 1 && n <= total).map((n) => n - 1);
  if (indices.length === 0) throw new Error("Ninguna de esas páginas existe en el PDF");
  for (const pagina of await nuevo.copyPages(fuente, indices)) {
    if (girar) pagina.setRotation(degrees((pagina.getRotation().angle + 90) % 360));
    nuevo.addPage(pagina);
  }
  return nuevo.save();
}
