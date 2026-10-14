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

export function asuntoCorreo(d: Pick<DatosCorreo, "pedido" | "cliente">): string {
  return d.cliente.trim() ? `Planteamiento ${d.pedido} · ${d.cliente.trim()}` : `Planteamiento ${d.pedido}`;
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
  const lineas = [cliente ? `Pedido ${d.pedido} · ${cliente}` : `Pedido ${d.pedido}`, ""];
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
