import type { SituacionPedido } from "./consulta";
import { capitalizaFrase, nombreDeCentro } from "./publico";

// ─── Por dónde va un pedido en fábrica, y quién lo tiene ─────────────────────
// Lo segundo que pregunta un comercial, después de «¿cómo va?», es «¿quién lo
// tiene?», para poder llamarle. RPS no lo sabe: el estado de cada tarea y el
// operario están en OLANET (sch_FasesMov). Aquí, sin base de datos, se decide
// qué se dice con las tareas de RPS y el último movimiento de OLANET ya
// juntos.
//
// Puede ser más de un sitio a la vez: las tareas van en paralelo (en la OF
// 0231429 la calderería se cerró antes de empezar el corte).

/** Estados de `sch_FasesMov.IdEstadoOF` (ver lib/fases.ts). */
export const EN_CURSO = 1;
export const PAUSADA = 2;
export const FINALIZADA = 3;

export interface MovimientoFase {
  estado: number;
  /** Nombre de quien hizo el último movimiento, o null si no se pudo saber. */
  nombre: string | null;
  /** ISO yyyy-mm-dd del último movimiento. */
  desde: string | null;
}

export interface TareaConEstado {
  orden: string;
  codigo: string;
  descripcion: string;
  /** Centro de trabajo de RPS. Sin centro es una pseudo-tarea (Materiales, una
   *  nota tecleada como tarea) que nunca cierra: no cuenta. */
  centro: string | null;
  esFinalizar: boolean;
  /** Cerrada en RPS (`tgm_estadosof_olanet`, o el rescate de OT al 100 %). */
  cerrada: boolean;
  /** Último movimiento en OLANET, o null si no hay (o no contestó). */
  movimiento: MovimientoFase | null;
}

export interface PasoDonde {
  /** El paso legible: el centro con su nombre para gente de fuera, o el texto
   *  de la tarea si no tiene centro. */
  paso: string;
  tarea: string;
  quien: string | null;
  desde: string | null;
}

export interface DondeOF {
  orden: string;
  enCurso: PasoDonde[];
  pausadas: PasoDonde[];
  /** Solo cuando nadie ha empezado nada en la OF. */
  siguientes: PasoDonde[];
}

/** El número de secuencia de la tarea es su código ("5", "05"). Uno que no es
 *  número no se puede ordenar: va detrás. */
export function numeroDeTarea(codigo: string): number {
  const limpio = codigo.trim();
  return /^\d+$/.test(limpio) ? Number(limpio) : Number.POSITIVE_INFINITY;
}

const estaCerrada = (t: TareaConEstado) => t.cerrada || t.movimiento?.estado === FINALIZADA;

function pasoDe(t: TareaConEstado, conQuien: boolean): PasoDonde {
  return {
    paso: t.centro ? nombreDeCentro(t.centro) : capitalizaFrase(t.descripcion),
    tarea: capitalizaFrase(t.descripcion),
    quien: conQuien ? (t.movimiento?.nombre ?? null) : null,
    desde: conQuien ? (t.movimiento?.desde ?? null) : null,
  };
}

/** null = la OF no tiene trabajo pendiente. MISMA regla que el índice
 *  (`trabajo_abierto`): FINALIZAR cerrada manda; si no, cuenta lo que tiene
 *  centro, más FINALIZAR aunque no lo tenga. Con otra regla, un pedido que la
 *  lista da por «en fábrica» no tendría dónde estar. */
export function dondeEstaOF(orden: string, tareas: readonly TareaConEstado[]): DondeOF | null {
  if (tareas.some((t) => t.esFinalizar && estaCerrada(t))) return null;
  const abiertas = tareas.filter((t) => (t.centro || t.esFinalizar) && !estaCerrada(t));
  if (abiertas.length === 0) return null;
  const enCurso = abiertas.filter((t) => t.movimiento?.estado === EN_CURSO).map((t) => pasoDe(t, true));
  const pausadas = abiertas.filter((t) => t.movimiento?.estado === PAUSADA).map((t) => pasoDe(t, true));
  let siguientes: PasoDonde[] = [];
  // Solo si nadie ha empezado nada: con alguien trabajando o con algo en la
  // mano de alguien, lo que viene detrás no es lo que hay que contar.
  if (enCurso.length === 0 && pausadas.length === 0) {
    const minimo = Math.min(...abiertas.map((t) => numeroDeTarea(t.codigo)));
    siguientes = abiertas.filter((t) => numeroDeTarea(t.codigo) === minimo).map((t) => pasoDe(t, false));
  }
  return { orden, enCurso, pausadas, siguientes };
}

export function dondeEstaPedido(tareas: readonly TareaConEstado[]): DondeOF[] {
  const porOrden = new Map<string, TareaConEstado[]>();
  for (const t of tareas) {
    const suyas = porOrden.get(t.orden);
    if (suyas) suyas.push(t);
    else porOrden.set(t.orden, [t]);
  }
  return [...porOrden]
    .map(([orden, suyas]) => dondeEstaOF(orden, suyas))
    .filter((d): d is DondeOF => d !== null);
}

const unicos = (textos: string[]) => [...new Set(textos)];

/** Una línea para la fila: «Haciendo: Corte (Ana) · Pausado: … · Siguiente: …».
 *  Se juntan todas las OF sin repetir: en la fila no cabe una línea por OF, y
 *  la ficha ya las separa. */
export function fraseDonde(donde: readonly DondeOF[]): string | null {
  const conQuien = (p: PasoDonde) => (p.quien ? `${p.paso} (${p.quien})` : p.paso);
  const enCurso = unicos(donde.flatMap((d) => d.enCurso).map(conQuien));
  const pausadas = unicos(donde.flatMap((d) => d.pausadas).map(conQuien));
  const siguientes = unicos(donde.flatMap((d) => d.siguientes).map((p) => p.paso));
  const trozos: string[] = [];
  if (enCurso.length) trozos.push(`Haciendo: ${enCurso.join(", ")}`);
  if (pausadas.length) trozos.push(`Pausado: ${pausadas.join(", ")}`);
  if (siguientes.length) trozos.push(`Siguiente: ${siguientes.join(", ")}`);
  return trozos.length ? trozos.join(" · ") : null;
}

/** Lo que dice la fila en «dónde está». Entregado calla: la fecha de al lado
 *  ya dice «Entregado el …». En fábrica sin tareas que enseñar (RPS no
 *  contestó, o ninguna quedó abierta) se dice sin más. */
export function textoSituacion(situacion: SituacionPedido, donde: readonly DondeOF[]): string | null {
  if (situacion === "entregado") return null;
  if (situacion === "salir") return "Fabricado, esperando salir";
  return fraseDonde(donde) ?? "En fábrica";
}
