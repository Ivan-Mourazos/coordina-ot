import { esCodigoPedido } from "../types";
import { getDb } from "./estado-db";

export interface FaltaLona {
  codigo: string;
  descripcion: string;
  necesita: number;
  disponible: number;
  ofs: string[];
  stock?: number;
  reservado?: number;
  reservadoPropio?: number;
}
interface Lona { codigo: string; descripcion: string; ml: number; ofs: string[]; origen: "corte" | "reserva" | "manual" }
export interface StockLona {
  pedido: string; entrega: number | null; cliente: string; ofs: string[]; lonas: Lona[]; faltas: FaltaLona[];
  consultado: string; consultadoPor: string | null;
  origen?: "web" | "plano-manual";
}
export interface AvisoLona { creadoAt: string; pasadoPor: string }
type FaltaConAviso = FaltaLona & { yaAvisado: AvisoLona | null };
type DatosStock = Pick<StockLona, "cliente" | "ofs" | "lonas" | "faltas" | "origen">;
type AvisoGuardado = AvisoLona & { entrega: number; codigo: string; necesita: number | null };

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
  const claves = ["pedido", "entrega", "cliente", "ofs", "consultado", "consultadoPor", "lonas", "faltas"];
  if (!tieneClaves(v, claves) && !tieneClaves(v, [...claves, "origen"])) return null;
  const origen = Object.hasOwn(v, "origen") ? v.origen : "web";
  if ((origen !== "web" && origen !== "plano-manual")
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
  const CLAVES_FALTA = ["codigo", "descripcion", "necesita", "disponible", "ofs"];
  const CLAVES_FALTA_CUENTA = [...CLAVES_FALTA, "stock", "reservado", "reservadoPropio"];
  const faltas: FaltaLona[] = [];
  const codigosConFalta = new Set<string>();
  for (const f of v.faltas) {
    if (!tieneClaves(f, CLAVES_FALTA) && !tieneClaves(f, CLAVES_FALTA_CUENTA)) return null;
    if (!metros(f.necesita) || !metros(f.disponible) || f.disponible >= f.necesita || !ofsDeLona(f.ofs)) return null;
    const conCuenta = Object.hasOwn(f, "stock");
    if (conCuenta && (!metros(f.stock) || !metros(f.reservado) || !metros(f.reservadoPropio))) return null;
    const base = material(f);
    if (!base || codigosConFalta.has(base.codigo)) return null;
    codigosConFalta.add(base.codigo);
    faltas.push({
      ...base,
      necesita: f.necesita,
      disponible: f.disponible,
      ofs: f.ofs.map(texto),
      ...(conCuenta ? { stock: f.stock as number, reservado: f.reservado as number, reservadoPropio: f.reservadoPropio as number } : {}),
    });
  }
  return { pedido, entrega: v.entrega, cliente: texto(v.cliente), ofs: [...ofs], lonas, faltas, origen,
    consultado, consultadoPor: v.consultadoPor === null ? null : texto(v.consultadoPor) };
}

function combinarPlano(anterior: DatosStock, nuevo: DatosStock): DatosStock {
  const nuevas = new Set(nuevo.ofs);
  const conservar = <T extends { ofs: string[] }>(lineas: T[]) => lineas.flatMap(linea => {
    const ofs = linea.ofs.filter(of => !nuevas.has(of));
    return ofs.length ? [{ ...linea, ofs }] : [];
  });
  return {
    ...nuevo,
    ofs: [...new Set([...anterior.ofs, ...nuevo.ofs])],
    lonas: [...conservar(anterior.lonas), ...nuevo.lonas],
    faltas: [...conservar(anterior.faltas), ...nuevo.faltas],
  };
}

export function guardarStockLona({ pedido, entrega, consultado, consultadoPor, origen = "web", ...datos }: StockLona, ahora = new Date()) {
  const db = getDb();
  const numeroEntrega = entrega ?? 0;
  const fecha = new Date(consultado).toISOString();
  db.transaction(() => {
    const nuevo = { ...datos, origen };
    const anterior = origen === "plano-manual" ? db.prepare(`SELECT datos, consultado FROM stock_lona_entrega
      WHERE pedido_id = ? AND entrega = ?`).get(pedido, numeroEntrega) as { datos: string; consultado: string } | undefined : undefined;
    if (anterior && fecha <= anterior.consultado) return;
    const guardado = anterior ? combinarPlano(JSON.parse(anterior.datos) as DatosStock, nuevo) : nuevo;
    db.prepare(`INSERT INTO stock_lona_entrega (pedido_id, entrega, datos, consultado, consultado_por, recibido_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(pedido_id, entrega) DO UPDATE SET datos=excluded.datos,
      consultado=excluded.consultado, consultado_por=excluded.consultado_por, recibido_at=excluded.recibido_at
      WHERE excluded.consultado > stock_lona_entrega.consultado`)
      .run(pedido, numeroEntrega, JSON.stringify(guardado), fecha, consultadoPor, ahora.toISOString());
  }).immediate();
}

