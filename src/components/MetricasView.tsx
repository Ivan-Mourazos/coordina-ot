"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ErrorCarga } from "./ErrorCarga";
import { INICIO_METRICAS, periodoAnterior, periodoDeMes, proporcionDevueltas, sinActividad, type MesMetricas, type Metricas, type Tramo } from "@/lib/metricas";
import { sumarDias } from "@/lib/fechas";
import type { CuadroMetricas } from "@/lib/metricas-cuadro";
import { hoyISO, type Operario } from "@/lib/types";
import { fmtMin } from "@/lib/estado";
import type { CausaDevolucion } from "@/lib/causas-cliente";
import { SECCIONES, type SeccionId } from "@/lib/secciones";
import { familiaMeta } from "@/lib/familia";
import type { DetalleMetricas, Devueltas } from "@/lib/metricas-personales";
import { causaMayor, deLaSeccion, esMia, repartoNc, resumenNc, type FilaFamiliaNc, type NoConformidad } from "@/lib/no-conformidad";
import { MetricasGrafica } from "./MetricasGrafica";
import { Select } from "./Select";

interface Respuesta { metricas: Metricas; cuadro: CuadroMetricas; causas: CausaDevolucion[]; pasos?: { id: number; texto: string }[]; detalle?: DetalleMetricas; detalleCargando?: boolean; entregas?: { revision: number; total: number }; devueltas?: Devueltas }
const nombreMes = (mes: string) =>
  new Date(`${mes}-15T12:00:00`).toLocaleDateString("es-ES", { month: "long", year: "numeric" }).replace(" de ", " ");
const nombreMesCorto = (mm: string) => {
  const n = new Date(`2026-${mm}-15T12:00:00`).toLocaleDateString("es-ES", { month: "long" });
  return n.charAt(0).toUpperCase() + n.slice(1);
};
const SERIES = [
  { clave: "planteos", label: "OF entregadas", color: "var(--fase-planteando-relleno)" },
  { clave: "revisiones", label: "Revisiones", color: "var(--fase-revision-relleno)" },
  { clave: "terminadas", label: "OF terminadas", color: "var(--fase-listo-relleno)" },
] as const;
const COLOR_DEVUELTA = "var(--fase-devuelta-relleno)";
const COLOR_SIN_REVISION = "var(--fase-parado-relleno)";
// Rectificados: el único color de serie libre en las dos gráficas donde salen.
const COLOR_RECTIFICADO = "var(--fase-listo-relleno)";
const tiempo = (min: number | null | undefined) => min == null ? "—" : min < 60 ? `${min} min` : min < 1440 ? fmtMin(min) : `${Math.floor(min / 1440)} d ${Math.floor(min % 1440 / 60)} h`;
const porcentaje = (n: number | null) => n === null ? "—" : `${Math.round(n * 100)} %`;
/** «n de base» como %, con un decimal por debajo de 10: las incidencias
 *  rondan el 2 % y redondeadas saldrían todas iguales. */
const sobre = (n: number, base: number) => {
  if (!base) return "—";
  const v = n / base * 100;
  return `${v < 10 ? v.toFixed(1).replace(".", ",").replace(",0", "") : Math.round(v)} %`;
};
const MESES = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

/** Los doce meses del año, con `null` en los que no hay dato (antes de que la
 *  web registrara nada, o todavía por llegar). Las gráficas son ANUALES (Iván,
 *  21/10/2026): enero a diciembre, aunque el año vaya por octubre. */
function delAnio<T extends { mes: string }>(anio: string, filas: readonly T[]): { mes: string; fila: T | null }[] {
  const porMes = new Map(filas.map((f) => [f.mes, f]));
  return MESES.map((mm) => ({ mes: `${anio}-${mm}`, fila: porMes.get(`${anio}-${mm}`) ?? null }));
}

