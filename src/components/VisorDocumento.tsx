"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { comoServir, type DocumentoRps } from "@/lib/historial";

// ─── El documento, abierto DENTRO de la web ──────────────────────────────────
// Antes cada documento era un enlace con target="_blank": para ver tres
// versiones de un planteamiento acababas con tres pestañas, y volviendo a
// buscar cuál era la ficha entre ellas. Aquí se abre encima, se pasa al
// siguiente con las flechas y se cierra con Escape — sin salir del pedido.
//
// El visor lo pone el navegador (un `iframe` para el PDF, un `img` para la
// foto) y no un lector propio: el PDF de Chrome ya trae zoom, búsqueda, giro e
// impresión, y todo eso habría que rehacerlo peor.

/** Documento con URL: los que RPS tiene en su gestor documental y no como
 *  fichero no se pueden abrir, y por eso no llegan hasta aquí. */
export interface DocumentoAbrible extends DocumentoRps {
  url: string;
}

export function VisorDocumento({
  documentos,
  indice,
  onIr,
  onCerrar,
}: {
  /** Los abribles del pedido, en el mismo orden en que se ven en la rejilla:
   *  las flechas pasean por esta lista y no por la del grupo, que es lo que se
   *  quiere cuando lo que buscas está en el grupo de al lado. */
  documentos: DocumentoAbrible[];
  indice: number;
  onIr: (indice: number) => void;
  onCerrar: () => void;
}) {
  const doc = documentos[indice];

  // Escape, ← y →. En fase de captura y con stopPropagation porque este visor
  // vive DENTRO de un drawer que también cierra con Escape: sin esto, la
  // primera pulsación cerraría los dos y te dejaría en el tablero.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCerrar();
        return;
      }
      if (e.key === "ArrowLeft" && indice > 0) {
        e.stopPropagation();
        onIr(indice - 1);
      }
      if (e.key === "ArrowRight" && indice < documentos.length - 1) {
        e.stopPropagation();
        onIr(indice + 1);
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [indice, documentos.length, onIr, onCerrar]);

  if (!doc || typeof document === "undefined") return null;

  const { tipo, incrustable } = comoServir(doc.archivo);
  const esPdf = tipo === "application/pdf";

  return createPortal(
    // z-[90]: por encima de los drawers (z-50) y del visor del parte (z-80),
    // que es desde donde se puede llegar hasta aquí.
    <div
      className="overlay-in fixed inset-0 z-[90] flex flex-col bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={doc.descripcion || doc.archivo}
      onClick={onCerrar}
    >
      <div
        className="flex shrink-0 items-center gap-3 px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="min-w-0 truncate text-sm font-semibold">
          {doc.descripcion || doc.archivo}
        </span>
        <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
          {doc.clase}
        </span>
        <span className="ml-auto shrink-0 text-xs text-white/60">
          {indice + 1} / {documentos.length}
        </span>
        {/* Bajarlo sigue haciendo falta: hay quien lo adjunta a un correo o lo
            manda a taller. `download` con el nombre de RPS, no el de la URL
            (que sería "3"). */}
        <a
          href={doc.url}
          download={doc.archivo}
          onClick={(e) => e.stopPropagation()}
          title="Descargar"
          className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
        >
          ⤓ Descargar
        </a>
        <button
          onClick={onCerrar}
          aria-label="Cerrar"
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 text-lg hover:bg-white/20"
        >
          ✕
        </button>
      </div>

      <div className="relative min-h-0 flex-1 px-4 pb-4" onClick={onCerrar}>
        {esPdf && (
          <iframe
            src={`${doc.url}#view=Fit`}
            title={doc.descripcion || doc.archivo}
            className="h-full w-full rounded-xl border-none bg-white"
            onClick={(e) => e.stopPropagation()}
          />
        )}
        {!esPdf && incrustable && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={doc.url}
            alt={doc.descripcion || doc.archivo}
            className="mx-auto h-full w-auto max-w-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        )}
        {!incrustable && (
          <div
            className="mx-auto grid h-full max-w-md place-items-center rounded-xl bg-white/5 px-8 text-center text-sm text-white/70"
            onClick={(e) => e.stopPropagation()}
          >
            <p>
              <span className="font-mono">{doc.archivo}</span> no se puede enseñar en el
              navegador. Descárgalo para abrirlo con su programa.
            </p>
          </div>
        )}

        {/* Las flechas van sobre el documento y no en la barra: es donde está
            el ojo mientras se pasa de una versión del planteamiento a otra. */}
        {indice > 0 && (
          <FlechaVisor lado="izq" onClick={() => onIr(indice - 1)} />
        )}
        {indice < documentos.length - 1 && (
          <FlechaVisor lado="der" onClick={() => onIr(indice + 1)} />
        )}
      </div>
    </div>,
    document.body,
  );
}

function FlechaVisor({ lado, onClick }: { lado: "izq" | "der"; onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={lado === "izq" ? "Documento anterior" : "Documento siguiente"}
      className={`absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-xl text-white ring-1 ring-white/20 hover:bg-black/70 ${
        lado === "izq" ? "left-6" : "right-6"
      }`}
    >
      {lado === "izq" ? "‹" : "›"}
    </button>
  );
}
