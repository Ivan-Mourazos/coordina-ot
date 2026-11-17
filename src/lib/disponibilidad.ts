// ─── Disponibilidad del equipo (Bizneo) ──────────────────────────────────────
// Quién trabaja, quién está fuera y cuándo vuelve. Los datos salen de Bizneo
// (`GET /api/v1/timeline`, ver server/bizneo.ts y docs/BIZNEO-ESTUDIO.md) y
// aquí se reducen a lo único que Coordina enseña: el ESTADO del día.
//
// EL MOTIVO DE UNA AUSENCIA NO SALE DE AQUÍ. Una baja médica es un dato de
// salud (RGPD) y el resto de tipos (asuntos propios, permiso por…) tampoco son
// asunto del compañero que reparte trabajo. Lo único que se distingue es
// «Vacaciones», porque es lo que se enseña en cualquier calendario de la casa;
// todo lo demás es «Fuera». El nombre del tipo no viaja al navegador.
//
// Este fichero no importa nada de servidor: lo usan la ruta y las pantallas.

export type EstadoDia =
  /** Día de trabajo normal, en la casa. */
  | "trabaja"
  /** Día de trabajo entero desde casa. */
  | "teletrabajo"
  /** Fuera una parte del día (ausencia por horas). */
  | "parcial"
  | "vacaciones"
  /** Fuera todo el día por cualquier otro motivo (no se dice cuál). */
  | "fuera"
  | "festivo"
  /** Fin de semana o día libre de su horario. */
  | "libre"
  /** Bizneo no tiene horario para esa persona ese día. */
  | "sin_dato";

export interface DiaDisponibilidad {
  estado: EstadoDia;
  /** Una línea para el tooltip: horario, tramo de ausencia o nombre del festivo. */
  nota?: string;
}

export interface PersonaDisponibilidad {
  /** Id de Bizneo. */
  id: number;
  nombre: string;
  /** Departamento principal en Bizneo (`main_taxons`). */
  grupo: string;
  /** Operario del tablero, si es del equipo de Coordina (casado por correo). */
  operarioId: string | null;
  /** Por fecha ISO (YYYY-MM-DD). */
  dias: Record<string, DiaDisponibilidad>;
}

export interface DisponibilidadMes {
  /** YYYY-MM */
  mes: string;
  personas: PersonaDisponibilidad[];
  /** ISO de cuándo se leyó de Bizneo. */
  actualizado: string;
  /** Datos inventados para desarrollo (sin token de Bizneo). */
  demo?: boolean;
}

export type RespuestaDisponibilidad = { activo: false } | ({ activo: true } & DisponibilidadMes);

/** Quién está fuera un día concreto, y cuándo vuelve. */
export interface FueraHoy {
  id: number;
  nombre: string;
  grupo: string;
  operarioId: string | null;
  estado: Extract<EstadoDia, "vacaciones" | "fuera" | "parcial" | "teletrabajo">;
  nota?: string;
  /** Primer día de trabajo a partir de mañana, si se sabe. */
  vuelve: string | null;
}

export type RespuestaFueraHoy =
  | { activo: false }
  | { activo: true; fecha: string; fuera: FueraHoy[]; actualizado: string; demo?: boolean };

// ─── Lo que manda Bizneo (solo los campos que se leen) ───────────────────────

export interface BizneoAusenciaDia {
  name?: string | null;
  /** "6m", "2h", "1h 30m"… */
  duration?: string | null;
  /** "08:39:00", solo en las de horas. */
  start_at?: string | null;
}

export interface BizneoTurno {
  time_ranges?: { start_at?: string | null; end_at?: string | null }[] | null;
  /** false, o { type: "all_day" | …, start_at, end_at } */
  telework?: false | null | { type?: string | null; start_at?: string | null; end_at?: string | null };
}

export interface BizneoDia {
  date: string;
  kind?: string | null;
  absences?: BizneoAusenciaDia[] | null;
  shifts?: BizneoTurno[] | null;
  /** null, o el festivo (Bizneo no documenta la forma: se aceptan texto u objeto con nombre). */
  public_holiday?: null | string | { name?: string | null };
}

const KIND_AUSENCIA_COMPLETA = new Set(["absence", "loggable_absence"]);
const KIND_AUSENCIA_PARCIAL = new Set(["partial_absence", "loggable_partial_absence"]);
const KIND_TRABAJO = new Set(["working_day", "one_time_schedule"]);
const KIND_LIBRE = new Set(["day_off", "non_working_day", "one_time_day_off"]);

/** «08:00:00» → «8:00». */
export function hora(h: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(h ?? "");
  return m ? `${Number(m[1])}:${m[2]}` : null;
}

function horario(turnos: BizneoTurno[]): string | undefined {
  const tramos = turnos
    .flatMap((t) => t.time_ranges ?? [])
    .map((r) => {
      const a = hora(r.start_at);
      const b = hora(r.end_at);
      return a && b ? `${a}–${b}` : null;
    })
    .filter((x): x is string => x !== null);
  return tramos.length ? tramos.join(", ") : undefined;
}

function esVacaciones(nombre: string | null | undefined): boolean {
  return /vacaci/i.test(nombre ?? "");
}

function nombreFestivo(f: BizneoDia["public_holiday"]): string | null {
  if (!f) return null;
  if (typeof f === "string") return f;
  return f.name ?? "Festivo";
}

