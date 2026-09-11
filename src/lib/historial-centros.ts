import type { HistorialOF, RepartoRol } from "./historial";
import { SECCIONES, type SeccionId } from "./secciones";

export type CentroHistorialId = SeccionId | "taller";

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

const ORDEN_CENTROS: readonly CentroHistorialId[] = ["ot", "diseno", "taller"];

/** Para ordenar: la sección consultada primero; los demás, en el orden de siempre. */
export function rangoCentro(centro: CentroHistorialId, seccion: SeccionId): number {
  return centro === seccion ? -1 : ORDEN_CENTROS.indexOf(centro);
}

/** Cada OF puede aparecer en varios centros; sus minutos nunca se mezclan. */
export function agruparCentros(ofs: readonly HistorialOF[]): HistorialCentro[] {
  return [
    { id: "ot" as const, nombre: SECCIONES.ot.nombre },
    { id: "diseno" as const, nombre: SECCIONES.diseno.nombre },
    { id: "taller" as const, nombre: "Taller" },
  ].map(({ id, nombre }) => {
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
  empleado: string | null;
  nombreEmpleado?: string | null;
  minutos: number | null;
}

/** Comparte el formato con los ids de fichaje, tolerando el cero de delante. */
export function claveTareaHistorial(orden: string, tarea: string): string {
  return `${orden.trim()}:${tarea.trim().replace(/^0+(?=\d)/, "")}`;
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
    }
    if (tarea) tarea.tiempoImputadoMin += fila.minutos ?? 0;
    if (fila.empleado?.trim()) {
      const nombre = nombreDeEmpleado(fila.empleado.trim());
      if (tarea) {
        const personaTarea = tarea.personas.find((p) => p.nombre === nombre);
        if (personaTarea) personaTarea.min += fila.minutos ?? 0;
        else tarea.personas.push({ nombre, min: fila.minutos ?? 0 });
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
  return [...ordenes.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
}
