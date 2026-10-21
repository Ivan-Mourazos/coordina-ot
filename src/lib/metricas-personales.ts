import { calcularMetricas, type Metricas, type MovimientoRegistrado, type Periodo } from "./metricas";
import { leerDevolucion } from "./devolucion";

export interface IncidenciaMetricas {
  fecha: string;
  orden: string;
  familia: string;
}
export interface CuentaFamilia { familia: string; n: number }
export interface MesPersonal { mes: string; entregadas: number; correcciones: number; incidencias: number }
export interface DetalleMetricas {
  porFamilia: { familia: string; devoluciones: number; porCausa: Metricas["porCausa"]; porPaso: Metricas["porPaso"] }[];
  personal: {
    entregadas: number;
    correcciones: number;
    incidencias: number | null;
    meses: MesPersonal[];
    correccionesPorFamilia: (CuentaFamilia & { porCausa: Metricas["porCausa"] })[];
    incidenciasPorFamilia: CuentaFamilia[];
  };
  familiasDisponibles: boolean;
}

/** Una OF entregada varias veces sigue contando una. El total incluye las
 * entregadas a revisión y las dadas por buenas directamente por el autor. */
export function contarEntregas(movimientos: readonly MovimientoRegistrado[]) {
  const revision = new Set<string>();
  const total = new Set<string>();
  for (const m of movimientos) {
    if (m.motivo === "terminar_planteo") { revision.add(m.ofId); total.add(m.ofId); }
    if (m.motivo === "aprobar_sin_revision") total.add(m.ofId);
  }
  return { revision: revision.size, total: total.size };
}

/** Las correcciones pertenecen al autor de la entrega, nunca al revisor que
 * firma la devolución. El contexto anterior al filtro permite reconocerlo. */
export function calcularDetalleMetricas(
  movimientos: readonly MovimientoRegistrado[],
  historico: readonly MovimientoRegistrado[],
  familias: ReadonlyMap<string, string>,
  incidencias: readonly IncidenciaMetricas[] | null,
  miId: string,
  periodo: Periodo,
  meses: readonly string[],
  familiasDisponibles = true,
): DetalleMetricas {
  const familiaDe = (id: string) => familias.get(id) ?? "Sin familia conocida";
  const grupos = new Map<string, MovimientoRegistrado[]>();
  for (const m of movimientos) {
    const familia = familiaDe(m.ofId);
    const grupo = grupos.get(familia) ?? [];
    grupo.push(m);
    grupos.set(familia, grupo);
  }
  const porFamilia = [...grupos].map(([familia, movs]) => {
    const m = calcularMetricas(movs);
    return { familia, devoluciones: m.devoluciones, porCausa: m.porCausa, porPaso: m.porPaso };
  }).sort((a, b) => b.devoluciones - a.devoluciones || a.familia.localeCompare(b.familia));
  const clave = (m: MovimientoRegistrado) => JSON.stringify([m.at, m.ofId, m.motivo, m.operarioId]);
  const seleccion = new Set(movimientos.map(clave));
  const autores = new Map<string, string | null>();
  const entregadas = new Set<string>();
  const correcciones = new Set<string>();
  const correccionesPorFamilia = new Map<string, { ofs: Set<string>; causas: Map<number | null, Set<string>> }>();
  const calendario = new Map(meses.map((mes) => [mes, { entregadas: new Set<string>(), correcciones: new Set<string>(), incidencias: new Set<string>() }]));
  const todos = [...new Map([...historico, ...movimientos].map((m) => [clave(m), m])).values()].sort((a, b) => a.at.localeCompare(b.at));
  for (const m of todos) {
    if (m.motivo === "terminar_planteo") autores.set(m.ofId, m.operarioId ?? null);
    if (["aprobar", "aprobar_corregida", "aprobar_sin_revision", "anular", "recuperar_planteo"].includes(m.motivo)) autores.delete(m.ofId);
    if (!seleccion.has(clave(m))) continue;
    const mes = calendario.get(m.at.slice(0, 7));
    if ((m.motivo === "terminar_planteo" || m.motivo === "aprobar_sin_revision") && m.operarioId === miId) {
      entregadas.add(m.ofId);
      mes?.entregadas.add(m.ofId);
    }
    if (m.motivo === "devolver" && autores.get(m.ofId) === miId) {
      correcciones.add(m.ofId);
      mes?.correcciones.add(m.ofId);
      const familia = familiaDe(m.ofId);
      let grupo = correccionesPorFamilia.get(familia);
      if (!grupo) { grupo = { ofs: new Set(), causas: new Map() }; correccionesPorFamilia.set(familia, grupo); }
      grupo.ofs.add(m.ofId);
      const { causas } = leerDevolucion(m.observacion);
      for (const id of new Set<number | null>(causas.length ? causas : [null])) {
        let conCausa = grupo.causas.get(id);
        if (!conCausa) { conCausa = new Set(); grupo.causas.set(id, conCausa); }
        conCausa.add(m.ofId);
      }
    }
  }
  const porFamiliaDe = (filas: Iterable<string>): CuentaFamilia[] => {
    const cuenta = new Map<string, number>();
    for (const familia of filas) cuenta.set(familia, (cuenta.get(familia) ?? 0) + 1);
    return [...cuenta].map(([familia, n]) => ({ familia, n })).sort((a, b) => b.n - a.n || a.familia.localeCompare(b.familia));
  };
  const ofsIncidencia = new Map<string, string>();
  for (const i of incidencias ?? []) {
    if ((periodo.desde && i.fecha < periodo.desde) || (periodo.hasta && i.fecha > periodo.hasta)) continue;
    ofsIncidencia.set(i.orden, i.familia);
    calendario.get(i.fecha.slice(0, 7))?.incidencias.add(i.orden);
  }
  return {
    porFamilia,
    familiasDisponibles,
    personal: {
      entregadas: entregadas.size,
      correcciones: correcciones.size,
      incidencias: incidencias === null ? null : ofsIncidencia.size,
      meses: [...calendario].map(([mes, c]) => ({ mes, entregadas: c.entregadas.size, correcciones: c.correcciones.size, incidencias: c.incidencias.size })),
      correccionesPorFamilia: [...correccionesPorFamilia].map(([familia, g]) => ({
        familia, n: g.ofs.size,
        porCausa: [...g.causas].map(([id, ofs]) => ({ id, n: ofs.size })).sort((a, b) => b.n - a.n || (a.id === null ? 1 : b.id === null ? -1 : a.id - b.id)),
      })).sort((a, b) => b.n - a.n || a.familia.localeCompare(b.familia)),
      incidenciasPorFamilia: porFamiliaDe(ofsIncidencia.values()),
    },
  };
}
