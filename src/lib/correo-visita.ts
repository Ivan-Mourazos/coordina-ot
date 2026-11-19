import { hoyISO } from "./types";
import { diaCorto, diaSemana, lineaTramo, sumarDias, unirNombres, type Cuando, type DiaFuera, type Tramo } from "./visita";

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
  /** Día a día, con nombres: dibuja el calendario del correo. */
  diasFuera: DiaFuera[];
  pide: string;
  /** Para el gris de los días pasados; por defecto, hoy. Los tests lo fijan. */
  hoy?: string;
}

export const PREFIJO_NOTA_VISITA = "Visita solicitada a Instalaciones";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const conQuien = (d: DatosVisita) => (d.atienden.length ? ` con ${unirNombres(d.atienden)}` : "");

// La frase no lleva fecha (Iván, 19/11): el día pedido va en su píldora y en
// el calendario, para que no se lea pegado a los nombres.
export function fraseVisita(d: DatosVisita): string {
  return `Se solicita visita de ${d.viene} a Oficina Técnica${conQuien(d)}.`;
}

// Instalaciones las busca por pedido: el asunto no lleva nada más (Iván, 19/11).
export const asuntoVisita = (d: DatosVisita): string => `Visita ${d.pedido}`;

/** «Solicitada» a secas se confundía con el día pedido para la visita. */
export const ROTULO_ENTREGA = "Fecha de entrega del pedido";

export const ROTULO_DIA_VISITA = "Día pedido para la visita";

const datosPedido = (d: DatosVisita) =>
  [d.cuando.tipo === "dia" ? `${ROTULO_DIA_VISITA}: ${diaCorto(d.cuando.fecha)}` : null,
    d.solicitada ? `${ROTULO_ENTREGA}: ${diaCorto(d.solicitada)}` : null, d.prioridad ? `Prioridad ${d.prioridad}` : null]
    .filter(Boolean).join(" · ");

const AVISO_DIAS = "Esos días no estamos en OT, por favor no pongáis la visita:";
const firma = (d: DatosVisita) => `Pedido desde Coordina por ${d.pide}.`;

export function cuerpoVisita(d: DatosVisita): string {
  const lineas = [fraseVisita(d), "", [d.pedido, d.cliente, datosPedido(d)].filter(Boolean).join(" · ")];
  lineas.push("", ...d.ofs.map((o) => `${o.codigo} ${o.descripcion}`.trim()));
  if (d.motivo) lineas.push("", `Motivo: ${d.motivo}`);
  if (d.noEstamos.length) lineas.push("", AVISO_DIAS, ...d.noEstamos.map((t) => `  ${lineaTramo(t)}`));
  lineas.push("", firma(d));
  return lineas.join("\n");
}

const C = { texto: "#18181b", apagado: "#71717a", codigo: "#1f2937", caja: "#f4f4f5", rojoFondo: "#fef2f2", rojo: "#b91c1c" };
export function cuerpoVisitaHtml(d: DatosVisita): string {
  const b = (s: string) => `<b>${esc(s)}</b>`;
  const con = d.atienden.length ? ` con ${b(unirNombres(d.atienden))}` : "";
  const frase = `Se solicita visita de ${b(d.viene)} a Oficina Técnica${con}.`;
  // Con calendario, la entrega y el día pedido ya se ven en él (Iván, 19/11):
  // arriba solo la prioridad. Sin calendario, van en texto junto al pedido.
  const conCalendario = d.noEstamos.length > 0 && mesesCalendario(d).length > 0;
  const extra = conCalendario ? (d.prioridad ? `Prioridad ${d.prioridad}` : "") : datosPedido(d);
  const ofs = d.ofs
    .map((o) => `<div style="font-size:14px;color:${C.texto}"><b style="font-family:Consolas,Menlo,monospace;color:${C.codigo}">${esc(o.codigo)}</b>${o.descripcion ? `&nbsp; ${esc(o.descripcion)}` : ""}</div>`)
    .join("");
  const motivo = d.motivo
    ? `<div style="margin-top:10px;font-size:14px;color:${C.texto}"><span style="color:${C.apagado}">Motivo:</span> ${esc(d.motivo)}</div>`
    : "";
  const dias = d.noEstamos.length
    ? `<div style="margin-top:14px;padding:12px 16px;border-radius:16px;background:${C.rojoFondo};color:${C.rojo};font-size:14px"><b>${esc(AVISO_DIAS)}</b>${calendarioHtml(d)}</div>`
    : "";
  return `<div style="font-family:Segoe UI,Arial,sans-serif;color:${C.texto};max-width:640px">
<p style="font-size:15px;margin:0 0 14px">${frase}</p>
<div style="padding:14px 16px;border-radius:16px;background:${C.caja}">
<div style="margin:0 0 10px;padding-bottom:8px;border-bottom:1px solid #e4e4e7"><span style="font-size:17px;font-weight:700;font-family:Consolas,Menlo,monospace">${esc(d.pedido)}</span>${d.cliente ? `<span style="font-size:15px;font-weight:600">&nbsp; ${esc(d.cliente)}</span>` : ""}${extra ? `<span style="font-size:13px;color:${C.apagado}">&nbsp;·&nbsp; ${esc(extra)}</span>` : ""}</div>${ofs}${motivo}</div>${dias}
<p style="margin:16px 0 0;font-size:12px;color:${C.apagado}">${esc(firma(d))}</p>
</div>`;
}

