"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
  // La página mide lo que queda de pantalla bajo la cabecera, y no baja.
  const contenedor = useRef<HTMLDivElement>(null);
  const [alto, setAlto] = useState<number>();
  useEffect(() => {
    const elemento = contenedor.current;
    if (!elemento) return;
    const medir = () => setAlto(Math.max(560, window.innerHeight - elemento.getBoundingClientRect().top - 14));
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
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

  // Rectificados con culpa de la sección: la cifra de arriba y su panel.
  const nc = datos?.detalle?.nc;
  const rectConCausa = nc ? nc.filter((x) => x.rectificativo && deLaSeccion(x, seccion) === "causa") : null;
  const rectPeso = rectConCausa ? rectConCausa.reduce((s, x) => s + (repartoNc(x).secciones[seccion] ?? 0), 0) : 0;
  const totalesNc = datos?.detalle?.ncTotales;
  const incid = datos?.detalle?.incidenciasOT;
  const nombreCorto = SECCIONES[seccion].nombreCorto;
  const queIncid = QUE_ES_INCIDENCIA[seccion];
  const nPorQue = 1 + (sinRevision ? 0 : 1) + (conIncidencias ? 1 : 0);
  const anchoPorQue = ANCHO[nPorQue];

  // ─── Cuadro de mando sin scroll (Iván, 04/11/2026) ──────────────────────────
  // La página mide lo que la pantalla y nunca baja, con lo del equipo y lo
  // tuyo a la vez (no en dos vistas: «lo quiero todo junto»). Dentro de los paneles,
  // nada se despliega: se entra en una familia y se sale con «← Volver», y lo
  // que no cabe va en páginas ‹ 1/3 ›. Las explicaciones, al pasar el ratón.
  const nombreYo = operarios.find((o) => o.id === miId)?.nombre;
  return (
    <div ref={contenedor} className="flex flex-col gap-2.5 text-text xl:h-[var(--alto-metricas)]" style={{ "--alto-metricas": alto ? `${alto}px` : "calc(100dvh - 100px)" } as CSSProperties}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold tracking-tight">Métricas <span className="font-medium text-text-muted">· {SECCIONES[seccion].nombre}</span></h2>
        </div>
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
      {m && c && (
        // UNA rejilla de 6 columnas (Iván, 04/11/2026: «paneles simétricos»):
        // las cifras, la evolución y los tres «por qué», cada fila a su alto.
        <div aria-busy={actualizando} className={`grid min-h-0 flex-1 grid-cols-2 gap-2.5 transition-opacity duration-200 motion-reduce:transition-none xl:grid-cols-6 xl:grid-rows-[auto_minmax(0,.8fr)_minmax(0,1fr)_auto_minmax(0,1fr)] ${atenuado(actualizando)}`}>
          <Cifras>
            <Tile titulo="OF terminadas" valor={String(m.volumen.ofTerminadas + ofsRps)}
              ayuda={`OF distintas en el ${unidad}: ${m.volumen.ofTerminadas} cerradas en la web${ofsRps ? ` y ${ofsRps} que OT cerró en RPS antes de usarla` : ""}.`}
              delta={<Delta ahora={m.volumen.ofTerminadas + ofsRps} antes={comparable ? previo!.metricas.volumen.ofTerminadas : null} frente={frente} />} />
            {!sinRevision && <Tile titulo="A revisión" valor={String(m.volumen.ofEntregadas)} extra={datos?.entregas ? porcentaje(datos.entregas.total ? datos.entregas.revision / datos.entregas.total : null) : undefined}
              ayuda={`OF distintas entregadas a revisión; el % es sobre todas las OF entregadas, incluidas las dadas por buenas sin revisión. Además, ${m.volumen.planteos - m.volumen.ofEntregadas} reentregas tras corregir.`}
              delta={<Delta ahora={m.volumen.ofEntregadas} antes={comparable ? previo!.metricas.volumen.ofEntregadas : null} frente={frente} sinDato={soloDesdeWeb} />} />}
            {!sinRevision && <Tile titulo="Vuelven al autor" valor={String(m.devoluciones)} extra={porcentaje(prop)}
              ayuda={`${m.devoluciones} devoluciones de ${m.revisiones} revisiones en el ${unidad}.`}
              delta={<Delta ahora={prop === null ? null : prop * 100} antes={comparable ? (proporcionDevueltas(previo!.metricas) ?? NaN) * 100 : null} puntos frente={frente} sinDato={soloDesdeWeb} />} />}
            {conIncidencias && <Tile titulo="Incidencias" valor={incid ? String(incid.total) : "—"} extra={incid ? sobre(incid.total, incid.base) : undefined}
              ayuda={`${queIncid?.explica ?? "OF con incidencia apuntada en RPS"}${incid ? `: ${incid.total} de ${incid.base} OF pasadas` : ""}. Cada OF cuenta una vez.`}
              delta={<span>{incid ? `de ${incid.base} OF pasadas` : datos?.detalleCargando ? "Consultando RPS…" : "Sin datos de RPS"}</span>} />}
            <Tile titulo="Rectificados" valor={rectConCausa ? String(rectConCausa.length) : "—"} extra={rectConCausa ? `≈ ${decimal(rectPeso)}` : undefined}
              ayuda={`Pedidos rectificados que Calidad achaca, en algo, a ${nombreCorto}. «≈» suma solo la parte de ${nombreCorto} (cada defecto reparte su 100 % entre sus causas).${totalesNc ? ` En toda la empresa: ${totalesNc.rectificadas} rectificados.` : ""}`}
              delta={<span>{rectConCausa ? `con culpa de ${nombreCorto}` : datos?.detalleCargando ? "Consultando RPS…" : "Sin datos de RPS"}</span>} />
            {!sinRevision && <Tile titulo="Hasta aprobarse" valor={tiempo(c.aprobacion.medianaMin)}
              ayuda={`Lo normal desde que se entrega una OF hasta que se aprueba, contando noches y fines de semana. ${c.aprobacion.n} ciclos.`}
              delta={<span>{soloDesdeWeb ?? "lo normal"}</span>} />}
          </Cifras>
          <Panel titulo="Mes a mes" extra={`Año ${anio}`} className={sinRevision ? "col-span-2 xl:col-span-6" : "col-span-2 xl:col-span-4"}><Meses anio={anio} meses={c.meses} mes={mes} rps={datos?.detalle?.equipoRps.meses} rectificados={datos?.detalle?.rectificadosMeses} sinRevision={sinRevision} /></Panel>
          {!sinRevision && <Panel titulo="Cuánto tarda" extra={soloDesdeWeb ?? "lo normal"}><Recorrido m={m} /></Panel>}
          {!sinRevision && <Panel titulo="Motivo de devolución" extra={datos?.devueltas ? `${datos.devueltas.devueltas} de ${datos.devueltas.entregadas} OF` : `${m.devoluciones}`} className={anchoPorQue}><PorQueVuelven devueltas={datos?.devueltas} causa={causa} porFamilia={datos?.detalle?.familiasDisponibles ? datos.detalle.porFamilia : undefined} cargando={datos?.detalleCargando} detalleViejo={detalleViejo} /></Panel>}
          {conIncidencias && <Panel titulo={`Incidencias ${SECCIONES[seccion].siglas} por familia`} extra={incid ? `${incid.total} de ${incid.base} OF` : undefined} actualizando={detalleViejo} className={anchoPorQue}><IncidenciasSeccion seccion={seccion} incidencias={incid} cargando={datos?.detalleCargando} /></Panel>}
          <Panel titulo="Rectificados" extra={rectConCausa ? `${rectConCausa.length} con culpa` : undefined} actualizando={detalleViejo} className={anchoPorQue}><Rectificados nc={nc} familias={datos?.detalle?.ncFamilias} cargando={datos?.detalleCargando} seccion={seccion} miId={miId} onAbrirPedido={onAbrirPedido} /></Panel>
          {/* Lo tuyo, separado de lo del equipo (Iván, 04/11/2026): su rótulo y la raya dorada. */}
          <h3 className="col-span-full flex items-baseline gap-2 border-t border-border-strong pt-2.5">
            <span aria-hidden className="size-2 self-center rounded-full bg-brand-500" />
            <span className="text-sm font-bold text-text">Tus datos</span>
            {nombreYo && <span className="text-xs text-text-muted">{nombreYo}</span>}
          </h3>
          <MisDatos anio={anio} mes={mes} unidad={unidad} detalle={datos?.detalle} cargando={datos?.detalleCargando} causa={causa} seccion={seccion} nombre={nombreYo} actualizando={detalleViejo} />
        </div>
      )}
    </div>
  );
}

/** La fila de cifras de arriba: a lo ancho, todas iguales. Con el mismo hueco
 *  que la rejilla de abajo, cada borde cae en su sitio. */
function Cifras({ children }: { children: ReactNode }) {
  return <div className="col-span-2 grid grid-cols-2 gap-2.5 xl:col-span-6 xl:auto-cols-fr xl:grid-flow-col xl:grid-cols-none">{children}</div>;
}

/** Por causa o por familia. Por familia, se entra en una para ver sus causas. */
function PorQueVuelven({ devueltas, causa, porFamilia, cargando, detalleViejo = false }: { devueltas?: Devueltas; causa: (id: number | null) => string; porFamilia?: DetalleMetricas["porFamilia"]; cargando?: boolean; detalleViejo?: boolean }) {
  const [vista, setVista] = useState<"causa" | "tipo">("causa");
  return <div className="flex min-h-0 flex-1 flex-col gap-2">
    <Tira opciones={[["causa", "Por causa"], ["tipo", "Por familia"]]} valor={vista} onCambiar={setVista} etiqueta="Contar por" />
    {vista === "causa"
      ? devueltas ? <Ranking filas={devueltas.porCausa.map((x) => ({ etiqueta: causa(x.id), n: x.n, pct: sobre(x.n, devueltas.entregadas), titulo: `${causa(x.id)}: ${x.n} OF devueltas de ${devueltas.entregadas} entregadas a revisión` }))} color={SERIES[1].color} vacio="Sin devoluciones en este periodo." /> : <Vacio>Contando…</Vacio>
      : porFamilia ? <div aria-busy={detalleViejo} className={`flex min-h-0 flex-1 flex-col transition-opacity duration-200 motion-reduce:transition-none ${atenuado(detalleViejo)}`}><PorFamiliaEntrar color={SERIES[1].color} vacio="Sin devoluciones en este periodo."
        familias={porFamilia.filter((f) => f.devueltas > 0).map((f) => ({ familia: f.familia, n: f.devueltas, pct: sobre(f.devueltas, f.entregadas), base: f.entregadas, detalle: f.porCausa.map((x) => ({ etiqueta: causa(x.id), n: x.n, pct: sobre(x.n, f.entregadas) })) }))} /></div>
        : <Vacio>{cargando ? "Consultando familias…" : "No se pudieron consultar las familias. Prueba a recargar."}</Vacio>}
  </div>;
}

/** La tira de opciones de dentro de un panel (la misma que el resto de la web). */
function Tira<T extends string>({ opciones, valor, onCambiar, etiqueta }: { opciones: readonly (readonly [T, string])[]; valor: T; onCambiar: (v: T) => void; etiqueta: string }) {
  return <div className="tira-3d glass-chip inline-flex shrink-0 self-start rounded-lg p-1" role="group" aria-label={etiqueta}>
    {opciones.map(([v, l]) => <button key={v} type="button" aria-pressed={valor === v} onClick={() => onCambiar(v)} className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${valor === v ? "pestana-activa" : "text-text-muted hover:text-text"}`}>{l}</button>)}
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
 *  OF pasadas del periodo, por familia. El total va en las cifras de arriba. */
function IncidenciasSeccion({ seccion, incidencias, cargando }: { seccion: SeccionId; incidencias?: DetalleMetricas["incidenciasOT"]; cargando?: boolean }) {
  if (!incidencias) return <Vacio>{cargando ? "Consultando RPS…" : "Datos de RPS no disponibles. Prueba a recargar."}</Vacio>;
  const que = QUE_ES_INCIDENCIA[seccion];
  return <Ranking filas={incidencias.porFamilia.map((f) => ({ etiqueta: nombreFamilia(f.familia), n: f.n, pct: sobre(f.n, f.base), titulo: `${nombreFamilia(f.familia)}: ${f.n} con incidencia de ${f.base} OF pasadas` }))} color={COLOR_DEVUELTA} vacio={que?.vacio ?? "Sin incidencias en este periodo."} />;
}

const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** Clases de ancho para repartir una fila de la rejilla de 6 a partes iguales. */
const ANCHO: Record<number, string> = { 1: "col-span-2 xl:col-span-6", 2: "col-span-2 xl:col-span-3", 3: "col-span-2 xl:col-span-2" };

/** Los rectificados de la sección: los pedidos que hubo que rehacer y que
 *  Calidad achaca, en sus causas, a alguien de la sección. Por familia o los
 *  pedidos, uno u otro (Iván, 04/11/2026: sin scroll); los pedidos, en páginas.
 *  El total y lo que pesa van en las cifras de arriba. Sin nombres de
 *  compañeros: en Métricas cada uno ve lo suyo (21/10/2026). */
function Rectificados({ nc, familias, cargando, seccion, miId, onAbrirPedido }: { nc?: NoConformidad[] | null; familias?: FilaFamiliaNc[] | null; cargando?: boolean; seccion: SeccionId; miId: string; onAbrirPedido?: (codigo: string) => void }) {
  const [vista, setVista] = useState<"familias" | "pedidos">("familias");
  if (!nc || !familias) return <Vacio>{cargando ? "Consultando RPS…" : "Datos de RPS no disponibles. Prueba a recargar."}</Vacio>;
  const nombreCorto = SECCIONES[seccion].nombreCorto;
  const rectificados = nc.filter((x) => x.rectificativo);
  const lista = [
    ...rectificados.filter((x) => deLaSeccion(x, seccion) === "causa"),
    ...rectificados.filter((x) => deLaSeccion(x, seccion) === "pendiente"),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!familias.length && !lista.length) return <Vacio>Sin rectificados en este periodo.</Vacio>;
  const max = Math.max(1, ...familias.map((f) => f.rectificados));
  const columnas = "grid-cols-[minmax(0,1.3fr)_minmax(30px,1fr)_2rem_3rem]";
  return <div className="flex min-h-0 flex-1 flex-col gap-2">
    <Tira opciones={[["familias", "Por familia"], ["pedidos", `Pedidos · ${lista.length}`]]} valor={vista} onCambiar={setVista} etiqueta="Ver" />
    {vista === "familias" ? <>
      <div className={`grid ${columnas} gap-2 text-[10px] text-text-muted`}><span>Familia</span><span /><span className="text-right" title="Rectificados de pedidos con tareas de la sección">Total</span><span className="text-right" title={`De ellos, los que Calidad achaca en algo a ${nombreCorto}`}>Culpa</span></div>
      <ListaPaginada items={familias} clave={(f) => f.familia} vacio="Sin rectificados en este periodo." render={(f) =>
        <div className={`grid h-full ${columnas} items-center gap-2 text-[11px]`} title={`${nombreFamilia(f.familia)}: ${f.rectificados} rectificados; ${f.conCausa} con culpa de ${nombreCorto}; culpa media ${f.culpaMedia === null ? "—" : `${Math.round(f.culpaMedia * 100)} %`}`}>
          <span className="truncate">{nombreFamilia(f.familia)}</span>
          <span className="recuadro h-2 overflow-hidden rounded"><span className="block h-full rounded-r" style={{ width: `${f.rectificados / max * 100}%`, background: COLOR_RECTIFICADO }} /></span>
          <strong className="text-right tabular-nums">{f.rectificados}</strong>
          <strong className="text-right tabular-nums">{f.conCausa}</strong>
        </div>} />
    </> : <ListaPaginada items={lista} clave={(x) => x.codigo} altoFila={24} vacio="Sin pedidos rectificados." render={(x) => {
      const pendiente = deLaSeccion(x, seccion) === "pendiente";
      const mayor = !pendiente && causaMayor(x, seccion) === "mayor";
      const que = pendiente ? "sin investigar" : `${Math.round((repartoNc(x).secciones[seccion] ?? 0) * 100)} %`;
      const abrible = onAbrirPedido && x.pedido;
      const pista = [x.descripcion && resumenNc(x.descripcion, 110), abrible ? "Pulsa para ver el pedido y su no conformidad" : null].filter(Boolean).join("\n");
      const fila = "grid h-full w-full grid-cols-[minmax(0,1fr)_2.75rem_auto] items-center gap-2 rounded-md! px-1.5 text-left text-[11px] hover:bg-surface-2";
      const contenido = <>
        <span className="min-w-0 truncate tabular-nums">
          <span className="font-semibold">{x.pedido ?? "—"}</span>
          {esMia(x, miId) && <span className="ml-1.5 text-[10px] font-semibold text-brand-800 dark:text-brand-300">tuyo</span>}
        </span>
        <span className="text-right tabular-nums text-text-muted">{fechaCorta(x.fecha)}</span>
        <span className={`justify-self-end rounded-full px-2 py-px text-[10px] font-semibold tabular-nums ${
          pendiente ? "bg-surface-2 font-medium text-text-muted" : mayor ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-surface-2 text-text"
        }`} title={pendiente ? "Calidad aún no lo ha investigado" : `La parte de ${nombreCorto} en este rectificado${mayor ? "; es la causa que más pesa" : ""}`}>{que}</span>
      </>;
      return abrible
        ? <button type="button" onClick={() => onAbrirPedido(x.pedido!)} title={pista} className={fila}>{contenido}</button>
        : <div title={pista} className={fila}>{contenido}</div>;
    }} />}
  </div>;
}

/** Un decimal, con coma: «3,2». Sin decimales si es entero. */
const decimal = (n: number) => (Math.round(n * 10) / 10).toLocaleString("es-ES", { maximumFractionDigits: 1 });

/** Las familias, y se ENTRA en una para ver sus causas, con «← Volver» para
 *  salir (Iván, 04/11/2026: «mini menús de entrar y salir»). Antes se
 *  desplegaban y el panel crecía sin fin. Mis correcciones y el motivo de
 *  devolución por familia. */
function PorFamiliaEntrar({ familias, color, vacio }: { familias: { familia: string; n: number; pct?: string; base?: number; detalle: FilaRanking[] }[]; color: string; vacio: string }) {
  const [dentro, setDentro] = useState<string | null>(null);
  const f = dentro ? familias.find((x) => x.familia === dentro) : undefined;
  if (f) return <div className="flex min-h-0 flex-1 flex-col gap-1.5">
    <div className="flex items-center gap-2 border-b border-border pb-1.5 text-[11px]">
      <button type="button" onClick={() => setDentro(null)} className="chip-3d shrink-0 px-2.5 py-0.5 text-[11px] font-semibold text-text">← Volver</button>
      <strong className="truncate">{nombreFamilia(f.familia)}</strong>
      <span className="ml-auto shrink-0 tabular-nums text-text-muted">{f.n}{f.pct ? ` · ${f.pct}` : ""}</span>
    </div>
    <Ranking filas={f.detalle} color={color} vacio="Sin detalle." />
  </div>;
  if (!familias.length) return <Vacio>{vacio}</Vacio>;
  const max = Math.max(...familias.map((x) => x.n));
  const conPct = familias.some((x) => x.pct !== undefined);
  return <ListaPaginada items={familias} clave={(x) => x.familia} render={(x) =>
    <button type="button" onClick={() => setDentro(x.familia)} title={`${x.base !== undefined ? `${nombreFamilia(x.familia)}: ${x.n} de ${x.base} OF. ` : ""}Pulsa para ver las causas`}
      className={`grid h-full w-full ${conPct ? "grid-cols-[minmax(0,1.3fr)_minmax(30px,1fr)_auto_2.75rem_.75rem]" : "grid-cols-[minmax(0,1.3fr)_minmax(30px,1fr)_auto_.75rem]"} items-center gap-2 rounded-md! px-1 text-left text-[11px] hover:bg-surface-2`}>
      <span className="truncate">{nombreFamilia(x.familia)}</span>
      <span className="recuadro h-2 overflow-hidden rounded"><span className="block h-full rounded-r" style={{ width: `${x.n / max * 100}%`, background: color }} /></span>
      <strong className="min-w-4 text-right tabular-nums">{x.n}</strong>
      {conPct && <span className="text-right tabular-nums text-text-muted">{x.pct}</span>}
      <span aria-hidden className="text-text-muted">›</span>
    </button>} />;
}

/** «Tus datos»: tu gráfica, tus correcciones y tus incidencias, en una fila
 *  alineada con las de arriba. Con la raya dorada de lo tuyo. */
function MisDatos({ anio, mes, unidad, detalle, cargando, causa, seccion, nombre, actualizando }: { anio: string; mes: string; unidad: string; detalle?: DetalleMetricas; cargando?: boolean; causa: (id: number | null) => string; seccion: SeccionId; nombre?: string; actualizando: boolean }) {
  if (!detalle) return <Panel titulo="Tus datos" extra={nombre} className="col-span-2 xl:col-span-6" mio><Vacio>{cargando ? "Consultando tus datos…" : "No se pudieron consultar tus datos. Prueba a recargar."}</Vacio></Panel>;
  const p = detalle.personal;
  const sinRevision = SECCIONES[seccion].sinRevision === true;
  const filas = delAnio(anio, p.meses);
  const sumaAnio = (k: "entregadas" | "sinRevision" | "correcciones" | "incidencias") => p.meses.reduce((s, x) => s + (x[k] ?? 0), 0);
  const delPeriodo = (k: "entregadas" | "sinRevision" | "correcciones" | "incidencias") => mes ? p.meses.find((x) => x.mes === mes)?.[k] ?? 0 : sumaAnio(k);
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
  const ancho = ANCHO[sinRevision ? 2 : 3];
  return <>
    <Panel titulo="Mis OF por mes" extra={`Año ${anio}`} actualizando={actualizando} className={ancho} mio>
      <MetricasGrafica llenar titulo="Mis OF por mes" resaltar={mes || undefined} series={series}
        puntos={filas.map(({ mes, fila }) => ({ mes, valores: fila ? valoresDe(fila) : series.map(() => null) }))} />
    </Panel>
    {!sinRevision && <Panel titulo="Mis correcciones" extra={String(p.correcciones)} actualizando={actualizando} className={ancho} mio>
      <PorFamiliaEntrar color={SERIES[1].color} vacio={`No te han devuelto OF este ${unidad}.`} familias={p.correccionesPorFamilia.map((f) => ({ familia: f.familia, n: f.n, detalle: f.porCausa.map((x) => ({ etiqueta: causa(x.id), n: x.n })) }))} />
    </Panel>}
    <Panel titulo="Mis incidencias" extra={p.incidencias === null ? undefined : `${p.incidencias} · ${sobre(p.incidencias, p.entregadas)} de ${p.entregadas}`} actualizando={actualizando} className={ancho} mio>
      <div className="flex min-h-0 flex-1 flex-col" title={`${queIncidencia}, sobre tus ${p.entregadas} OF pasadas.`}>
      {p.incidencias === null ? <Vacio>Datos de RPS no disponibles.</Vacio> : <Ranking color={COLOR_DEVUELTA} vacio={`Sin incidencias en tus OF este ${unidad}.`} filas={p.incidenciasPorFamilia.map((f) => ({ etiqueta: nombreFamilia(f.familia), n: f.n, pct: sobre(f.n, f.base), titulo: `${nombreFamilia(f.familia)}: ${f.n} con incidencia de ${f.base} que pasaste` }))} />}
      </div>
    </Panel>
  </>;
}

/** Atenuado mientras se cambia de periodo. Con retraso al entrar: si los
 *  datos llegan enseguida no se ve parpadeo ninguno; al salir, al momento. */
const atenuado = (si: boolean) => si ? "opacity-55 delay-150" : "opacity-100 delay-0";
function Panel({ titulo, extra, actualizando = false, mio = false, className = "col-span-2", children }: { titulo: string; extra?: string; actualizando?: boolean; /** Lo mío: con la raya dorada, para no confundirlo con lo del equipo. */ mio?: boolean; /** Cuántas columnas de la rejilla ocupa. */ className?: string; children: ReactNode }) {
  // Alto fijo en pantallas pequeñas; en las grandes, el de su fila de la rejilla.
  return <section aria-busy={actualizando} className={`metricas-panel glass-panel flex h-72 min-h-0 min-w-0 flex-col overflow-hidden rounded-xl p-3 xl:h-auto ${mio ? "metricas-mio" : ""} ${className}`}><h3 className="mb-2 flex shrink-0 flex-wrap items-baseline justify-between gap-1 text-[11px] font-semibold uppercase tracking-[.08em] text-text-muted">{titulo}{extra && <span className="text-[10px] font-normal normal-case tracking-normal first-letter:uppercase">{extra}</span>}</h3><div className={`flex min-h-0 flex-1 flex-col transition-opacity duration-200 motion-reduce:transition-none ${atenuado(actualizando)}`}>{children}</div></section>;
}
function Vacio({ children }: { children: ReactNode }) { return <p className="flex flex-1 items-center justify-center py-4 text-center text-xs text-text-muted">{children}</p>; }
function Delta({ ahora, antes, puntos, frente, sinDato }: { ahora: number | null; antes: number | null; puntos?: boolean; frente: string; sinDato?: string | null }) {
  if (ahora === null || antes === null || !Number.isFinite(antes)) return <span>{sinDato ?? "sin comparación"}</span>;
  const diferencia = ahora - antes;
  const valor = puntos ? `${Math.abs(diferencia).toFixed(1).replace(".", ",")} ptos` : antes === 0 ? String(Math.abs(diferencia)) : `${Math.round(Math.abs(diferencia / antes) * 100)} %`;
  return <span title={`${frente}. Antes: ${puntos ? `${Math.round(antes)} %` : antes}. Los mismos días si el periodo está en curso.`}><strong className="font-semibold text-text">{diferencia === 0 ? "=" : diferencia > 0 ? "▲" : "▼"} {valor}</strong></span>;
}
/** Una cifra del cuadro: el nombre, el número grande y, debajo, la
 *  comparación. Lo que explica cómo se cuenta, al pasar el ratón (Iván,
 *  04/11/2026: «sin textos explicativos»). `malo`: que suba es peor. */
function Tile({ titulo, valor, extra, ayuda, delta, mio = false }: { titulo: string; valor: string; extra?: string; ayuda: string; delta: ReactNode; mio?: boolean }) {
  return <div className={`glass-panel min-w-0 rounded-xl px-3 py-2.5 ${mio ? "metricas-panel metricas-mio" : ""}`} title={ayuda}>
    <div className="truncate text-[10px] font-semibold uppercase tracking-[.08em] text-text-muted">{titulo}</div>
    <div className="mt-1 flex items-baseline gap-1.5">
      <span className="text-2xl leading-none font-bold tracking-tight tabular-nums">{valor}</span>
      {extra && <span className="text-xs font-semibold tabular-nums text-text-muted">{extra}</span>}
    </div>
    <div className="mt-1 truncate text-[10px] text-text-muted">{delta}</div>
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
  return <MetricasGrafica llenar titulo="Actividad del equipo mes a mes" resaltar={mes || undefined}
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
/** Cuánto tarda, en simple (Iván, 04/11/2026): los tramos que de verdad se
 *  miran, un número cada uno. Lo de cómo se cuenta, al pasar el ratón. */
function Recorrido({ m }: { m: Metricas }) {
  const t = m.tiempos;
  const tramos: { nombre: string; tramo: Tramo; ayuda: string }[] = [
    { nombre: "Espera a revisión", tramo: t.esperaCola, ayuda: "De pasarla a revisar a que el revisor la abre" },
    { nombre: "Revisión", tramo: t.repaso, ayuda: "De abrirla el revisor a aprobarla o devolverla" },
    { nombre: "Corrección", tramo: t.correccion, ayuda: "De ponerse a corregirla a volver a entregarla" },
    { nombre: "Hasta Producción", tramo: t.hastaProduccion, ayuda: "De aprobarse a pasar el pedido" },
  ];
  if (tramos.every((x) => !x.tramo.n)) return <Vacio>Sin datos en este periodo.</Vacio>;
  return <dl className="grid grid-cols-2 gap-2">
    {tramos.map((x) => <div key={x.nombre} className="metricas-cifra rounded-lg px-2.5 py-2" title={`${x.ayuda}. Lo normal, contando noches y fines de semana; ${x.tramo.n} medidas.`}>
      <dt className="truncate text-[10px] text-text-muted">{x.nombre}</dt>
      <dd className="text-lg leading-tight font-bold tabular-nums">{tiempo(x.tramo.medianaMin)}</dd>
    </div>)}
  </dl>;
}
/** `pct` va en su propia columna para que los % queden alineados. */
interface FilaRanking { etiqueta: string; n: number; pct?: string; titulo?: string }
function Ranking({ filas, color, vacio }: { filas: FilaRanking[]; color: string; vacio: string }) {
  if (!filas.length) return <Vacio>{vacio}</Vacio>;
  const max = Math.max(...filas.map((f) => f.n));
  const conPct = filas.some((f) => f.pct !== undefined);
  return <ListaPaginada items={filas} clave={(f) => f.etiqueta} render={(f) =>
    <div className={`grid h-full ${conPct ? "grid-cols-[minmax(0,1.3fr)_minmax(30px,1fr)_auto_2.75rem]" : "grid-cols-[minmax(0,1.3fr)_minmax(30px,1fr)_auto]"} items-center gap-2 text-[11px]`} title={f.titulo ?? `${f.etiqueta}: ${f.n}`}>
      <span className="truncate">{f.etiqueta}</span>
      <span className="recuadro h-2 overflow-hidden rounded"><span className="block h-full rounded-r" style={{ width: `${f.n / max * 100}%`, background: color }} /></span>
      <strong className="min-w-4 text-right tabular-nums">{f.n}</strong>
      {conPct && <span className="text-right tabular-nums text-text-muted">{f.pct}</span>}
    </div>} />;
}

/** Una lista que nunca desborda su panel (Iván, 04/11/2026: «que no haya
 *  scroll nunca»): mide el alto que tiene, enseña las filas que caben y, si
 *  hay más, pasa de página con ‹ 1/3 ›. Cambiar de periodo vuelve a la 1. */
function ListaPaginada<T>({ items, render, clave, altoFila = 20, vacio = "Nada en este periodo." }: { items: readonly T[]; render: (item: T) => ReactNode; clave: (item: T) => string; altoFila?: number; vacio?: string }) {
  const [alto, setAlto] = useState(0);
  const [pagina, setPagina] = useState(0);
  // Se mide en cuanto aparece la caja (con una referencia que observa), no en
  // un efecto de montaje: si la lista llegaba vacía y luego se llenaba, el
  // efecto ya había pasado sin caja y la lista se quedaba sin medir.
  const observador = useRef<ResizeObserver | null>(null);
  const caja = useCallback((el: HTMLDivElement | null) => {
    observador.current?.disconnect();
    observador.current = null;
    if (!el) return;
    setAlto(Math.floor(el.getBoundingClientRect().height));
    const o = new ResizeObserver(([e]) => setAlto(Math.floor(e.contentRect.height)));
    o.observe(el);
    observador.current = o;
  }, []);
  if (!items.length) return <Vacio>{vacio}</Vacio>;
  const PIE = 26;
  const caben = Math.max(1, Math.floor(alto / altoFila));
  const porPagina = items.length > caben ? Math.max(1, Math.floor((alto - PIE) / altoFila)) : caben;
  const paginas = Math.max(1, Math.ceil(items.length / porPagina));
  const actual = Math.min(pagina, paginas - 1);
  const vistos = alto ? items.slice(actual * porPagina, actual * porPagina + porPagina) : [];
  const flecha = "chip-3d grid size-6 place-items-center text-[11px] font-bold text-text disabled:opacity-35";
  return <div ref={caja} className="flex min-h-24 flex-1 flex-col overflow-hidden xl:min-h-0">
    <div className="flex flex-col">{vistos.map((it) => <div key={clave(it)} style={{ height: altoFila }}>{render(it)}</div>)}</div>
    {paginas > 1 && <div className="mt-auto flex shrink-0 items-center justify-end gap-1.5 pt-1 text-[11px] tabular-nums text-text-muted" style={{ height: PIE }}>
      <button type="button" onClick={() => setPagina(actual - 1)} disabled={actual === 0} aria-label="Página anterior" className={flecha}>‹</button>
      <span>{actual + 1} / {paginas}</span>
      <button type="button" onClick={() => setPagina(actual + 1)} disabled={actual >= paginas - 1} aria-label="Página siguiente" className={flecha}>›</button>
    </div>}
  </div>;
}
