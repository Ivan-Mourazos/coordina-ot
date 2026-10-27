// ─── El correo del planteamiento: asunto y cuerpo ────────────────────────────
// Sustituye al que cada técnico mandaba a mano. Sigue la norma de la casa
// (Iván, 14/10/2026): siempre se imprime arriba y siempre se manda el correo;
// los de PVC (-10 en adelante) van ADJUNTOS, y los de toldos y acrílico solo se
// imprimen, así que el correo avisa de que se imprimieron. Lleva además una
// línea por OF con su descripción, autor y revisor (sin tiempos), para que nadie
// tenga que abrir nada. Texto plano: se lee igual en cualquier cliente y en el
// móvil.

export interface OfCorreo {
  codigo: string;
  /** La de catálogo, corta: cabe en una línea. */
  descripcion: string;
  planteoMin: number;
  autor: string | null;
  /** El nombre es para leer; el id permite resolver su correo sin adivinarlo. */
  autorId?: string | null;
  revisionMin: number;
  revisor: string | null;
}

export interface DatosCorreo {
  pedido: string;
  cliente: string;
  ofs: OfCorreo[];
  /** Los autores del pedido completo: quitar una OF del texto no les quita la copia. */
  autoresPedido?: string[];
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

/** Quién hizo cada OF, SIN TIEMPOS (Iván, 27/10/2026: «algunos correos ponen
 *  el tiempo de revisión y otros no; mejor solo el autor y el revisor»). El
 *  minuto de revisión solo salía si el revisor había fichado, y el correo
 *  parecía decir cosas distintas de pedidos iguales. Producción necesita saber
 *  a quién preguntar, no cuánto se tardó. */
function lineaQuien(of: OfCorreo): string {
  const autor = of.autor ? `Autor: ${of.autor}` : "Sin autor";
  // Sin revisor nombrado, no hubo revisión: se dice, no se calla.
  const revisor = of.revisor ? `Revisor: ${of.revisor}` : "Sin revisión";
  return `   ${autor} · ${revisor}`;
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
    lineas.push(`OF ${of.codigo}${of.descripcion.trim() ? ` · ${of.descripcion.trim()}` : ""}`, lineaQuien(of));
  }
  if (d.ofs.length) lineas.push("");
  if (f.impresos.length) {
    lineas.push(f.dondeImprime ? `Impreso en ${f.dondeImprime}: ${f.impresos.join(", ")}` : `Para imprimir: ${f.impresos.join(", ")}`);
  }
  if (f.aMano.length) lineas.push(`Para imprimir a mano (no es todo A4): ${f.aMano.join(", ")}`);
  if (f.adjuntos.length) lineas.push(enumerar("Adjunto", "Adjuntos", f.adjuntos));
  lineas.push(`Pasado a Producción por: ${d.pasadoPor}`, "", "Enviado automáticamente por Coordina.");
  return lineas.join("\n");
}

// ─── La misma información, en HTML ──────────────────────────────────────────
// Estilo HeroUI, como la web (Iván, 27/10/2026: «dale algo de diseño al correo,
// estilo HeroUI»; aprobado con capturas): fondo gris, tarjeta blanca
// redondeada sin borde, el tipo en una etiqueta arriba, el pedido grande, cada
// OF en su bloque gris y quién en etiquetas, autor en verde y revisor en
// violeta, los colores de planteando y revisar de Coordina. Sin tiempos.
//
// Hecho a la antigua a propósito —tablas y estilos en línea, sin hojas de
// estilo ni imágenes—, que es lo único que respetan todos los clientes de
// correo. Outlook de escritorio no redondea esquinas: allí sale todo recto, con
// los mismos colores. TODO lo que viene de RPS (cliente, descripciones,
// nombres) pasa por `esc`: un «<» en un nombre de cliente no puede romper el
// correo.

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Colores fijos (un correo no tiene tokens): los de HeroUI en claro. */
const C = {
  fondo: "#f4f4f5",
  tarjeta: "#ffffff",
  zona: "#f4f4f5",
  texto: "#18181b",
  suave: "#52525b",
  apagado: "#71717a",
  codigo: "#9e6512",
  azul: ["#e6f1fe", "#005bc4"],
  verde: ["#e8faf0", "#0e793c"],
  violeta: ["#f2eafa", "#6020a0"],
  gris: ["#e4e4e7", "#52525b"],
  nota: ["#fefce8", "#713f12"],
} as const;

const etiqueta = (texto: string, [fondo, tinta]: readonly [string, string]) =>
  `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${fondo};color:${tinta};font-size:11px;font-weight:700;letter-spacing:.6px;line-height:18px">${texto}</span>`;

