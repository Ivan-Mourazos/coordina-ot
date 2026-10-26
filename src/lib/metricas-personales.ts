import { INICIO_METRICAS, type Metricas, type MovimientoRegistrado, type Periodo } from "./metricas";
import { leerDevolucion } from "./devolucion";
import { partirOfId } from "./bonos";
import type { FilaFamiliaNc, NoConformidad, TotalesNc } from "./no-conformidad";

/** Un error de planteamiento apuntado en RPS sobre una OF. */
export interface IncidenciaMetricas {
  fecha: string;
  orden: string;
  familia: string;
  /** Código de empleado RPS de quien más fichó de OT en la OF, si se sabe. */
  autor?: string | null;
}
/** Una OF que OT cerró en RPS antes de que existiera Coordina. */
export interface PaseRps { fecha: string; orden: string; familia: string; autor: string | null }
/** `n` de cuántas, sobre `base` OF de esa familia. */
export interface CuentaFamilia { familia: string; n: number; base: number }
export type CuentaCausa = Metricas["porCausa"][number];
/** Antes de Coordina no hay devoluciones ni «sin revisión»: null, no cero. */
export interface MesPersonal { mes: string; entregadas: number; sinRevision: number | null; correcciones: number | null; incidencias: number | null }
export interface Devueltas { entregadas: number; devueltas: number; porCausa: CuentaCausa[] }
export interface DetalleMetricas {
  porFamilia: (Devueltas & { familia: string })[];
  /** Los errores de planteamiento de todo el equipo. null si RPS no contestó. */
  incidenciasOT: { total: number; base: number; porFamilia: CuentaFamilia[] } | null;
  personal: {
    entregadas: number;
    correcciones: number;
    incidencias: number | null;
    meses: MesPersonal[];
    correccionesPorFamilia: { familia: string; n: number; porCausa: CuentaCausa[] }[];
    incidenciasPorFamilia: CuentaFamilia[];
  };
  familiasDisponibles: boolean;
  /** Las OF que el EQUIPO cerró en RPS sin pasar por Coordina (antes de
   *  COORDINA_EN_USO), para que «OF terminadas» y «Realizadas» del año no
   *  empiecen en agosto. Solo volumen: antes de Coordina no hubo revisión
   *  que contar. `meses` va por "2026-03". */
  equipoRps: { ofs: number; meses: Record<string, number> };
  /** Las no conformidades de la sección en el periodo (ver
   *  `leerNcMetricas`). null si RPS no contestó o la sección no tiene; sin
   *  definir hasta que la ruta las pone. */
  nc?: NoConformidad[] | null;
  /** Las NC de toda la empresa en el periodo, como referencia (ver
   *  `leerTotalesNc`). */
  ncTotales?: TotalesNc | null;
  /** Los rectificados de la sección por familia (ver `rectificadosPorFamilia`). */
  ncFamilias?: FilaFamiliaNc[] | null;
}

/** Desde aquí toda OF de OT se pasa en Coordina. Agosto aún iba a medias:
 *  185 OF entregadas en Coordina frente a 363 que OT cerró en RPS; septiembre
 *  ya cuadra (363 frente a 392). Antes de esta fecha, una OF sin registro en
 *  Coordina se cuenta con lo que diga RPS. */
export const COORDINA_EN_USO = "2026-09-01";
const ENTREGA = new Set(["terminar_planteo", "aprobar_sin_revision"]);
/** El número de orden de RPS. Una OF con dos tareas de OT es una sola OF
 *  pasada: las incidencias van por orden y su base también. */
const ordenDe = (ofId: string) => partirOfId(ofId)?.of ?? ofId;
const enPeriodo = (fecha: string, p: Periodo) => (!p.desde || fecha >= p.desde) && (!p.hasta || fecha <= p.hasta);
const porCuenta = <T extends { n: number; familia: string }>(a: T, b: T) => b.n - a.n || a.familia.localeCompare(b.familia);
const ordenCausas = (a: CuentaCausa, b: CuentaCausa) => b.n - a.n || (a.id === null ? 1 : b.id === null ? -1 : a.id - b.id);

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

