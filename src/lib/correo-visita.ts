import { diaCorto, diaLargo, lineaTramo, unirNombres, type Cuando, type Tramo } from "./visita";

// ─── El correo y la nota de «Pedir visita» (spec 2026-11-19) ────────────────
// Va a Instalaciones; casi nunca responden, así que el texto no invita a
// hacerlo (el Responder a lleva a quien pide, por si acaso).

export interface DatosVisita {
  pedido: string;
  cliente: string;
  solicitada: string | null;
  prioridad: number | null;
  ofs: { codigo: string; descripcion: string }[];
  viene: string;
  cuando: Cuando;
  motivo: string | null;
  /** Nombres, no ids. */
  atienden: string[];
  noEstamos: Tramo[];
  pide: string;
}

export const PREFIJO_NOTA_VISITA = "Visita solicitada a Instalaciones";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const conQuien = (d: DatosVisita) => (d.atienden.length ? ` con ${unirNombres(d.atienden)}` : "");

export function fraseVisita(d: DatosVisita): string {
  const cola = d.cuando.tipo === "dia" ? ` el ${diaLargo(d.cuando.fecha)}` : d.cuando.tipo === "pronto" ? " lo antes posible" : "";
  return `Visita de ${d.viene} a Oficina Técnica${conQuien(d)}${cola}.`;
}

export function asuntoVisita(d: DatosVisita): string {
  const cuando = d.cuando.tipo === "dia" ? diaCorto(d.cuando.fecha) : d.cuando.tipo === "pronto" ? "lo antes posible" : null;
  return [`Visita de ${d.viene} a Oficina Técnica`, cuando, d.pedido].filter(Boolean).join(" · ");
}

const datosPedido = (d: DatosVisita) =>
  [d.solicitada ? `Solicitada: ${diaCorto(d.solicitada)}` : null, d.prioridad ? `Prioridad ${d.prioridad}` : null]
    .filter(Boolean).join(" · ");

const AVISO_DIAS = "Esos días no estamos en OT, por favor no pongáis la visita:";
const firma = (d: DatosVisita) => `Pedido desde Coordina por ${d.pide}.`;

export function cuerpoVisita(d: DatosVisita): string {
  const lineas = [fraseVisita(d), "", d.cliente ? `${d.pedido} · ${d.cliente}` : d.pedido];
  const datos = datosPedido(d);
  if (datos) lineas.push(datos);
  lineas.push("", ...d.ofs.map((o) => `${o.codigo} ${o.descripcion}`.trim()));
  if (d.motivo) lineas.push("", `Motivo: ${d.motivo}`);
  if (d.noEstamos.length) lineas.push("", AVISO_DIAS, ...d.noEstamos.map((t) => `  ${lineaTramo(t)}`));
  lineas.push("", firma(d));
  return lineas.join("\n");
}

const C = { texto: "#18181b", apagado: "#71717a", codigo: "#1f2937", caja: "#f4f4f5", rojoFondo: "#fef2f2", rojo: "#b91c1c" };
const pildora = (rotulo: string, valor: string) =>
  `<span style="display:inline-block;margin:0 6px 4px 0;padding:3px 10px;border-radius:999px;background:#fef3c7;font-size:12px;line-height:18px;color:#3f3f46"><b style="color:#92400e;font-weight:600">${esc(rotulo)}</b>&nbsp; ${esc(valor)}</span>`;

export function cuerpoVisitaHtml(d: DatosVisita): string {
  const b = (s: string) => `<b>${esc(s)}</b>`;
  const cola = d.cuando.tipo === "dia" ? ` el ${b(diaLargo(d.cuando.fecha))}` : d.cuando.tipo === "pronto" ? ` ${b("lo antes posible")}` : "";
  const con = d.atienden.length ? ` con ${b(unirNombres(d.atienden))}` : "";
  const frase = `Visita de ${b(d.viene)} a Oficina Técnica${con}${cola}.`;
  const pildoras = [
    d.solicitada ? pildora("Solicitada", diaCorto(d.solicitada)) : "",
    d.prioridad ? pildora("Prioridad", String(d.prioridad)) : "",
  ].join("");
  const ofs = d.ofs
    .map((o) => `<div style="font-size:14px;color:${C.texto}"><b style="font-family:Consolas,Menlo,monospace;color:${C.codigo}">${esc(o.codigo)}</b>${o.descripcion ? `&nbsp; ${esc(o.descripcion)}` : ""}</div>`)
    .join("");
  const motivo = d.motivo
    ? `<div style="margin-top:10px;font-size:14px;color:${C.texto}"><span style="color:${C.apagado}">Motivo:</span> ${esc(d.motivo)}</div>`
    : "";
  const dias = d.noEstamos.length
    ? `<div style="margin-top:14px;padding:12px 16px;border-radius:16px;background:${C.rojoFondo};color:${C.rojo};font-size:14px"><b>${esc(AVISO_DIAS)}</b>${d.noEstamos.map((t) => `<div style="margin-top:4px">${esc(lineaTramo(t))}</div>`).join("")}</div>`
    : "";
  return `<div style="font-family:Segoe UI,Arial,sans-serif;color:${C.texto};max-width:640px">
<p style="font-size:15px;margin:0 0 14px">${frase}</p>
<div style="padding:14px 16px;border-radius:16px;background:${C.caja}">
<div style="font-size:14px;margin-bottom:6px"><b style="font-family:Consolas,Menlo,monospace">${esc(d.pedido)}</b>${d.cliente ? `&nbsp; ${esc(d.cliente)}` : ""}</div>
<div style="margin-bottom:6px">${pildoras}</div>${ofs}${motivo}</div>${dias}
<p style="margin:16px 0 0;font-size:12px;color:${C.apagado}">${esc(firma(d))}</p>
</div>`;
}

export function notaVisita(d: DatosVisita): string {
  const cuando = d.cuando.tipo === "dia" ? `, preferible ${diaCorto(d.cuando.fecha)}` : d.cuando.tipo === "pronto" ? ", lo antes posible" : "";
  const ofs = ` OF ${d.ofs.map((o) => o.codigo).join(", ")}.`;
  const motivo = d.motivo ? ` Motivo: ${d.motivo}` : "";
  return `${PREFIJO_NOTA_VISITA}: ${d.viene}${conQuien(d)}${cuando}.${ofs}${motivo}`;
}
