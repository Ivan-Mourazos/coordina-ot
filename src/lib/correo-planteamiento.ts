// ─── El correo del planteamiento: asunto y cuerpo ────────────────────────────
// Sustituye al que cada técnico mandaba a mano («PLANTEAMENTO» y el PDF). Lleva
// además los datos del pedido (Iván, 14/10/2026) para que Producción no tenga
// que abrir nada para saber de qué va. Texto plano: se lee igual en cualquier
// cliente de correo y en el móvil.

export interface DatosCorreo {
  pedido: string;
  cliente: string;
  ofs: string[];
  /** ISO yyyy-mm-dd, la entrega SOLICITADA (no la planificación de RPS, que se
   *  recalcula en bloque y no dice nada). */
  entrega: string | null;
  minutosPlanteo: number;
  pasadoPor: string;
}

export function asuntoCorreo(d: DatosCorreo): string {
  return d.cliente.trim() ? `Planteamiento ${d.pedido} · ${d.cliente.trim()}` : `Planteamiento ${d.pedido}`;
}

export function minutosATexto(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const fecha = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

export function cuerpoCorreo(d: DatosCorreo, ficheros: string[]): string {
  const lineas = [`Planteamiento del pedido ${d.pedido}`, ""];
  if (d.cliente.trim()) lineas.push(`Cliente: ${d.cliente.trim()}`);
  if (d.ofs.length) lineas.push(`OF: ${d.ofs.join(", ")}`);
  if (d.entrega) lineas.push(`Entrega solicitada: ${fecha(d.entrega)}`);
  if (d.minutosPlanteo > 0) lineas.push(`Tiempo de planteo: ${minutosATexto(d.minutosPlanteo)}`);
  lineas.push(`Pasado a Producción por: ${d.pasadoPor}`, "");
  lineas.push(`${ficheros.length === 1 ? "Adjunto" : "Adjuntos"}: ${ficheros.join(", ")}`, "");
  lineas.push("Enviado automáticamente por CoordinaOT.");
  return lineas.join("\n");
}