// ─── Calendario del correo ──────────────────────────────────────────────────
// Instalaciones lo mira de un vistazo, como el de la pared: los días pasados en
// gris, los que falta alguien tachados y tintados del color de esa persona, y
// la fecha de entrega del pedido marcada. Va de este mes al de la entrega, ni
// uno más (Iván, 19/11).
//
// Outlook de escritorio pinta con el motor de Word: tablas, estilos en línea y
// el atributo `bgcolor` además del `background` (el CSS de fondo a veces no lo
// respeta). Ignora `border-radius`: ahí las celdas salen cuadradas, sin más.

/** Color fuerte (✕, tachado) de cada técnico. El primero es el rojo de siempre. */
export const COLORES_TECNICO = ["#dc2626", "#2563eb", "#7c3aed", "#059669", "#ea580c", "#db2777"];
/** Tinte de fondo del día que falta una sola persona, mismo orden. */
const TINTES = ["#fee2e2", "#dbeafe", "#ede9fe", "#d1fae5", "#ffedd5", "#fce7f3"];
const MAX_MESES = 2;
const LETRAS = ["L", "M", "X", "J", "V", "S", "D"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const ENTREGA = "#18181b";
const VISITA = "#f59e0b";
const PASADO = { fondo: "#e4e4e7", num: "#a1a1aa" };

const primeroDeMes = (iso: string) => `${iso.slice(0, 7)}-01`;
function mesSiguiente(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
}

/** Meses (día 1 ISO) desde el de hoy hasta el de la entrega del pedido (o el de
 *  la visita pedida, si cayera después). Sin entrega, hasta la última ausencia.
 *  Con tope de dos. Sin nada que enseñar, ninguno. */
export function mesesCalendario(d: DatosVisita): string[] {
  const visita = d.cuando.tipo === "dia" ? d.cuando.fecha : null;
  const hasta = [
    ...(d.solicitada ? [d.solicitada] : d.diasFuera.map((x) => x.fecha)),
    ...(visita ? [visita] : []),
  ].sort();
  if (!hasta.length) return [];
  const ultimo = primeroDeMes(hasta[hasta.length - 1]);
  const primero = primeroDeMes(d.hoy ?? hoyISO());
  const meses: string[] = [];
  for (let m = primero; m <= ultimo && meses.length < MAX_MESES; m = mesSiguiente(m)) meses.push(m);
  // Entrega ya pasada: al menos el mes en curso.
  return meses.length ? meses : [primero];
}

/** Nombre → posición de color, en el orden de quien atiende para que no baile entre correos. */
function indicesPorTecnico(d: DatosVisita): Map<string, number> {
  const nombres = [...d.atienden];
  for (const x of d.diasFuera) for (const q of x.quien) if (!nombres.includes(q)) nombres.push(q);
  return new Map(nombres.map((n, i) => [n, i % COLORES_TECNICO.length]));
}

export function coloresPorTecnico(d: DatosVisita): Map<string, string> {
  return new Map([...indicesPorTecnico(d)].map(([n, i]) => [n, COLORES_TECNICO[i]]));
}

function mesHtml(mes: string, d: DatosVisita, hoy: string, fuera: Map<string, string[]>, idx: Map<string, number>): string {
  const visita = d.cuando.tipo === "dia" ? d.cuando.fecha : null;
  const celdas: (string | null)[] = Array(diaSemana(mes) - 1).fill(null);
  for (let f = mes; f.slice(0, 7) === mes.slice(0, 7); f = sumarDias(f, 1)) celdas.push(f);
  while (celdas.length % 7) celdas.push(null);
  // Alto fijo para todas: con ✕ o sin ella, las filas quedan iguales.
  const base = "width:26px;height:32px;padding:0;text-align:center;vertical-align:middle;font-size:11px;line-height:13px;";
  const filas: string[] = [];
  for (let k = 0; k < celdas.length; k += 7) {
    filas.push(`<tr>${celdas.slice(k, k + 7).map((f) => {
      if (!f) return `<td width="26" height="32" style="${base}"></td>`;
      const pasado = f < hoy;
      // Lo pasado ya no cuenta: ni ausencias ni marcas, solo gris.
      const quien = pasado ? [] : fuera.get(f) ?? [];
      const finde = diaSemana(f) > 5;
      const uno = quien.length === 1 ? idx.get(quien[0]) ?? 0 : null;
      const fondo = pasado ? PASADO.fondo : uno !== null ? TINTES[uno] : quien.length ? "#ffffff" : finde ? "#fef2f2" : "#fafafa";
      // Borde siempre de 2px (del color del fondo si no hay marca) para que no cambie el tamaño.
      const marca = pasado ? null : f === d.solicitada ? ENTREGA : f === visita ? VISITA : null;
      const borde = `2px solid ${marca ?? fondo}`;
      const colorNum = pasado ? PASADO.num : uno !== null ? COLORES_TECNICO[uno] : quien.length ? C.texto : finde ? "#d4d4d8" : C.apagado;
      const extra = `${quien.length ? "text-decoration:line-through;" : ""}${quien.length || marca ? "font-weight:700;" : ""}`;
      const num = `<div style="color:${colorNum};${extra}">${Number(f.slice(8))}</div>`;
      const equis = quien.length
        ? `<div style="font-size:${quien.length === 1 ? 13 : 10}px;line-height:13px;font-weight:700">${quien.map((q) => `<span style="color:${COLORES_TECNICO[idx.get(q) ?? 0]}">✕</span>`).join("")}</div>`
        : "";
      const titulo = quien.length ? `No está: ${quien.join(", ")}` : "";
      return `<td width="26" height="32" bgcolor="${fondo}" style="${base}background:${fondo};border:${borde};border-radius:6px" title="${esc(titulo)}">${num}${equis}</td>`;
    }).join("")}</tr>`);
  }
  const [a, m] = mes.split("-").map(Number);
  return `<table role="presentation" cellspacing="2" cellpadding="0" border="0" style="border-collapse:separate">
<tr><td colspan="7" style="padding:0 0 4px;font-size:12px;font-weight:700;color:${C.texto}">${MESES[m - 1]} ${a}</td></tr>
<tr>${LETRAS.map((l) => `<td width="26" style="width:26px;text-align:center;font-size:10px;font-weight:600;color:${C.apagado}">${l}</td>`).join("")}</tr>${filas.join("")}</table>`;
}

function calendarioHtml(d: DatosVisita): string {
  const meses = mesesCalendario(d);
  if (!meses.length) return "";
  const hoy = d.hoy ?? hoyISO();
  const fuera = new Map(d.diasFuera.map((x) => [x.fecha, x.quien]));
  const idx = indicesPorTecnico(d);
  const visita = d.cuando.tipo === "dia" ? d.cuando.fecha : null;
  const enVista = (f: string | null) => !!f && f >= hoy && meses.includes(primeroDeMes(f));
  const nombres = [...idx.keys()].filter((n) => d.diasFuera.some((x) => enVista(x.fecha) && x.quien.includes(n)));
  const caja = (color: string, fondo = "transparent") =>
    `<span style="display:inline-block;width:9px;height:9px;border:2px solid ${color};background:${fondo};border-radius:3px;vertical-align:-1px"></span>`;
  const item = (s: string) => `<span style="margin-right:10px;white-space:nowrap">${s}</span>`;
  const leyenda = [
    ...nombres.map((n) => item(`<b style="color:${COLORES_TECNICO[idx.get(n)!]}">✕</b> ${esc(n)} no está`)),
    enVista(d.solicitada) ? item(`${caja(ENTREGA)} entrega del pedido`) : "",
    enVista(visita) ? item(`${caja(VISITA)} visita pedida`) : "",
    item(`${caja(PASADO.fondo, PASADO.fondo)} ya pasado`),
  ].join("");
  // Dos meses, uno al lado del otro (tabla exterior: Outlook no hace columnas de otra forma).
  // Centrado en el recuadro: con un solo mes quedaba un hueco a la derecha.
  // `align` además del margin: Outlook solo hace caso al atributo.
  return `<table role="presentation" align="center" cellspacing="0" cellpadding="0" border="0" style="margin:10px auto 0"><tr>${meses
    .map((m, i) => `<td style="vertical-align:top;${i ? "padding-left:18px" : ""}">${mesHtml(m, d, hoy, fuera, idx)}</td>`).join("")}</tr></table>
<div style="margin-top:6px;font-size:11px;text-align:center;color:${C.texto}">${leyenda}</div>`;
}

export function notaVisita(d: DatosVisita): string {
  const cuando = d.cuando.tipo === "dia" ? `, preferible ${diaCorto(d.cuando.fecha)}` : d.cuando.tipo === "pronto" ? ", lo antes posible" : "";
  const ofs = ` OF ${d.ofs.map((o) => o.codigo).join(", ")}.`;
  const motivo = d.motivo ? ` Motivo: ${d.motivo}` : "";
  return `${PREFIJO_NOTA_VISITA}: ${d.viene}${conQuien(d)}${cuando}.${ofs}${motivo}`;
}
