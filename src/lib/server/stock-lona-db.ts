import { esCodigoPedido } from "../types";
import { getDb } from "./estado-db";

export interface FaltaLona { codigo: string; descripcion: string; necesita: number; disponible: number; ofs: string[] }
interface Lona { codigo: string; descripcion: string; ml: number; ofs: string[]; origen: "corte" | "reserva" | "manual" }
export interface StockLona {
  pedido: string; entrega: number | null; cliente: string; ofs: string[]; lonas: Lona[]; faltas: FaltaLona[];
  consultado: string; consultadoPor: string | null;
}
export interface AvisoLona { creadoAt: string; pasadoPor: string }
type FaltaConAviso = FaltaLona & { yaAvisado: AvisoLona | null };

function tieneClaves(v: unknown, claves: string[]): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
    && Object.keys(v).length === claves.length && claves.every(clave => Object.hasOwn(v, clave));
}

const metros = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const texto = (v: string) => v.trim().slice(0, 250);
const codigosOF = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(of => typeof of === "string" && of.trim().length > 0 && of.trim().length <= 250);

function fechaISO(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const fecha = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(v);
  if (!fecha || !Number.isFinite(Date.parse(v)) || !Number.isFinite(Date.parse(fecha[1]))) return null;
  if (!new Date(fecha[1]).toISOString().startsWith(fecha[1]) || v.slice(11, 13) === "24") return null;
  return new Date(v).toISOString();
}

function material(v: Record<string, unknown>) {
  if (typeof v.codigo !== "string" || typeof v.descripcion !== "string") return null;
  const codigo = v.codigo.trim();
  return /^[A-Z0-9._/-]{1,40}$/.test(codigo) ? { codigo, descripcion: texto(v.descripcion) } : null;
}

export function validarStockLona(v: unknown): StockLona | null {
  if (!tieneClaves(v, ["pedido", "entrega", "cliente", "ofs", "consultado", "consultadoPor", "lonas", "faltas"])
    || typeof v.pedido !== "string" || typeof v.cliente !== "string"
    || (v.consultadoPor !== null && typeof v.consultadoPor !== "string")
    || (v.entrega !== null && (typeof v.entrega !== "number" || !Number.isSafeInteger(v.entrega) || v.entrega < 0))
    || !codigosOF(v.ofs)
    || !Array.isArray(v.lonas) || v.lonas.length > 50 || !Array.isArray(v.faltas) || v.faltas.length > 50) return null;
  const consultado = fechaISO(v.consultado);
  const pedido = v.pedido.trim().toUpperCase().replace(/^([A-Z]{2})(\d{2})(\d{5})$/, "$1.$2.$3");
  if (!consultado || !esCodigoPedido(pedido)) return null;

  const ofs = new Set(v.ofs.map(texto));
  const ofsDeLona = (valor: unknown): valor is string[] =>
    codigosOF(valor) && valor.every(of => ofs.has(texto(of)));
  const lonas: Lona[] = [];
  for (const linea of v.lonas) {
    if (!tieneClaves(linea, ["codigo", "descripcion", "ml", "ofs", "origen"])
      || !metros(linea.ml) || !ofsDeLona(linea.ofs)
      || (linea.origen !== "corte" && linea.origen !== "reserva" && linea.origen !== "manual")) return null;
    const base = material(linea);
    if (!base) return null;
    lonas.push({ ...base, ml: linea.ml, ofs: linea.ofs.map(texto), origen: linea.origen });
  }
  const faltas: FaltaLona[] = [];
  const codigosConFalta = new Set<string>();
  for (const f of v.faltas) {
    if (!tieneClaves(f, ["codigo", "descripcion", "necesita", "disponible", "ofs"])
      || !metros(f.necesita) || !metros(f.disponible) || f.disponible >= f.necesita || !ofsDeLona(f.ofs)) return null;
    const base = material(f);
    if (!base || codigosConFalta.has(base.codigo)) return null;
    codigosConFalta.add(base.codigo);
    faltas.push({ ...base, necesita: f.necesita, disponible: f.disponible, ofs: f.ofs.map(texto) });
  }
  return { pedido, entrega: v.entrega, cliente: texto(v.cliente), ofs: [...ofs], lonas, faltas,
    consultado, consultadoPor: v.consultadoPor === null ? null : texto(v.consultadoPor) };
}

export function guardarStockLona({ pedido, entrega, consultado, consultadoPor, ...datos }: StockLona, ahora = new Date()) {
  getDb().prepare(`INSERT INTO stock_lona_entrega (pedido_id, entrega, datos, consultado, consultado_por, recibido_at)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(pedido_id, entrega) DO UPDATE SET datos=excluded.datos,
    consultado=excluded.consultado, consultado_por=excluded.consultado_por, recibido_at=excluded.recibido_at
    WHERE excluded.consultado > stock_lona_entrega.consultado`)
    .run(pedido, entrega ?? 0, JSON.stringify(datos), new Date(consultado).toISOString(), consultadoPor, ahora.toISOString());
}

export function leerStockLona(pedido: string, ofs: readonly string[]) {
  if (!ofs.length) return [];
  const db = getDb();
  const filas = db.prepare(`SELECT entrega, datos, consultado, consultado_por AS consultadoPor
    FROM stock_lona_entrega WHERE pedido_id = ? ORDER BY consultado DESC, entrega DESC`).all(pedido) as
    { entrega: number; datos: string; consultado: string; consultadoPor: string | null }[];
  if (!filas.length) return [];
  const avisos = db.prepare(`SELECT entrega, codigo, avisado_at AS creadoAt, avisado_por AS pasadoPor
    FROM stock_lona_aviso WHERE pedido_id = ?`).all(pedido) as (AvisoLona & { entrega: number; codigo: string })[];
  const avisoPorLona = new Map(avisos.map(({ entrega, codigo, ...aviso }) => [`${entrega}:${codigo}`, aviso]));
  const pendientes = new Set(ofs);
  const resultado: { pedido: string; cliente: string; entrega: number; consultado: string; consultadoPor: string | null;
    faltas: FaltaConAviso[] }[] = [];
  for (const { datos, ...fila } of filas) {
    const stock = JSON.parse(datos) as Pick<StockLona, "cliente" | "ofs" | "faltas">;
    const cubiertas = new Set(stock.ofs.filter(of => pendientes.delete(of)));
    const faltas = stock.faltas
      .filter(f => f.ofs.some(of => cubiertas.has(of)))
      .map(f => ({ ...f, yaAvisado: avisoPorLona.get(`${fila.entrega}:${f.codigo}`) ?? null }));
    if (faltas.length) resultado.push({ pedido, cliente: stock.cliente, ...fila, faltas });
    if (!pendientes.size) break;
  }
  return resultado;
}

export function registrarAvisoLona(pedido: string, entrega: number, codigo: string, operarioId: string, ts: string) {
  getDb().prepare(`INSERT INTO stock_lona_aviso (pedido_id, entrega, codigo, avisado_por, avisado_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(pedido_id, entrega, codigo) DO UPDATE SET
    avisado_por=excluded.avisado_por, avisado_at=excluded.avisado_at`).run(pedido, entrega, codigo, operarioId, ts);
}
