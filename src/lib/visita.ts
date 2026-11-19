// ─── Pedir visita: días, ausencias y validación (spec 2026-11-19) ───────────
// Puro: lo usan la ventana (navegador) y el servidor. Las fechas son cadenas
// ISO yyyy-mm-dd y se calcula en UTC para que el huso no mueva un día.

export type Cuando = { tipo: "pronto" } | { tipo: "dia"; fecha: string } | { tipo: "sinPrisa" };
export interface Rango { desde: string; hasta: string; nota?: string | null }
export interface Ausencias { operarioId: string; dias: number[]; rangos: Rango[] }
export interface DiaFuera { fecha: string; quien: string[] }
export interface Tramo { desde: string; hasta: string; quien: string }

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const aFecha = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const esIso = (v: unknown): v is string =>
  typeof v === "string" && ISO.test(v) && !Number.isNaN(aFecha(v).getTime()) && aFecha(v).toISOString().startsWith(v);

export function diaSemana(iso: string): number {
  return ((aFecha(iso).getUTCDay() + 6) % 7) + 1;
}

export function sumarDias(iso: string, n: number): string {
  const d = aFecha(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diasLaborables(hoy: string, semanas = 3): string[] {
  const lunes = sumarDias(hoy, 1 - diaSemana(hoy));
  const dias: string[] = [];
  for (let i = 0; i < semanas * 7; i++) {
    const d = sumarDias(lunes, i);
    if (diaSemana(d) <= 5) dias.push(d);
  }
  return dias;
}

export function ausentesPorDia(dias: string[], ausencias: Ausencias[], atienden: string[]): Record<string, string[]> {
  const por = new Map(ausencias.map((a) => [a.operarioId, a]));
  const salida: Record<string, string[]> = {};
  for (const fecha of dias) {
    const ds = diaSemana(fecha);
    salida[fecha] = atienden.filter((id) => {
      const a = por.get(id);
      return !!a && (a.dias.includes(ds) || a.rangos.some((r) => r.desde <= fecha && fecha <= r.hasta));
    });
  }
  return salida;
}

/** Lo que va al correo: lo de sus ausencias, con los retoques de esta
 *  petición encima (true = ese día no está nadie; false = ese día sí). */
export function diasNoEstamos(
  dias: string[], ausentes: Record<string, string[]>, retoques: Record<string, boolean>, atienden: string[],
): DiaFuera[] {
  const salida: DiaFuera[] = [];
  for (const fecha of dias) {
    const r = retoques[fecha];
    const quien = r === true ? [...atienden] : r === false ? [] : ausentes[fecha] ?? [];
    if (quien.length > 0) salida.push({ fecha, quien });
  }
  return salida;
}

export function unirNombres(nombres: string[]): string {
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

const siguienteLaborable = (iso: string) => {
  let d = sumarDias(iso, 1);
  while (diaSemana(d) > 5) d = sumarDias(d, 1);
  return d;
};

export function agruparDias(fuera: DiaFuera[], nombreDe: (id: string) => string): Tramo[] {
  const tramos: Tramo[] = [];
  for (const d of [...fuera].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const quien = unirNombres(d.quien.map(nombreDe));
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && ultimo.quien === quien && siguienteLaborable(ultimo.hasta) === d.fecha) ultimo.hasta = d.fecha;
    else tramos.push({ desde: d.fecha, hasta: d.fecha, quien });
  }
  return tramos;
}

const CORTO = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const LARGO = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)}/${m}`;
}
export const diaCorto = (iso: string) => `${CORTO[diaSemana(iso) - 1]} ${fechaCorta(iso)}`;
export const diaLargo = (iso: string) => `${LARGO[diaSemana(iso) - 1]} ${fechaCorta(iso)}`;

export function lineaTramo(t: Tramo): string {
  const cuando = t.desde === t.hasta ? diaCorto(t.desde) : `${fechaCorta(t.desde)} al ${fechaCorta(t.hasta)}`;
  return `${cuando} · ${t.quien}`;
}

const NOTA_AUSENCIA_MAX = 200;

export function validarAusencias(v: unknown): { dias: number[]; rangos: Rango[] } | null {
  if (typeof v !== "object" || v === null) return null;
  const { dias, rangos } = v as { dias?: unknown; rangos?: unknown };
  if (!Array.isArray(dias) || !Array.isArray(rangos) || rangos.length > 60) return null;
  if (!dias.every((d) => Number.isInteger(d) && d >= 1 && d <= 5)) return null;
  const limpios: Rango[] = [];
  for (const r of rangos as unknown[]) {
    if (typeof r !== "object" || r === null) return null;
    const { desde, hasta, nota } = r as { desde?: unknown; hasta?: unknown; nota?: unknown };
    if (!esIso(desde) || !esIso(hasta) || desde > hasta) return null;
    const n = typeof nota === "string" ? nota.trim().slice(0, NOTA_AUSENCIA_MAX) : "";
    limpios.push(n ? { desde, hasta, nota: n } : { desde, hasta });
  }
  return { dias: [...new Set(dias as number[])].sort(), rangos: limpios };
}

export interface EntradaVisita {
  pedido: string;
  cliente: string;
  solicitada: string | null;
  prioridad: number | null;
  ofs: { codigo: string; descripcion: string }[];
  viene: string;
  cuando: Cuando;
  motivo: string | null;
  atienden: string[];
  noEstamos: DiaFuera[];
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const fallo = (campo: string, error: string) => ({ ok: false as const, campo, error });

export function validarVisita(b: Record<string, unknown>):
  { ok: true; entrada: EntradaVisita } | { ok: false; campo: string; error: string } {
  const pedido = texto(b.pedido, 60);
  if (!pedido) return fallo("pedido", "Falta el pedido");
  const ofs = Array.isArray(b.ofs)
    ? (b.ofs as unknown[]).flatMap((o) => {
        if (typeof o !== "object" || o === null) return [];
        const codigo = texto((o as { codigo?: unknown }).codigo, 40);
        return codigo ? [{ codigo, descripcion: texto((o as { descripcion?: unknown }).descripcion, 200) }] : [];
      }).slice(0, 50)
    : [];
  if (ofs.length === 0) return fallo("ofs", "Marca al menos una OF");
  const viene = texto(b.viene, 80);
  if (!viene) return fallo("viene", "Escribe quién tiene que venir");
  const c = b.cuando as { tipo?: unknown; fecha?: unknown } | undefined;
  let cuando: Cuando;
  if (c?.tipo === "pronto") cuando = { tipo: "pronto" };
  else if (c?.tipo === "sinPrisa") cuando = { tipo: "sinPrisa" };
  else if (c?.tipo === "dia" && esIso(c.fecha)) cuando = { tipo: "dia", fecha: c.fecha };
  else return fallo("cuando", "Elige el día de la visita");
  const atienden = Array.isArray(b.atienden)
    ? [...new Set((b.atienden as unknown[]).filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 60))]
    : [];
  if (atienden.length === 0) return fallo("atienden", "Tiene que atenderle alguien");
  const noEstamos: DiaFuera[] = Array.isArray(b.noEstamos)
    ? (b.noEstamos as unknown[]).flatMap((d) => {
        if (typeof d !== "object" || d === null) return [];
        const { fecha, quien } = d as { fecha?: unknown; quien?: unknown };
        if (!esIso(fecha) || !Array.isArray(quien)) return [];
        const q = (quien as unknown[]).filter((x): x is string => typeof x === "string" && atienden.includes(x));
        return q.length ? [{ fecha, quien: q }] : [];
      }).slice(0, 40)
    : [];
  const motivo = texto(b.motivo, 500) || null;
  return {
    ok: true,
    entrada: {
      pedido,
      cliente: texto(b.cliente, 120),
      solicitada: esIso(b.solicitada) ? b.solicitada : null,
      prioridad: typeof b.prioridad === "number" && Number.isInteger(b.prioridad) ? b.prioridad : null,
      ofs, viene, cuando, motivo, atienden, noEstamos,
    },
  };
}