/** OF entregadas a revisión y OF devueltas, cada causa contada una vez por
 *  OF: así «Medidas · 12 %» se lee sobre las OF, y nunca pasa del 100 %.
 *  Una devuelta este mes que se entregó el anterior también es de la base: si
 *  no, «2 devueltas de 1» en el primer día del mes. */
export function contarDevueltas(movimientos: readonly MovimientoRegistrado[]): Devueltas {
  const entregadas = new Set<string>();
  const devueltas = new Set<string>();
  const causas = new Map<number | null, Set<string>>();
  for (const m of movimientos) {
    if (m.motivo === "terminar_planteo") entregadas.add(m.ofId);
    if (m.motivo !== "devolver") continue;
    devueltas.add(m.ofId);
    entregadas.add(m.ofId);
    const leidas = leerDevolucion(m.observacion).causas;
    for (const id of new Set<number | null>(leidas.length ? leidas : [null])) {
      const ofs = causas.get(id) ?? new Set<string>();
      causas.set(id, ofs.add(m.ofId));
    }
  }
  return {
    entregadas: entregadas.size,
    devueltas: devueltas.size,
    porCausa: [...causas].map(([id, ofs]) => ({ id, n: ofs.size })).sort(ordenCausas),
  };
}

/** Las correcciones pertenecen al autor de la entrega, nunca al revisor que
 * firma la devolución. El contexto anterior al filtro permite reconocerlo.
 *
 * Las OF pasadas salen de Coordina; las que no tienen registro aquí y OT cerró
 * en RPS antes de `COORDINA_EN_USO`, de RPS (Iván, 21/10/2026). Después de esa
 * fecha una OF de OT sin registro no debería existir, y no se cuenta. */
