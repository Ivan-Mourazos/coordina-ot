import { C, esc } from "./correo-planteamiento";
import type { FaltaLona, StockLona } from "./server/stock-lona-db";

type DatosCorreoStock = Pick<StockLona, "pedido" | "cliente" | "faltas" | "consultado">;

const formato = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2, useGrouping: "always" });
export const metrosCuenta = (n: number) => `${formato.format(n)} m`;
export const textoOFStock = (ofs: readonly string[]) => ofs.map(of => `OF ${of}`).join(", ");
function fecha(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Madrid" })
    + " " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
}

export function asuntoCorreoStock(pedido: string, cliente: string) {
  return `Falta material ${pedido}${cliente.trim() ? " · " + cliente.trim() : ""}`;
}

/** Lo que el panel y el correo cuentan de una falta, simplificado (Iván, 26/11/2026): lo que se
 * necesita, el stock disponible, los metros reservados por cada pedido y, si sumando llega pero
 * ninguna bobina sola tiene el largo, que hay stock pero ninguna bobina llega. */
export interface ResumenFalta {
  nombre: string;
  codigo: string;
  necesita: number;
  disponible: number;
  /** Sumando llega, pero ninguna bobina sola tiene el largo: la mayor. */
  bobinaMayor: number | null;
  reservas: { pedido: string; ml: number }[];
  /** Reservado por otros pedidos cuando no llega el desglose (avisos de antes). */
  reservadoSinDesglose: number;
  reservadoPropio: number;
}

export function resumenFalta(f: FaltaLona): ResumenFalta {
  // Avisos de antes del 26/11 tarde: la explicación de las bobinas iba en la descripción, tras « — ».
  const [nombre = "", ...resto] = f.descripcion.split(" — ");
  const antigua = /la mayor,\s*([\d.,]+)\s*m;\s*en total\s*([\d.,]+)\s*m/.exec(resto.join(" — "));
  const numero = (t: string) => Number(t.replace(/\./g, "").replace(",", "."));
  const bobinaMayor = f.bobinaMayor ?? (antigua ? numero(antigua[1]) : null);
  const disponible = f.bobinaMayor === undefined && antigua ? numero(antigua[2]) : f.disponible;
  const reservas = f.reservas ?? [];
  return {
    nombre: nombre.trim(), codigo: f.codigo, necesita: f.necesita, disponible, bobinaMayor, reservas,
    reservadoSinDesglose: reservas.length ? 0 : f.reservado ?? 0,
    reservadoPropio: f.reservadoPropio ?? 0,
  };
}

/** La frase de las bobinas, o null si lo que falta es stock. */
export const notaBobinas = (r: ResumenFalta) => r.bobinaMayor === null ? null
  : `Hay stock, pero ninguna bobina llega a ${metrosCuenta(r.necesita)}: la mayor tiene ${metrosCuenta(r.bobinaMayor)}.`;

function bloqueFaltaTexto(f: FaltaLona) {
  const r = resumenFalta(f);
  const lineas = [
    textoOFStock(f.ofs),
    `${r.nombre || r.codigo}${r.nombre ? ` (${r.codigo})` : ""}`,
    `Necesita: ${metrosCuenta(r.necesita)}`,
    `Stock disponible: ${metrosCuenta(r.disponible)}`,
  ];
  const nota = notaBobinas(r);
  if (nota) lineas.push(nota);
  if (r.reservas.length) lineas.push("Reservado para otros pedidos:", ...r.reservas.map(x => `  ${x.pedido}: ${metrosCuenta(x.ml)}`));
  else if (r.reservadoSinDesglose > 0) lineas.push(`Reservado para otros pedidos: ${metrosCuenta(r.reservadoSinDesglose)}`);
  if (r.reservadoPropio > 0) lineas.push(`Ya reservado para este pedido: ${metrosCuenta(r.reservadoPropio)}`);
  return lineas.join("\n");
}

