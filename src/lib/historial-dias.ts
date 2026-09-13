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
  /** Cuántos pedidos tuvo el día ENTERO, lo cargado y lo que falta, o null si
   *  el servidor no lo sabe (la consulta SQL de respaldo no lo trae).
   *
   *  Contando solo lo cargado, el número crecía según bajabas: el mismo día
   *  decía 16 y al rato 24, sin que hubiera pasado nada. La lista del
   *  Historial vive entera en memoria del servidor, así que el total de cada
   *  día sale de ahí sin trabajo extra (ver `filtrarIndice`). */
  total: number | null;
  /** Faltan filas de este día por cargar. Importa para el TIEMPO: los minutos
   *  de cada fila se piden a RPS por página, no están en la lista en memoria,
   *  así que en un día a medias el tiempo es solo el de lo que se ve. */
  parcial: boolean;
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
  opciones: {
    hayMas: boolean;
    hoy: Date;
    /** Cuántos pedidos tiene cada día en la consulta entera, por clave de día.
     *  Lo manda el servidor desde la lista en memoria; sin él se cuenta lo
     *  cargado, como antes. */
    totales?: Record<string, number>;
  },
): DiaHistorial[] {
  const dias: DiaHistorial[] = [];
  for (const it of items) {
    const d = fechaDeFila(it);
    const clave = d ? claveDe(d) : "sin-fecha";
    let dia = dias.at(-1);
    if (!dia || dia.clave !== clave) {
      dia = {
        clave,
        titulo: d ? tituloDia(d, opciones.hoy) : "Sin fecha",
        items: [],
        minutos: 0,
        total: opciones.totales?.[clave] ?? null,
        parcial: false,
      };
      dias.push(dia);
    }
    dia.items.push(it);
    if (!it.otrosCentros?.length) dia.minutos += it.minutos ?? 0;
  }
  for (const dia of dias) {
    // Con total del servidor la cuenta es exacta: falta lo que falte. Sin él,
    // solo se puede sospechar del último día cargado mientras queden páginas.
    dia.parcial =
      dia.total !== null
        ? dia.items.length < dia.total
        : opciones.hayMas && dia === dias.at(-1);
  }
  return dias;
}
