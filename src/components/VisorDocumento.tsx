"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { comoServir, type DocumentoRps } from "@/lib/historial";
import { useCapaEscape } from "@/lib/useCapaEscape";
import { CLAVE_ENCAJE_DOCUMENTOS, siguienteGiro, type Giro } from "@/lib/visor-pdf";
import { FotoConZoom } from "./FotoConZoom";
import { BotonesEncaje } from "./VisorPdf/BotonesEncaje";
import { imprimirPdf } from "./VisorPdf/imprimir";
import { MotorNavegador } from "./VisorPdf/MotorNavegador";
import { precargarPdf } from "./VisorPdf/usePdfDoc";
import { useEncajePdf, useMotorPdf } from "./VisorPdf/preferencias";
import { VisorPdf } from "./VisorPdf/VisorPdf";

// ─── El documento, abierto DENTRO de la web ──────────────────────────────────
// Antes cada documento era un enlace con target="_blank": para ver tres
// versiones de un planteamiento acababas con tres pestañas, y volviendo a
// buscar cuál era la ficha entre ellas. Aquí se abre encima, se pasa al
// siguiente con las flechas y se cierra con Escape — sin salir del pedido.
//
// El PDF lo pinta CoordinaOT (VisorPdf), o el navegador para quien lo prefiera
// —la misma preferencia que el parte—. La foto, un `img` con zoom.

/** Documento con URL: los que RPS tiene en su gestor documental y no como
 *  fichero no se pueden abrir, y por eso no llegan hasta aquí. */
export interface DocumentoAbrible extends DocumentoRps {
  url: string;
}

