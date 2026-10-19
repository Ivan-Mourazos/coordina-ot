"use client";

import { useEffect, useState } from "react";
import type { PedidoConsultaDetalle } from "@/lib/publico";
import { DocumentosRps } from "./DocumentosRps";
import { NotasPublicas } from "./NotasPublicas";
import type { NotaPublica } from "@/lib/nota-pedido";

/** Los documentos de RPS de un pedido, en el desplegable de «En curso» (Iván,
 *  14/10/2026: para abrir las fotos o el pedido escaneado sin ir a Pedidos).
 *  Se piden al desplegar —el desplegable no se monta cerrado— con la misma
 *  ficha pública que usa la pestaña Pedidos. */
export function DocumentosEnCurso({ codigo }: { codigo: string }) {
  const [docs, setDocs] = useState<PedidoConsultaDetalle["documentos"] | null>(null);
  // Las notas «para todos» llegan en la misma ficha: se enseñan encima.
  const [notas, setNotas] = useState<NotaPublica[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/publico/pedidos/${encodeURIComponent(codigo)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<PedidoConsultaDetalle>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!vivo) return;
        setDocs(d.documentos);
        setNotas(d.notas ?? []);
      })
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, [codigo]);

  return (
    <div className="mt-2.5">
      {notas.length > 0 && (
        <div className="mb-2.5">
          <NotasPublicas notas={notas} />
        </div>
      )}
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Documentos de RPS</p>
      {error ? (
        <p className="text-[11px] text-text-muted">No se pudieron cargar los documentos.</p>
      ) : docs === null ? (
        <p role="status" className="text-[11px] text-text-muted">Cargando documentos…</p>
      ) : (
        <DocumentosRps documentos={docs} clasePrimero="Pedido escaneado" />
      )}
    </div>
  );
}
