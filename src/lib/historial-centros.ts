import type { HistorialOF, RepartoRol } from "./historial";
import { SECCIONES, recursosSql, type SeccionId } from "./secciones";

export type CentroHistorialId = SeccionId | "taller";

/** Los recursos de Impresión Digital. Desde el 13/10/2026 es una sección de la
 *  web y la lista vive allí; esto se queda como nombre para el Historial, que
 *  la separa de Taller desde el 09/10. Diseño se mira ANTES en los CASE: lo
 *  que lleve su mesa sigue siendo suyo. */
export const RECURSOS_IMPRESION: readonly string[] = SECCIONES.impresion.recursos;

export const recursosImpresionSql = (): string => recursosSql(SECCIONES.impresion);

/** El nombre corto de cada centro: el de la cabecera, el de los pedidos de
 *  otro centro y el del desglose. Uno solo para que no se llame igual en un
 *  sitio y distinto en otro. */
export const CENTRO_CORTO: Record<CentroHistorialId, string> = {
  ot: SECCIONES.ot.nombreCorto,
  diseno: SECCIONES.diseno.nombreCorto,
  impresion: SECCIONES.impresion.nombreCorto,
  taller: "Taller",
};

/** RPS asocia «PLANTEAR EN TALLER» a OTEC-A, pero el trabajo es de Taller.
 *  Se mueve la tarea completa, con todas sus personas y minutos. */
export function centroDeTareaHistorial(centro: CentroHistorialId, descripcion: string | null): CentroHistorialId {
  return /^PLANTEAR\s+EN\s+TALLER\b/i.test(descripcion?.trim() ?? "") ? "taller" : centro;
}

export interface HistorialCentro {
  id: CentroHistorialId;
  nombre: string;
  totalMin: number;
  personas: RepartoRol[];
  ofs: HistorialOF[];
}

/** Qué centros enseñan el desglose por persona.
 *
 *  El de la sección consultada; si el pedido no tiene nada de ella (un pedido
 *  «Solo Taller» visto desde OT), los que sí tienen trabajo. Es la misma regla
 *  que la fila de la lista: si la fila enseña a la gente de Taller, la ficha no
 *  puede enseñar solo el total. */
export function centrosConDesglose(
  ofs: readonly HistorialOF[],
  seccion: SeccionId,
): ReadonlySet<CentroHistorialId> {
  const centros = new Set(ofs.map((of) => of.centro ?? "ot"));
  return centros.has(seccion) ? new Set([seccion]) : centros;
}

const ORDEN_CENTROS: readonly CentroHistorialId[] = ["ot", "diseno", "impresion", "taller"];

/** Para ordenar: la sección consultada primero; los demás, en el orden de siempre. */
export function rangoCentro(centro: CentroHistorialId, seccion: SeccionId): number {
  return centro === seccion ? -1 : ORDEN_CENTROS.indexOf(centro);
}

/** Cómo se llama cada centro en pantalla. */
export const NOMBRE_CENTRO: Record<CentroHistorialId, string> = {
  ot: SECCIONES.ot.nombre,
  diseno: SECCIONES.diseno.nombre,
  impresion: "Impresión digital",
  taller: "Taller",
};

/** El color de cada centro, el MISMO en toda la ficha: su franja, su punto,
 *  la raya de sus tareas, sus tiempos. La
 *  ficha era gris sobre gris, con todos los tiempos en el mismo dorado, y no
 *  se veía de un vistazo dónde se fue el trabajo.
 *
 *  OT, el dorado de la marca: es su web. Ni esmeralda ni violeta (son los de
 *  autor y revisor en toda la app), ni rojo ni ámbar (avisos). Clases
 *  literales porque Tailwind solo compila las que ve escritas. */
export const CENTRO_TONO: Record<
  CentroHistorialId,
  { punto: string; texto: string; franja: string; raya: string }
> = {
  // AZUL y no el dorado de la marca (Iván, 27/10/2026: «la rayita amarilla
  // ya es de los pedidos de la web, no la quiero también para OT»): con el
  // dorado, dentro de un pedido desplegado no se distinguía el centro OT del
  // propio pedido.
  ot: {
    punto: "bg-blue-500",
    texto: "text-blue-700 dark:text-blue-300",
    // Franja gris en claro: el crema sobre blanco se leía amarillento
    // (Iván, 15/10/2026).
    franja: "bg-[var(--franja-ot)]",
    raya: "border-blue-400/60",
  },
  diseno: {
    punto: "bg-fuchsia-500",
    texto: "text-fuchsia-700 dark:text-fuchsia-300",
    franja: "bg-[var(--franja-diseno)]",
    raya: "border-fuchsia-400/60",
  },
  impresion: {
    punto: "bg-cyan-500",
    texto: "text-cyan-700 dark:text-cyan-300",
    franja: "bg-[var(--franja-impresion)]",
    raya: "border-cyan-400/60",
  },
  taller: {
    punto: "bg-slate-500",
    texto: "text-slate-700 dark:text-slate-300",
    franja: "bg-[var(--franja-taller)]",
    raya: "border-slate-400/60",
  },
};

