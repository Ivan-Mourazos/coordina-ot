import { useEffect, useRef, useState } from "react";

export interface SerieMetricas { etiqueta: string; color: string }

/** Un eje compartido y valores reales, incluidos los meses sin actividad. */
export function MetricasGrafica({ puntos, series, titulo }: {
  puntos: { mes: string; valores: number[] }[];
  series: readonly SerieMetricas[];
  titulo: string;
}) {
  const sinActividad = !puntos.some((p) => p.valores.some((n) => n > 0));
  const contenedor = useRef<HTMLDivElement>(null);
  const [{ ancho, alto }, setMedida] = useState({ ancho: 720, alto: 144 });
  useEffect(() => {
    const elemento = contenedor.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([entrada]) => {
      const ancho = Math.max(200, Math.round(entrada.contentRect.width));
      const alto = Math.max(80, Math.round(entrada.contentRect.height));
      setMedida((antes) => antes.ancho === ancho && antes.alto === alto ? antes : { ancho, alto });
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [sinActividad]);
  const max = Math.max(1, ...puntos.flatMap((p) => p.valores));
  const techo = max <= 5 ? 6 : Math.ceil(max / 10) * 10;
  const derecha = ancho - 16;
  const x = (i: number) => puntos.length === 1 ? (38 + derecha) / 2 : 38 + i * (derecha - 38) / (puntos.length - 1);
  const y = (n: number) => alto - 28 - n / techo * (alto - 44);
  const pasoEtiqueta = Math.max(1, Math.ceil(puntos.length / Math.max(2, Math.floor(ancho / 55))));
  return <div className="metricas-grafica flex min-h-0 shrink-0 flex-col gap-2">
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-text-muted">{series.map((s) => <span key={s.etiqueta} className="flex items-center gap-1.5"><i className="h-1.5 w-3 rounded-full" style={{ background: s.color }} />{s.etiqueta}</span>)}</div>
    {sinActividad ? <p className="py-8 text-center text-xs text-text-muted">Sin actividad en este periodo.</p> :
      <div ref={contenedor} className="h-[var(--alto-grafica,144px)] w-full min-w-0 shrink-0"><svg viewBox={`0 0 ${ancho} ${alto}`} className="size-full overflow-visible" role="img" aria-label={`${titulo}. ${puntos.map((p) => `${p.mes}: ${series.map((s, i) => `${s.etiqueta} ${p.valores[i]}`).join(", ")}`).join("; ")}`}>
        {[0, .5, 1].map((n) => <g key={n}><line x1="38" x2={derecha} y1={y(n * techo)} y2={y(n * techo)} stroke="var(--border)" strokeDasharray={n === 0 ? undefined : "3 5"} /><text x="28" y={y(n * techo) + 3} fill="var(--text-muted)" fontSize="10" textAnchor="end">{n * techo}</text></g>)}
        {series.map((s, j) => <g key={s.etiqueta}>
          <polyline points={puntos.map((p, i) => `${x(i)},${y(p.valores[j])}`).join(" ")} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {puntos.map((p, i) => <circle key={p.mes} cx={x(i)} cy={y(p.valores[j])} r={puntos.length === 1 ? 4 : 2.5} fill={s.color}><title>{p.mes} · {s.etiqueta}: {p.valores[j]}</title></circle>)}
        </g>)}
        {puntos.map((p, i) => i % pasoEtiqueta === 0 || i === puntos.length - 1 ? <text key={p.mes} x={x(i)} y={alto - 8} fill="var(--text-muted)" fontSize="10" textAnchor="middle">{new Date(`${p.mes}-15T12:00:00`).toLocaleDateString("es", { month: "short", ...(puntos[0]?.mes.slice(0, 4) !== puntos.at(-1)?.mes.slice(0, 4) ? { year: "2-digit" } : {}) })}</text> : null)}
      </svg></div>}
  </div>;
}