export function leerComprobacionesLona(pedido: string, ofs: readonly string[]) {
  const pendientes = new Set(ofs);
  const resultado: { pedido: string; cliente: string; entrega: number; consultado: string; consultadoPor: string | null;
    faltas: FaltaConAviso[] }[] = [];
  if (!pendientes.size) return { resultado, sinComprobar: [] };
  const db = getDb();
  const filas = db.prepare(`SELECT entrega, datos, consultado, consultado_por AS consultadoPor
    FROM stock_lona_entrega WHERE pedido_id = ? ORDER BY consultado DESC, entrega DESC`).all(pedido) as
    { entrega: number; datos: string; consultado: string; consultadoPor: string | null }[];
  if (!filas.length) return { resultado, sinComprobar: [...pendientes] };
  const avisos = db.prepare(`SELECT entrega, codigo, necesita, avisado_at AS creadoAt, avisado_por AS pasadoPor
    FROM stock_lona_aviso WHERE pedido_id = ?`).all(pedido) as AvisoGuardado[];
  const avisosOF = db.prepare(`SELECT entrega, codigo, of, necesita, avisado_at AS creadoAt, avisado_por AS pasadoPor
    FROM stock_lona_aviso_of WHERE pedido_id = ?`).all(pedido) as (AvisoGuardado & { of: string })[];
  const avisoPorLona = new Map(avisos.map(aviso => [`${aviso.entrega}:${aviso.codigo}`, aviso]));
  const avisoPorOF = new Map(avisosOF.map(aviso => [`${aviso.entrega}:${aviso.codigo}:${aviso.of}`, aviso]));
  for (const { datos, ...fila } of filas) {
    const stock = JSON.parse(datos) as DatosStock;
    const cubiertas = new Set(stock.ofs.filter(of => pendientes.delete(of)));
    const faltas = stock.faltas
      .filter(f => f.ofs.some(of => cubiertas.has(of)))
      .map(f => {
        const clave = `${fila.entrega}:${f.codigo}`;
        // Tras recortar una línea compartida sigue valiendo lo que se avisó para sus OF restantes.
        const propio = f.ofs.reduce<AvisoGuardado | undefined>((ultimo, of) => {
          const aviso = avisoPorOF.get(`${clave}:${of}`);
          return aviso && (!ultimo || aviso.creadoAt > ultimo.creadoAt) ? aviso : ultimo;
        }, undefined);
        const aviso = propio ?? avisoPorLona.get(clave);
        const coincide = aviso && (aviso.necesita === null || Math.abs(aviso.necesita - f.necesita) <= 0.005 + Number.EPSILON * f.necesita);
        return { ...f, yaAvisado: coincide ? { creadoAt: aviso.creadoAt, pasadoPor: aviso.pasadoPor } : null };
      });
    if (faltas.length) resultado.push({ pedido, cliente: stock.cliente, ...fila, faltas });
    if (!pendientes.size) break;
  }
  return { resultado, sinComprobar: [...pendientes] };
}

export function leerStockLona(pedido: string, ofs: readonly string[]) {
  return leerComprobacionesLona(pedido, ofs).resultado;
}

export function registrarAvisoLona(pedido: string, entrega: number, falta: FaltaLona, operarioId: string, ts: string) {
  const db = getDb();
  db.transaction(() => {
    db.prepare(`INSERT INTO stock_lona_aviso (pedido_id, entrega, codigo, avisado_por, avisado_at, necesita)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(pedido_id, entrega, codigo) DO UPDATE SET
      avisado_por=excluded.avisado_por, avisado_at=excluded.avisado_at, necesita=excluded.necesita`)
      .run(pedido, entrega, falta.codigo, operarioId, ts, falta.necesita);
    const guardarOF = db.prepare(`INSERT INTO stock_lona_aviso_of (pedido_id, entrega, codigo, avisado_por, avisado_at, necesita, of)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(pedido_id, entrega, codigo, of) DO UPDATE SET
      avisado_por=excluded.avisado_por, avisado_at=excluded.avisado_at, necesita=excluded.necesita`);
    for (const of of falta.ofs) guardarOF.run(pedido, entrega, falta.codigo, operarioId, ts, falta.necesita, of);
  }).immediate();
}
