import { esCodigoPedido } from "../types";
import { getDb } from "./estado-db";

export interface FaltaLona { codigo: string; descripcion: string; necesita: number; disponible: number }
interface Lona { codigo: string; descripcion: string; ml: number; porOf: Record<string, number> }
export interface StockLona {
  pedido: string; cliente: string; ofs: string[]; lonas: Lona[]; faltas: FaltaLona[];
  consultado: string; consultadoPor: string | null; recibidoAt: string;
}

const objeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const metros = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const texto = (v: string) => v.trim().slice(0, 250);

function material(v: Record<string, unknown>) {
  if (typeof v.codigo !== "string" || typeof v.descripcion !== "string") return null;
  const codigo = v.codigo.trim();
  return /^[A-Z0-9._/-]{1,40}$/.test(codigo) ? { codigo, descripcion: texto(v.descripcion) } : null;
}

export function validarStockLona(v: unknown): Omit<StockLona, "recibidoAt"> | null {
  if (!objeto(v) || typeof v.pedido !== "string" || typeof v.cliente !== "string"
    || typeof v.consultado !== "string" || !Number.isFinite(Date.parse(v.consultado))
    || (v.consultadoPor !== null && typeof v.consultadoPor !== "string")
    || !Array.isArray(v.ofs) || !v.ofs.every((of): of is string => typeof of === "string")
    || !Array.isArray(v.lonas) || v.lonas.length > 50 || !Array.isArray(v.faltas) || v.faltas.length > 50) return null;
  const pedido = v.pedido.trim().toUpperCase().replace(/^([A-Z]{2})(\d{2})(\d{5})$/, "$1.$2.$3");
  if (!esCodigoPedido(pedido)) return null;
  const lonas: Lona[] = [];
  for (const linea of v.lonas) {
    if (!objeto(linea) || !metros(linea.ml) || !objeto(linea.porOf)) return null;
    const base = material(linea);
    if (!base) return null;
    const reparto = Object.entries(linea.porOf);
    if (!reparto.every((par): par is [string, number] => metros(par[1]))) return null;
    lonas.push({ ...base, ml: linea.ml, porOf: Object.fromEntries(reparto) });
  }
  const faltas: FaltaLona[] = [];
  for (const f of v.faltas) {
    if (!objeto(f) || !metros(f.necesita) || !metros(f.disponible) || f.disponible >= f.necesita) return null;
    const base = material(f);
    if (!base) return null;
    faltas.push({ ...base, necesita: f.necesita, disponible: f.disponible });
  }
  return { pedido, cliente: texto(v.cliente), ofs: v.ofs.map(texto), lonas, faltas,
    consultado: new Date(v.consultado).toISOString(), consultadoPor: v.consultadoPor && texto(v.consultadoPor) };
}

export function guardarStockLona({ pedido, consultado, consultadoPor, ...datos }: Omit<StockLona, "recibidoAt">, ahora = new Date()) {
  getDb().prepare(`INSERT INTO stock_lona (pedido_id, datos, consultado, consultado_por, recibido_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(pedido_id) DO UPDATE SET datos=excluded.datos,
    consultado=excluded.consultado, consultado_por=excluded.consultado_por, recibido_at=excluded.recibido_at
    WHERE excluded.consultado >= stock_lona.consultado`)
    .run(pedido, JSON.stringify(datos), consultado, consultadoPor, ahora.toISOString());
}

export function leerStockLona(pedido: string): StockLona | null {
  const fila = getDb().prepare("SELECT datos, consultado, consultado_por AS consultadoPor, recibido_at AS recibidoAt FROM stock_lona WHERE pedido_id = ?")
    .get(pedido) as { datos: string; consultado: string; consultadoPor: string | null; recibidoAt: string } | undefined;
  if (!fila) return null;
  const { datos, ...fechas } = fila;
  return { pedido, ...JSON.parse(datos), ...fechas };
}