const persona = (rol: string, nombre: string, [fondo, tinta]: readonly [string, string]) =>
  `<span style="display:inline-block;margin:0 6px 4px 0;padding:3px 10px;border-radius:999px;background:${fondo};font-size:12px;line-height:18px;color:#3f3f46"><b style="color:${tinta};font-weight:600">${rol}</b>&nbsp; ${esc(nombre)}</span>`;

const sinNadie = (texto: string) =>
  `<span style="display:inline-block;margin:0 6px 4px 0;padding:3px 10px;border-radius:999px;background:${C.gris[0]};font-size:12px;font-weight:600;line-height:18px;color:${C.gris[1]}">${texto}</span>`;

export function cuerpoCorreoHtml(d: DatosCorreo, f: FicherosCorreo): string {
  const planteamiento = esDePlanteamiento(f);
  const nota = d.nota?.trim();
  const cliente = d.cliente.trim();

  const filasOf = d.ofs
    .map((of) => {
      const desc = of.descripcion.trim();
      const quien = [
        of.autor ? persona("Autor", of.autor, C.verde) : sinNadie("Sin autor"),
        of.revisor ? persona("Revisor", of.revisor, C.violeta) : sinNadie("Sin revisión"),
      ].join("");
      return `
      <tr><td style="padding:0 0 8px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.zona};border-radius:12px"><tr><td style="padding:12px 14px 8px 14px">
          <div style="font-size:14px;color:${C.texto}"><b style="font-family:Consolas,Menlo,monospace;color:${C.codigo}">${esc(of.codigo)}</b>${desc ? `&nbsp; ${esc(desc)}` : ""}</div>
          <div style="margin-top:8px">${quien}</div>
        </td></tr></table>
      </td></tr>`;
    })
    .join("");

  const pie: [string, string][] = [];
  if (f.adjuntos.length) pie.push([f.adjuntos.length === 1 ? "Adjunto" : "Adjuntos", f.adjuntos.join(", ")]);
  if (f.impresos.length) pie.push([f.dondeImprime ? `Impreso en ${f.dondeImprime}` : "Para imprimir", f.impresos.join(", ")]);
  if (f.aMano.length) pie.push(["Para imprimir a mano (no es todo A4)", f.aMano.join(", ")]);
  pie.push(["Pasado a Producción por", d.pasadoPor]);
  const filasPie = pie
    .map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:${C.apagado};font-size:13px;vertical-align:top">${esc(k)}</td><td style="padding:3px 0;font-size:13px;color:${C.texto}">${esc(v)}</td></tr>`)
    .join("");

  return `<!doctype html><html><body style="margin:0;padding:24px 12px;background:${C.fondo};font-family:'Segoe UI',Inter,Arial,sans-serif;color:${C.texto}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.fondo}"><tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${C.tarjeta};border-radius:20px;box-shadow:0 1px 2px rgba(0,0,0,.04),0 10px 30px -14px rgba(0,0,0,.12)">
    <tr><td style="padding:24px 24px 8px 24px">
      ${etiqueta(planteamiento ? "PLANTEAMIENTO" : "IMPRESO", planteamiento ? C.azul : C.verde)}
      <div style="margin-top:12px;font-size:24px;font-weight:700;letter-spacing:-.3px;color:${C.texto}">${esc(d.pedido)}</div>${cliente ? `
      <div style="margin-top:2px;font-size:15px;color:${C.suave}">${esc(cliente)}</div>` : ""}
    </td></tr>${nota ? `
    <tr><td style="padding:8px 24px 4px 24px"><div style="padding:12px 14px;border-radius:12px;background:${C.nota[0]};color:${C.nota[1]};font-size:14px">${esc(nota).replace(/\r?\n/g, "<br>")}</div></td></tr>` : ""}${d.ofs.length ? `
    <tr><td style="padding:12px 24px 4px 24px">
      <div style="margin-bottom:8px;font-size:11px;font-weight:600;letter-spacing:.8px;color:${C.apagado}">ÓRDENES DE FABRICACIÓN · ${d.ofs.length}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${filasOf}
      </table>
    </td></tr>` : ""}
    <tr><td style="padding:8px 24px 20px 24px"><table role="presentation" cellpadding="0" cellspacing="0">${filasPie}</table></td></tr>
  </table>
  <div style="margin-top:14px;font-size:11px;color:#a1a1aa">Enviado automáticamente por Coordina</div>
  </td></tr></table>
</body></html>`;
}
