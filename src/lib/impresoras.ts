// ─── Las impresoras, vistas desde la web ─────────────────────────────────────
// Para que, si se duda de si algo salió, se vea de un vistazo si se mandó, si
// sigue en cola o si la impresora tiene un problema (Iván, 04/11/2026). Lo que
// cuenta cada impresora sale de ella misma por IPP; aquí solo se traduce.

export type IdImpresora = "produccion" | "ot";

export const NOMBRES_IMPRESORA: Record<IdImpresora, string> = {
  produccion: "Producción",
  ot: "Oficina Técnica",
};

/** Lo que dice la impresora de sí misma (printer-state de IPP: 3, 4 o 5). */
export type EstadoImpresora = "libre" | "imprimiendo" | "parada" | "sin_respuesta";

/** Cómo va un trabajo (job-state de IPP). */
export type EstadoTrabajo = "en_cola" | "retenido" | "imprimiendo" | "parado" | "cancelado" | "abortado" | "impreso";

export interface TrabajoEnImpresora {
  id: number;
  nombre: string;
  usuario: string | null;
  estado: EstadoTrabajo;
  creado: string | null;
}

export interface VistaImpresora {
  id: IdImpresora;
  nombre: string;
  modelo: string | null;
  estado: EstadoImpresora;
  /** Avisos en castellano: «Sin papel», «Atasco»… Vacío si todo va bien. */
  avisos: string[];
  /** Los tóneres que van bajos, con su nivel: «Negro 12 %». */
  tonerBajo: string[];
  /** Los papeles cargados, legibles: «A4», «A5», «A3». */
  papeles: string[];
  /** Lo que aún no ha salido, y lo último que salió. */
  pendientes: TrabajoEnImpresora[];
  recientes: TrabajoEnImpresora[];
}

export function estadoImpresora(codigo: number | null): EstadoImpresora {
  if (codigo === 3) return "libre";
  if (codigo === 4) return "imprimiendo";
  if (codigo === 5) return "parada";
  return "sin_respuesta";
}

const ESTADOS_TRABAJO: Record<number, EstadoTrabajo> = {
  3: "en_cola",
  4: "retenido",
  5: "imprimiendo",
  6: "parado",
  7: "cancelado",
  8: "abortado",
  9: "impreso",
};

export function estadoTrabajo(codigo: number | null): EstadoTrabajo | null {
  return codigo === null ? null : (ESTADOS_TRABAJO[codigo] ?? null);
}

export const TEXTO_TRABAJO: Record<EstadoTrabajo, string> = {
  en_cola: "En cola",
  retenido: "Retenido en la impresora",
  imprimiendo: "Imprimiendo",
  parado: "Parado",
  cancelado: "Cancelado",
  abortado: "Abortado",
  impreso: "Impreso",
};

/** Los motivos de IPP que se entienden en la oficina. Llegan con un sufijo de
 *  gravedad (-report, -warning, -error) que aquí no aporta. */
const MOTIVOS: Record<string, string> = {
  "media-empty": "Sin papel",
  "media-needed": "Pide papel",
  "media-low": "Queda poco papel",
  "media-jam": "Atasco de papel",
  "toner-empty": "Sin tóner",
  "toner-low": "Queda poco tóner",
  "marker-supply-empty": "Sin tóner",
  "marker-supply-low": "Queda poco tóner",
  "door-open": "Tapa abierta",
  "cover-open": "Tapa abierta",
  "input-tray-missing": "Falta una bandeja",
  "output-area-full": "Bandeja de salida llena",
  "offline": "Desconectada",
  "paused": "En pausa",
  "stopped": "Parada",
  "spool-area-full": "Memoria llena",
  "interlock-open": "Tapa abierta",
};

/** Los avisos que importan. Las Konica dicen «toner-empty-warning» con el
 *  tóner al 12 % y la impresora libre (04/11/2026): lo del tóner sale de su
 *  nivel (ver `tonerBajo`), no de aquí. Los «-report» son informativos y los
 *  que no se sabe traducir («other») no le dicen nada a nadie. */
