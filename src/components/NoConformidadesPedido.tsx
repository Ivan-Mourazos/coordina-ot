"use client";

import { useEffect, useState } from "react";
import { esCausaNuestra, resumenNc, textoProcesos, type CausaNc, type NoConformidad } from "@/lib/no-conformidad";

// ─── Las no conformidades del pedido, EN LA FICHA ────────────────────────────
// Si Calidad abrió una NC por este pedido, quien lo mira tiene que saberlo, y
// en qué pedido se rectificó. Y al revés: si este pedido ES la rectificación
// de otro, saber de cuál viene es lo primero para plantearlo bien.
//
// Se pide al abrir la ficha (una consulta pequeña) y sale SOLO si hay algo:
// un bloque vacío en cada ficha enseñaría a no mirarlo. Si RPS falla, tampoco
// sale: es un aviso, no algo que haga falta para trabajar.
//
// Lo usan el tablero y el Historial, de todas las secciones: la NC es del
// pedido, no de quien lo trabaja.

/** Las causas que apuntó Calidad: de qué tipo, a quién se le achaca y con qué
 *  peso. Las de planteamiento o diseño gráfico —las nuestras— van marcadas. Si
 *  aún no hay ninguna, lo dice: la NC está pendiente de investigar. El texto
 *  de cada una, al pasar el ratón. */
function CausasNc({ causas }: { causas: CausaNc[] }) {
  if (!causas.length) return <span className="mt-1 block text-[11px] text-text-muted">Sin causas todavía: pendiente de investigar.</span>;
  return (
    <ul className="mt-1 space-y-0.5">
      {causas.map((c, i) => (
        <li key={i} className={`text-[11px] leading-snug ${esCausaNuestra(c) ? "text-text" : "text-text-muted"}`} title={c.texto || undefined}>
          <span className={esCausaNuestra(c) ? "font-semibold" : ""}>{c.responsable || "Sin nombre"}</span>
          {c.tipo && ` · ${c.tipo.toLowerCase()}`}
          {c.contribucion != null && ` · ${c.contribucion} %`}
        </li>
      ))}
    </ul>
  );
}

/** El seguimiento de Calidad, plegado: suele ser largo (correos pegados
 *  enteros) y no todo el mundo lo necesita, pero cuando trae un aviso para OT
 *  es lo más útil de la NC. Con sus saltos de línea, que en él sí significan. */
function ComentariosCalidad({ texto }: { texto: string }) {
  if (!texto) return null;
  return (
    <details className="group mt-1">
      <summary className="cursor-pointer list-none text-[11px] font-semibold text-amber-800 hover:underline dark:text-amber-300 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="mr-1 inline-block text-[8px] transition-transform group-open:rotate-90 motion-reduce:transition-none">▶</span>
        Comentarios de Calidad
      </summary>
      <p className="detalle-hundido mt-1 max-h-48 overflow-y-auto whitespace-pre-line rounded-md px-2 py-1.5 text-[11px] leading-snug text-text">
        {texto.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n")}
      </p>
    </details>
  );
}

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

const fmt = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : "");

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
      {rectifica.map((x) => (
        <p key={`r:${x.codigo}`} className="text-[13px] font-semibold text-amber-800 dark:text-amber-300" title={x.descripcion}>
          Este pedido rectifica el {x.pedido ? <EnlaceParte pedido={x.pedido} titulo="Abre el parte del pedido original" /> : "pedido original"}
          <span className="font-normal text-text-muted"> · {x.codigo} · {fmt(x.fecha)} · {textoProcesos(x)}</span>
        </p>
      ))}
      {propias.length > 0 && (
        <p className={`text-[13px] font-semibold text-amber-800 dark:text-amber-300 ${rectifica.length ? "mt-2" : ""}`}>
          {propias.length === 1 ? "Tiene una no conformidad" : `Tiene ${propias.length} no conformidades`}
        </p>
      )}
      <ul className="mt-1 space-y-1.5">
        {propias.map((x) => (
          <li key={x.codigo} className="text-[11px] leading-snug" title={x.descripcion}>
            <span className="font-semibold text-text">{x.codigo}</span>
            <span className="text-text-muted">
              {" "}· {fmt(x.fecha)}
              {` · ${textoProcesos(x)}`}
              {x.origen && ` · ${x.origen.toLowerCase()}`}
              {!x.cerrada && " · abierta"}
            </span>
            {x.rectificativo && (
              <span className="font-semibold text-text">
                {" "}· rectificado en <EnlaceParte pedido={x.rectificativo} titulo="Abre el parte del pedido rectificativo: la hoja de la no conformidad viene escaneada con él" />
              </span>
            )}
            {x.descripcion && <span className="block text-text-muted">{resumenNc(x.descripcion)}</span>}
            <CausasNc causas={x.causas} />
            <ComentariosCalidad texto={x.comentarios} />
          </li>
        ))}
        {rectifica.map((x) => (x.descripcion || x.comentarios) && (
          <li key={`rd:${x.codigo}`} className="text-[11px] leading-snug text-text-muted" title={x.descripcion}>
            {x.descripcion && resumenNc(x.descripcion)}
            <ComentariosCalidad texto={x.comentarios} />
          </li>
        ))}
      </ul>
    </section>
  );
}
