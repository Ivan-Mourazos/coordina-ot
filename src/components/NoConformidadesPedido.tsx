"use client";

import { useEffect, useState } from "react";
import { resumenNc, type NoConformidad } from "@/lib/no-conformidad";

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
          Este pedido rectifica el {x.pedido ?? "pedido original"}
          <span className="font-normal text-text-muted"> · {x.codigo} · {fmt(x.fecha)}{x.procesos.length ? ` · ${x.procesos.join(", ")}` : ""}</span>
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
              {x.procesos.length > 0 && ` · ${x.procesos.join(", ")}`}
              {x.origen && ` · ${x.origen.toLowerCase()}`}
              {!x.cerrada && " · abierta"}
            </span>
            {x.rectificativo && (
              <span className="font-semibold text-text"> · rectificado en {x.rectificativo}</span>
            )}
            {x.descripcion && <span className="block text-text-muted">{resumenNc(x.descripcion)}</span>}
          </li>
        ))}
        {rectifica.map((x) => x.descripcion && (
          <li key={`rd:${x.codigo}`} className="text-[11px] leading-snug text-text-muted" title={x.descripcion}>
            {resumenNc(x.descripcion)}
          </li>
        ))}
      </ul>
    </section>
  );
}
