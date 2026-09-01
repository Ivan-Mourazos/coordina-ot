"use client";

import { useEffect, useState } from "react";
import { esImagen, type DocumentoRps } from "@/lib/historial";

// ─── Lo que RPS tiene colgado del pedido, EN LA FICHA ────────────────────────
// La rotulación, el planteamiento, el presupuesto, las fotos del trabajo y el
// adjunto de cada OF. Estaban solo en el Historial, o sea que solo se veían
// cuando el pedido ya estaba cerrado — justo cuando ya no sirven para trabajar.
// La rotulación es lo que hay que mirar PARA plantearla.
//
// LAS IMÁGENES SE VEN, no se enumeran. Es la diferencia con la lista del
// Historial: allí se consulta qué hubo, aquí se está trabajando con ello, y
// "AR.26.04116-4.jpg" no dice nada mientras que la miniatura sí. En RPS hay
// 122 000 imágenes colgadas de pedidos y en Diseño Gráfico son media jornada.
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

  const imagenes = docs?.filter((d) => d.url && esImagen(d.archivo)) ?? [];
  const otros = docs?.filter((d) => !d.url || !esImagen(d.archivo)) ?? [];

  return (
    <section className="rounded-xl border border-border">
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-text"
      >
        <span className="text-text-muted">{abierto ? "▾" : "▸"}</span>
        Documentos de RPS
        {docs && (
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-text-muted ring-1 ring-border">
            {docs.length}
          </span>
        )}
        <span className="ml-auto text-[10px] font-normal text-text-muted">
          rotulación, planteamiento, fotos
        </span>
      </button>

      {abierto && (
        <div className="border-t border-border p-3">
          {error && (
            <p className="text-[11px] text-text-muted">
              No se pudieron cargar. Vuelve a plegar y desplegar para reintentarlo.
            </p>
          )}
          {!docs && !error && <p className="text-[11px] text-text-muted">Buscando…</p>}
          {docs?.length === 0 && (
            <p className="text-[11px] text-text-muted">RPS no tiene nada colgado de este pedido.</p>
          )}

          {imagenes.length > 0 && (
            <ul className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {imagenes.map((d, i) => (
                <li key={`${i}-${d.url}`}>
                  {/* Se abre en pestaña nueva y no en un visor propio: aquí se
                      mira la rotulación MIENTRAS se trabaja el pedido, y un
                      modal obligaría a cerrarlo para volver a la ficha. */}
                  <a
                    href={d.url ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={d.descripcion || d.archivo}
                    className="block overflow-hidden rounded-lg border border-border hover:border-border-strong"
                  >
                    {/* `img` a pelo y no `next/image`: son ficheros de un share
                        interno servidos por nuestra propia ruta, sin tamaño
                        conocido de antemano y sin nada que optimizar. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={d.url ?? ""}
                      alt={d.descripcion || d.archivo}
                      loading="lazy"
                      className="aspect-square w-full bg-surface-2 object-cover"
                    />
                    <span className="block truncate px-1.5 py-1 text-[9px] text-text-muted">
                      {d.clase}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}

          {otros.length > 0 && (
            <ul className="space-y-0.5">
              {otros.map((d, i) => (
                <li key={`${i}-${d.url ?? d.archivo}`} className="text-[11px] leading-snug">
                  {d.url ? (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-600 hover:underline"
                    >
                      {d.descripcion || d.archivo}
                    </a>
                  ) : (
                    <span
                      className="text-text-muted/70"
                      title="RPS lo tiene en su gestor documental, no como fichero del archivo: desde aquí no se puede abrir."
                    >
                      {d.descripcion || d.archivo}{" "}
                      <span className="text-[10px]">(no se puede abrir)</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
