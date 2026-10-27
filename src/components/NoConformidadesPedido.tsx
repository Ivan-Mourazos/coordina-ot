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

/** El código del otro pedido. Pulsarlo abre ESE pedido en Coordina (Iván,
 *  26/10/2026: «que no abra el pedido en PDF, que abra ese pedido en
 *  Coordina»); lo resuelve el Board con `onAbrir`. Al lado, «parte» sigue
 *  abriendo el PDF: la hoja en papel de la NC no está adjunta a la NC en RPS,
 *  viene escaneada con el PEDIDO RECTIFICATIVO, y por aquí se llega a ella.
 *  Sin `onAbrir` (donde nadie sabe abrir un pedido), solo el PDF. */
function EnlacePedido({ pedido, titulo, onAbrir }: { pedido: string; titulo: string; onAbrir?: (codigo: string) => void }) {
  const pdf = `/api/pedidos/${encodeURIComponent(pedido)}.pdf`;
  const enlace = "underline decoration-dotted underline-offset-2 hover:decoration-solid";
  if (!onAbrir) {
    return <a href={pdf} target="_blank" rel="noreferrer" title={titulo} className={enlace}>{pedido}</a>;
  }
  return (
    <>
      <button type="button" onClick={() => onAbrir(pedido)} title={`Abre el pedido ${pedido} en Coordina`} className={`rounded-none font-semibold ${enlace}`}>
        {pedido}
      </button>
      <a href={pdf} target="_blank" rel="noreferrer" title={titulo} className={`ml-1 text-[10px] font-normal text-text-muted ${enlace}`}>
        parte
      </a>
    </>
  );
}

/** La parte de cada sección nuestra, en una línea: «OT 5 % · causa menor».
 *  Pesada como en Métricas (ver `repartoNc`). */
function ParteNuestra({ nc }: { nc: NoConformidad }) {
  const gris = "rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text-muted";
  if (!nc.causas.length) return <span className={gris}>Pendiente de investigar</span>;
  const r = repartoNc(nc);
  const nuestras = NUESTRAS.filter((s) => (r.secciones[s] ?? 0) > 0);
  if (!nuestras.length) return <span className={gris}>Sin causas de planteamiento ni diseño</span>;
  // En píldora: es el dato que se busca de un vistazo (Iván, 27/10/2026:
  // «se debe compactar»).
  return (
    <>
      {nuestras.map((s) => (
        <span key={s} className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
          {SECCIONES[s].nombreCorto} {pct(r.secciones[s] ?? 0)} · {causaMayor(nc, s) === "mayor" ? "causa mayor" : "causa menor"}
        </span>
      ))}
    </>
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
      {/* La parte nuestra y «Ver detalles» en UNA línea: antes eran dos, más
          la descripción de Calidad entera, que ya está aquí dentro. */}
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-1.5 text-[11px] [&::-webkit-details-marker]:hidden">
        <ParteNuestra nc={nc} />
        <span className="font-semibold text-amber-800 hover:underline dark:text-amber-300">
          <span aria-hidden="true" className="mr-1 inline-block text-[8px] transition-transform group-open:rotate-90 motion-reduce:transition-none">▶</span>
          Ver detalles
        </span>
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
export function NoConformidadesPedido({ pedido, onAbrirPedido }: { pedido: string; onAbrirPedido?: (codigo: string) => void }) {
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
    <section aria-label="No conformidades" className="bloque-3d relative mb-3 overflow-hidden rounded-xl py-2.5 pr-3 pl-4">
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-amber-600 dark:bg-amber-400" />
      {propias.length > 0 && (
        <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-300">
          {propias.length === 1 ? "Tiene una no conformidad" : `Tiene ${propias.length} no conformidades`}
        </p>
      )}
      <ul className="mt-1 space-y-2">
        {propias.map((x) => (
          <li key={x.codigo} className="text-[11px] leading-snug">
            {/* Procesos, origen y lo que escribió Calidad, al pasar el ratón
                (y entero en «Ver detalles»): a la vista, cuál, cuándo y dónde
                se rectificó. */}
            <span
              className="font-semibold text-text"
              title={[textoProcesos(x), x.origen?.toLowerCase(), x.descripcion && resumenNc(x.descripcion)].filter(Boolean).join(" · ")}
            >
              {x.codigo}
            </span>
            <span className="text-text-muted">
              {" "}· {fmt(x.fecha)}
              {!x.cerrada && " · abierta"}
            </span>
            {x.rectificativo && (
              <span className="font-semibold text-text">
                {" "}· rectificado en <EnlacePedido pedido={x.rectificativo} onAbrir={onAbrirPedido} titulo="Abre el parte del pedido rectificativo: la hoja de la no conformidad viene escaneada con él" />
              </span>
            )}
            <Detalles nc={x} />
          </li>
        ))}
        {rectifica.map((x) => (
          <li key={`r:${x.codigo}`} className="text-[11px] leading-snug">
            <span className="text-[13px] font-semibold text-amber-800 dark:text-amber-300">
              Este pedido rectifica el {x.pedido ? <EnlacePedido pedido={x.pedido} onAbrir={onAbrirPedido} titulo="Abre el parte del pedido original" /> : "pedido original"}
            </span>
            <span
              className="text-text-muted"
              title={[textoProcesos(x), x.descripcion && resumenNc(x.descripcion)].filter(Boolean).join(" · ")}
            >
              {" "}· {x.codigo} · {fmt(x.fecha)}
            </span>
            <Detalles nc={x} />
          </li>
        ))}
      </ul>
    </section>
  );
}
