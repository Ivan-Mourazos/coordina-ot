import { useEffect, useRef, useState } from "react";

export interface SerieMetricas {
  etiqueta: string;
  color: string;
  /** La cantidad que sale en la leyenda, al lado del nombre (Iván,
   *  21/10/2026: con las líneas solas no se sabía cuántas eran). */
  valor?: number | string;
}

/** Un eje compartido y valores reales, incluidos los meses sin actividad.
 *
 *  `null` es «no hay dato» —un mes que aún no ha llegado, o de antes de que la
 *  web registrara nada— y no se pinta: dibujarlo a cero diría que ese mes no
 *  se trabajó. Un 0 de verdad sí se pinta. */
export function MetricasGrafica({ puntos, series, titulo, resaltar }: {
  puntos: { mes: string; valores: (number | null)[] }[];
  series: readonly SerieMetricas[];
  titulo: string;
  /** El mes elegido arriba ("2026-10"), con una franja detrás. */
  resaltar?: string;
}) {
  const sinActividad = !puntos.some((p) => p.valores.some((n) => (n ?? 0) > 0));
  const contenedor = useRef<HTMLDivElement>(null);
  const [{ ancho, alto }, setMedida] = useState({ ancho: 720, alto: 144 });
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
  const max = Math.max(1, ...puntos.flatMap((p) => p.valores.map((n) => n ?? 0)));
  const techo = max <= 5 ? 6 : Math.ceil(max / 10) * 10;
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
  return <div className="metricas-grafica flex min-h-0 shrink-0 flex-col gap-1.5">
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-text-muted">{series.map((s) => <span key={s.etiqueta} className="flex items-center gap-1.5"><i className="h-1.5 w-3 rounded-full" style={{ background: s.color }} />{s.etiqueta}{s.valor !== undefined && <strong className="font-bold tabular-nums text-text">{s.valor}</strong>}</span>)}</div>
    {sinActividad ? <p className="py-6 text-center text-xs text-text-muted">Sin actividad en este periodo.</p> :
      <div ref={contenedor} className="h-[var(--alto-grafica,144px)] w-full min-w-0 shrink-0"><svg viewBox={`0 0 ${ancho} ${alto}`} className="size-full overflow-visible" role="img" aria-label={`${titulo}. ${puntos.filter((p) => p.valores.some((v) => v !== null)).map((p) => `${p.mes}: ${series.map((s, i) => `${s.etiqueta} ${p.valores[i]}`).join(", ")}`).join("; ")}`}>
        {iResaltado >= 0 && <rect x={x(iResaltado) - medio} y={4} width={medio * 2} height={alto - 26} rx={4} fill="var(--surface-2)" opacity={0.7} />}
        {[0, .5, 1].map((n) => <g key={n}><line x1="34" x2={derecha} y1={y(n * techo)} y2={y(n * techo)} stroke="var(--border)" strokeDasharray={n === 0 ? undefined : "3 5"} /><text x="26" y={y(n * techo) + 3} fill="var(--text-muted)" fontSize="9" textAnchor="end">{n * techo}</text></g>)}
        {series.map((s, j) => <g key={s.etiqueta}>
          {tramos(j).map((pts) => <polyline key={pts} points={pts} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
          {puntos.map((p, i) => p.valores[j] === null || p.valores[j] === undefined ? null : <circle key={p.mes} cx={x(i)} cy={y(p.valores[j]!)} r={i === iResaltado ? 3.5 : 2.5} fill={s.color}><title>{p.mes} · {s.etiqueta}: {p.valores[j]}</title></circle>)}
        </g>)}
        {puntos.map((p, i) => i % pasoEtiqueta === 0 || i === puntos.length - 1 ? <text key={p.mes} x={x(i)} y={alto - 6} fill={i === iResaltado ? "var(--text)" : "var(--text-muted)"} fontWeight={i === iResaltado ? 700 : 400} fontSize="9" textAnchor="middle">{new Date(`${p.mes}-15T12:00:00`).toLocaleDateString("es", { month: "short", ...(variosAnios ? { year: "2-digit" } : {}) })}</text> : null)}
      </svg></div>}
  </div>;
}
