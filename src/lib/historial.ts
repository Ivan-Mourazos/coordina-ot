// ─── Historial permanente: tipos + lógica pura (client-safe) ─────────────────
// Sin acceso a BD: solo los tipos que comparten API y UI, el constructor de
// cláusulas de filtro (parametrizadas, NUNCA interpoladas) y el mapeo de fila.

export const PAGE_SIZE = 40;

/** Códigos de pedido de cualquier serie (AR/BE/SA…): 2 letras . 2 díg . 5 díg. */
export const CODIGO_PEDIDO_RE = /^[A-Z]{2}\.\d{2}\.\d{5}$/;

export interface HistorialFiltros {
  page: number;
  q?: string; // busca en código de pedido o nombre de cliente
  desde?: string; // ISO yyyy-mm-dd (inclusive)
  hasta?: string; // ISO yyyy-mm-dd (exclusivo)
}

export interface HistorialItem {
  pedido: string;
  cliente: string | null;
  finalizada: string; // ISO
  nOf: number;
}

export interface HistorialOF {
  codigo: string;
  descripcion: string;
  tiempoImputadoMin: number;
  quien: string[]; // nombres (operario mapeado o código de empleado)
}

/** Fila cruda de la query de página (antes de mapear). */
export interface FilaPagina {
  pedido: string;
  finalizada: Date | string | null;
  cliente: string | null;
  n_of: number;
}

/** Cláusulas AND parametrizadas para el WHERE de la página. Los valores van
 *  como params mssql (request.input), nunca interpolados. */
export function construirFiltros(f: HistorialFiltros): {
  clausulas: string[];
  params: Array<{ nombre: string; valor: string }>;
} {
  const clausulas: string[] = [];
  const params: Array<{ nombre: string; valor: string }> = [];

  const q = f.q?.trim();
  if (q) {
    clausulas.push("(p.pedido LIKE @q OR cli.Description LIKE @q)");
    params.push({ nombre: "q", valor: `%${q}%` });
  }
  if (f.desde?.trim()) {
    clausulas.push("p.finalizada >= @desde");
    params.push({ nombre: "desde", valor: f.desde.trim() });
  }
  if (f.hasta?.trim()) {
    clausulas.push("p.finalizada < @hasta");
    params.push({ nombre: "hasta", valor: f.hasta.trim() });
  }
  return { clausulas, params };
}

export function filaAItem(fila: FilaPagina): HistorialItem {
  const finalizada =
    fila.finalizada instanceof Date
      ? fila.finalizada.toISOString()
      : (fila.finalizada ?? "");
  return {
    pedido: (fila.pedido ?? "").trim(),
    cliente: fila.cliente,
    finalizada,
    nOf: fila.n_of ?? 0,
  };
}