/** Botón cuadrado de la barra, sobre el telón negro. */
const BOTON = "grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 text-sm text-white hover:bg-white/20";
/** El que está puesto (encaje elegido, documento girado). */
const PUESTO = "bg-white/25 ring-2 ring-white/60";

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

  const [motor, setMotor] = useMotorPdf();
  // Su propio encaje, recordado aparte del del parte: un planteamiento
  // apaisado no se mira como un A4 de pie.
  const [encaje, pulsarEncaje] = useEncajePdf(CLAVE_ENCAJE_DOCUMENTOS);
  // El giro va con el documento y no se guarda: el siguiente de la lista
  // empieza derecho aunque este estuviera tumbado. Se apunta junto a su URL
  // y, si la URL ya no es la que se ve, cuenta como 0 — sin un setState en
  // un efecto, y sin depender de por dónde se haya pasado de documento.
  const [giroDe, setGiroDe] = useState<{ url: string; giro: Giro }>({ url: "", giro: 0 });
  const giro: Giro = doc && giroDe.url === doc.url ? giroDe.giro : 0;

  // Las flechas son un paseo, no un salto: el de al lado ya está abierto
  // cuando se llega. Solo con el motor propio; el del navegador no se deja.
  useEffect(() => {
    if (motor !== "propio") return;
    for (const vecino of [documentos[indice - 1], documentos[indice + 1]]) {
      if (vecino && comoServir(vecino.archivo).tipo === "application/pdf") precargarPdf(vecino.url);
    }
  }, [motor, indice, documentos]);

  // Escape es una capa más: cierra el visor y deja la ficha de debajo abierta
  // (ver capas-escape.ts).
  useCapaEscape(true, onCerrar);

  // ← y →. En fase de captura y con stopPropagation: las flechas son del
  // visor mientras está abierto, no de lo que haya detrás.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
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
  }, [indice, documentos.length, onIr]);

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
        {/* Los mismos TRES GRUPOS que el carril del parte, en horizontal: cómo
            se ve el documento aquí, sacarlo fuera, y —aparte, junto a cerrar,
            con texto porque un icono solo no dice qué hace— con qué visor se
            ve. Todos los botones de acción cuadrados: mezclar cuadrados con
            píldoras de texto era parte de lo que hacía la barra desordenada. */}
        {esPdf && (
          <>
            <Separador />
            <div role="group" aria-label="Cómo se ve el documento" className="flex shrink-0 items-center gap-1.5">
              <BotonesEncaje encaje={encaje} onPulsar={pulsarEncaje} clase={BOTON} clasePuesto={PUESTO} />
              {/* Solo con el motor propio: el visor del navegador trae su giro. */}
              {motor === "propio" && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setGiroDe({ url: doc.url, giro: siguienteGiro(giro) });
                  }}
                  title={`Girar el documento · ahora ${giro}°`}
                  // El grado también en el `aria-label`, como en el parte.
                  aria-label={`Girar el documento · ahora ${giro}°`}
                  className={`${BOTON} ${giro !== 0 ? PUESTO : ""}`}
                >
                  ↻
                </button>
              )}
            </div>
          </>
        )}
        <Separador />
        <div role="group" aria-label="Sacar el documento" className="flex shrink-0 items-center gap-1.5">
          {esPdf && (
            <a
              href={doc.url}
              target="_blank"
              rel="noopener"
              onClick={(e) => e.stopPropagation()}
              title="Abrir en otra pestaña"
              aria-label="Abrir el documento en otra pestaña"
              className={BOTON}
            >
              ↗
            </a>
          )}
          {/* Bajarlo sigue haciendo falta: hay quien lo adjunta a un correo o
              lo manda a taller. `download` con el nombre de RPS, no el de la
              URL (que sería "3"). */}
          <a
            href={doc.url}
            download={doc.archivo}
            onClick={(e) => e.stopPropagation()}
            title="Descargar"
            aria-label="Descargar el documento"
            className={BOTON}
          >
            ⤓
          </a>
          {/* En los dos motores: con el del navegador también se imprime el
              PDF de verdad, sin buscar el botón en su barra. */}
          {esPdf && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                imprimirPdf(doc.url);
              }}
              title="Imprimir el documento"
              aria-label="Imprimir el documento"
              className={BOTON}
            >
              ⎙
            </button>
          )}
        </div>
        {esPdf && (
          <>
            <Separador />
            <button
              type="button"
              aria-pressed={motor === "navegador"}
              onClick={(e) => {
                e.stopPropagation();
                setMotor(motor === "propio" ? "navegador" : "propio");
              }}
              title="Se recuerda para la próxima vez, también en el parte"
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs text-white/60 hover:bg-white/10 hover:text-white"
            >
              {motor === "propio" ? "⇄ Visor del navegador" : "⇄ Visor de CoordinaOT"}
            </button>
          </>
        )}
        <button
          onClick={onCerrar}
          aria-label="Cerrar"
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 text-lg hover:bg-white/20"
        >
          ✕
        </button>
      </div>

      <div className="relative min-h-0 flex-1 px-4 pb-4" onClick={onCerrar}>
        {esPdf &&
          (motor === "propio" ? (
            <VisorPdf
              // La clave con la URL: cada documento empieza en su página 1 y
              // con su zoom, no con el scroll del anterior.
              key={doc.url}
              url={doc.url}
              encaje={encaje}
              giro={giro}
              titulo={doc.descripcion || doc.archivo}
              poster={`${doc.url}?mini=1`}
            />
          ) : (
            <MotorNavegador url={doc.url} fragmento={`view=${encaje}`} titulo={doc.descripcion || doc.archivo} />
          ))}
        {!esPdf && incrustable && (
          // Con zoom: son fotos de móvil hechas en obra, y lo que hace falta
          // ver —el número de serie de un motor, una cota escrita a mano— no se
          // lee a tamaño de pantalla. El PDF no lo necesita aquí: VisorPdf
          // trae el suyo con Ctrl+rueda, y el visor del navegador el propio.
          <FotoConZoom src={doc.url} alt={doc.descripcion || doc.archivo} />
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

/** Raya corta entre grupos de la barra: separa sin ocupar un botón. */
function Separador() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-white/25" />;
}