export function MetricasView({ seccion, operarios, miId, onAbrirPedido }: { seccion: SeccionId; operarios: Operario[]; miId: string; /** Abre un pedido en Coordina (la ficha del tablero o la del Historial). */ onAbrirPedido?: (codigo: string) => void }) {
  const hoy = hoyISO();
  const mesHoy = hoy.slice(0, 7);
  const anioInicio = Number(INICIO_METRICAS.slice(0, 4));
  // Mes a mes, o un año entero (mes "" = todo el año). Por defecto, el mes en
  // curso, que es lo que se mira a diario.
  const [anio, setAnio] = useState(mesHoy.slice(0, 4));
  const [mesSel, setMesSel] = useState(mesHoy.slice(5, 7));
  const mes = mesSel ? `${anio}-${mesSel}` : "";
  const finAnio = `${anio}-12-31`;
  const { desde, hasta } = mes ? periodoDeMes(mes, hoy) : { desde: `${anio}-01-01`, hasta: finAnio < hoy ? finAnio : hoy };
  const etiquetaPeriodo = mes ? nombreMes(mes) : `Año ${anio}`;
  const unidad = mes ? "mes" : "año";
  const anios: string[] = [];
  for (let a = Number(mesHoy.slice(0, 4)); a >= anioInicio; a--) anios.push(String(a));
  const mesesDelAnio = MESES.filter((mm) => `${anio}-${mm}` >= INICIO_METRICAS.slice(0, 7) && `${anio}-${mm}` <= mesHoy);
  const elegirAnio = (a: string) => {
    setAnio(a);
    if (mesSel && (`${a}-${mesSel}` < INICIO_METRICAS.slice(0, 7) || `${a}-${mesSel}` > mesHoy)) setMesSel("");
  };
  const ir = (paso: 1 | -1) => {
    if (!mes) { elegirAnio(String(Number(anio) + paso)); return; }
    const nuevo = paso < 0 ? sumarDias(`${mes}-01`, -1).slice(0, 7) : sumarDias(`${mes}-28`, 4).slice(0, 7);
    setAnio(nuevo.slice(0, 4));
    setMesSel(nuevo.slice(5, 7));
  };
  const primero = mes ? mes <= INICIO_METRICAS.slice(0, 7) : Number(anio) <= anioInicio;
  const ultimo = mes ? mes >= mesHoy : anio >= mesHoy.slice(0, 4);

  const [resultado, setDatos] = useState<{ clave: string; datos: Respuesta } | null>(null);
  const [resultadoPrevio, setPrevio] = useState<{ clave: string; datos: Respuesta | null } | null>(null);
  const [fallo, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const clave = JSON.stringify([desde, hasta, seccion, miId, intento]);
  const error = fallo === clave;
  // Al cambiar de mes se sigue enseñando lo anterior, atenuado, hasta que
  // llega lo nuevo (Iván, 21/10/2026): vaciar la pantalla la encogía y volvía
  // a crecer, y despistaba.
  const datos = error ? null : resultado?.datos ?? null;
  const previo = resultadoPrevio?.datos ?? null;
  const actualizando = !!datos && resultado?.clave !== clave;
  const etiquetaAnio = useId();
  const etiquetaMes = useId();
  const contenedor = useRef<HTMLDivElement>(null);
  const [alto, setAlto] = useState<number>();
  useEffect(() => {
    const elemento = contenedor.current;
    if (!elemento) return;
    const medir = () => setAlto(Math.max(280, window.innerHeight - elemento.getBoundingClientRect().top - 14));
    const observador = new ResizeObserver(medir);
    if (elemento.parentElement) observador.observe(elemento.parentElement);
    medir();
    window.addEventListener("resize", medir);
    return () => { observador.disconnect(); window.removeEventListener("resize", medir); };
  }, []);

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
        // El detalle del periodo anterior se queda, atenuado, mientras RPS
        // contesta; si ya falló, fuera, para no hacerlo pasar por el nuevo.
        setDatos((actual) => actual?.clave === clave && actual.datos.detalle ? actual : { clave, datos: { ...d, detalle: detalleTerminado ? undefined : actual?.datos.detalle, detalleCargando: !detalleTerminado } });
        setError(null);
      }
    }).catch(() => { if (!controlador.signal.aborted && !detalleCargado) setError(clave); });
    pedir({ desde, hasta }, true).then((d) => {
      detalleTerminado = true;
      detalleCargado = true;
      if (!controlador.signal.aborted) { setDatos({ clave, datos: d }); setError(null); }
    }).catch(() => {
      detalleTerminado = true;
      if (!controlador.signal.aborted) setDatos((actual) => actual?.clave === clave ? { clave, datos: { ...actual.datos, detalle: undefined, detalleCargando: false } } : actual);
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
  const frente = `frente al ${unidad} anterior`;
  // Lo de RPS tarda más que los totales: sus paneles siguen atenuados con lo
  // del periodo anterior hasta que llega lo suyo.
  const detalleViejo = !actualizando && !!datos?.detalleCargando && !!datos.detalle;
  // Lo de revisar (entregas, devoluciones, tiempos) solo existe desde que se
  // usa la web: en un periodo que empieza antes, se dice desde cuándo cuenta.
  // Las OF terminadas sí van completas, con las que se cerraron en RPS.
  const soloDesdeWeb = desde < INICIO_METRICAS ? `Desde ${nombreMes(INICIO_METRICAS.slice(0, 7))}` : null;
  const ofsRps = datos?.detalle?.equipoRps.ofs ?? 0;
  // Donde nadie revisa (Diseño, Impresión) no se enseña nada de revisión:
  // entregas a revisión, devoluciones, sus motivos, sus tiempos ni mis
  // correcciones. Diseño pidió quitar «lo que no es de ellos» (26/10/2026), y
  // eran ceros que solo despistaban.
  const sinRevision = SECCIONES[seccion].sinRevision === true;
  // Impresión no tiene incidencias propias en RPS (ver
  // `leerIncidenciasMetricas`); NC sí tienen las tres (ver `leerNcMetricas`).
  const conIncidencias = seccion !== "impresion";

  return (
    <div ref={contenedor} className="metricas-vista flex flex-col gap-2.5 text-text" style={{ "--alto-metricas": alto ? `${alto}px` : "calc(100dvh - 100px)" } as CSSProperties}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight">Métricas <span className="font-medium text-text-muted">· {SECCIONES[seccion].nombre}</span></h2>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5" role="group" aria-label="Periodo de las métricas">
          <span id={etiquetaAnio} className="sr-only">Año</span>
          <span id={etiquetaMes} className="sr-only">Mes</span>
          <button type="button" onClick={() => ir(-1)} disabled={primero} aria-label={mes ? "Mes anterior" : "Año anterior"} className="glass-chip grid size-8 place-items-center rounded-lg text-[10px] text-text-muted hover:text-text disabled:opacity-30">◀</button>
          <Select value={anio} onChange={(v) => { if (v) elegirAnio(v); }} options={anios.map((a) => ({ value: a, label: a }))} placeholder={null} ariaLabelledBy={etiquetaAnio} acentuarActivo className="w-24 [&>button]:h-8 [&>button]:font-semibold" />
          <Select value={mesSel} onChange={(v) => setMesSel(v ?? "")} options={[{ value: "", label: "Todo el año" }, ...mesesDelAnio.map((mm) => ({ value: mm, label: `${nombreMesCorto(mm)}${`${anio}-${mm}` === mesHoy ? " · en curso" : ""}` }))]} placeholder={null} ariaLabelledBy={etiquetaMes} acentuarActivo className="w-44 [&>button]:h-8 [&>button]:font-semibold" />
          <button type="button" onClick={() => ir(1)} disabled={ultimo} aria-label={mes ? "Mes siguiente" : "Año siguiente"} className="glass-chip grid size-8 place-items-center rounded-lg text-[10px] text-text-muted hover:text-text disabled:opacity-30">▶</button>
        </div>
      </div>
      {error && <ErrorCarga mensaje="No se pudieron cargar las métricas." onReintentar={() => setIntento((v) => v + 1)} />}
      {!datos && !error && <p className="glass-panel rounded-xl p-4 text-xs text-text-muted">Contando…</p>}
      {m && c && <>
      <div aria-busy={actualizando} className={`metricas-cuadricula grid items-start gap-2.5 transition-opacity duration-200 motion-reduce:transition-none xl:grid-cols-[minmax(250px,.95fr)_minmax(290px,1.2fr)_minmax(400px,1.85fr)] ${atenuado(actualizando)}`}>
        <div className="metricas-columna metricas-indicadores grid min-w-0 gap-2.5 sm:grid-cols-2 xl:grid-cols-1">
          <Panel titulo="Resumen" extra={etiquetaPeriodo}>
            <div className="grid gap-2">
              <Cifra titulo="OF terminadas" valor={String(m.volumen.ofTerminadas + ofsRps)} detalle={`OF distintas en el ${unidad}: ${m.volumen.ofTerminadas} cerradas en la web${ofsRps ? ` y ${ofsRps} que OT cerró en RPS antes de usarla` : ""}.`} delta={<Delta ahora={m.volumen.ofTerminadas + ofsRps} antes={comparable ? previo!.metricas.volumen.ofTerminadas : null} frente={frente} />} />
              {!sinRevision && <Cifra titulo="Entregadas a revisión" valor={String(m.volumen.ofEntregadas)} extra={datos?.entregas ? porcentaje(datos.entregas.total ? datos.entregas.revision / datos.entregas.total : null) : undefined} detalle={`OF distintas entregadas a revisión; el % es sobre el total de OF entregadas, incluidas las dadas por buenas sin revisión. Además, ${m.volumen.planteos - m.volumen.ofEntregadas} reentregas tras corregir.`} delta={<Delta ahora={m.volumen.ofEntregadas} antes={comparable ? previo!.metricas.volumen.ofEntregadas : null} frente={frente} sinDato={soloDesdeWeb} />} />}
              {!sinRevision && <Cifra titulo="Vuelven al autor" valor={String(m.devoluciones)} extra={porcentaje(prop)} detalle={`${m.devoluciones} devoluciones de ${m.revisiones} revisiones en el ${unidad}.`} delta={<Delta ahora={prop === null ? null : prop * 100} antes={comparable ? (proporcionDevueltas(previo!.metricas) ?? NaN) * 100 : null} puntos frente={frente} sinDato={soloDesdeWeb} />} />}
            </div>
          </Panel>
          {!sinRevision && <Panel titulo="Cuánto tarda cada paso" extra={soloDesdeWeb ? `tiempo normal · ${soloDesdeWeb.toLowerCase()}` : "tiempo normal"}><Recorrido m={m} aprobacion={c.aprobacion} /></Panel>}
          {/* Incidencias aquí y no en la columna del medio (Iván, 27/10/2026):
              bajo «Cuánto tarda» quedaban 330 px vacíos, y en el medio, con
              tres paneles a partes iguales, Rectificados no dejaba ver sus
              pedidos. Cada panel mide lo suyo y el último de cada columna se
              queda lo que sobra (globals.css, «Métricas»). */}
          {conIncidencias && <Panel titulo={`Incidencias ${SECCIONES[seccion].siglas}`} extra={etiquetaPeriodo} actualizando={detalleViejo}><IncidenciasSeccion seccion={seccion} incidencias={datos?.detalle?.incidenciasOT} cargando={datos?.detalleCargando} /></Panel>}
        </div>
        <div className="metricas-columna metricas-motivos grid min-w-0 gap-2.5 sm:grid-cols-2 xl:grid-cols-1">
          {!sinRevision && <Panel titulo="Motivo de devolución" extra={datos?.devueltas ? `${datos.devueltas.devueltas} de ${datos.devueltas.entregadas} OF` : `${m.devoluciones} devoluciones`}><PorQueVuelven devueltas={datos?.devueltas} causa={causa} porFamilia={datos?.detalle?.familiasDisponibles ? datos.detalle.porFamilia : undefined} cargando={datos?.detalleCargando} detalleViejo={detalleViejo} /></Panel>}
          <Panel titulo="Rectificados" extra={etiquetaPeriodo} actualizando={detalleViejo}><Rectificados nc={datos?.detalle?.nc} totales={datos?.detalle?.ncTotales} familias={datos?.detalle?.ncFamilias} cargando={datos?.detalleCargando} seccion={seccion} miId={miId} onAbrirPedido={onAbrirPedido} /></Panel>
        </div>
        <div className="metricas-columna metricas-personal grid min-w-0 gap-2.5">
          <Panel titulo="Mes a mes" extra={`Año ${anio}`}><Meses anio={anio} meses={c.meses} mes={mes} rps={datos?.detalle?.equipoRps.meses} rectificados={datos?.detalle?.rectificadosMeses} sinRevision={sinRevision} /></Panel>
          <Panel titulo="Mis datos" extra={operarios.find((o) => o.id === miId)?.nombre} actualizando={detalleViejo}><MisDatos anio={anio} mes={mes} unidad={unidad} detalle={datos?.detalle} cargando={datos?.detalleCargando} causa={causa} seccion={seccion} /></Panel>
        </div>
      </div>
      </>}
    </div>
  );
}

/** Por causa o por familia. «Por paso» de la guía se quitó (Iván,
 *  21/10/2026): sobraba aquí. */
function PorQueVuelven({ devueltas, causa, porFamilia, cargando, detalleViejo = false }: { devueltas?: Devueltas; causa: (id: number | null) => string; porFamilia?: DetalleMetricas["porFamilia"]; cargando?: boolean; detalleViejo?: boolean }) {
  const [vista, setVista] = useState<"causa" | "tipo">("causa");
  return <div data-fluido className="flex min-h-32 flex-1 flex-col gap-3 xl:min-h-0">
    {/* La misma tira que el resto de la web (Revisión, Visitas): la bandeja
        gris que llevaba aquí no casaba con nada (21/10/2026). */}
    <div className="tira-3d glass-chip inline-flex shrink-0 self-start rounded-lg p-1" role="group" aria-label="Contar por">
      {([["causa", "Por causa"], ["tipo", "Por familia"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={vista === v} onClick={() => setVista(v)} className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${vista === v ? "pestana-activa" : "text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"}`}>{l}</button>)}
    </div>
    {vista === "causa"
      ? devueltas ? <Ranking filas={devueltas.porCausa.map((x) => ({ etiqueta: causa(x.id), n: x.n, pct: sobre(x.n, devueltas.entregadas), titulo: `${causa(x.id)}: ${x.n} OF devueltas de ${devueltas.entregadas} entregadas a revisión` }))} color={SERIES[1].color} vacio="Sin devoluciones en este periodo." /> : <Vacio>Contando…</Vacio>
      : porFamilia ? <div aria-busy={detalleViejo} className={`scroll-thin min-h-0 overflow-y-auto pr-1 transition-opacity duration-200 motion-reduce:transition-none ${atenuado(detalleViejo)}`}><PorFamiliaAbrible color={SERIES[1].color} vacio="Sin devoluciones en este periodo."
        familias={porFamilia.filter((f) => f.devueltas > 0).map((f) => ({ familia: f.familia, n: f.devueltas, pct: sobre(f.devueltas, f.entregadas), base: f.entregadas, detalle: f.porCausa.map((x) => ({ etiqueta: causa(x.id), n: x.n, pct: sobre(x.n, f.entregadas) })) }))} /></div>
        : <Vacio>{cargando ? "Consultando familias…" : "No se pudieron consultar las familias. Prueba a recargar."}</Vacio>}
  </div>;
}
const nombreFamilia = (familia: string) => familiaMeta(familia).label;

/** Qué cuenta como incidencia en cada sección, para el globo de ayuda (la
 *  regla vive en `leerIncidenciasMetricas`). */
const QUE_ES_INCIDENCIA: Partial<Record<SeccionId, { explica: string; vacio: string }>> = {
  ot: { explica: "OF con algún «error en planteamiento» apuntado en RPS (corte, confección o soldadura)", vacio: "Sin errores de planteamiento en este periodo." },
  diseno: { explica: "OF con tarea de Diseño y algún error de rotulación o de archivo de impresión apuntado en RPS (desde el 8 de septiembre)", vacio: "Sin incidencias de rotulación en este periodo." },
};

/** Las incidencias que apuntó Producción en RPS, de todo el equipo, sobre las
 *  OF pasadas del periodo (Iván, 21/10/2026; Diseño desde el 26/10/2026). */
function IncidenciasSeccion({ seccion, incidencias, cargando }: { seccion: SeccionId; incidencias?: DetalleMetricas["incidenciasOT"]; cargando?: boolean }) {
  if (!incidencias) return <Vacio>{cargando ? "Consultando RPS…" : "Datos de RPS no disponibles. Prueba a recargar."}</Vacio>;
  const que = QUE_ES_INCIDENCIA[seccion];
  return <div className="flex min-h-32 flex-1 flex-col gap-2.5 xl:min-h-0">
    <div className="flex items-baseline gap-2" title={`${que?.explica ?? "OF con incidencia apuntada en RPS"}, sobre las OF pasadas en el periodo. Cada OF cuenta una vez.`}>
      <strong className="text-2xl leading-none font-bold tabular-nums">{incidencias.total}</strong>
      <span className="text-xs font-semibold tabular-nums text-text-muted">{sobre(incidencias.total, incidencias.base)}</span>
      <span className="text-[10px] text-text-muted">de {incidencias.base} OF pasadas</span>
    </div>
    <Ranking filas={incidencias.porFamilia.map((f) => ({ etiqueta: nombreFamilia(f.familia), n: f.n, pct: sobre(f.n, f.base), titulo: `${nombreFamilia(f.familia)}: ${f.n} con incidencia de ${f.base} OF pasadas` }))} color={COLOR_DEVUELTA} vacio={que?.vacio ?? "Sin incidencias en este periodo."} />
  </div>;
}

const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Los rectificados de la sección: los pedidos que hubo que rehacer y que
 *  Calidad achaca, en sus causas, a alguien de la sección (Iván, 26/10/2026:
 *  «la tabla, y los rectificados en las gráficas»). Una NC sin pedido
 *  rectificativo no entra: no se rehízo nada; sigue en la ficha del pedido.
 *
 *  Arriba, una línea; debajo, la tabla por familia; los pedidos, plegados.
 *  Sin nombres de compañeros: en Métricas cada uno ve lo suyo (21/10/2026).
 *  Una NC no pesa entera por tener una causa nuestra: «equivale a» suma solo
 *  nuestra parte (ver `repartoNc`). */
function Rectificados({ nc, totales, familias, cargando, seccion, miId, onAbrirPedido }: { nc?: NoConformidad[] | null; totales?: DetalleMetricas["ncTotales"]; familias?: FilaFamiliaNc[] | null; cargando?: boolean; seccion: SeccionId; miId: string; onAbrirPedido?: (codigo: string) => void }) {
  if (!nc || !familias) return <Vacio>{cargando ? "Consultando RPS…" : "Datos de RPS no disponibles. Prueba a recargar."}</Vacio>;
  const nombreCorto = SECCIONES[seccion].nombreCorto;
  const rectificados = nc.filter((x) => x.rectificativo);
  const conCausa = rectificados.filter((x) => deLaSeccion(x, seccion) === "causa");
  const pendientes = rectificados.filter((x) => deLaSeccion(x, seccion) === "pendiente");
  const mayores = conCausa.filter((x) => causaMayor(x, seccion) === "mayor").length;
  const peso = conCausa.reduce((s, x) => s + (repartoNc(x).secciones[seccion] ?? 0), 0);
  const mios = conCausa.filter((x) => esMia(x, miId)).length;
  const max = Math.max(1, ...familias.map((f) => f.rectificados));
  return <div className="flex min-h-32 flex-1 flex-col gap-2.5 xl:min-h-0">
    <div className="flex flex-wrap items-baseline gap-x-2" title={`Pedidos rectificados que Calidad achaca, en sus causas, a alguien de ${nombreCorto} con «error en planteamiento o diseño gráfico». «Equivale a» suma solo la parte de ${nombreCorto}: cada defecto reparte su 100 % entre sus causas según el % de Calidad. «Causa mayor»: donde lo de ${nombreCorto} pesa más que cualquier otra causa.`}>
      <strong className="text-2xl leading-none font-bold tabular-nums">{conCausa.length}</strong>
      <span className="text-[11px] text-text-muted">con culpa de {nombreCorto} · equivale a <strong className="font-semibold text-text tabular-nums">{decimal(peso)}</strong> · causa mayor en <strong className="font-semibold text-text tabular-nums">{mayores}</strong>{mios > 0 && <> · <strong className="font-semibold text-text tabular-nums">{mios}</strong> tuyos</>}</span>
    </div>
    {totales && <p className="text-[10px] leading-snug text-text-muted" title="Todos los pedidos rectificados de la empresa en el periodo, y lo que pesa en ellos el planteamiento o el diseño gráfico (OT, Diseño e Impresión juntos).">
      En toda la empresa, {totales.rectificadas} rectificados; lo de planteamiento o diseño gráfico pesa {decimal(totales.nuestrasRectificadasPeso)} ({sobre(totales.nuestrasRectificadasPeso, totales.rectificadas)}).
      {pendientes.length > 0 && ` ${pendientes.length} de pedidos con tareas de ${nombreCorto} aún sin investigar.`}
    </p>}
    {/* SIN SCROLL PROPIO, ni la tabla ni los pedidos (Iván, 27/10/2026: «lo
        ideal es no tener scrolls»): el panel se queda el alto que sobra en su
        columna, y si aun así no cabe, el que desplaza es el panel entero. Los
        pedidos ya no van plegados en «Ver los pedidos»: no se veían. */}
    {!familias.length ? <Vacio>Sin rectificados en este periodo.</Vacio> : (
      <div>
        <table className="w-full text-[11px]">
          <thead><tr className="text-[10px] text-text-muted">
            <th className="text-left font-normal">Por familia</th>
            <th className="font-normal" />
            <th className="text-right font-normal" title="Rectificados de pedidos con tareas de la sección en esa familia">Rectif.</th>
            <th className="text-right font-normal" title="De ellos, los que Calidad achaca en algo a la sección">Con culpa</th>
            <th className="text-right font-normal" title="La parte media de la sección en los rectificados ya investigados de esa familia">Culpa media</th>
          </tr></thead>
          <tbody>{familias.map((f) => <tr key={f.familia} title={`${nombreFamilia(f.familia)}: ${f.rectificados} rectificados; ${f.conCausa} con culpa de ${nombreCorto}; ${f.investigados} investigados`}>
            <td className="truncate pr-2">{nombreFamilia(f.familia)}</td>
            <td className="w-1/3 pr-2"><span className="recuadro block h-2 overflow-hidden rounded"><span className="block h-full rounded-r" style={{ width: `${f.rectificados / max * 100}%`, background: COLOR_RECTIFICADO }} /></span></td>
            <td className="text-right font-semibold tabular-nums">{f.rectificados}</td>
            <td className="text-right font-semibold tabular-nums">{f.conCausa}</td>
            <td className="text-right font-semibold tabular-nums">{f.culpaMedia === null ? "—" : `${Math.round(f.culpaMedia * 100)} %`}</td>
          </tr>)}</tbody>
        </table>
      </div>
    )}
    {conCausa.length + pendientes.length > 0 && <div>
      <p className="text-[10px] text-text-muted">Pedidos</p>
      {/* UNA FILA POR PEDIDO, en columnas (Iván, 27/10/2026: «no tener la
          lista de pedidos así a lo bruto»): qué pedido, en cuál se rectificó,
          cuándo y cuánto nos toca, en píldora. Lo que escribió Calidad, al
          pasar el ratón; entero, en la ficha del pedido. */}
      <ul className="mt-0.5">
        {[...conCausa, ...pendientes].map((x) => {
          const pendiente = deLaSeccion(x, seccion) === "pendiente";
          const mayor = !pendiente && causaMayor(x, seccion) === "mayor";
          const que = pendiente
            ? "sin investigar"
            : `${Math.round((repartoNc(x).secciones[seccion] ?? 0) * 100)} % · ${mayor ? "mayor" : "menor"}`;
          // Al pasar el ratón, UNA línea; el texto entero de Calidad, en la
          // ficha del pedido, que se abre al pulsar (Iván, 27/10/2026: «estos
          // textos son un agobio»). Allí sale ordenado en «Ver detalles».
          const abrible = onAbrirPedido && x.pedido;
          const pista = [x.descripcion && resumenNc(x.descripcion, 110), abrible ? "Pulsa para ver el pedido y su no conformidad" : null].filter(Boolean).join("\n");
          const fila = "grid w-full grid-cols-[minmax(0,1fr)_3.25rem_auto] items-center gap-2 rounded-md! px-1.5 py-1 text-left text-[11px] hover:bg-surface-2";
          const contenido = <>
            <span className="min-w-0 truncate tabular-nums">
              <span className="font-semibold">{x.pedido ?? "—"}</span>
              <span className="text-text-muted"> → </span>
              <span className="font-semibold">{x.rectificativo}</span>
              {esMia(x, miId) && <span className="ml-1.5 text-[10px] font-semibold text-brand-800 dark:text-brand-300">tuyo</span>}
            </span>
            <span className="text-right tabular-nums text-text-muted">{fechaCorta(x.fecha)}</span>
            <span className={`justify-self-end rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
              pendiente ? "bg-surface-2 font-medium text-text-muted" : mayor ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-surface-2 text-text"
            }`}>{que}</span>
          </>;
          return <li key={x.codigo}>
            {abrible
              ? <button type="button" onClick={() => onAbrirPedido(x.pedido!)} title={pista} className={fila}>{contenido}</button>
              : <div title={pista} className={fila}>{contenido}</div>}
          </li>;
        })}
      </ul>
    </div>}
  </div>;
}

/** Un decimal, con coma: «3,2». Sin decimales si es entero. */
const decimal = (n: number) => (Math.round(n * 10) / 10).toLocaleString("es-ES", { maximumFractionDigits: 1 });

/** Una familia que se abre para ver el desglose por causa: mis correcciones
 *  y el motivo de devolución por familia. */
function PorFamiliaAbrible({ familias, color, vacio }: { familias: { familia: string; n: number; pct?: string; base?: number; detalle: FilaRanking[] }[]; color: string; vacio: string }) {
  if (!familias.length) return <p className="py-2 text-[11px] text-text-muted">{vacio}</p>;
  const max = Math.max(...familias.map((f) => f.n));
  const conPct = familias.some((f) => f.pct !== undefined);
  return <div className="space-y-1">
    {familias.map((f) => <details key={f.familia} className="group rounded-md border border-border open:border-border-strong">
      <summary className={`grid cursor-pointer list-none ${conPct ? "grid-cols-[minmax(0,1.3fr)_minmax(30px,1fr)_auto_2.75rem]" : "grid-cols-[minmax(0,1.3fr)_minmax(30px,1fr)_auto]"} items-center gap-2 rounded-md px-1.5 py-1 text-[11px] hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 group-open:text-brand-800 dark:group-open:text-brand-300 [&::-webkit-details-marker]:hidden`} title={f.base !== undefined ? `${nombreFamilia(f.familia)}: ${f.n} de ${f.base} OF` : undefined}>
        <span className="flex min-w-0 items-center gap-1"><span aria-hidden="true" className="inline-block text-[8px] text-text-muted transition-transform group-open:rotate-90 motion-reduce:transition-none">▶</span><span className="truncate">{nombreFamilia(f.familia)}</span></span>
        <span className="recuadro h-2 overflow-hidden rounded"><span className="block h-full rounded-r" style={{ width: `${f.n / max * 100}%`, background: color }} /></span>
        <strong className="min-w-4 text-right tabular-nums">{f.n}</strong>
        {conPct && <span className="text-right tabular-nums text-text-muted">{f.pct}</span>}
      </summary>
      <div className="mx-1.5 mb-1.5 border-l-2 border-border py-1 pl-2"><Ranking filas={f.detalle} color={color} vacio="Sin detalle." /></div>
    </details>)}
  </div>;
}

function MisDatos({ anio, mes, unidad, detalle, cargando, causa, seccion }: { anio: string; mes: string; unidad: string; detalle?: DetalleMetricas; cargando?: boolean; causa: (id: number | null) => string; seccion: SeccionId }) {
  if (!detalle) return <Vacio>{cargando ? "Consultando tus datos…" : "No se pudieron consultar tus datos. Prueba a recargar."}</Vacio>;
  const p = detalle.personal;
  const sinRevision = SECCIONES[seccion].sinRevision === true;
  const filas = delAnio(anio, p.meses);
  const sumaAnio = (k: "entregadas" | "sinRevision" | "correcciones" | "incidencias") => p.meses.reduce((s, x) => s + (x[k] ?? 0), 0);
  const delPeriodo = (k: "entregadas" | "sinRevision" | "correcciones" | "incidencias") => mes ? p.meses.find((x) => x.mes === mes)?.[k] ?? 0 : sumaAnio(k);
  // UNA gráfica para todo lo mío (21/10/2026): las incidencias iban en otra
  // aparte y no cabía la pantalla. Donde no se revisa, sin «Sin revisión» ni
  // «Devueltas»: todo sería una cosa y nada la otra.
  const conIncidencias = p.incidencias !== null;
  // Mis rectificados: los que Calidad me achaca a mí, por mes (26/10/2026).
  const rect = detalle.rectificadosMeses;
  const misRect = mes ? rect?.[mes]?.mios ?? 0 : Object.entries(rect ?? {}).reduce((s, [m, r]) => m.startsWith(anio) ? s + r.mios : s, 0);
  const series = [
    { etiqueta: "Pasadas", color: SERIES[0].color, valor: p.entregadas },
    ...(sinRevision ? [] : [
      { etiqueta: "Sin revisión", color: COLOR_SIN_REVISION, valor: delPeriodo("sinRevision") },
      { etiqueta: "Devueltas", color: SERIES[1].color, valor: p.correcciones },
    ]),
    ...(conIncidencias ? [{ etiqueta: "Con incidencia", color: COLOR_DEVUELTA, valor: p.incidencias ?? 0 }] : []),
    ...(rect ? [{ etiqueta: "Con rectificado", color: COLOR_RECTIFICADO, valor: misRect }] : []),
  ];
  const valoresDe = (fila: (typeof p.meses)[number]) => [
    fila.entregadas,
    ...(sinRevision ? [] : [fila.sinRevision, fila.correcciones]),
    ...(conIncidencias ? [fila.incidencias] : []),
    ...(rect ? [rect[fila.mes]?.mios ?? 0] : []),
  ];
  const queIncidencia = seccion === "diseno"
    ? "Errores de rotulación o de archivo apuntados en RPS en OF que pasaste tú"
    : "Errores de planteamiento apuntados en RPS en OF que pasaste tú (según Coordina; las de antes de agosto, quien más fichó de OT)";
  return <div className="metricas-datos flex flex-col gap-3">
    <MetricasGrafica titulo="Mis OF por mes" resaltar={mes || undefined} series={series}
      puntos={filas.map(({ mes, fila }) => ({ mes, valores: fila ? valoresDe(fila) : series.map(() => null) }))} />
    <div className={`grid gap-3 border-t border-border pt-2.5 ${sinRevision ? "" : "sm:grid-cols-2"}`}>
      {!sinRevision && <div className="min-w-0"><h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted" title="OF distintas que te devolvieron, por familia. Abre una para ver las causas.">Mis correcciones · {p.correcciones}</h4>
        <PorFamiliaAbrible color={SERIES[1].color} vacio={`No te han devuelto OF este ${unidad}.`} familias={p.correccionesPorFamilia.map((f) => ({ familia: f.familia, n: f.n, detalle: f.porCausa.map((x) => ({ etiqueta: causa(x.id), n: x.n })) }))} /></div>}
      <div className="min-w-0"><h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted" title={`${queIncidencia}, sobre tus ${p.entregadas} OF pasadas. Por familia, sobre las que pasaste de esa familia.`}>Mis incidencias · {p.incidencias ?? "—"}{p.incidencias !== null && <span className="font-normal normal-case tracking-normal"> · {sobre(p.incidencias, p.entregadas)} de {p.entregadas}</span>}</h4>
        {p.incidencias === null ? <p className="py-2 text-[11px] text-text-muted">Datos de RPS no disponibles.</p> : !p.incidenciasPorFamilia.length ? <p className="py-2 text-[11px] text-text-muted">{`Sin incidencias en tus OF este ${unidad}.`}</p> : <Ranking color={COLOR_DEVUELTA} vacio="" filas={p.incidenciasPorFamilia.map((f) => ({ etiqueta: nombreFamilia(f.familia), n: f.n, pct: sobre(f.n, f.base), titulo: `${nombreFamilia(f.familia)}: ${f.n} con incidencia de ${f.base} que pasaste` }))} />}</div>
    </div>
  </div>;
}

/** Atenuado mientras se cambia de periodo. Con retraso al entrar: si los
 *  datos llegan enseguida no se ve parpadeo ninguno; al salir, al momento. */
const atenuado = (si: boolean) => si ? "opacity-55 delay-150" : "opacity-100 delay-0";
function Panel({ titulo, extra, actualizando = false, children }: { titulo: string; extra?: string; actualizando?: boolean; children: ReactNode }) {
  return <section aria-busy={actualizando} className="metricas-panel glass-panel flex min-h-0 min-w-0 flex-col rounded-xl p-3"><h3 className="mb-2 flex shrink-0 flex-wrap items-baseline justify-between gap-1 text-[11px] font-semibold uppercase tracking-[.08em] text-text-muted">{titulo}{extra && <span className="text-[10px] font-normal normal-case tracking-normal first-letter:uppercase">{extra}</span>}</h3><div className={`metricas-panel-contenido flex min-h-0 flex-1 flex-col transition-opacity duration-200 motion-reduce:transition-none ${atenuado(actualizando)}`}>{children}</div></section>;
}
function Vacio({ children }: { children: ReactNode }) { return <p className="flex flex-1 items-center justify-center py-4 text-center text-xs text-text-muted">{children}</p>; }
function Delta({ ahora, antes, puntos, frente, sinDato }: { ahora: number | null; antes: number | null; puntos?: boolean; frente: string; sinDato?: string | null }) {
  if (ahora === null || antes === null || !Number.isFinite(antes)) return <span>{sinDato ?? "Sin comparación"}</span>;
  const diferencia = ahora - antes;
  const valor = puntos ? `${Math.abs(diferencia).toFixed(1).replace(".", ",")} puntos` : antes === 0 ? String(Math.abs(diferencia)) : `${Math.round(Math.abs(diferencia / antes) * 100)} %`;
  return <span title={`Antes: ${puntos ? `${Math.round(antes)} %` : antes}. Los mismos días si el periodo está en curso.`}><strong className="font-semibold text-text">{diferencia === 0 ? "=" : diferencia > 0 ? "▲" : "▼"} {valor}</strong> <span>{frente}</span></span>;
}
/** Una cifra del resumen en una línea: el número grande a la izquierda, y el
 *  nombre y la comparación a su lado. Eran tres tarjetas altas y se comían la
 *  columna (21/10/2026). */
function Cifra({ titulo, valor, extra, detalle, delta }: { titulo: string; valor: string; extra?: string; detalle: string; delta: ReactNode }) {
  // Tres columnas fijas (cifra, porcentaje, texto): con el ancho de cada
  // número, «229» y «176 (76 %)» dejaban los rótulos cada uno a una altura.
  return <div className="grid min-w-0 grid-cols-[3.25rem_3rem_minmax(0,1fr)] items-center gap-x-2 metricas-cifra rounded-lg border border-border px-2.5 py-1.5" title={detalle}>
    <div className="text-right text-2xl leading-none font-bold tracking-tight tabular-nums">{valor}</div>
    <div className="text-xs font-semibold tabular-nums text-text-muted">{extra ?? ""}</div>
    <div className="min-w-0 text-[10px] leading-tight text-text-muted"><div className="truncate font-semibold uppercase tracking-[.06em] text-text">{titulo}</div><div className="truncate">{delta}</div></div>
  </div>;
}
/** «Realizadas» suma las OF que OT cerró en RPS antes de usar la web (`rps`,
 *  llega con el detalle): sin ellas el año empezaba en agosto (Iván,
 *  21/10/2026). Revisadas y devoluciones no existían antes: sin línea. */
function Meses({ anio, meses, mes, rps, rectificados, sinRevision = false }: { anio: string; meses: MesMetricas[]; mes: string; rps?: Record<string, number>; rectificados?: DetalleMetricas["rectificadosMeses"]; sinRevision?: boolean }) {
  const filas = delAnio(anio, meses);
  // Rectificados con culpa de la sección, como las incidencias en «Mis datos»
  // (26/10/2026). Hasta el mes en curso; los que faltan por llegar, sin punto.
  const hastaHoy = hoyISO().slice(0, 7);
  const rect = (m: string) => !rectificados || m > hastaHoy ? null : rectificados[m]?.equipo ?? 0;
  const rectValor = mes ? rectificados?.[mes]?.equipo ?? 0 : Object.entries(rectificados ?? {}).reduce((s, [m, r]) => m.startsWith(anio) ? s + r.equipo : s, 0);
  const realizadas = (m: string, fila: MesMetricas | null) =>
    fila || rps?.[m] ? (fila?.planteos ?? 0) + (rps?.[m] ?? 0) : null;
  // La cantidad de cada línea en la leyenda (Iván, 21/10/2026): la del mes
  // elegido, o la del año si se mira el año entero.
  // Sin «pasadas sin revisión» (Iván, 21/10/2026): ya sale en Mis datos.
  const cuenta = (k: "planteos" | "revisiones" | "devoluciones") => mes ? meses.find((x) => x.mes === mes)?.[k] ?? 0 : meses.reduce((s, x) => s + x[k], 0);
  const deRps = mes ? rps?.[mes] ?? 0 : Object.entries(rps ?? {}).reduce((s, [m, n]) => m.startsWith(anio) ? s + n : s, 0);
  // Donde no se revisa, solo «Realizadas»: revisadas y devoluciones serían
  // dos líneas pegadas al cero.
  return <MetricasGrafica titulo="Actividad del equipo mes a mes" resaltar={mes || undefined}
    puntos={filas.map(({ mes, fila }) => ({ mes, valores: [
      realizadas(mes, fila),
      ...(sinRevision ? [] : [fila?.revisiones ?? null, fila?.devoluciones ?? null]),
      ...(rectificados ? [rect(mes)] : []),
    ] }))}
    series={[
      { etiqueta: "Realizadas", color: SERIES[0].color, valor: cuenta("planteos") + deRps },
      ...(sinRevision ? [] : [
        { etiqueta: "Revisadas", color: SERIES[1].color, valor: cuenta("revisiones") },
        { etiqueta: "Devoluciones", color: COLOR_DEVUELTA, valor: cuenta("devoluciones") },
      ]),
      ...(rectificados ? [{ etiqueta: "Rectificados", color: COLOR_RECTIFICADO, valor: rectValor }] : []),
    ]} />;
}
/** Los cinco tramos del ciclo (Iván, 21/10/2026), en el orden en que pasan,
 *  cada uno con una frase de DÓNDE a DÓNDE va. */
function Recorrido({ m, aprobacion }: { m: Metricas; aprobacion: { n: number; medianaMin: number | null } }) {
  const t = m.tiempos;
  const tramos: { nombre: string; que: string; tramo: Tramo; color: string; trabajo?: boolean }[] = [
    { nombre: "Espera a revisión", que: "De pasarla a revisar a que el revisor la abre", tramo: t.esperaCola, color: "var(--text-muted)" },
    { nombre: "Revisión", que: "De abrirla el revisor a aprobarla o devolverla", tramo: t.repaso, color: SERIES[1].color, trabajo: true },
    { nombre: "Espera a corregir", que: "De devolvértela a ponerte a corregirla", tramo: t.esperaCorreccion, color: COLOR_SIN_REVISION },
    { nombre: "Corrección", que: "De ponerte a corregirla a mandarla o entregarla", tramo: t.correccion, color: COLOR_DEVUELTA, trabajo: true },
    { nombre: "Hasta Producción", que: "De aprobarse (o darse por corregida) a pasar el pedido", tramo: t.hastaProduccion, color: "var(--fase-listo-relleno)" },
  ];
  const total = tramos.reduce((s, x) => s + (x.tramo.medianaMin ?? 0), 0);
  if (tramos.every((x) => !x.tramo.n)) return <Vacio>Sin tramos completos en este periodo.</Vacio>;
  return <div className="flex flex-1 flex-col gap-2">
    <div className="recuadro flex h-3 shrink-0 gap-0.5 overflow-hidden rounded-md p-0.5" role="img" aria-label={tramos.map((x) => `${x.nombre}: ${tiempo(x.tramo.medianaMin)}`).join("; ")}>
      {tramos.map((x) => x.tramo.medianaMin ? <span key={x.nombre} className="rounded-sm" style={{ width: `${x.tramo.medianaMin / total * 100}%`, minWidth: 3, background: x.color }} title={`${x.nombre}: ${tiempo(x.tramo.medianaMin)}`} /> : null)}
    </div>
    <ol className="grid gap-1">
      {tramos.map((x, i) => <li key={x.nombre} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 rounded-md px-1 py-0.5" title={`${x.que}. ${x.tramo.n} medidas${x.trabajo ? ` · ${x.tramo.trabajo.n} con fichaje` : ""}.`}>
        <span className="grid size-4 place-items-center rounded-full text-[9px] font-bold" style={{ background: x.color, color: "var(--surface)" }}>{i + 1}</span>
        <span className="min-w-0 leading-tight"><span className="block text-[11px] font-semibold">{x.nombre}</span><span className="block truncate text-[10px] text-text-muted">{x.que}</span></span>
        <span className="text-right leading-tight"><strong className="block text-sm tabular-nums">{tiempo(x.tramo.medianaMin)}</strong>{x.trabajo && <span className="block text-[9px] text-text-muted">{tiempo(x.tramo.trabajo.medianaMin)} fichados</span>}</span>
      </li>)}
    </ol>
    <p className="border-t border-border pt-1.5 text-[10px] text-text-muted" title="El reloj cuenta noches y fines de semana; «fichados» es el tiempo fichado en la web. «Normal» es la OF del medio: ni la más rápida ni la que se quedó olvidada.">Ciclo entero hasta aprobarse: <strong className="text-text">{tiempo(aprobacion.medianaMin)}</strong> · {aprobacion.n} ciclos</p>
  </div>;
}
/** `pct` va en su propia columna para que los % queden alineados. */
interface FilaRanking { etiqueta: string; n: number; pct?: string; titulo?: string }
function Ranking({ filas, color, vacio }: { filas: FilaRanking[]; color: string; vacio: string }) {
  if (!filas.length) return <Vacio>{vacio}</Vacio>;
  const max = Math.max(...filas.map((f) => f.n));
  const conPct = filas.some((f) => f.pct !== undefined);
  return <div className="scroll-thin grid min-h-0 content-start gap-1.5 overflow-y-auto pr-1" aria-label="Ordenado por frecuencia">{filas.map((f) => <div key={f.etiqueta} className={`grid ${conPct ? "grid-cols-[minmax(0,1.3fr)_minmax(30px,1fr)_auto_2.75rem]" : "grid-cols-[minmax(0,1.3fr)_minmax(30px,1fr)_auto]"} items-center gap-2 text-[11px]`} title={f.titulo ?? `${f.etiqueta}: ${f.n}`}><span className="truncate">{f.etiqueta}</span><span className="recuadro h-2 overflow-hidden rounded"><span className="block h-full rounded-r" style={{ width: `${f.n / max * 100}%`, background: color }} /></span><strong className="min-w-4 text-right tabular-nums">{f.n}</strong>{conPct && <span className="text-right tabular-nums text-text-muted">{f.pct}</span>}</div>)}</div>;
}