/** Cada OF puede aparecer en varios centros; sus minutos nunca se mezclan. */
export function agruparCentros(ofs: readonly HistorialOF[]): HistorialCentro[] {
  return (["ot", "diseno", "impresion", "taller"] as const).map((id) => ({ id, nombre: NOMBRE_CENTRO[id] })).map(({ id, nombre }) => {
    const propias = ofs.filter((of) => (of.centro ?? "ot") === id);
    const personas = new Map<string, number>();
    for (const of of propias) {
      for (const p of of.personas ?? []) {
        personas.set(p.nombre, (personas.get(p.nombre) ?? 0) + p.min);
      }
    }
    return {
      id,
      nombre,
      totalMin: propias.reduce((total, of) => total + of.tiempoImputadoMin, 0),
      personas: [...personas].map(([nombre, min]) => ({ nombre, min }))
        .sort((a, b) => b.min - a.min || a.nombre.localeCompare(b.nombre, "es")),
      ofs: propias,
    };
  });
}

export interface FilaTiempoCentro {
  orden: string | null;
  descripcion: string | null;
  centro: CentroHistorialId;
  tarea: string | null;
  descripcionTarea?: string | null;
  /** Orden de la tarea en la ruta de la OF (`CPRMOTask.Order`): el del papel
   *  de la OF que reparte Producción. No es el número de la tarea. */
  ordenRuta?: number | null;
  empleado: string | null;
  nombreEmpleado?: string | null;
  minutos: number | null;
  /** Primer y último día en que esta persona imputó a esta tarea. */
  desde?: Date | string | null;
  hasta?: Date | string | null;
}

/** Comparte el formato con los ids de fichaje, tolerando el cero de delante. */
export function claveTareaHistorial(orden: string, tarea: string): string {
  return `${orden.trim()}:${tarea.trim().replace(/^0+(?=\d)/, "")}`;
}

/** yyyy-mm-dd de lo que devuelva el driver (Date o texto), o null. */
function diaIso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  const iso = v instanceof Date ? v.toISOString() : String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null;
}

export function agruparTiemposPorCentro(
  filas: readonly FilaTiempoCentro[],
  nombreDeEmpleado: (codigo: string) => string,
): HistorialOF[] {
  const ordenes = new Map<string, HistorialOF>();
  for (const fila of filas) {
    const codigo = fila.orden?.trim();
    if (!codigo) continue;
    const clave = `${fila.centro}:${codigo}`;
    const of = ordenes.get(clave) ?? {
      codigo,
      descripcion: fila.descripcion?.trim() ?? "",
      centro: fila.centro,
      tiempoImputadoMin: 0,
      quien: [],
      personas: [],
      tareas: [],
    };
    of.tiempoImputadoMin += fila.minutos ?? 0;
    const tareaCodigo = fila.tarea?.trim();
    let tarea = of.tareas!.find((t) => t.codigo === tareaCodigo);
    if (tareaCodigo && !tarea) {
      tarea = { codigo: tareaCodigo, descripcion: fila.descripcionTarea?.trim() || "Tarea sin descripción", tiempoImputadoMin: 0, personas: [] };
      of.tareas!.push(tarea);
      if (fila.ordenRuta != null) tarea.ordenRuta = fila.ordenRuta;
    }
    if (tarea) tarea.tiempoImputadoMin += fila.minutos ?? 0;
    if (fila.empleado?.trim()) {
      const nombre = nombreDeEmpleado(fila.empleado.trim());
      if (tarea) {
        const desde = diaIso(fila.desde);
        const hasta = diaIso(fila.hasta);
        let personaTarea = tarea.personas.find((p) => p.nombre === nombre);
        if (personaTarea) personaTarea.min += fila.minutos ?? 0;
        else {
          personaTarea = { nombre, min: fila.minutos ?? 0 };
          tarea.personas.push(personaTarea);
        }
        // El rango de días se ensancha con cada fila: una persona puede venir
        // en varias (mismo nombre con dos códigos de empleado).
        if (desde && (!personaTarea.desde || desde < personaTarea.desde)) personaTarea.desde = desde;
        if (hasta && (!personaTarea.hasta || hasta > personaTarea.hasta)) personaTarea.hasta = hasta;
      }
      const persona = of.personas!.find((p) => p.nombre === nombre);
      if (persona) persona.min += fila.minutos ?? 0;
      else {
        of.personas!.push({ nombre, min: fila.minutos ?? 0 });
        of.quien.push(nombre);
      }
    }
    ordenes.set(clave, of);
  }
  // Las tareas, en el orden del papel de la OF (la ruta de RPS). Con el mismo
  // orden —pasa en unas 36 OF al año— o sin él, por el número de la tarea.
  // Sin esto salían como las agrupaba SQL Server, comparando los códigos como
  // texto: «10» antes que «9».
  const porNumero = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });
  for (const of of ordenes.values()) {
    of.tareas!.sort(
      (a, b) =>
        (a.ordenRuta ?? Number.POSITIVE_INFINITY) - (b.ordenRuta ?? Number.POSITIVE_INFINITY) ||
        porNumero(a.codigo, b.codigo),
    );
  }
  return [...ordenes.values()].sort((a, b) => porNumero(a.codigo, b.codigo));
}
