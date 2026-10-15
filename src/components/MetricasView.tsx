"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ErrorCarga } from "./ErrorCarga";
import { SelectorFecha } from "./SelectorFecha";
import { periodoAnterior, proporcionDevueltas, sinActividad, ventanaDeDias, type MesMetricas, type Metricas, type Tramo } from "@/lib/metricas";
import type { CuadroMetricas, PuntoTendencia } from "@/lib/metricas-cuadro";
import { hoyISO, type Operario } from "@/lib/types";
import { CAUSAS } from "@/lib/anulacion";
import { fmtMin } from "@/lib/estado";
import type { CausaDevolucion } from "@/lib/causas-cliente";
import { SECCIONES, type SeccionId } from "@/lib/secciones";

interface Respuesta { metricas: Metricas; cuadro: CuadroMetricas; causas: CausaDevolucion[] }
const ATAJOS = [{ label: "30 días", dias: 30 }, { label: "90 días", dias: 90 }, { label: "Todo", dias: null }] as const;
const SERIES = [
  { clave: "planteos", label: "Planteos entregados", color: "var(--fase-planteando-relleno)" },
  { clave: "revisiones", label: "Revisiones", color: "var(--fase-revision-relleno)" },
  { clave: "terminadas", label: "OF terminadas", color: "var(--fase-listo-relleno)" },
] as const;
const tiempo = (min: number | null | undefined) => min == null ? "—" : min < 60 ? `${min} min` : min < 1440 ? fmtMin(min) : `${Math.floor(min / 1440)} d ${Math.floor(min % 1440 / 60)} h`;
const porcentaje = (n: number | null) => n === null ? "—" : `${Math.round(n * 100)} %`;

