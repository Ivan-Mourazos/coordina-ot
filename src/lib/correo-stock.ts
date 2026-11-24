import { C, esc } from "./correo-planteamiento";
import type { FaltaLona, StockLona } from "./server/stock-lona-db";

type DatosCorreoStock = Pick<StockLona, "pedido" | "cliente" | "faltas" | "consultado">;
type FaltaConCuenta = FaltaLona & { stock: number; reservado: number; reservadoPropio: number };

const formato = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatoCuenta = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2, useGrouping: "always" });
export const metrosStock = (n: number) => `${formato.format(n)} m`;
export const metrosCuenta = (n: number) => `${formatoCuenta.format(n)} m`;
export const faltanStock = (f: Pick<FaltaLona, "necesita" | "disponible">) =>
  Math.max(0, Math.round((f.necesita - f.disponible) * 100) / 100);
export const tieneCuentaStock = (f: FaltaLona): f is FaltaConCuenta =>
  f.stock !== undefined && f.reservado !== undefined && f.reservadoPropio !== undefined;
export const textoOFStock = (ofs: readonly string[]) => ofs.map(of => `OF ${of}`).join(", ");
function fecha(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Madrid" })
    + " " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
}

export function asuntoCorreoStock(pedido: string, cliente: string) {
  return `Falta material ${pedido}${cliente.trim() ? " · " + cliente.trim() : ""}`;
}

function bloqueFaltaTexto(f: FaltaLona) {
  if (!tieneCuentaStock(f)) {
    return `${textoOFStock(f.ofs)}\nNo llega el stock de ${f.codigo} ${f.descripcion}\nNecesita: ${metrosStock(f.necesita)} · Stock disponible: ${metrosStock(f.disponible)}`;
  }
  const lineas = [
    textoOFStock(f.ofs),
    `No llega el stock de ${f.codigo}${f.descripcion.trim() ? ` ${f.descripcion.trim()}` : ""}`,
    `Stock en almacén: ${metrosCuenta(f.stock)}`,
    `− Reservado (otros pedidos): ${metrosCuenta(f.reservado)}`,
    `= Disponible: ${metrosCuenta(f.disponible)}`,
    `Necesita este pedido: ${metrosCuenta(f.necesita)}`,
    `Faltan: ${metrosCuenta(faltanStock(f))}`,
  ];
  if (f.reservadoPropio > 0) {
    lineas.push(`Reservado para este pedido: ${metrosCuenta(f.reservadoPropio)} (no se resta)`);
  }
  return lineas.join("\n");
}

function detalleFaltaHtml(f: FaltaLona) {
  if (!tieneCuentaStock(f)) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:10px"><tr>
            <td style="padding:0 24px 0 0"><div style="font-size:11px;color:${C.apagado}">Necesita</div><div style="font-size:18px;font-weight:700;color:${C.texto}">${metrosStock(f.necesita)}</div></td>
            <td style="padding:0"><div style="font-size:11px;color:${C.apagado}">Stock disponible</div><div style="font-size:18px;font-weight:700;color:#c20e4d">${metrosStock(f.disponible)}</div></td>
          </tr></table>`;
  }
  const filas: [string, string, string][] = [
    ["Stock en almacén", metrosCuenta(f.stock), `color:${C.texto}`],
    ["− Reservado (otros pedidos)", metrosCuenta(f.reservado), `color:${C.suave}`],
    ["= Disponible", metrosCuenta(f.disponible), `font-weight:700;color:${C.texto}`],
    ["Necesita este pedido", metrosCuenta(f.necesita), `color:${C.texto}`],
    ["Faltan", metrosCuenta(faltanStock(f)), "font-weight:700;color:#c20e4d"],
  ];
  const trs = filas.map(([etiqueta, valor, estilo], i) => {
    const borde = i === 2 ? `border-top:1px solid ${C.gris[0]};padding-top:6px;` : "";
    return `<tr><td style="padding:3px 16px 3px 0;${borde}font-size:13px;${estilo}">${etiqueta}</td><td align="right" style="padding:3px 0;${borde}font-size:13px;white-space:nowrap;font-variant-numeric:tabular-nums;${estilo}">${valor}</td></tr>`;
  }).join("");
  const propio = f.reservadoPropio > 0
    ? `<div style="margin-top:8px;font-size:12px;color:${C.apagado}">Reservado para este pedido: ${metrosCuenta(f.reservadoPropio)} (no se resta)</div>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px">${trs}</table>${propio}`;
}

export function cuerpoCorreoStock(s: DatosCorreoStock, nombre: string) {
  return [asuntoCorreoStock(s.pedido, s.cliente), ...s.faltas.map(bloqueFaltaTexto),
    `Stock consultado ${fecha(s.consultado)}\nPor ${nombre}`].join("\n\n");
}

export function cuerpoCorreoStockHtml(s: DatosCorreoStock, nombre: string) {
  const tarjetas = s.faltas.map(f => `
      <tr><td style="padding:0 0 8px 0">
        <div style="padding:0 0 6px 0;font-size:14px;font-weight:700;color:${C.texto}">${esc(textoOFStock(f.ofs))}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.fondo};border-radius:12px"><tr><td style="padding:12px 14px">
          <div style="font-size:14px;color:${C.texto}">No llega el stock de <b style="font-family:Consolas,Menlo,monospace;color:${C.codigo}">${esc(f.codigo)}</b>&nbsp; ${esc(f.descripcion)}</div>
          ${detalleFaltaHtml(f)}
        </td></tr></table>
      </td></tr>`).join("");
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