export function calcularDetalleMetricas(
  movimientos: readonly MovimientoRegistrado[],
  historico: readonly MovimientoRegistrado[],
  familias: ReadonlyMap<string, string>,
  rps: { incidencias: readonly IncidenciaMetricas[] | null; pases: readonly PaseRps[] },
  yo: { id: string; codigoRps: string | null },
  periodo: Periodo,
  meses: readonly string[],
  familiasDisponibles = true,
): DetalleMetricas {
  const familiaDe = (id: string) => familias.get(id) ?? "Sin familia conocida";
  const grupos = new Map<string, MovimientoRegistrado[]>();
  for (const m of movimientos) {
    const familia = familiaDe(m.ofId);
    grupos.set(familia, [...grupos.get(familia) ?? [], m]);
  }
  const porFamilia = [...grupos].map(([familia, movs]) => ({ familia, ...contarDevueltas(movs) }))
    .filter((f) => f.entregadas || f.devueltas)
    .sort((a, b) => b.devueltas - a.devueltas || b.entregadas - a.entregadas || a.familia.localeCompare(b.familia));

  const clave = (m: MovimientoRegistrado) => JSON.stringify([m.at, m.ofId, m.motivo, m.operarioId]);
  const seleccion = new Set(movimientos.map(clave));
  const autores = new Map<string, string | null>();
  // Quién entregó cada orden por última vez, sin el filtro del periodo: manda
  // para atribuir incidencias y para saber si RPS sobra.
  const autorCoordina = new Map<string, string | null>();
  const pasadas = new Map<string, string>();
  const mias = new Set<string>();
  const correcciones = new Set<string>();
  const correccionesPorFamilia = new Map<string, { ofs: Set<string>; causas: Map<number | null, Set<string>> }>();
  const calendario = new Map(meses.map((mes) => [mes, { entregadas: new Set<string>(), sinRevision: new Set<string>(), correcciones: new Set<string>(), incidencias: new Set<string>() }]));
  const todos = [...new Map([...historico, ...movimientos].map((m) => [clave(m), m])).values()].sort((a, b) => a.at.localeCompare(b.at));
  for (const m of todos) {
    if (m.motivo === "terminar_planteo") autores.set(m.ofId, m.operarioId ?? null);
    if (ENTREGA.has(m.motivo)) autorCoordina.set(ordenDe(m.ofId), m.operarioId ?? null);
    if (["aprobar", "aprobar_corregida", "aprobar_sin_revision", "anular", "recuperar_planteo"].includes(m.motivo)) autores.delete(m.ofId);
    if (!seleccion.has(clave(m))) continue;
    const mes = calendario.get(m.at.slice(0, 7));
    if (ENTREGA.has(m.motivo)) {
      pasadas.set(ordenDe(m.ofId), familiaDe(m.ofId));
      if (m.operarioId === yo.id) {
        mias.add(ordenDe(m.ofId));
        mes?.entregadas.add(ordenDe(m.ofId));
        if (m.motivo === "aprobar_sin_revision") mes?.sinRevision.add(m.ofId);
      }
    }
    if (m.motivo === "devolver" && autores.get(m.ofId) === yo.id) {
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
  const soyYo = (autorRps: string | null | undefined) => !!yo.codigoRps && autorRps === yo.codigoRps;
  const equipoRps = { ofs: 0, meses: {} as Record<string, number> };
  for (const p of rps.pases) {
    if (p.fecha >= COORDINA_EN_USO || !enPeriodo(p.fecha, periodo) || autorCoordina.has(p.orden) || pasadas.has(p.orden)) continue;
    pasadas.set(p.orden, p.familia);
    equipoRps.ofs++;
    equipoRps.meses[p.fecha.slice(0, 7)] = (equipoRps.meses[p.fecha.slice(0, 7)] ?? 0) + 1;
    if (soyYo(p.autor)) {
      mias.add(p.orden);
      calendario.get(p.fecha.slice(0, 7))?.entregadas.add(p.orden);
    }
  }

  const base = (ordenes: Iterable<string>) => {
    const cuenta = new Map<string, number>();
    for (const o of ordenes) { const f = pasadas.get(o); if (f) cuenta.set(f, (cuenta.get(f) ?? 0) + 1); }
    return cuenta;
  };
  const porFamiliaDe = (incidencias: Map<string, string>, bases: Map<string, number>): CuentaFamilia[] => {
    const cuenta = new Map<string, number>();
    for (const familia of incidencias.values()) cuenta.set(familia, (cuenta.get(familia) ?? 0) + 1);
    return [...cuenta].map(([familia, n]) => ({ familia, n, base: bases.get(familia) ?? 0 })).sort(porCuenta);
  };
  const delEquipo = new Map<string, string>();
  const delMio = new Map<string, string>();
  for (const i of rps.incidencias ?? []) {
    if (!enPeriodo(i.fecha, periodo)) continue;
    delEquipo.set(i.orden, i.familia);
    const mia = autorCoordina.has(i.orden) ? autorCoordina.get(i.orden) === yo.id : soyYo(i.autor);
    if (!mia) continue;
    delMio.set(i.orden, i.familia);
    calendario.get(i.fecha.slice(0, 7))?.incidencias.add(i.orden);
  }
  const antesDeCoordina = (mes: string) => mes < INICIO_METRICAS.slice(0, 7);
  return {
    porFamilia,
    familiasDisponibles,
    equipoRps,
    incidenciasOT: rps.incidencias === null ? null : {
      total: delEquipo.size,
      base: pasadas.size,
      porFamilia: porFamiliaDe(delEquipo, base(pasadas.keys())),
    },
    personal: {
      entregadas: mias.size,
      correcciones: correcciones.size,
      incidencias: rps.incidencias === null ? null : delMio.size,
      meses: [...calendario].map(([mes, c]) => ({
        mes,
        entregadas: c.entregadas.size,
        sinRevision: antesDeCoordina(mes) ? null : c.sinRevision.size,
        correcciones: antesDeCoordina(mes) ? null : c.correcciones.size,
        incidencias: rps.incidencias === null ? null : c.incidencias.size,
      })),
      correccionesPorFamilia: [...correccionesPorFamilia].map(([familia, g]) => ({
        familia, n: g.ofs.size,
        porCausa: [...g.causas].map(([id, ofs]) => ({ id, n: ofs.size })).sort(ordenCausas),
      })).sort(porCuenta),
      incidenciasPorFamilia: porFamiliaDe(delMio, base(mias)),
    },
  };
}
