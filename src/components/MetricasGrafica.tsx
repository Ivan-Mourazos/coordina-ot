import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";

export interface SerieMetricas {
  etiqueta: string;
  color: string;
  /** La cantidad que sale en la leyenda, al lado del nombre (Iván,
   *  21/10/2026: con las líneas solas no se sabía cuántas eran). */
  valor?: number | string;
  /** Apagada de entrada: está, pero solo se ve si alguien la enciende en la
   *  leyenda (Iván, 17/11/2026). */
  oculta?: boolean;
}

/** El paso de eje redondo (1, 2, 5, 10, 20, 25, 50…) que cubre `bruto`.
 *  Siempre entero: son OF, no hay media OF. */
export function pasoRedondo(bruto: number): number {
  const magnitud = 10 ** Math.floor(Math.log10(Math.max(1, bruto)));
  const opciones = magnitud >= 10 ? [1, 2, 2.5, 5, 10] : [1, 2, 5, 10];
  return opciones.map((o) => o * magnitud).find((p) => p >= bruto) ?? 10 * magnitud;
}

const nombreMes = (mes: string, conAnio: boolean, largo = false) =>
  new Date(`${mes}-15T12:00:00`).toLocaleDateString("es", { month: largo ? "long" : "short", ...(conAnio ? { year: largo ? "numeric" : "2-digit" } : {}) });

/** Qué líneas ha encendido o apagado cada uno, por gráfica, en el navegador.
 *  Solo lo que tocó: una serie nueva entra con su valor por defecto. Sin
 *  `guardarComo`, la elección dura la visita. */
const oyentesElecciones = new Set<() => void>();
const enMemoria = new Map<string, string>();
function suscribirElecciones(avisar: () => void) {
  oyentesElecciones.add(avisar);
  window.addEventListener("storage", avisar);
  return () => { oyentesElecciones.delete(avisar); window.removeEventListener("storage", avisar); };
}
function leerElecciones(clave: string) {
  try { return localStorage.getItem(clave) ?? enMemoria.get(clave) ?? "{}"; } catch { return enMemoria.get(clave) ?? "{}"; }
}
function useElecciones(guardarComo?: string) {
  const clave = `coordina:grafica:${guardarComo ?? "visita"}`;
  const texto = useSyncExternalStore(suscribirElecciones, () => guardarComo ? leerElecciones(clave) : enMemoria.get(clave) ?? "{}", () => "{}");
  const elecciones = useMemo<Record<string, boolean>>(() => { try { return JSON.parse(texto) ?? {}; } catch { return {}; } }, [texto]);
  const elegir = (etiqueta: string, visible: boolean) => {
    const nuevas = JSON.stringify({ ...elecciones, [etiqueta]: visible });
    enMemoria.set(clave, nuevas);
    if (guardarComo) try { localStorage.setItem(clave, nuevas); } catch { /* sin almacenamiento: vale para esta visita */ }
    for (const o of oyentesElecciones) o();
  };
  return [elecciones, elegir] as const;
}

/** Un eje compartido y valores reales, incluidos los meses sin actividad.
 *
 *  `null` es «no hay dato» —un mes que aún no ha llegado, o de antes de que la
 *  web registrara nada— y no se pinta: dibujarlo a cero diría que ese mes no
 *  se trabajó. Un 0 de verdad sí se pinta.
 *
 *  Cada línea se enciende o apaga desde la leyenda y la escala se ajusta a las
 *  que se ven; al pasar el ratón (o con las flechas) una ficha da todas las
 *  líneas de ese mes (Iván, 17/11/2026). */
