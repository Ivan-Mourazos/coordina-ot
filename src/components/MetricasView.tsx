"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ErrorCarga } from "./ErrorCarga";
import { INICIO_METRICAS, periodoAnterior, periodoDeMes, proporcionDevueltas, sinActividad, type MesMetricas, type Metricas, type Tramo } from "@/lib/metricas";
import { sumarDias } from "@/lib/fechas";
import type { CuadroMetricas } from "@/lib/metricas-cuadro";
import { hoyISO, type Operario } from "@/lib/types";
import { CAUSAS } from "@/lib/anulacion";
import { fmtMin } from "@/lib/estado";
import type { CausaDevolucion } from "@/lib/causas-cliente";
import { SECCIONES, type SeccionId } from "@/lib/secciones";
import { familiaMeta } from "@/lib/familia";
import type { DetalleMetricas } from "@/lib/metricas-personales";
import { MetricasGrafica } from "./MetricasGrafica";

interface Respuesta { metricas: Metricas; cuadro: CuadroMetricas; causas: CausaDevolucion[]; pasos?: { id: number; texto: string }[]; detalle?: DetalleMetricas; detalleCargando?: boolean; entregas?: { revision: number; total: number } }
const nombreMes = (mes: string) =>
  new Date(`${mes}-15T12:00:00`).toLocaleDateString("es-ES", { month: "long", year: "numeric" }).replace(" de ", " ");
const SERIES = [
  { clave: "planteos", label: "OF entregadas", color: "var(--fase-planteando-relleno)" },
  { clave: "revisiones", label: "Revisiones", color: "var(--fase-revision-relleno)" },
  { clave: "terminadas", label: "OF terminadas", color: "var(--fase-listo-relleno)" },
] as const;
const tiempo = (min: number | null | undefined) => min == null ? "—" : min < 60 ? `${min} min` : min < 1440 ? fmtMin(min) : `${Math.floor(min / 1440)} d ${Math.floor(min % 1440 / 60)} h`;
const porcentaje = (n: number | null) => n === null ? "—" : `${Math.round(n * 100)} %`;

