"use client";

import { useEffect, useState } from "react";
import type { DocumentoRps } from "@/lib/historial";
import { DocumentosRps, contarAbribles } from "./DocumentosRps";

// ─── Lo que RPS tiene colgado del pedido, EN LA FICHA ────────────────────────
// La rotulación, el planteamiento, el presupuesto, las fotos del trabajo y el
// adjunto de cada OF. Estaban solo en el Historial, o sea que solo se veían
// cuando el pedido ya estaba cerrado — justo cuando ya no sirven para trabajar.
// La rotulación es lo que hay que mirar PARA plantearla.
//
// Aquí solo está la CARGA: cómo se ven (rejilla de miniaturas, agrupada por
// clase, y el visor a pantalla completa) lo pone `DocumentosRps`, que es el
// mismo que usa el Historial. Antes eran dos pintas distintas y el mismo pedido
// se veía de dos maneras según por dónde entraras.
//
// SE PIDE AL DESPLEGAR y no al abrir la ficha: son dos tablas grandes de RPS
// por pedido, y la mayoría de las veces que se abre una ficha es para fichar o
// para mirar el estado, no los documentos. Plegado por defecto, y quien los
// quiera los pide.

/** NO hace falta limpiar el estado al cambiar de pedido: quien lo pinta le
 *  pone `key={\`docs:${codigo}\`}`, así que React lo desmonta y lo vuelve a
 *  montar entero. Mismo recurso que el hilo de notas, y por lo mismo: sin él
 *  quedaría un instante con los documentos del pedido anterior. */
export function DocumentosPedido({ pedido }: { pedido: string }) {
  const [abierto, setAbierto] = useState(false);
  const [docs, setDocs] = useState<DocumentoRps[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!abierto || docs || error) return;
    let vivo = true;
    fetch(`/api/pedidos/${encodeURIComponent(pedido)}/documentos`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { documentos: DocumentoRps[] }) => vivo && setDocs(d.documentos))
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, [abierto, docs, error, pedido]);

  return (
    // Mismo bloque que los demás de la ficha (comentario del pedido, notas,
    // asignar autor): `mb-4`, borde y fondo de cristal. Nació con un borde
    // suelto y sin margen, y el efecto era que se leía pegado al hilo de notas
    // —como si fuera su cabecera— en vez de como un apartado propio.
    //
    // El padding NO va en el contenedor sino dentro: la cabecera es un botón y
    // tiene que ocupar el ancho entero para que se pueda pulsar en cualquier
    // punto de la fila, no solo sobre el texto.
    <section className="mb-4 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)]">
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-text"
      >
        <span className="text-text-muted">{abierto ? "▾" : "▸"}</span>
        Documentos de RPS
        {docs && (
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-text-muted ring-1 ring-border">
            {/* Los que se pueden abrir, no los que RPS trae: los que no tienen
                fichero no se listan, y contarlos aquí dejaría un número que no
                cuadra con lo que se ve al desplegar. */}
            {contarAbribles(docs)}
          </span>
        )}
        <span className="ml-auto text-[10px] font-normal text-text-muted">
          rotulación, planteamiento, fotos
        </span>
      </button>

      {abierto && (
        <div className="border-t border-[var(--glass-border)] px-3 pb-3 pt-3">
          {error && (
            <p className="text-[11px] text-text-muted">
              No se pudieron cargar. Vuelve a plegar y desplegar para reintentarlo.
            </p>
          )}
          {!docs && !error && <p className="text-[11px] text-text-muted">Buscando…</p>}
          {docs && <DocumentosRps documentos={docs} />}
        </div>
      )}
    </section>
  );
}
