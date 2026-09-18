"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { pixelRatio, rotacionTotal, type Giro, type Medidas } from "@/lib/visor-pdf";

/** Cuánto se espera a que pare el zoom antes de volver a pintar nítido.
 *  Mientras, se estira lo ya pintado: instantáneo, borroso un momento. Sin
 *  esta espera, cada golpe de rueda es un render completo encolado. */
const ESPERA_REPINTADO_MS = 150;

/** Una página del PDF.
 *
 *  SOLO SE PINTA SI SE VE (o está a una pantalla de verse). Un planteamiento
 *  de 40 páginas no pinta 40 canvas; y la que sale de pantalla SUELTA su
 *  memoria (canvas a 0×0): a ratio 2, una hoja al ancho son ~14 MB, cuarenta
 *  son más de medio giga.
 *
 *  Se pinta en un canvas aparte y se copia al final: así lo viejo sigue a la
 *  vista, estirado, hasta que lo nuevo está listo — nunca un parpadeo en
 *  blanco. Un render que se queda viejo (otro zoom, otro giro) se cancela. */
export function PaginaPdf({
  doc,
  numero,
  escala,
  giro,
  raiz,
  provisional,
  poster,
}: {
  doc: PDFDocumentProxy;
  numero: number;
  escala: number;
  giro: Giro;
  /** El hueco con scroll: es la ventana contra la que se mira si se ve. */
  raiz: HTMLElement | null;
  /** Medidas en pantalla mientras esta página no ha dicho las suyas: las de
   *  la primera. Sin ellas, cuarenta cajas a 0 px se verían todas a la vez. */
  provisional: Medidas;
  /** Solo la primera: la miniatura del servidor, hasta que se pinta. */
  poster?: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const giroPintado = useRef<Giro | null>(null);
  const [pagina, setPagina] = useState<PDFPageProxy | null>(null);
  const [visible, setVisible] = useState(false);
  const [pintada, setPintada] = useState(false);

  useEffect(() => {
    let vivo = true;
    doc.getPage(numero).then(
      (p) => {
        if (vivo) setPagina(p);
      },
      () => {},
    );
    return () => {
      vivo = false;
    };
  }, [doc, numero]);

  useEffect(() => {
    const el = caja.current;
    if (!el || !raiz) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), {
      root: raiz,
      rootMargin: "100% 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [raiz]);

  useEffect(() => {
    const c = lienzo.current;
    if (!pagina || !c) return;
    if (!visible) {
      c.width = 0;
      c.height = 0;
      giroPintado.current = null;
      return;
    }
    const vp = pagina.getViewport({
      scale: escala * pixelRatio(window.devicePixelRatio),
      rotation: rotacionTotal(pagina.rotate, giro),
    });
    // Girar NO espera: estirar la hoja vieja a la forma nueva la deformaría.
    // El zoom sí, y la primera vez no hay nada que estirar.
    const espera = giroPintado.current === giro && c.width > 0 ? ESPERA_REPINTADO_MS : 0;
    let vivo = true;
    let tarea: RenderTask | null = null;
    const t = window.setTimeout(() => {
      const fuera = document.createElement("canvas");
      fuera.width = Math.max(1, Math.floor(vp.width));
      fuera.height = Math.max(1, Math.floor(vp.height));
      tarea = pagina.render({ canvas: fuera, viewport: vp });
      tarea.promise.then(
        () => {
          if (!vivo) return;
          c.width = fuera.width;
          c.height = fuera.height;
          c.getContext("2d")?.drawImage(fuera, 0, 0);
          giroPintado.current = giro;
          setPintada(true);
        },
        // Cancelado por un render más nuevo: es lo esperado, no un error.
        () => {},
      );
    }, espera);
    return () => {
      vivo = false;
      window.clearTimeout(t);
      tarea?.cancel();
    };
  }, [pagina, visible, escala, giro]);

  const vista = pagina?.getViewport({ scale: escala, rotation: rotacionTotal(pagina.rotate, giro) });
  const ancho = vista?.width ?? provisional.ancho;
  const alto = vista?.height ?? provisional.alto;

  return (
    <div ref={caja} className="relative shrink-0 bg-white shadow-md" style={{ width: ancho, height: alto }}>
      {poster && !pintada && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-contain" />
      )}
      <canvas ref={lienzo} className="block h-full w-full" />
    </div>
  );
}
