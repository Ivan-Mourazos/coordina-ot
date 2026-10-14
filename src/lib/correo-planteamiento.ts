// ─── El correo del planteamiento: asunto y cuerpo ────────────────────────────
// Sustituye al que cada técnico mandaba a mano. Sigue la norma de la casa
// (Iván, 14/10/2026): siempre se imprime arriba y siempre se manda el correo;
// los de PVC (-10 en adelante) van ADJUNTOS, y los de toldos y acrílico solo se
// imprimen, así que el correo avisa de que se imprimieron. Lleva además una
// línea por OF con su descripción, tiempos, autor y revisor, para que nadie
// tenga que abrir nada. Texto plano: se lee igual en cualquier cliente y en el
// móvil.

export interface OfCorreo {
  codigo: string;
  /** La de catálogo, corta: cabe en una línea. */
  descripcion: string;
  planteoMin: number;
  autor: string | null;
  revisionMin: number;
  revisor: string | null;
}

export interface DatosCorreo {
  pedido: string;
  cliente: string;
  ofs: OfCorreo[];
  pasadoPor: string;
  /** Lo que escribió a mano quien pasa el pedido; sale arriba del todo. */
  nota?: string;
}

/** Qué pasa con cada PDF del planteamiento, para contarlo en el correo. */
export interface FicherosCorreo {
  /** Van adjuntos (PVC). */
  adjuntos: string[];
  /** Se mandaron a imprimir solos (toldos, acrílico). */
  impresos: string[];
  /** Llevan páginas que no son A4: los imprime a mano quien pasa el pedido. */
  aMano: string[];
  /** Dónde se imprimen («Producción», o la de OT en prueba). null = la
   *  impresión está apagada: no se puede decir «impreso». */
  dondeImprime: string | null;
}

/** «Planteamiento» si el correo lleva el PDF adjunto (PVC); «Impreso» si solo
 *  avisa de que se imprimió (toldos, acrílico). Es lo que se ponía a mano:
 *  «PLANTEAMENTO» con el adjunto, «IMPRESO» sin él. */
const titulo = (conAdjuntos: boolean) => (conAdjuntos ? "Planteamiento" : "Impreso");

/** ¿El correo es de «Planteamiento» (lleva el PDF) o de «Impreso» (avisa de lo
 *  que se imprimió)? Sin adjuntos ni nada impreso —se quitó todo a mano en el
 *  aviso de pasar— no hay nada impreso que avisar: «Planteamiento». */
export const esDePlanteamiento = (f: Pick<FicherosCorreo, "adjuntos" | "impresos" | "aMano">) =>
  f.adjuntos.length > 0 || f.impresos.length + f.aMano.length === 0;

export function asuntoCorreo(d: Pick<DatosCorreo, "pedido" | "cliente">, conAdjuntos: boolean): string {
  const t = titulo(conAdjuntos);
  return d.cliente.trim() ? `${t} ${d.pedido} · ${d.cliente.trim()}` : `${t} ${d.pedido}`;
}