export function MetricasView({ seccion, operarios, miId }: { seccion: SeccionId; operarios: Operario[]; miId: string }) {
  const [{ desde, hasta }, setPeriodo] = useState(() => ventanaDeDias(90, hoyISO()));
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [previo, setPrevio] = useState<Respuesta | null>(null);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);
  const [alto, setAlto] = useState<number>();

  // La cabecera puede cambiar de altura. Medir el borde real evita restar una
  // constante que solo encajaría en una resolución. En bajo y móvil fluye.
  useEffect(() => {
    const medir = () => {
      if (contenedor.current) setAlto(Math.max(480, window.innerHeight - contenedor.current.getBoundingClientRect().top - 16));
    };
    medir();
    const observador = new ResizeObserver(medir);
    if (contenedor.current?.parentElement) observador.observe(contenedor.current.parentElement);
    window.addEventListener("resize", medir);
    return () => { observador.disconnect(); window.removeEventListener("resize", medir); };
  }, []);

  useEffect(() => {
    const controlador = new AbortController();
    const pedir = async (p: { desde: string; hasta: string }): Promise<Respuesta> => {
      const q = new URLSearchParams({ seccion });
      if (p.desde) q.set("desde", p.desde);
      if (p.hasta) q.set("hasta", p.hasta);
      const r = await fetch(`/api/metricas?${q}`, { cache: "no-store", signal: controlador.signal });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    };
    pedir({ desde, hasta }).then((d) => { setDatos(d); setError(false); }).catch(() => { if (!controlador.signal.aborted) setError(true); });
    const antes = periodoAnterior(desde, hasta);
    (antes ? pedir(antes).catch(() => null) : Promise.resolve(null)).then((d) => { if (!controlador.signal.aborted) setPrevio(d); });
    return () => controlador.abort();
  }, [desde, hasta, seccion, intento]);

  const m = datos?.metricas;
  const c = datos?.cuadro;
  const comparable = !!previo && !sinActividad(previo.metricas) && !!periodoAnterior(desde, hasta);
  const prop = m ? proporcionDevueltas(m) : null;
  const causa = (id: number | null) => id === null ? "Sin causa apuntada" : datos?.causas.find((c) => c.id === id)?.etiqueta ?? `Causa ${id}`;

  return (
    <div ref={contenedor} className="flex flex-col gap-3 text-text lg:h-[var(--alto-metricas)] bajo:h-auto" style={{ "--alto-metricas": alto ? `${alto}px` : "calc(100dvh - 110px)" } as CSSProperties}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight">Métricas <span className="font-medium text-text-muted">· {SECCIONES[seccion].nombre}</span></h2>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <div className="tira-3d glass-chip flex gap-1 rounded-lg p-0.5" aria-label="Periodo">
            {ATAJOS.map((a) => {
              const p = a.dias === null ? { desde: "", hasta: "" } : ventanaDeDias(a.dias, hoyISO());
              const activo = p.desde === desde && p.hasta === hasta;
              return <button key={a.label} onClick={() => setPeriodo(p)} aria-pressed={activo} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${activo ? "pestana-activa text-text" : "text-text-muted"}`}>{a.label}</button>;
            })}
          </div>
          <span className="sr-only">Entre fechas</span>
          <div className="[&_[role=dialog]]:right-0 [&_[role=dialog]]:left-auto">
            <SelectorFecha desde={desde} hasta={hasta} onCambiar={(d, h) => setPeriodo({ desde: d, hasta: h })} />
          </div>
        </div>
      </div>
      {error && <ErrorCarga mensaje="No se pudieron cargar las métricas." onReintentar={() => setIntento((v) => v + 1)} />}
      {!datos && !error && <p className="glass-panel rounded-xl p-4 text-xs text-text-muted">Contando…</p>}
      {m && c && <div className="grid min-h-0 flex-1 gap-3 lg:grid-rows-[auto_minmax(0,1fr)_minmax(0,1.1fr)] bajo:lg:grid-rows-[auto_auto_auto]">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi titulo="OF terminadas" valor={String(m.volumen.ofTerminadas)} detalle={`${m.volumen.terminadas} cierres · OF distintas en el periodo`} delta={<Delta ahora={m.volumen.ofTerminadas} antes={comparable ? previo!.metricas.volumen.ofTerminadas : null} />} puntos={c.tendencia} serie="terminadas" color={SERIES[2].color} />
          <Kpi titulo="Planteos entregados" valor={String(m.volumen.planteos)} detalle="Cada entrega a revisión cuenta, incluidas las correcciones." delta={<Delta ahora={m.volumen.planteos} antes={comparable ? previo!.metricas.volumen.planteos : null} />} puntos={c.tendencia} serie="planteos" color={SERIES[0].color} />
          <Kpi titulo="Vuelven al autor" valor={porcentaje(prop)} detalle={`${m.devoluciones} devoluciones de ${m.revisiones} revisiones. Se incluyen revisiones deducidas de una devolución sin inicio registrado.`} delta={<Delta ahora={prop === null ? null : prop * 100} antes={comparable ? (proporcionDevueltas(previo!.metricas) ?? NaN) * 100 : null} puntos />} puntos={c.tendencia} serie="proporcion" color={SERIES[1].color} pie={`${m.devoluciones} de ${m.revisiones} revisiones`} />
          <Kpi titulo="Tiempo típico hasta aprobarse" valor={tiempo(c.aprobacion.medianaMin)} detalle={`Mediana de ${c.aprobacion.n} ciclos completos: primera entrega a revisión → aprobación, incluidas las correcciones; el reloj incluye noches y fines de semana.`} delta={<Delta ahora={c.aprobacion.medianaMin} antes={comparable ? previo!.cuadro.aprobacion.medianaMin : null} minutos />} puntos={c.tendencia} serie="aprobacion" color="var(--text-muted)" />
        </div>
        <div className="grid min-h-0 gap-3 lg:grid-cols-[1.35fr_1fr]">
          <Panel titulo="Mes a mes"><Meses meses={c.meses} /></Panel>
          <Panel titulo="Dónde se para el trabajo"><Recorrido m={m} /></Panel>
        </div>
        <div className="grid min-h-0 gap-3 lg:grid-cols-[1fr_1fr_1.4fr]">
          <Panel titulo="Por qué vuelven" extra={`${m.devoluciones} devoluciones`}><Ranking filas={m.porCausa.map((x) => ({ etiqueta: causa(x.id), n: x.n }))} color={SERIES[1].color} vacio="Sin devoluciones en este periodo." /></Panel>
          <Panel titulo="Por qué se anulan" extra={`${m.anulaciones} anulaciones`}><Ranking filas={m.porCausaAnulacion.map((x) => ({ etiqueta: x.causa === null ? "Sin causa apuntada" : CAUSAS.find((c) => c.id === x.causa)?.label ?? x.causa, n: x.n }))} color="var(--text-muted)" vacio="Sin anulaciones en este periodo." /></Panel>
          <Panel titulo="Por técnico"><Tecnicos cuadro={c} operarios={operarios} miId={miId} /></Panel>
        </div>
      </div>}
    </div>
  );
}

function Panel({ titulo, extra, children }: { titulo: string; extra?: string; children: ReactNode }) {
  return <section className="glass-panel flex min-h-0 min-w-0 flex-col rounded-xl p-3"><h3 className="mb-2 flex shrink-0 flex-wrap items-baseline justify-between gap-1 text-[11px] font-semibold uppercase tracking-[.08em] text-text-muted">{titulo}{extra && <span className="text-[10px] font-normal normal-case tracking-normal">{extra}</span>}</h3>{children}</section>;
}
function Vacio({ children }: { children: ReactNode }) { return <p className="flex flex-1 items-center justify-center py-6 text-center text-xs text-text-muted">{children}</p>; }
function Delta({ ahora, antes, puntos, minutos }: { ahora: number | null; antes: number | null; puntos?: boolean; minutos?: boolean }) {
  if (ahora === null || antes === null || !Number.isFinite(antes)) return <span>Sin comparación</span>;
  const diferencia = ahora - antes;
  const valor = puntos ? `${Math.abs(diferencia).toFixed(1).replace(".", ",")} puntos` : minutos ? tiempo(Math.abs(diferencia)) : antes === 0 ? String(Math.abs(diferencia)) : `${Math.round(Math.abs(diferencia / antes) * 100)} %`;
  return <span title={`Periodo anterior: ${minutos ? tiempo(antes) : puntos ? `${Math.round(antes)} %` : antes}. Periodos de igual duración.`}><strong className="font-semibold text-text">{diferencia === 0 ? "=" : diferencia > 0 ? "▲" : "▼"} {valor}</strong> <span>frente al anterior</span></span>;
}
function Kpi({ titulo, valor, detalle, delta, puntos, serie, color, pie }: { titulo: string; valor: string; detalle: string; delta: ReactNode; puntos: PuntoTendencia[]; serie: "terminadas" | "planteos" | "proporcion" | "aprobacion"; color: string; pie?: string }) {
  const valores = puntos.map((p) => serie === "aprobacion" ? p.aprobacion.medianaMin : p[serie]);
  const sinDatos = puntos.every((p) => p.terminadas === 0 && p.planteos === 0 && p.proporcion === null);
  const max = Math.max(1, ...valores.map((v) => v ?? 0));
  return <section className="glass-panel min-w-0 rounded-xl px-4 py-3" title={detalle}>
    <h3 className="text-[10px] font-semibold uppercase tracking-[.07em] text-text-muted">{titulo}</h3>
    <div className="mt-2 text-3xl leading-none font-bold tracking-tight tabular-nums xl:text-4xl">{valor}</div>
    <div className="mt-2 text-[10px] text-text-muted">{sinDatos ? "Sin actividad en este periodo." : <>{delta}{pie && <span className="ml-1"> · {pie}</span>}</>}</div>
    <div className="mt-2 flex h-7 items-end gap-1" role="img" aria-label={`Tendencia de ${titulo}: ${puntos.map((p, i) => `${p.desde} a ${p.hasta}: ${valores[i] === null ? "sin datos" : serie === "proporcion" ? porcentaje(valores[i]) : serie === "aprobacion" ? tiempo(valores[i]) : valores[i]}`).join("; ")}`}>
      {puntos.map((p, i) => <span key={p.desde} className="min-w-0 flex-1 rounded-t-sm" style={{ height: `${valores[i] === null ? 0 : Math.max(valores[i]! > 0 ? 4 : 0, valores[i]! / max * 100)}%`, background: color, opacity: .85 }} title={`${p.desde} → ${p.hasta}: ${valores[i] === null ? "sin datos" : serie === "proporcion" ? porcentaje(valores[i]) : serie === "aprobacion" ? `${valores[i]} minutos` : valores[i]}`} />)}
    </div>
  </section>;
}
function Meses({ meses }: { meses: MesMetricas[] }) {
  const max = Math.max(1, ...meses.flatMap((mes) => SERIES.map((s) => mes[s.clave])));
  if (!meses.some((mes) => SERIES.some((s) => mes[s.clave] > 0))) return <Vacio>Sin actividad en este periodo.</Vacio>;
  return <>
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-text-muted">{SERIES.map((s) => <span key={s.clave} className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}</div>
    <div className="flex min-h-36 flex-1 gap-2" role="img" aria-label={`Un mismo eje de 0 a ${max}. ${meses.map((mes) => `${mes.mes}: ${SERIES.map((s) => `${mes[s.clave]} ${s.label}`).join(", ")}`).join("; ")}`}>
      <div className="flex w-6 shrink-0 flex-col justify-between pb-9 text-right text-[9px] text-text-muted"><span>{max}</span><span>{Math.round(max / 2)}</span><span>0</span></div>
      <div className="flex min-w-0 flex-1 gap-3">
        {meses.map((mes) => <div key={mes.mes} className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 items-end gap-1 border-b border-border pt-5">{SERIES.map((s) => <div key={s.clave} className="relative min-w-0 flex-1 rounded-t-sm" style={{ height: `${mes[s.clave] / max * 100}%`, background: s.color }} title={`${mes.mes} · ${s.label}: ${mes[s.clave]}`}><span className="absolute -top-4 right-0 left-0 text-center text-[10px] font-semibold tabular-nums text-text">{mes[s.clave]}</span></div>)}</div>
          <div className="h-9 pt-1 text-center text-[10px] text-text-muted">{new Date(`${mes.mes}-15T12:00:00Z`).toLocaleDateString("es", { month: "long" })}{mes.mes === new Date().toISOString().slice(0, 7) && <span className="block text-[9px]">en curso</span>}</div>
        </div>)}
      </div>
    </div>
  </>;
}
function Recorrido({ m }: { m: Metricas }) {
  const tramos: { nombre: string; tramo: Tramo; color: string }[] = [
    { nombre: "Esperando", tramo: m.tiempos.esperaCola, color: "var(--text-muted)" },
    { nombre: "Revisión", tramo: m.tiempos.repaso, color: SERIES[1].color },
    { nombre: "Corrección", tramo: m.tiempos.correccion, color: "var(--fase-devuelta-relleno)" },
  ];
  const total = tramos.reduce((s, t) => s + (t.tramo.medianaMin ?? 0), 0);
  return <div className="flex flex-1 flex-col justify-center gap-3">
    {tramos.every((t) => !t.tramo.n) ? <Vacio>Sin tramos completos en este periodo.</Vacio> : <div className="recuadro flex h-10 shrink-0 gap-1 overflow-hidden rounded-lg p-1" role="img" aria-label={tramos.map((t) => `${t.nombre}: ${tiempo(t.tramo.medianaMin)}`).join("; ")} title="Longitud proporcional a la mediana de cada tramo; las medianas no se suman para calcular el tiempo hasta aprobarse.">{tramos.map((t) => <span key={t.nombre} className="rounded" style={{ width: `${total ? (t.tramo.medianaMin ?? 0) / total * 100 : 0}%`, background: t.color }} title={`${t.nombre}: ${t.tramo.medianaMin ?? "sin datos"} minutos · ${t.tramo.n} tramos`} />)}</div>}
    <div className="grid grid-cols-3 gap-2">{tramos.map((t) => <div key={t.nombre} className="recuadro min-w-0 rounded-lg p-3 bajo:p-2" title={`${t.tramo.n} tramos completos · ${t.tramo.trabajo.n} con fichaje. Medianas independientes: el reloj incluye noches y fines de semana; sin fichaje no se cuenta como cero.`}><div className="flex items-center gap-1 text-[10px] text-text-muted"><i className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.color }} />{t.nombre}</div><div className="mt-1 text-xl font-bold tabular-nums">{tiempo(t.tramo.medianaMin)}</div><div className="mt-1 text-[10px] text-text-muted">Trabajo fichado<strong className="mt-0.5 block font-semibold text-text">{tiempo(t.tramo.trabajo.medianaMin)}</strong></div></div>)}</div>
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