export function MetricasGrafica({ puntos, series, titulo, resaltar, llenar = false, guardarComo }: {
  puntos: { mes: string; valores: (number | null)[] }[];
  series: readonly SerieMetricas[];
  titulo: string;
  /** El mes elegido arriba ("2026-10"), con una franja detrás. */
  resaltar?: string;
  /** Ocupa todo el alto de su panel (Métricas sin scroll, 04/11/2026). */
  llenar?: boolean;
  /** Dónde recordar qué líneas se ven. Sin él, la elección dura la visita. */
  guardarComo?: string;
}) {
  const [elecciones, elegir] = useElecciones(guardarComo);
  const visible = series.map((s) => elecciones[s.etiqueta] ?? !s.oculta);
  const sinActividad = !puntos.some((p) => p.valores.some((n) => (n ?? 0) > 0));
  const contenedor = useRef<HTMLDivElement>(null);
  const [{ ancho, alto }, setMedida] = useState({ ancho: 720, alto: 144 });
  const [activo, setActivo] = useState<number | null>(null);
  useEffect(() => {
    const elemento = contenedor.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([entrada]) => {
      const ancho = Math.max(200, Math.round(entrada.contentRect.width));
      const alto = Math.max(70, Math.round(entrada.contentRect.height));
      setMedida((antes) => antes.ancho === ancho && antes.alto === alto ? antes : { ancho, alto });
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [sinActividad]);
  // La escala, de las líneas que se ven: apagar la grande deja leer las pequeñas.
  const max = Math.max(1, ...puntos.flatMap((p) => p.valores.map((n, j) => visible[j] ? n ?? 0 : 0)));
  // Marcas REDONDAS (0 · 100 · 200 · 300), unas cuatro. Antes el techo era el
  // máximo redondeado a decenas y solo se marcaba la mitad: salían 165 y 330,
  // que no se leen de un vistazo (Iván, 21/10/2026).
  const paso = pasoRedondo(max / 4);
  const techo = Math.ceil(max / paso) * paso;
  const marcas = Array.from({ length: techo / paso + 1 }, (_, i) => i * paso);
  const derecha = ancho - 12;
  const x = (i: number) => puntos.length === 1 ? (34 + derecha) / 2 : 34 + i * (derecha - 34) / (puntos.length - 1);
  const y = (n: number) => alto - 22 - n / techo * (alto - 32);
  const pasoEtiqueta = Math.max(1, Math.ceil(puntos.length / Math.max(2, Math.floor(ancho / 40))));
  const variosAnios = puntos[0]?.mes.slice(0, 4) !== puntos.at(-1)?.mes.slice(0, 4);
  // Tramos seguidos con dato: un hueco (null) corta la línea.
  const tramos = (j: number) => {
    const salida: string[] = [];
    let actual: string[] = [];
    puntos.forEach((p, i) => {
      const v = p.valores[j];
      if (v === null || v === undefined) { if (actual.length) salida.push(actual.join(" ")); actual = []; return; }
      actual.push(`${x(i)},${y(v)}`);
    });
    if (actual.length) salida.push(actual.join(" "));
    return salida;
  };
  const iResaltado = resaltar ? puntos.findIndex((p) => p.mes === resaltar) : -1;
  const medio = puntos.length > 1 ? (derecha - 34) / (puntos.length - 1) / 2 : 20;
  // El mes más cercano al ratón: se apunta a una fecha, no a una línea de 2 px.
  const alMover = (e: PointerEvent<SVGSVGElement>) => {
    const caja = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - caja.left) * ancho / caja.width;
    const i = puntos.length === 1 ? 0 : Math.round((px - 34) / ((derecha - 34) / (puntos.length - 1)));
    setActivo(Math.min(puntos.length - 1, Math.max(0, i)));
  };
  const conDato = (i: number) => puntos[i]?.valores.some((v, j) => visible[j] && v !== null && v !== undefined);
  const alTeclear = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "Escape") { setActivo(null); return; }
    const salto = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!salto) return;
    e.preventDefault();
    setActivo((a) => Math.min(puntos.length - 1, Math.max(0, (a ?? (salto > 0 ? -1 : puntos.length)) + salto)));
  };
  // Al entrar con el tabulador, el mes elegido o el último con datos.
  const alEnfocar = () => setActivo((a) => a ?? (iResaltado >= 0 ? iResaltado : Math.max(0, puntos.findLastIndex((_, i) => conDato(i)))));
  const filaActiva = activo === null ? null : puntos[activo];
  const aLaIzquierda = activo !== null && x(activo) > ancho * 0.6;
  const enVista = series.map((s, j) => ({ s, j })).filter(({ j }) => visible[j]);
  return <div className={`metricas-grafica flex min-h-0 flex-col gap-1.5 ${llenar ? "flex-1" : "shrink-0"}`}>
    <div className="flex flex-wrap gap-x-1 gap-y-0.5 text-[10px] text-text-muted" role="group" aria-label={`Líneas de ${titulo}`}>
      {series.map((s, j) => <button key={s.etiqueta} type="button" aria-pressed={visible[j]} onClick={() => elegir(s.etiqueta, !visible[j])}
        title={visible[j] ? `Ocultar ${s.etiqueta}` : `Mostrar ${s.etiqueta}`}
        className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-opacity hover:bg-surface-2 motion-reduce:transition-none ${visible[j] ? "" : "opacity-45"}`}>
        <i className="h-1.5 w-3 rounded-full border-[1.5px]" style={{ borderColor: s.color, background: visible[j] ? s.color : "transparent" }} />
        <span className={visible[j] ? "" : "line-through"}>{s.etiqueta}</span>
        {s.valor !== undefined && <strong className="font-bold tabular-nums text-text">{s.valor}</strong>}
      </button>)}
    </div>
    {sinActividad ? <p className="py-6 text-center text-xs text-text-muted">Sin actividad en este periodo.</p> :
      <div ref={contenedor} className={`relative w-full min-w-0 ${llenar ? "min-h-[70px] flex-1" : "h-[var(--alto-grafica,144px)] shrink-0"}`}>
        <svg viewBox={`0 0 ${ancho} ${alto}`} className="size-full touch-none overflow-visible rounded-md outline-none focus-visible:ring-2 focus-visible:ring-focus" role="img" tabIndex={0}
          onPointerMove={alMover} onPointerLeave={() => setActivo(null)} onKeyDown={alTeclear} onFocus={alEnfocar} onBlur={() => setActivo(null)}
          aria-label={`${titulo}. Flechas para recorrer los meses. ${puntos.filter((p) => p.valores.some((v, j) => visible[j] && v !== null)).map((p) => `${p.mes}: ${enVista.map(({ s, j }) => `${s.etiqueta} ${p.valores[j] ?? "sin dato"}`).join(", ")}`).join("; ")}`}>
          {iResaltado >= 0 && <rect x={x(iResaltado) - medio} y={4} width={medio * 2} height={alto - 26} rx={4} fill="var(--surface-2)" opacity={0.7} />}
          {marcas.map((n) => <g key={n}><line x1="34" x2={derecha} y1={y(n)} y2={y(n)} stroke="var(--border)" strokeOpacity={n === 0 ? 1 : 0.6} /><text x="26" y={y(n) + 3} fill="var(--text-muted)" fontSize="9" textAnchor="end">{n}</text></g>)}
          {activo !== null && <line x1={x(activo)} x2={x(activo)} y1={4} y2={alto - 22} stroke="var(--text-muted)" strokeOpacity={0.5} />}
          {enVista.map(({ s, j }) => <g key={s.etiqueta}>
            {tramos(j).map((pts) => <polyline key={pts} points={pts} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
            {puntos.map((p, i) => p.valores[j] === null || p.valores[j] === undefined ? null : <circle key={p.mes} cx={x(i)} cy={y(p.valores[j]!)} r={i === activo ? 4 : i === iResaltado ? 3.5 : 2.5} fill={s.color} stroke={i === activo ? "var(--surface)" : undefined} strokeWidth={2} />)}
          </g>)}
          {puntos.map((p, i) => i % pasoEtiqueta === 0 || i === puntos.length - 1 ? <text key={p.mes} x={x(i)} y={alto - 6} fill={i === iResaltado || i === activo ? "var(--text)" : "var(--text-muted)"} fontWeight={i === iResaltado ? 700 : 400} fontSize="9" textAnchor="middle">{nombreMes(p.mes, variosAnios)}</text> : null)}
        </svg>
        {filaActiva && <div aria-hidden className="glass-panel-strong pointer-events-none absolute top-1 z-10 min-w-32 rounded-lg px-2.5 py-1.5 text-[11px] shadow-lg"
          style={aLaIzquierda ? { right: ancho - x(activo!) + 10 } : { left: x(activo!) + 10 }}>
          <div className="mb-1 font-semibold text-text first-letter:uppercase">{nombreMes(filaActiva.mes, true, true)}</div>
          {enVista.length === 0 ? <div className="text-text-muted">Ninguna línea encendida</div> : enVista.map(({ s, j }) => <div key={s.etiqueta} className="flex items-center gap-2">
            <i className="h-1 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
            <strong className="min-w-6 text-right font-bold tabular-nums text-text">{filaActiva.valores[j] ?? "—"}</strong>
            <span className="text-text-muted">{s.etiqueta}</span>
          </div>)}
        </div>}
        <span className="sr-only" aria-live="polite">{filaActiva ? `${nombreMes(filaActiva.mes, true, true)}: ${enVista.map(({ s, j }) => `${s.etiqueta} ${filaActiva.valores[j] ?? "sin dato"}`).join(", ")}` : ""}</span>
      </div>}
  </div>;
}