/** «6m» → «6 min», «2h» → «2 h». Sin formato conocido, tal cual. */
function duracion(d: string | null | undefined): string | null {
  if (!d) return null;
  return d.replace(/(\d+)\s*h/g, "$1 h").replace(/(\d+)\s*m\b/g, "$1 min").trim();
}

/** Un día de Bizneo, reducido a lo que se enseña. */
export function normalizarDia(d: BizneoDia): DiaDisponibilidad {
  const kind = d.kind ?? "";
  const ausencias = d.absences ?? [];
  const turnos = d.shifts ?? [];

  if (KIND_AUSENCIA_COMPLETA.has(kind)) {
    return { estado: ausencias.length > 0 && ausencias.every((a) => esVacaciones(a.name)) ? "vacaciones" : "fuera" };
  }
  if (KIND_AUSENCIA_PARCIAL.has(kind)) {
    // Solo la hora y cuánto: ni el tipo ni el comentario.
    const tramos = ausencias
      .map((a) => {
        const desde = hora(a.start_at);
        const cuanto = duracion(a.duration);
        if (desde && cuanto) return `desde las ${desde} (${cuanto})`;
        if (desde) return `desde las ${desde}`;
        return cuanto;
      })
      .filter((x): x is string => !!x);
    return { estado: "parcial", nota: tramos.length ? `Fuera ${tramos.join(", ")}` : "Fuera parte del día" };
  }
  const festivo = nombreFestivo(d.public_holiday);
  if (festivo) return { estado: "festivo", nota: festivo };
  if (KIND_TRABAJO.has(kind) && turnos.length > 0) {
    const enCasa = turnos.every((t) => t.telework && t.telework.type === "all_day");
    return { estado: enCasa ? "teletrabajo" : "trabaja", nota: horario(turnos) };
  }
  if (KIND_LIBRE.has(kind)) return { estado: "libre" };
  return { estado: "sin_dato" };
}

/** «PÉREZ, Ana» y «  ana  pérez » → «Ana Pérez». */
export function nombrePersona(nombre: string | null | undefined, apellidos: string | null | undefined): string {
  const limpio = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  return [limpio(nombre), limpio(apellidos)].filter(Boolean).join(" ") || "Sin nombre";
}

/** ¿Cuenta como «ese día está para trabajar»? */
export function estaDisponible(e: EstadoDia): boolean {
  return e === "trabaja" || e === "teletrabajo" || e === "parcial";
}

const ESTADOS_FUERA: ReadonlySet<EstadoDia> = new Set(["vacaciones", "fuera", "parcial", "teletrabajo"]);

/** Quién está fuera (o en casa) en `fecha`, con el día que vuelve.
 *
 *  `personas` puede traer los días de más de un mes juntos: así la vuelta de
 *  unas vacaciones que cruzan de mes se sabe. Si no hay día de trabajo dentro
 *  de lo que se tiene, `vuelve` queda en null. */
export function fueraEnFecha(personas: PersonaDisponibilidad[], fecha: string): FueraHoy[] {
  const out: FueraHoy[] = [];
  for (const p of personas) {
    const hoy = p.dias[fecha];
    if (!hoy || !ESTADOS_FUERA.has(hoy.estado)) continue;
    let vuelve: string | null = null;
    if (hoy.estado === "vacaciones" || hoy.estado === "fuera") {
      vuelve =
        Object.keys(p.dias)
          .filter((f) => f > fecha)
          .sort()
          .find((f) => estaDisponible(p.dias[f].estado)) ?? null;
    }
    out.push({
      id: p.id,
      nombre: p.nombre,
      grupo: p.grupo,
      operarioId: p.operarioId,
      estado: hoy.estado as FueraHoy["estado"],
      nota: hoy.nota,
      vuelve,
    });
  }
  // Primero los que no están en todo el día; dentro, por nombre.
  const peso: Record<FueraHoy["estado"], number> = { vacaciones: 0, fuera: 0, parcial: 1, teletrabajo: 2 };
  return out.sort((a, b) => peso[a.estado] - peso[b.estado] || a.nombre.localeCompare(b.nombre, "es"));
}

/** Junta los días de varias lecturas (p. ej. este mes y el siguiente) por persona. */
export function juntarMeses(meses: DisponibilidadMes[]): PersonaDisponibilidad[] {
  const porId = new Map<number, PersonaDisponibilidad>();
  for (const m of meses) {
    for (const p of m.personas) {
      const ya = porId.get(p.id);
      if (ya) Object.assign(ya.dias, p.dias);
      else porId.set(p.id, { ...p, dias: { ...p.dias } });
    }
  }
  return [...porId.values()];
}

/** Lo que se lee en pantalla para cada estado. */
export const ETIQUETA_ESTADO: Record<EstadoDia, string> = {
  trabaja: "Trabaja",
  teletrabajo: "Teletrabajo",
  parcial: "Fuera unas horas",
  vacaciones: "Vacaciones",
  fuera: "Ausente",
  festivo: "Festivo",
  libre: "Libre",
  sin_dato: "Sin horario",
};

/** «YYYY-MM» válido, o null. */
export function mesValido(m: string | null | undefined): string | null {
  const r = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(m ?? "");
  return r ? m! : null;
}

/** Primer y último día de un «YYYY-MM». */
export function limitesMes(mes: string): { desde: string; hasta: string } {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

/** El mes siguiente a «YYYY-MM». */
export function mesSiguiente(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}

/** El mes anterior a «YYYY-MM». */
export function mesAnterior(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}
