"use client";

import { useEffect, useState } from "react";
import { causaMayor, esCausaNuestra, repartoNc, resumenNc, textoProcesos, type NoConformidad } from "@/lib/no-conformidad";
import { SECCIONES, type SeccionId } from "@/lib/secciones";

// ─── Las no conformidades del pedido, EN LA FICHA ────────────────────────────
// Si Calidad abrió una NC por este pedido, quien lo mira tiene que saberlo, y
// en qué pedido se rectificó. Y al revés: si este pedido ES la rectificación
// de otro, saber de cuál viene es lo primero para plantearlo bien.
//
// A la vista, lo justo: qué NC, dónde se rectificó y qué parte es nuestra. El
// resto —el reparto por sección y por tipo de causa, los defectos con sus
// causas, el texto entero y los comentarios de Calidad— en «Ver detalles»
// (Iván, 26/10/2026).
//
// Se pide al abrir la ficha (una consulta pequeña) y sale SOLO si hay algo:
// un bloque vacío en cada ficha enseñaría a no mirarlo. Si RPS falla, tampoco
// sale: es un aviso, no algo que haga falta para trabajar.
//
// Lo usan el tablero y el Historial, de todas las secciones: la NC es del
// pedido, no de quien lo trabaja.

const pct = (n: number) => `${Math.round(n * 100)} %`;
const fmt = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : "");
const NUESTRAS = Object.keys(SECCIONES) as SeccionId[];

/** El código del otro pedido, que abre su parte escaneado. La hoja en papel
 *  de la NC («No conformidad en pedido de cliente») no está adjunta a la NC en
 *  RPS: viene escaneada con el PEDIDO RECTIFICATIVO, así que desde el original
 *  se llega a ella por aquí. Lo sirve la ruta de siempre del PDF del pedido. */
function EnlaceParte({ pedido, titulo }: { pedido: string; titulo: string }) {
  return (
    <a
      href={`/api/pedidos/${encodeURIComponent(pedido)}.pdf`}
      target="_blank"
      rel="noreferrer"
      title={titulo}
      className="underline decoration-dotted underline-offset-2 hover:decoration-solid"
    >
      {pedido}
    </a>
  );
}

/** La parte de cada sección nuestra, en una línea: «OT 5 % · causa menor».
 *  Pesada como en Métricas (ver `repartoNc`). */
function ParteNuestra({ nc }: { nc: NoConformidad }) {
  if (!nc.causas.length) return <span className="mt-1 block text-[11px] text-text-muted">Sin causas todavía: pendiente de investigar.</span>;
  const r = repartoNc(nc);
  const nuestras = NUESTRAS.filter((s) => (r.secciones[s] ?? 0) > 0);
  if (!nuestras.length) return <span className="mt-1 block text-[11px] text-text-muted">Sin causas de planteamiento ni de diseño gráfico.</span>;
  return (
    <span className="mt-1 block text-[11px] font-semibold text-text">
      {nuestras.map((s, i) => (
        <span key={s}>
          {i > 0 && " · "}
          {SECCIONES[s].nombreCorto} {pct(r.secciones[s] ?? 0)} ({causaMayor(nc, s) === "mayor" ? "causa mayor" : "causa menor"})
        </span>
      ))}
    </span>
  );
}

/** El reparto entero de la NC en barras: cada sección nuestra y cada tipo de
 *  causa ajeno, de mayor a menor. Suma 100 %. */