export function avisosDe(motivos: readonly string[]): string[] {
  const salida = new Set<string>();
  for (const m of motivos) {
    if (m.endsWith("-report")) continue;
    const base = m.replace(/-(warning|error)$/, "");
    if (base === "none" || /^(toner|marker-supply)-/.test(base)) continue;
    const texto = MOTIVOS[base];
    if (texto) salida.add(texto);
  }
  return [...salida];
}

/** Qué papel hay en cada bandeja, de `media-col-ready` tal como llega (la
 *  colección aplanada: «media-source», «tray-2», …, «x-dimension», 14800,
 *  «y-dimension», 21000). Las medidas, en centésimas de milímetro. */
export function bandejasDe(valores: readonly unknown[]): Map<number, string> {
  const papeles: Record<string, string> = { "14800x21000": "A5", "21000x29700": "A4", "29700x42000": "A3" };
  const salida = new Map<number, string>();
  let bandeja: number | null = null;
  let x: number | null = null;
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i];
    if (v === "media-source") {
      const m = String(valores[i + 1] ?? "").match(/tray-(\d+)/);
      bandeja = m ? Number(m[1]) : null;
    } else if (v === "x-dimension") x = Number(valores[i + 1]);
    else if (v === "y-dimension" && bandeja !== null && x !== null) {
      const y = Number(valores[i + 1]);
      const [a, b] = x <= y ? [x, y] : [y, x];
      salida.set(bandeja, papeles[`${a}x${b}`] ?? `${Math.round(a / 100)}×${Math.round(b / 100)} mm`);
      bandeja = null;
      x = null;
    }
  }
  return salida;
}

const lista = (n: number[]) => (n.length === 1 ? `la bandeja ${n[0]}` : `las bandejas ${n.slice(0, -1).join(", ")} y ${n.at(-1)}`);

/** El papel por bandeja, de los avisos de la propia Konica
 *  (`printer-alert-description`: «No Paper Tray1», «Low Paper Tray2»). Antes
 *  salía «Sin papel» a secas y se miraba la bandeja del A4, que estaba llena
 *  (Iván, 06/11/2026): lo vacío era otra. Vacío si la impresora no los da. */
export function avisosDeBandejas(alertas: readonly string[], bandejas: ReadonlyMap<number, string>): string[] {
  const sin: number[] = [];
  const poco: number[] = [];
  for (const a of alertas) {
    const m = a.match(/^(No|Low) Paper Tray\s*(\d+)/i);
    if (!m) continue;
    (m[1].toLowerCase() === "no" ? sin : poco).push(Number(m[2]));
  }
  const conPapel = (n: number[]) => {
    const papeles = [...new Set(n.map((b) => bandejas.get(b)).filter((p): p is string => !!p))];
    return papeles.length ? ` (${papeles.join(", ")})` : "";
  };
  const salida: string[] = [];
  if (sin.length) salida.push(`Sin papel en ${lista(sin.sort((a, b) => a - b))}`);
  if (poco.length) salida.push(`Poco papel en ${lista(poco.sort((a, b) => a - b))}${conPapel(poco)}`);
  return salida;
}

const COLORES: Record<string, string> = { K: "Negro", C: "Cian", M: "Magenta", Y: "Amarillo" };

/** Los tóneres por debajo del umbral, con su color: «Negro 12 %». */
export function tonerBajo(nombres: readonly string[], niveles: readonly number[], tipos: readonly string[], umbral = 15): string[] {
  return tipos.flatMap((tipo, i) => {
    const nivel = niveles[i];
    if (tipo !== "toner" || typeof nivel !== "number" || nivel < 0 || nivel > umbral) return [];
    const color = /\(([KCMY])\)/.exec(nombres[i] ?? "")?.[1];
    return [`${color ? COLORES[color] : "Tóner"} ${nivel} %`];
  });
}

/** «iso_a4_210x297mm» → «A4». Lo que no sea un tamaño ISO se deja tal cual. */
export function papelLegible(media: string): string {
  const m = /^iso_(a\d|sra\d)_/i.exec(media);
  return m ? m[1].toUpperCase() : media;
}