function detalleFaltaHtml(f: FaltaLona) {
  const r = resumenFalta(f);
  const nota = notaBobinas(r);
  const fila = (etiqueta: string, valor: string, estilo: string) =>
    `<tr><td style="padding:3px 16px 3px 0;font-size:13px;${estilo}">${etiqueta}</td><td align="right" style="padding:3px 0;font-size:13px;white-space:nowrap;font-variant-numeric:tabular-nums;${estilo}">${valor}</td></tr>`;
  const filas = [
    fila("Necesita", metrosCuenta(r.necesita), `font-weight:700;color:${C.texto}`),
    fila("Stock disponible", metrosCuenta(r.disponible), `font-weight:700;color:${nota ? C.texto : "#c20e4d"}`),
  ];
  const reservas = r.reservas.length
    ? r.reservas.map(x => fila(`Reservado · ${esc(x.pedido)}`, metrosCuenta(x.ml), `color:${C.suave}`))
    : r.reservadoSinDesglose > 0 ? [fila("Reservado para otros pedidos", metrosCuenta(r.reservadoSinDesglose), `color:${C.suave}`)] : [];
  if (r.reservadoPropio > 0) reservas.push(fila("Ya reservado para este pedido", metrosCuenta(r.reservadoPropio), `color:${C.suave}`));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px">${filas.join("")}${reservas.join("")}</table>`
    + (nota ? `<div style="margin-top:8px;font-size:13px;font-weight:700;color:#c20e4d">${esc(nota)}</div>` : "");
}

export function cuerpoCorreoStock(s: DatosCorreoStock, nombre: string) {
  return [asuntoCorreoStock(s.pedido, s.cliente), ...s.faltas.map(bloqueFaltaTexto),
    `Stock consultado ${fecha(s.consultado)}\nPor ${nombre}`].join("\n\n");
}

export function cuerpoCorreoStockHtml(s: DatosCorreoStock, nombre: string) {
  const tarjetas = s.faltas.map(f => {
    const r = resumenFalta(f);
    return `
      <tr><td style="padding:0 0 8px 0">
        <div style="padding:0 0 6px 0;font-size:14px;font-weight:700;color:${C.texto}">${esc(textoOFStock(f.ofs))}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.fondo};border-radius:12px"><tr><td style="padding:12px 14px">
          <div style="font-size:14px;font-weight:700;color:${C.texto}">${esc(r.nombre || r.codigo)}</div>
          ${r.nombre ? `<div style="font-size:12px;font-family:Consolas,Menlo,monospace;color:${C.codigo}">${esc(r.codigo)}</div>` : ""}
          ${detalleFaltaHtml(f)}
        </td></tr></table>
      </td></tr>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(asuntoCorreoStock(s.pedido, s.cliente))}</title></head>
<body style="margin:0;padding:24px 12px;background:${C.fondo};font-family:'Segoe UI',Inter,Arial,sans-serif;color:${C.texto}">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.fondo}"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${C.tarjeta};border-radius:20px;box-shadow:0 1px 2px rgba(0,0,0,.04),0 10px 30px -14px rgba(0,0,0,.12)">

  <tr><td style="padding:24px 24px 8px 24px">
    <span style="display:inline-block;padding:3px 10px;border-radius:999px;background:#fee7ef;color:#c20e4d;font-size:11px;font-weight:700;letter-spacing:.6px;line-height:18px">FALTA MATERIAL</span>
    <div style="margin-top:12px;font-size:24px;font-weight:700;letter-spacing:-.3px;color:${C.texto}">${esc(s.pedido)}</div>
    <div style="margin-top:2px;font-size:15px;color:${C.suave}">${esc(s.cliente)}</div>
  </td></tr>

  <tr><td style="padding:12px 24px 16px 24px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">

${tarjetas}
    </table>
  </td></tr>

  <tr><td style="padding:0 24px 20px 24px">
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr><td style="padding:3px 14px 3px 0;color:${C.apagado};font-size:13px">Stock consultado</td><td style="padding:3px 0;font-size:13px">${fecha(s.consultado)}</td></tr>
      <tr><td style="padding:3px 14px 3px 0;color:${C.apagado};font-size:13px">Por</td><td style="padding:3px 0;font-size:13px">${esc(nombre)}</td></tr>
    </table>
  </td></tr>
</table>
<div style="margin-top:14px;font-size:11px;color:#a1a1aa">Enviado automáticamente por Coordina</div>
</td></tr></table>
</body></html>`;
}
