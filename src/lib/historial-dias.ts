import type { HistorialItem } from "./historial";

// ─── El Historial, por días ──────────────────────────────────────────────────
// La lista va ordenada por la fecha en que se pasó, así que repetir "11/09/26"
// en cuarenta filas seguidas era ruido. Se agrupa por día con un separador que
// dice cuántos pedidos salieron y cuánto tiempo de la sección llevaron: el día
// se lee como un parte de trabajo.

export interface DiaHistorial {
  /** yyyy-mm-dd local, o "sin-fecha". */
  clave: string;
  titulo: string;
  items: HistorialItem[];
  /** Tiempo de la sección del día. Los «Solo Taller» no suman: su tiempo es
   *  de otro centro y mezclarlo inflaría el día de OT. */
  minutos: number;
  /** El último día cargado cuando aún quedan páginas: puede tener más. */
  incompleto: boolean;
}

const claveDe = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** La fecha que ordena la fila: cuándo se pasó en CoordinaOT o, si no, cuándo
 *  cerró RPS. La misma que usa la consulta para ordenar. */
export function fechaDeFila(it: Pick<HistorialItem, "pasadoAt" | "finalizada">): Date | null {
  const iso = it.pasadoAt ?? it.finalizada;
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Hoy, jueves 11/09/26", "Ayer, …" o "Martes 09/09/26". */
export function tituloDia(d: Date, hoy: Date): string {
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  const dia = d.toLocaleDateString("es-ES", { weekday: "long" });
  const fecha = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const texto = `${dia} ${fecha}`;
  if (claveDe(d) === claveDe(hoy)) return `Hoy, ${texto}`;
  if (claveDe(d) === claveDe(ayer)) return `Ayer, ${texto}`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Agrupa en el orden en que llegan (ya vienen de más reciente a más antiguo):
 *  un día nuevo empieza cuando cambia la fecha. */
export function agruparPorDia(
  items: readonly HistorialItem[],
  opciones: { hayMas: boolean; hoy: Date },
): DiaHistorial[] {
  const dias: DiaHistorial[] = [];
  for (const it of items) {
    const d = fechaDeFila(it);
    const clave = d ? claveDe(d) : "sin-fecha";
    let dia = dias.at(-1);
    if (!dia || dia.clave !== clave) {
      dia = { clave, titulo: d ? tituloDia(d, opciones.hoy) : "Sin fecha", items: [], minutos: 0, incompleto: false };
      dias.push(dia);
    }
    dia.items.push(it);
    if (!it.otrosCentros?.length) dia.minutos += it.minutos ?? 0;
  }
  if (opciones.hayMas && dias.length > 0) dias[dias.length - 1].incompleto = true;
  return dias;
}