export function MetricasView({ seccion, operarios, miId }: { seccion: SeccionId; operarios: Operario[]; miId: string }) {
  const hoy = hoyISO();
  const mesHoy = hoy.slice(0, 7);
  const [mes, setMes] = useState(mesHoy);
  const { desde, hasta } = periodoDeMes(mes, hoy);
  const mesesDisponibles: string[] = [];
  for (let m = mesHoy; m >= INICIO_METRICAS.slice(0, 7); m = sumarDias(`${m}-01`, -1).slice(0, 7)) mesesDisponibles.push(m);
  const [resultado, setDatos] = useState<{ clave: string; datos: Respuesta } | null>(null);
  const [resultadoPrevio, setPrevio] = useState<{ clave: string; datos: Respuesta | null } | null>(null);
  const [fallo, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const clave = JSON.stringify([desde, hasta, seccion, miId, intento]);
  const datos = resultado?.clave === clave ? resultado.datos : null;
  const previo = resultadoPrevio?.clave === clave ? resultadoPrevio.datos : null;
  const error = fallo === clave;

  useEffect(() => {
    const controlador = new AbortController();
    const pedir = async (p: { desde: string; hasta: string }, detalle = false): Promise<Respuesta> => {
      const q = new URLSearchParams({ seccion });
      if (detalle) { q.set("detalle", "1"); q.set("operario", miId); }
      if (p.desde) q.set("desde", p.desde);
      if (p.hasta) q.set("hasta", p.hasta);
      const r = await fetch(`/api/metricas?${q}`, { cache: "no-store", signal: controlador.signal });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    };
    // Los totales locales se ven sin esperar a las familias e incidencias de
    // RPS. Ambas peticiones arrancan juntas y ninguna respuesta tardía puede
    // pisar otra sección, persona o periodo.
    let detalleTerminado = false;
    let detalleCargado = false;
    pedir({ desde, hasta }).then((d) => {
      if (!controlador.signal.aborted) {
        setDatos((actual) => actual?.clave === clave && actual.datos.detalle ? actual : { clave, datos: { ...d, detalleCargando: !detalleTerminado } });
        setError(null);
      }
    }).catch(() => { if (!controlador.signal.aborted && !detalleCargado) setError(clave); });
    pedir({ desde, hasta }, true).then((d) => {
      detalleTerminado = true;
      detalleCargado = true;
      if (!controlador.signal.aborted) { setDatos({ clave, datos: d }); setError(null); }
    }).catch(() => {
      detalleTerminado = true;
      if (!controlador.signal.aborted) setDatos((actual) => actual?.clave === clave ? { clave, datos: { ...actual.datos, detalleCargando: false } } : actual);
    });
    const antes = periodoAnterior(desde, hasta);
    (antes ? pedir(antes).catch(() => null) : Promise.resolve(null)).then((d) => { if (!controlador.signal.aborted) setPrevio({ clave, datos: d }); });
    return () => controlador.abort();
  }, [desde, hasta, seccion, miId, intento, clave]);

  const m = datos?.metricas;
  const c = datos?.cuadro;
  const comparable = !!previo && !sinActividad(previo.metricas) && !!periodoAnterior(desde, hasta);
  const prop = m ? proporcionDevueltas(m) : null;
  const causa = (id: number | null) => id === null ? "Otra cosa o sin causa" : datos?.causas.find((c) => c.id === id)?.etiqueta ?? `Causa ${id}`;

  return (
    <div className="flex flex-col gap-4 text-text">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight">Métricas <span className="font-medium text-text-muted">· {SECCIONES[seccion].nombre}</span></h2>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <div className="tira-3d glass-chip flex items-center gap-1 rounded-lg p-0.5" role="group" aria-label="Mes de las métricas">
            <button type="button" onClick={() => setMes(sumarDias(`${mes}-01`, -1).slice(0, 7))} disabled={mes <= INICIO_METRICAS.slice(0, 7)} aria-label="Mes anterior" className="rounded-md px-2 py-1.5 text-xs font-semibold text-text-muted hover:text-text disabled:opacity-30">◀</button>
            <select aria-label="Elegir mes" value={mes} onChange={(e) => setMes(e.target.value)} className="pestana-activa min-w-40 rounded-md px-3 py-1.5 text-xs font-semibold text-text">
              {mesesDisponibles.map((m) => <option key={m} value={m}>{nombreMes(m)}{m === mesHoy ? " · en curso" : ""}</option>)}
            </select>
            <button type="button" onClick={() => setMes(sumarDias(`${mes}-28`, 4).slice(0, 7))} disabled={mes >= mesHoy} aria-label="Mes siguiente" className="rounded-md px-2 py-1.5 text-xs font-semibold text-text-muted hover:text-text disabled:opacity-30">▶</button>
          </div>
        </div>
      </div>
      {error && <ErrorCarga mensaje="No se pudieron cargar las métricas." onReintentar={() => setIntento((v) => v + 1)} />}
      {!datos && !error && <p className="glass-panel rounded-xl p-4 text-xs text-text-muted">Contando…</p>}
      {m && c && <>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(220px,.85fr)_minmax(300px,1.35fr)_minmax(420px,1.9fr)]">
        <div className="grid min-w-0 gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <Kpi titulo="OF terminadas" valor={String(m.volumen.ofTerminadas)} mes={mes} detalle={`${m.volumen.terminadas} cierres · OF distintas en el mes`} delta={<Delta ahora={m.volumen.ofTerminadas} antes={comparable ? previo!.metricas.volumen.ofTerminadas : null} />} />
          <Kpi titulo="OF entregadas a revisión" valor={`${m.volumen.ofEntregadas}${datos?.entregas ? ` (${porcentaje(datos.entregas.total ? datos.entregas.revision / datos.entregas.total : null)})` : ""}`} mes={mes} detalle={`OF distintas entregadas a revisión sobre el total de OF entregadas en el mes, incluidas las dadas por buenas sin revisión. Además, ${m.volumen.planteos - m.volumen.ofEntregadas} reentregas: OF que volvieron y se mandaron otra vez corregidas.`} pie={`+ ${m.volumen.planteos - m.volumen.ofEntregadas} reentregas tras corregir`} delta={<Delta ahora={m.volumen.ofEntregadas} antes={comparable ? previo!.metricas.volumen.ofEntregadas : null} />} />
          <Kpi titulo="Vuelven al autor" valor={`${m.devoluciones} (${porcentaje(prop)})`} mes={mes} detalle={`${m.devoluciones} devoluciones de ${m.revisiones} revisiones en el mes. Se incluyen revisiones deducidas de una devolución sin inicio registrado.`} delta={<Delta ahora={prop === null ? null : prop * 100} antes={comparable ? (proporcionDevueltas(previo!.metricas) ?? NaN) * 100 : null} puntos />} pie={`${m.devoluciones} de ${m.revisiones} revisiones`} />
          <div className="sm:col-span-3 xl:col-span-1"><Panel titulo="Cuánto tarda cada paso"><Recorrido m={m} compacto /><p className="mt-3 border-t border-border pt-2 text-[10px] text-text-muted">Hasta aprobarse: <strong className="text-text">{tiempo(c.aprobacion.medianaMin)}</strong> · {c.aprobacion.n} ciclos completos</p></Panel></div>
        </div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Panel titulo="Motivo de devolución" extra={`${m.devoluciones} devoluciones`}><PorQueVuelven m={m} causa={causa} pasos={datos?.pasos ?? []} porFamilia={datos?.detalle?.familiasDisponibles ? datos.detalle.porFamilia : undefined} cargando={datos?.detalleCargando} /></Panel>
          <Panel titulo="Motivos de devolución por familia"><DevolucionesFamilia detalle={datos?.detalle} causa={causa} cargando={datos?.detalleCargando} /></Panel>
        </div>
        <div className="grid min-w-0 gap-4">
          <Panel titulo="Mes a mes"><Meses meses={c.meses} /></Panel>
          <Panel titulo="Mis datos" extra={operarios.find((o) => o.id === miId)?.nombre}><MisDatos detalle={datos?.detalle} cargando={datos?.detalleCargando} causa={causa} /></Panel>
        </div>
      </div>
      <details className="glass-panel rounded-xl px-4 py-3"><summary className="cursor-pointer text-xs font-semibold text-text-muted">Más datos del equipo</summary><div className="mt-4 grid gap-4 md:grid-cols-2">
          <Panel titulo="Por qué se anulan" extra={`${m.anulaciones} anulaciones`}><Ranking filas={m.porCausaAnulacion.map((x) => ({ etiqueta: x.causa === null ? "Sin causa apuntada" : CAUSAS.find((c) => c.id === x.causa)?.label ?? x.causa, n: x.n }))} color="var(--text-muted)" vacio="Sin anulaciones en este periodo." /></Panel>
          <Panel titulo="Por técnico"><Tecnicos cuadro={c} operarios={operarios} miId={miId} /></Panel>
      </div></details>
      </>}
    </div>
  );
}

