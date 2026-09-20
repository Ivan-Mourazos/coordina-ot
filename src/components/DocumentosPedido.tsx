"use client";

import { useEffect, useState } from "react";
import type { DocumentoRps } from "@/lib/historial";
import { DocumentosRps, contarAbribles } from "./DocumentosRps";
import { ErrorCarga } from "./ErrorCarga";
import { BloqueDesplegable } from "./BloqueDesplegable";

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
export function DocumentosPedido({ pedido, documentos }: { pedido: string; documentos?: DocumentoRps[] }) {
  const [abierto, setAbierto] = useState(false);
  const [cargados, setDocs] = useState<DocumentoRps[] | null>(null);
  const docs = documentos ?? cargados;
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
    // El MISMO bloque plegable que "Tareas y tiempos" (BloqueDesplegable): este
    // tenía su propia copia —mismo rótulo y misma flecha, pero con otro fondo y
    // sin la animación de abrir—, y uno encima del otro no parecían el mismo
    // tipo de bloque.
    <BloqueDesplegable
      titulo="Documentos de RPS"
      onAbrir={() => setAbierto(true)}
      insignia={
        docs ? (
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-text-muted ring-1 ring-border">
            {/* Los que se pueden abrir, no los que RPS trae: los que no tienen
                fichero no se listan, y contarlos aquí dejaría un número que no
                cuadra con lo que se ve al desplegar. */}
            {contarAbribles(docs)}
          </span>
        ) : undefined
      }
    >
      {error && (
        <ErrorCarga mensaje="No se pudieron cargar los documentos." onReintentar={() => setError(false)} />
      )}
      {!docs && !error && (
        <p role="status" className="text-[11px] text-text-muted">
          Buscando…
        </p>
      )}
      {docs && <DocumentosRps documentos={docs} />}
    </BloqueDesplegable>
  );
}