function Reparto({ nc }: { nc: NoConformidad }) {
  const r = repartoNc(nc);
  const filas = [
    ...NUESTRAS.filter((s) => (r.secciones[s] ?? 0) > 0).map((s) => ({ nombre: SECCIONES[s].nombre, peso: r.secciones[s] ?? 0, nuestra: true })),
    ...Object.entries(r.otros).map(([tipo, peso]) => ({ nombre: tipo.charAt(0) + tipo.slice(1).toLowerCase(), peso, nuestra: false })),
  ].sort((a, b) => b.peso - a.peso);
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted" title="Cada defecto de la NC vale lo mismo y reparte su 100 % entre sus causas según el % de Calidad.">Reparto de la culpa</p>
      <ul className="space-y-1">
        {filas.map((f) => (
          <li key={f.nombre} className="grid grid-cols-[minmax(0,1.4fr)_minmax(40px,1fr)_2.75rem] items-center gap-2 text-[11px]">
            <span className={`truncate ${f.nuestra ? "font-semibold text-text" : "text-text-muted"}`}>{f.nombre}</span>
            <span className="recuadro h-2 overflow-hidden rounded">
              <span className={`block h-full rounded-r ${f.nuestra ? "bg-amber-600 dark:bg-amber-400" : "bg-border-strong"}`} style={{ width: `${f.peso * 100}%` }} />
            </span>
            <span className="text-right font-semibold tabular-nums">{pct(f.peso)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Los defectos, cada uno con sus causas: quién, de qué tipo, con qué % del
 *  defecto y qué pasó. Las nuestras, marcadas. */
function Defectos({ nc }: { nc: NoConformidad }) {
  const numeros = [...new Set([...nc.defectos.map((d) => d.numero), ...nc.causas.map((c) => c.defecto)])].sort((a, b) => a - b);
  if (!numeros.length) return null;
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Defectos y causas</p>
      <ol className="space-y-2">
        {numeros.map((n) => {
          const d = nc.defectos.find((x) => x.numero === n);
          const causas = nc.causas.filter((c) => c.defecto === n);
          return (
            <li key={n} className="text-[11px] leading-snug">
              <span className="font-semibold text-text">Defecto {n}</span>
              {d?.tipo && <span className="text-text-muted"> · {d.tipo.toLowerCase()}</span>}
              {d?.descripcion && <span className="block whitespace-pre-line text-text">{d.descripcion}</span>}
              {causas.length > 0 && (
                <ul className="mt-1 space-y-1 border-l-2 border-border pl-2">
                  {causas.map((c, i) => (
                    <li key={i} className={esCausaNuestra(c) ? "text-text" : "text-text-muted"}>
                      <span className={esCausaNuestra(c) ? "font-semibold" : ""}>{c.responsable || "Sin nombre"}</span>
                      {c.tipo && ` · ${c.tipo.toLowerCase()}`}
                      {c.contribucion != null && c.contribucion > 0 && ` · ${c.contribucion} % del defecto`}
                      {c.texto && <span className="block whitespace-pre-line">{c.texto}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Todo lo que no cabe a la vista, plegado. */
function Detalles({ nc }: { nc: NoConformidad }) {
  return (
    <details className="group mt-1">
      <summary className="cursor-pointer list-none text-[11px] font-semibold text-amber-800 hover:underline dark:text-amber-300 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="mr-1 inline-block text-[8px] transition-transform group-open:rotate-90 motion-reduce:transition-none">▶</span>
        Ver detalles
      </summary>
      <div className="detalle-hundido mt-1 max-h-[28rem] space-y-3 overflow-y-auto rounded-md px-2.5 py-2">
        {nc.causas.length > 0 && <Reparto nc={nc} />}
        <Defectos nc={nc} />
        {nc.descripcion && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Lo que escribió Calidad</p>
            <p className="whitespace-pre-line text-[11px] leading-snug text-text">{nc.descripcion.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n")}</p>
          </div>
        )}
        {nc.comentarios && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Comentarios de Calidad</p>
            <p className="whitespace-pre-line text-[11px] leading-snug text-text">{nc.comentarios.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n")}</p>
          </div>
        )}
      </div>
    </details>
  );
}

/** Con `key={\`nc:${pedido}\`}` en quien lo pinta, como los documentos: al
 *  cambiar de pedido se monta de cero y no asoma un instante lo del anterior. */
export function NoConformidadesPedido({ pedido }: { pedido: string }) {
  const [nc, setNc] = useState<NoConformidad[] | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/pedidos/${encodeURIComponent(pedido)}/nc`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { nc: NoConformidad[] }) => vivo && setNc(d.nc))
      .catch(() => vivo && setNc([]));
    return () => {
      vivo = false;
    };
  }, [pedido]);

  if (!nc?.length) return null;
  const propias = nc.filter((x) => x.pedido === pedido);
  const rectifica = nc.filter((x) => x.pedido !== pedido && x.rectificativo === pedido);

  return (
    <section aria-label="No conformidades" className="bloque-3d relative mb-3 overflow-hidden rounded-xl p-3 pl-4">
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-amber-600 dark:bg-amber-400" />
      {propias.length > 0 && (
        <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-300">
          {propias.length === 1 ? "Tiene una no conformidad" : `Tiene ${propias.length} no conformidades`}
        </p>
      )}
      <ul className="mt-1 space-y-2.5">
        {propias.map((x) => (
          <li key={x.codigo} className="text-[11px] leading-snug">
            <span className="font-semibold text-text">{x.codigo}</span>
            <span className="text-text-muted">
              {" "}· {fmt(x.fecha)} · {textoProcesos(x)}
              {x.origen && ` · ${x.origen.toLowerCase()}`}
              {!x.cerrada && " · abierta"}
            </span>
            {x.rectificativo && (
              <span className="font-semibold text-text">
                {" "}· rectificado en <EnlaceParte pedido={x.rectificativo} titulo="Abre el parte del pedido rectificativo: la hoja de la no conformidad viene escaneada con él" />
              </span>
            )}
            {x.descripcion && <span className="block text-text-muted">{resumenNc(x.descripcion)}</span>}
            <ParteNuestra nc={x} />
            <Detalles nc={x} />
          </li>
        ))}
        {rectifica.map((x) => (
          <li key={`r:${x.codigo}`} className="text-[11px] leading-snug">
            <span className="text-[13px] font-semibold text-amber-800 dark:text-amber-300">
              Este pedido rectifica el {x.pedido ? <EnlaceParte pedido={x.pedido} titulo="Abre el parte del pedido original" /> : "pedido original"}
            </span>
            <span className="text-text-muted"> · {x.codigo} · {fmt(x.fecha)} · {textoProcesos(x)}</span>
            {x.descripcion && <span className="block text-text-muted">{resumenNc(x.descripcion)}</span>}
            <ParteNuestra nc={x} />
            <Detalles nc={x} />
          </li>
        ))}
      </ul>
    </section>
  );
}