/** Por causa (lo que se cuenta desde siempre) o por PASO de la guía, que es
 *  más fino: «Medidas» junta la salida del toldo, el frente y los aumentos
 *  (16/10/2026). Por paso solo cuentan las devoluciones hechas desde la guía. */
function PorQueVuelven({ m, causa, pasos, porFamilia, cargando }: { m: Metricas; causa: (id: number | null) => string; pasos: { id: number; texto: string }[]; porFamilia?: DetalleMetricas["porFamilia"]; cargando?: boolean }) {
  const [vista, setVista] = useState<"causa" | "tipo" | "paso">("causa");
  const texto = (id: number) => pasos.find((p) => p.id === id)?.texto ?? `Paso ${id}`;
  return <div className="flex min-h-72 flex-1 flex-col gap-5">
    <div className="tira-3d glass-chip flex shrink-0 gap-1 self-start rounded-lg p-0.5" role="group" aria-label="Contar por">
      {([["causa", "Por causa"], ["tipo", "Por familia"], ["paso", "Por paso"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={vista === v} onClick={() => setVista(v)} className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${vista === v ? "pestana-activa text-text" : "text-text-muted"}`}>{l}</button>)}
    </div>
    {vista === "causa"
      ? <Ranking filas={m.porCausa.map((x) => ({ etiqueta: causa(x.id), n: x.n }))} color={SERIES[1].color} vacio="Sin devoluciones en este periodo." />
      : vista === "tipo" ? porFamilia ? <Ranking filas={porFamilia.filter((f) => f.devoluciones > 0).map((f) => ({ etiqueta: nombreFamilia(f.familia), n: f.devoluciones }))} color={SERIES[1].color} vacio="Sin devoluciones en este periodo." /> : <Vacio>{cargando ? "Consultando familias…" : "No se pudieron consultar las familias. Prueba a recargar."}</Vacio>
      : <Ranking filas={m.porPaso.map((x) => ({ etiqueta: texto(x.id), n: x.n }))} color={SERIES[1].color} vacio="Ninguna devolución desde la guía en este periodo." />}
  </div>;
}
const nombreFamilia = (familia: string) => familiaMeta(familia).label;

function DevolucionesFamilia({ detalle, causa, cargando }: { detalle?: DetalleMetricas; causa: (id: number | null) => string; cargando?: boolean }) {
  const [elegida, setElegida] = useState("");
  const familias = detalle?.porFamilia ?? [];
  const seleccion = familias.find((f) => f.familia === elegida) ?? familias[0];
  return <div className="flex min-h-64 flex-col gap-5">
    {!detalle?.familiasDisponibles ? <Vacio>{cargando ? "Consultando familias…" : "No se pudieron consultar las familias. Prueba a recargar."}</Vacio> : !familias.length ? <Vacio>Sin actividad en este periodo.</Vacio> : <>
      <label className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted">Seleccionar familia:
        <select className="recuadro min-w-0 flex-1 rounded-lg px-2 py-1.5 font-semibold text-text" value={seleccion?.familia ?? ""} onChange={(e) => setElegida(e.target.value)}>
          {familias.map((f) => <option key={f.familia} value={f.familia}>{nombreFamilia(f.familia)} · {f.devoluciones}</option>)}
        </select>
      </label>
      <Ranking filas={(seleccion?.porCausa ?? []).map((x) => ({ etiqueta: causa(x.id), n: x.n }))} color={SERIES[1].color} vacio="Sin devoluciones de esta familia en el periodo." />
      <p className="mt-auto text-[10px] text-text-muted">{seleccion?.devoluciones ?? 0} devoluciones. Una devolución puede tener varias causas.</p>
    </>}
  </div>;
}

function MisCorrecciones({ familias, causa }: { familias: DetalleMetricas["personal"]["correccionesPorFamilia"]; causa: (id: number | null) => string }) {
  if (!familias.length) return <Vacio>No te han devuelto OF este mes.</Vacio>;
  const max = Math.max(...familias.map((f) => f.n));
  return <div className="space-y-2">
    <p className="text-[10px] text-text-muted">Abre una familia para ver las causas.</p>
    {familias.map((f) => <details key={f.familia} className="group">
      <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1.3fr)_minmax(35px,1fr)_auto] items-center gap-2 rounded py-1 text-[11px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-1"><span aria-hidden="true" className="inline-block text-[9px] text-text-muted transition-transform group-open:rotate-90 motion-reduce:transition-none">▶</span>{nombreFamilia(f.familia)}</span>
        <span className="recuadro h-2.5 overflow-hidden rounded"><span className="block h-full rounded-r" style={{ width: `${f.n / max * 100}%`, background: SERIES[1].color }} /></span>
        <strong className="min-w-4 text-right tabular-nums">{f.n}</strong>
      </summary>
      <div className="my-2 border-l-2 border-border py-1 pl-3"><h5 className="mb-2 text-[10px] font-semibold text-text-muted">Causas de mis devoluciones</h5><Ranking filas={f.porCausa.map((c) => ({ etiqueta: causa(c.id), n: c.n }))} color={SERIES[1].color} vacio="Sin causas registradas." /></div>
    </details>)}
    <p className="pt-1 text-[10px] text-text-muted">OF distintas devueltas. Una OF puede tener varias causas.</p>
  </div>;
}

function MisDatos({ detalle, cargando, causa }: { detalle?: DetalleMetricas; cargando?: boolean; causa: (id: number | null) => string }) {
  if (!detalle) return <Vacio>{cargando ? "Consultando tus datos…" : "No se pudieron consultar tus datos. Prueba a recargar."}</Vacio>;
  const p = detalle.personal;
  return <div className="flex flex-col gap-5">
    <div className="grid grid-cols-3 gap-2 border-b border-border pb-4">
      {[["OF pasadas", p.entregadas], ["OF devueltas", p.correcciones], ["OF con incidencia", p.incidencias ?? "—"]].map(([nombre, n]) => <div key={nombre} className="min-w-0"><div className="text-[10px] text-text-muted">{nombre}</div><div className="mt-1 text-2xl font-bold tabular-nums">{n}</div></div>)}
    </div>
    <MetricasGrafica titulo="Mis OF pasadas y devueltas por mes" puntos={p.meses.map((m) => ({ mes: m.mes, valores: [m.entregadas, m.correcciones] }))} series={[{ etiqueta: "OF pasadas", color: SERIES[0].color }, { etiqueta: "OF devueltas", color: SERIES[1].color }]} />
    <div>
      <h4 className="mb-3 text-[11px] font-semibold text-text-muted">OF con incidencia</h4>
      {p.incidencias === null ? <p className="py-5 text-xs text-text-muted">Incidencias de OT no disponibles. Comprueba la conexión con RPS y vuelve a cargar.</p> : <MetricasGrafica titulo="Mis OF con incidencia" puntos={p.meses.map((m) => ({ mes: m.mes, valores: [m.incidencias] }))} series={[{ etiqueta: "Incidencias de OT", color: "var(--fase-devuelta-relleno)" }]} />}
    </div>
    <div className="grid gap-5 border-t border-border pt-4 sm:grid-cols-2">
      <div><h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Mis correcciones</h4><MisCorrecciones familias={p.correccionesPorFamilia} causa={causa} /></div>
      <div><h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Mis incidencias</h4>{p.incidencias === null ? <p className="text-xs text-text-muted">Datos de RPS no disponibles.</p> : <Ranking filas={p.incidenciasPorFamilia.map((f) => ({ etiqueta: nombreFamilia(f.familia), n: f.n }))} color={SERIES[1].color} vacio="Sin OF con incidencias de OT en este periodo." />}</div>
    </div>
    <p className="text-[10px] leading-relaxed text-text-muted">Totales del mes elegido; las gráficas comparan meses. Las pasadas incluyen las entregadas sin revisión. Mis correcciones cuenta cada OF que te han devuelto por un fallo en tu planteo una sola vez en el mes. Las incidencias son errores de planteamiento o documentación registrados en RPS, atribuidos al técnico con más tiempo de OT en la OF.</p>
  </div>;
}

function Panel({ titulo, extra, children }: { titulo: string; extra?: string; children: ReactNode }) {
  return <section className="glass-panel flex min-h-0 min-w-0 flex-col rounded-xl p-4"><h3 className="mb-4 flex shrink-0 flex-wrap items-baseline justify-between gap-1 text-[11px] font-semibold uppercase tracking-[.08em] text-text-muted">{titulo}{extra && <span className="text-[10px] font-normal normal-case tracking-normal">{extra}</span>}</h3>{children}</section>;
}
function Vacio({ children }: { children: ReactNode }) { return <p className="flex flex-1 items-center justify-center py-6 text-center text-xs text-text-muted">{children}</p>; }
function Delta({ ahora, antes, puntos, minutos }: { ahora: number | null; antes: number | null; puntos?: boolean; minutos?: boolean }) {
  if (ahora === null || antes === null || !Number.isFinite(antes)) return <span>Sin comparación</span>;
  const diferencia = ahora - antes;
  const valor = puntos ? `${Math.abs(diferencia).toFixed(1).replace(".", ",")} puntos` : minutos ? tiempo(Math.abs(diferencia)) : antes === 0 ? String(Math.abs(diferencia)) : `${Math.round(Math.abs(diferencia / antes) * 100)} %`;
  return <span title={`Mes anterior: ${minutos ? tiempo(antes) : puntos ? `${Math.round(antes)} %` : antes}. Los mismos días si el mes está en curso.`}><strong className="font-semibold text-text">{diferencia === 0 ? "=" : diferencia > 0 ? "▲" : "▼"} {valor}</strong> <span>frente al mes anterior</span></span>;
}
function Kpi({ titulo, valor, detalle, delta, mes, pie }: { titulo: string; valor: string; detalle: string; delta: ReactNode; mes: string; pie?: string }) {
  return <section className="glass-panel min-w-0 rounded-xl px-4 py-3" title={detalle}>
    <h3 className="text-[10px] font-semibold uppercase tracking-[.07em] text-text-muted">{titulo}</h3>
    <div className="mt-2 text-3xl leading-none font-bold tracking-tight tabular-nums xl:text-4xl">{valor}</div>
    <p className="mt-2 text-[10px] capitalize text-text-muted">{nombreMes(mes)}</p>
    <div className="mt-2 text-[10px] text-text-muted">{delta}{pie && <span className="ml-1"> · {pie}</span>}</div>
  </section>;
}
function Meses({ meses }: { meses: MesMetricas[] }) {
  return <MetricasGrafica titulo="Actividad del equipo mes a mes" puntos={meses.map((m) => ({ mes: m.mes, valores: [m.planteos, m.revisiones, m.devoluciones] }))} series={[{ etiqueta: "Realizadas", color: SERIES[0].color }, { etiqueta: "Revisadas", color: SERIES[1].color }, { etiqueta: "Devoluciones", color: "var(--fase-devuelta-relleno)" }]} />;
}
function Recorrido({ m, compacto = false }: { m: Metricas; compacto?: boolean }) {
  // Cada caja dice QUÉ mide en palabras de la mesa. Con «Esperando»,
  // «Revisión» y «Corrección» a secas y dos números debajo no se entendía de
  // dónde a dónde iba cada uno (Iván, 16/10/2026).
  const tramos: { nombre: string; que: string; tramo: Tramo; color: string }[] = [
    { nombre: "Esperando al revisor", que: "Desde que se pasa a revisión hasta que el revisor la abre", tramo: m.tiempos.esperaCola, color: "var(--text-muted)" },
    { nombre: "Revisándose", que: "Desde que el revisor la abre hasta que la aprueba o la devuelve", tramo: m.tiempos.repaso, color: SERIES[1].color },
    { nombre: "Corrigiéndose", que: "Desde que se devuelve hasta que el autor la vuelve a mandar", tramo: m.tiempos.correccion, color: "var(--fase-devuelta-relleno)" },
  ];
  const total = tramos.reduce((s, t) => s + (t.tramo.medianaMin ?? 0), 0);
  return <div className="flex flex-1 flex-col justify-center gap-3">
    {tramos.every((t) => !t.tramo.n) ? <Vacio>Sin tramos completos en este periodo.</Vacio> : <div className="recuadro flex h-10 shrink-0 gap-1 overflow-hidden rounded-lg p-1" role="img" aria-label={tramos.map((t) => `${t.nombre}: ${tiempo(t.tramo.medianaMin)}`).join("; ")} title="Longitud proporcional a la mediana de cada tramo; las medianas no se suman para calcular el tiempo hasta aprobarse.">{tramos.map((t) => <span key={t.nombre} className="rounded" style={{ width: `${total ? (t.tramo.medianaMin ?? 0) / total * 100 : 0}%`, background: t.color }} title={`${t.nombre}: ${t.tramo.medianaMin ?? "sin datos"} minutos · ${t.tramo.n} tramos`} />)}</div>}
    <div className="grid grid-cols-3 gap-2">{tramos.map((t, i) => <div key={t.nombre} className="recuadro min-w-0 rounded-lg p-2" title={`${t.que}. ${t.tramo.n} tramos completos · ${t.tramo.trabajo.n} con fichaje. Medianas independientes: el reloj incluye noches y fines de semana; sin fichaje no se cuenta como cero.`}><div className="flex flex-wrap items-center gap-1 text-[10px] font-semibold text-text"><i className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: t.color }} />{compacto ? ["Espera", "Revisión", "Corrección"][i] : t.nombre}</div>{!compacto && <div className="mt-0.5 text-[10px] leading-snug text-text-muted">{t.que}</div>}<div className="mt-2 text-base font-bold tabular-nums">{tiempo(t.tramo.medianaMin)}</div>{t.tramo !== m.tiempos.esperaCola && <div className="mt-1 text-[10px] text-text-muted">Trabajando: <strong className="font-semibold text-text">{tiempo(t.tramo.trabajo.medianaMin)}</strong></div>}</div>)}</div>
    <p className="text-[10px] text-text-muted">El tiempo que pasa cuenta noches y fines de semana; el trabajado es el fichado en la web. «Normal» es la OF del medio: ni la más rápida ni la que se quedó olvidada.</p>
  </div>;
}
function Ranking({ filas, color, vacio }: { filas: { etiqueta: string; n: number }[]; color: string; vacio: string }) {
  if (!filas.length) return <Vacio>{vacio}</Vacio>;
  const max = Math.max(...filas.map((f) => f.n));
  return <div className="scroll-thin grid min-h-0 content-start gap-2 overflow-y-auto pr-1" aria-label="Causas ordenadas por frecuencia">{filas.map((f) => <div key={f.etiqueta} className="grid grid-cols-[minmax(0,1.3fr)_minmax(35px,1fr)_auto] items-center gap-2 text-[11px]" title={`${f.etiqueta}: ${f.n}`}><span>{f.etiqueta}</span><span className="recuadro h-2.5 overflow-hidden rounded"><span className="block h-full rounded-r" style={{ width: `${f.n / max * 100}%`, background: color }} /></span><strong className="min-w-4 text-right tabular-nums">{f.n}</strong></div>)}</div>;
}
function Tecnicos({ cuadro, operarios, miId }: { cuadro: CuadroMetricas; operarios: Operario[]; miId: string }) {
  if (!cuadro.porTecnico.length) return <Vacio>Sin actividad de técnicos en este periodo.</Vacio>;
  // No se ofrece planteo fichado: un intervalo identifica persona y OF, pero
  // el registro del ciclo no delimita de forma fiable cada planteo completo.
  return <div className="scroll-thin min-h-0 overflow-auto"><table className="w-full text-[11px] tabular-nums"><caption className="sr-only">Actividad por técnico: planteos entregados y revisiones hechas.</caption><thead><tr className="text-right text-[9px] font-semibold text-text-muted"><th className="pb-2 text-left font-semibold">Técnico</th><th className="px-2 pb-2 font-semibold" title="Entregas a revisión firmadas por esta persona">Planteos<br />entregados</th><th className="pb-2 pl-2 font-semibold" title="Inicios de revisión firmados por esta persona">Revisiones<br />hechas</th></tr></thead><tbody>{cuadro.porTecnico.map((p) => {
    const o = operarios.find((o) => o.id === p.operarioId);
    return <tr key={p.operarioId} className={`border-t border-border text-right ${p.operarioId === miId ? "font-bold" : ""}`}>
      <th scope="row" className={`py-1 text-left ${p.operarioId === miId ? "font-bold" : "font-normal"}`}>
        <span className="flex items-center gap-1.5"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white" style={{ background: o?.color ?? "var(--text-muted)" }}>{o?.iniciales ?? "?"}</span><span>{o?.nombre ?? p.operarioId}{p.operarioId === miId && " (tú)"}</span></span>
      </th>
      <td className="px-2">{p.planteos}</td><td className="pl-2">{p.revisiones}</td>
    </tr>;
  })}</tbody></table></div>;
}
