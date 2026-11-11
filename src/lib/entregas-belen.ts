import { sumarDias } from "./fechas";

export interface PedidoEntregaBelen {
  codigo: string;
  cliente: string | null;
  ciudad: string | null;
  fechaEntrega: string | null;
  situacion: "fabrica" | "salir";
  ofs: number;
}

/** «AR», «SA» o «BE»: Arzúa o la delegación del pedido. */
export const delegacion = (codigo: string) => codigo.slice(0, 2).toUpperCase();

export interface FiltrosEntregasBelen {
  texto: string;
  /** "" = todas. */
  delegacion: "" | "AR" | "SA" | "BE";
  desde: string;
  hasta: string;
  situacion: "" | PedidoEntregaBelen["situacion"];
  orden: "fechaEntrega" | "codigo" | "cliente" | "ciudad" | "situacion" | "ofs";
  descendente: boolean;
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");

export function filtrarEntregas(pedidos: readonly PedidoEntregaBelen[], f: FiltrosEntregasBelen): PedidoEntregaBelen[] {
  const palabras = normalizar(f.texto.trim()).split(/\s+/).filter(Boolean);
  return pedidos.filter((p) => {
    if (f.delegacion && delegacion(p.codigo) !== f.delegacion) return false;
    if (f.situacion && p.situacion !== f.situacion) return false;
    if (f.desde && (!p.fechaEntrega || p.fechaEntrega < f.desde)) return false;
    if (f.hasta && (!p.fechaEntrega || p.fechaEntrega > f.hasta)) return false;
    const texto = normalizar(`${p.codigo} ${p.cliente ?? ""} ${p.ciudad ?? ""}`);
    return palabras.every((palabra) => texto.includes(palabra));
  }).sort((a, b) => {
    const x = a[f.orden];
    const y = b[f.orden];
    if (x == null && y != null) return 1;
    if (y == null && x != null) return -1;
    const comparacion = typeof x === "number" && typeof y === "number"
      ? x - y
      : String(x ?? "").localeCompare(String(y ?? ""), "es", { numeric: true, sensitivity: "base" });
    return (f.descendente ? -comparacion : comparacion) || a.codigo.localeCompare(b.codigo);
  });
}

// ─── Grupos por día ──────────────────────────────────────────────────────────
// Belén mira «lo de hoy, lo de mañana y lo atrasado» (su hoja «Comprobar fecha
// solicitada», 10/11/2026). La fecha de entrega de Coordina ES la fecha
// solicitada del pedido (la más temprana de sus líneas), así que esta pantalla
// hace las dos cosas. Lo atrasado va aparte y plegado: hay pedidos de 2010 sin
// entregar que no deben ser lo primero que se ve.

export type IdGrupoEntrega = "atrasados" | "hoy" | "manana" | "semana" | "despues" | "sinFecha";

export interface GrupoEntregas {
  id: IdGrupoEntrega;
  titulo: string;
  pedidos: PedidoEntregaBelen[];
}

const TITULOS: Record<IdGrupoEntrega, string> = {
  atrasados: "Atrasados",
  hoy: "Hoy",
  manana: "Mañana",
  semana: "Resto de la semana",
  despues: "Más adelante",
  sinFecha: "Sin fecha de entrega",
};

/** La de siempre de Coordina (lib/fechas): aquí se reexporta para los tests. */
export { sumarDias };

/** Domingo de la semana de `iso` (la semana empieza en lunes). */
function domingoDe(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 = domingo
  return sumarDias(iso, dia === 0 ? 0 : 7 - dia);
}

/** Reparte los pedidos (ya filtrados y en orden de fecha) en grupos, sin dejar
 *  grupos vacíos. Dentro de cada grupo se respeta el orden de llegada. */
export function agruparEntregas(pedidos: readonly PedidoEntregaBelen[], hoy: string): GrupoEntregas[] {
  const manana = sumarDias(hoy, 1);
  const domingo = domingoDe(hoy);
  const grupo = (f: string | null): IdGrupoEntrega =>
    !f ? "sinFecha" : f < hoy ? "atrasados" : f === hoy ? "hoy" : f === manana ? "manana" : f <= domingo ? "semana" : "despues";
  const orden: IdGrupoEntrega[] = ["atrasados", "hoy", "manana", "semana", "despues", "sinFecha"];
  const porGrupo = new Map<IdGrupoEntrega, PedidoEntregaBelen[]>(orden.map((g) => [g, []]));
  for (const p of pedidos) porGrupo.get(grupo(p.fechaEntrega))!.push(p);
  return orden
    .filter((g) => porGrupo.get(g)!.length > 0)
    .map((g) => ({ id: g, titulo: TITULOS[g], pedidos: porGrupo.get(g)! }));
}

/** «lunes 16/11» para separar los días dentro de un grupo. */
export function diaConNombre(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const nombre = new Date(Date.UTC(a, m - 1, d)).toLocaleDateString("es-ES", { weekday: "long", timeZone: "UTC" });
  return `${nombre} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}${a !== new Date().getFullYear() ? `/${String(a).slice(2)}` : ""}`;
}