export function minutosATexto(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const quien = (nombre: string | null) => (nombre ? ` (${nombre})` : "");

function lineaTiempos(of: OfCorreo): string {
  const planteo = of.planteoMin > 0 ? `Planteo ${minutosATexto(of.planteoMin)}${quien(of.autor)}` : of.autor ? `Planteo sin fichar${quien(of.autor)}` : "Planteo sin fichar";
  // Sin revisor ni tiempo de revisión, no la hubo: se dice, no se calla.
  const revision = of.revisor || of.revisionMin > 0
    ? `Revisión${of.revisionMin > 0 ? ` ${minutosATexto(of.revisionMin)}` : ""}${quien(of.revisor)}`
    : "Sin revisión";
  return `   ${planteo} · ${revision}`;
}

const enumerar = (titulo: string, plural: string, nombres: string[]) =>
  `${nombres.length === 1 ? titulo : plural}: ${nombres.join(", ")}`;

export function cuerpoCorreo(d: DatosCorreo, f: FicherosCorreo): string {
  const cliente = d.cliente.trim();
  const lineas = [
    titulo(esDePlanteamiento(f)).toUpperCase(),
    "",
    cliente ? `Pedido ${d.pedido} · ${cliente}` : `Pedido ${d.pedido}`,
    "",
  ];
  if (d.nota?.trim()) lineas.push(d.nota.trim(), "");
  for (const of of d.ofs) {
    lineas.push(`OF ${of.codigo}${of.descripcion.trim() ? ` · ${of.descripcion.trim()}` : ""}`, lineaTiempos(of));
  }
  if (d.ofs.length) lineas.push("");
  if (f.impresos.length) {
    lineas.push(f.dondeImprime ? `Impreso en ${f.dondeImprime}: ${f.impresos.join(", ")}` : `Para imprimir: ${f.impresos.join(", ")}`);
  }
  if (f.aMano.length) lineas.push(`Para imprimir a mano (no es todo A4): ${f.aMano.join(", ")}`);
  if (f.adjuntos.length) lineas.push(enumerar("Adjunto", "Adjuntos", f.adjuntos));
  lineas.push(`Pasado a Producción por: ${d.pasadoPor}`, "", "Enviado automáticamente por CoordinaOT.");
  return lineas.join("\n");
}

// ─── La misma información, en HTML ──────────────────────────────────────────
// Outlook lo pinta con negrita y color (Iván, 14/10/2026). Hecho a la antigua
// a propósito —tablas y estilos en línea, sin hojas de estilo ni imágenes—,
// que es lo único que los clientes de correo respetan todos. TODO lo que viene
// de RPS (cliente, descripciones, nombres) pasa por `esc`: un «<» en un
// nombre de cliente no puede romper el correo.

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Verde para lo impreso (toldos), azul para el planteamiento con adjunto (PVC). */

export function cuerpoCorreoHtml(d: DatosCorreo, f: FicherosCorreo): string {
  // Sobrio a propósito: sin bloques de color (a Iván le chocaban, 14/10), solo
  // tamaños y negritas para que se lea de un vistazo.
  const titulo = esDePlanteamiento(f) ? "PLANTEAMIENTO" : "IMPRESO";
  const nota = d.nota?.trim();
  const cliente = d.cliente.trim();

  const filasOf = d.ofs
    .map((of) => {
      const desc = of.descripcion.trim();
      return `
  <p style="margin:0 0 10px 0"><b>OF ${esc(of.codigo)}</b>${desc ? ` · ${esc(desc)}` : ""}<br>
  <span style="font-size:13px;color:#555555">${esc(lineaTiempos(of).trim())}</span></p>`;
    })
    .join("");

  const pie: string[] = [];
  if (f.impresos.length) {
    pie.push(f.dondeImprime
      ? `<b>Impreso en ${esc(f.dondeImprime)}:</b> ${esc(f.impresos.join(", "))}`
      : `<b>Para imprimir:</b> ${esc(f.impresos.join(", "))}`);
  }
  if (f.aMano.length) pie.push(`<b>Para imprimir a mano (no es todo A4):</b> ${esc(f.aMano.join(", "))}`);
  if (f.adjuntos.length) {
    pie.push(`<b>${f.adjuntos.length === 1 ? "Adjunto" : "Adjuntos"}:</b> ${esc(f.adjuntos.join(", "))}`);
  }
  pie.push(`<b>Pasado a Producción por:</b> ${esc(d.pasadoPor)}`);

  return `<!doctype html><html><body style="margin:0;padding:12px;font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#222222">
  <p style="margin:0;font-size:13px;font-weight:bold;letter-spacing:1px">${titulo}</p>
  <p style="margin:2px 0 16px 0"><b style="font-size:20px">${esc(d.pedido)}</b>${cliente ? `<span style="font-size:16px"> · ${esc(cliente)}</span>` : ""}</p>${nota ? `
  <p style="margin:0 0 16px 0">${esc(nota).replace(/\r?\n/g, "<br>")}</p>` : ""}${filasOf}
  <p style="margin:16px 0 0 0;line-height:1.6">${pie.join("<br>")}</p>
  <p style="margin:16px 0 0 0;font-size:11px;color:#999999">Enviado automáticamente por CoordinaOT.</p>
</body></html>`;
}
