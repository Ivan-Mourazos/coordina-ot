// ─── Fechas en lenguaje de taller ────────────────────────────────────────────
// En OT las fechas se leen para decidir "¿esto es para hoy o puede esperar?".
// Un "05/08" obliga a comparar mentalmente con el calendario cada vez; "Hoy",
// "Mañana" o "-3 d" se leen de un vistazo. Aquí vive esa traducción, aparte de
// los componentes para poder probarla sin pintar nada.

/** Cómo de urgente es una fecha respecto a hoy. Los componentes eligen el
 *  color; aquí solo se dice en qué situación está. */
export type TonoFecha = "vencida" | "hoy" | "proxima" | "lejana";

export interface FechaRelativa {
  /** Diferencia en días naturales: negativo = ya pasó. */
  dias: number;
  /** Texto corto para la celda: "Hoy", "Mañana", "-3 d", "12/08". */
  etiqueta: string;
  /** Texto largo para el `title`: "hace 3 días (05/08/2026)". */
  completa: string;
  tono: TonoFecha;
}

const MS_DIA = 86_400_000;

/** Días naturales entre dos fechas ISO (yyyy-mm-dd). Se anclan a mediodía UTC
 *  para que ni el cambio de hora ni la zona del navegador desplacen el conteo
 *  (el server despliega en UTC y los técnicos miran desde Europe/Madrid). */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T12:00:00Z`);
  const b = Date.parse(`${hasta}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / MS_DIA);
}

/** Suma días a una fecha ISO, sea `yyyy-mm-dd` o un timestamp completo, y
 *  devuelve el mismo formato que recibió. Se opera en UTC, que no tiene cambio
 *  de hora: sumar 24 h por día es exacto ahí y no lo sería en local. */
export function sumarDias(iso: string, dias: number): string {
  const soloFecha = iso.length === 10;
  const t = Date.parse(soloFecha ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(t)) return iso;
  const movida = new Date(t + dias * MS_DIA).toISOString();
  return soloFecha ? movida.slice(0, 10) : movida;
}

/** dd/mm — el formato con el que se habla de fechas en el taller. */
export function fmtDiaMes(iso: string): string {
  const [, m, d] = iso.split("-");
  return m && d ? `${d}/${m}` : iso;
}

/** dd/mm/aaaa, para los `title` donde sí importa el año. */
export function fmtFechaLarga(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/** Lee una fecha en relación a hoy.
 *
 *  El "atrasado" del tablero era un badge rojo que salía en casi todas las
 *  filas (basta con que la planificación sea de ayer), así que dejaba de
 *  avisar de nada. Aquí el atraso se GRADÚA: "-1 d" y "-28 d" no son el mismo
 *  problema, y el que lo mira necesita distinguirlos sin abrir el pedido. */
export function relativoA(iso: string, hoy: string): FechaRelativa {
  const dias = diasEntre(hoy, iso);
  const larga = fmtFechaLarga(iso);
  if (dias < 0) {
    const n = -dias;
    return {
      dias,
      etiqueta: `-${n} d`,
      completa: `${n === 1 ? "hace 1 día" : `hace ${n} días`} (${larga})`,
      tono: "vencida",
    };
  }
  if (dias === 0) return { dias, etiqueta: "Hoy", completa: `hoy (${larga})`, tono: "hoy" };
  if (dias === 1)
    return { dias, etiqueta: "Mañana", completa: `mañana (${larga})`, tono: "proxima" };
  if (dias <= 6)
    return {
      dias,
      etiqueta: `+${dias} d`,
      completa: `dentro de ${dias} días (${larga})`,
      tono: "proxima",
    };
  return { dias, etiqueta: fmtDiaMes(iso), completa: larga, tono: "lejana" };
}

/** Cabecera de un día de agenda: "Hoy · miércoles 5 ago". */
export function tituloDia(iso: string | null, hoy: string): { titulo: string; sub: string } {
  if (!iso) return { titulo: "Sin fecha", sub: "no planificada" };
  const dias = diasEntre(hoy, iso);
  const fecha = new Date(`${iso}T12:00:00Z`);
  const largo = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
    .format(fecha)
    .replace(".", "");
  const titulo = dias === 0 ? "Hoy" : dias === 1 ? "Mañana" : dias === -1 ? "Ayer" : null;
  if (titulo) return { titulo, sub: largo };
  // Sin el año salvo que sea otro año: repetir "07/08/2026" al lado de
  // "Viernes, 7 ago" es decir dos veces lo mismo, y en el historial —donde sí
  // hay fechas de otros años— es justo el dato que falta.
  const otroAno = iso.slice(0, 4) !== hoy.slice(0, 4);
  return {
    titulo: `${largo[0].toUpperCase()}${largo.slice(1)}`,
    sub: otroAno ? iso.slice(0, 4) : "",
  };
}
