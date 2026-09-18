"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  acotarZoom,
  escalaParaEncaje,
  factorRueda,
  giroIntercambia,
  type Encaje,
  type Giro,
  type Medidas,
} from "@/lib/visor-pdf";
import { PaginaPdf } from "./PaginaPdf";
import { usePdfDoc } from "./usePdfDoc";

/** Aire alrededor de la hoja, en px: que el borde del papel se vea y que la
 *  sombra de `.hoja-3d` no quede cortada contra el canto del visor. */
const MARGEN = 24;
/** Abajo hace falta más: la sombra de `.hoja-3d` cae hacia abajo (la más
 *  larga llega a unos 60 px). Con el mismo margen que arriba, el borde del
 *  visor la cortaba en seco y se veía una raya bajo la última hoja. Si se
 *  alarga esa sombra en el CSS, esto tiene que crecer con ella. */
const MARGEN_PIE = 64;

/** El PDF pintado por nosotros.
 *
 *  EL GIRO NO TOCA ESTE CONTENEDOR. Va dentro del render de cada página
 *  (`getViewport({ rotation })`), así que el scroll sigue bajando hacia abajo a
 *  90° igual que a 0°. Era el motivo de todo esto: girando el `<iframe>` con
 *  `transform`, el eje de scroll giraba con él.
 *
 *  EL ENCAJE ES UNA ESCALA, no un fragmento de URL: cambiarlo repinta, no
 *  descarga otra vez ni vuelve a la página 1.
 *
 *  ZOOM CON CTRL + RUEDA (y el pellizco del touchpad, que el navegador manda
 *  igual). La rueda sola es el scroll de siempre. El punto bajo el ratón se
 *  queda bajo el ratón. Cambiar de documento, encaje o giro vuelve a «como
 *  encaja». */
export function VisorPdf({
  url,
  encaje,
  giro,
  titulo,
  poster,
}: {
  url: string;
  encaje: Encaje;
  giro: Giro;
  titulo: string;
  /** Miniatura de la 1ª página que ya genera el servidor: se ve al instante,
   *  borrosa, mientras pdf.js arranca. */
  poster?: string;
}) {
  const { doc, error } = usePdfDoc(url);
  const [raiz, setRaiz] = useState<HTMLDivElement | null>(null);
  // El estado dispara el re-render que engancha los efectos de abajo; la ref
  // es la misma caja, pero se puede tocar (scrollLeft/scrollTop) sin que el
  // linter la confunda con un valor de useState que no se debe mutar.
  const raizRef = useRef<HTMLDivElement | null>(null);
  const asignarRaiz = useCallback((el: HTMLDivElement | null) => {
    raizRef.current = el;
    setRaiz(el);
  }, []);
  const [hueco, setHueco] = useState<Medidas>({ ancho: 0, alto: 0 });
  const [base, setBase] = useState<{ doc: unknown; medidas: Medidas } | null>(null);

  // El zoom va atado a lo que se mira: si cambia documento, encaje o giro,
  // `clave` deja de coincidir y vuelve a 1 sin un efecto que lo resetee.
  const clave = `${url}|${encaje}|${giro}`;
  const [zoom, setZoom] = useState({ clave, valor: 1 });
  const valorZoom = zoom.clave === clave ? zoom.valor : 1;
  const zoomActual = useRef(valorZoom);
  const ancla = useRef<{ x: number; y: number; ratio: number } | null>(null);

  useEffect(() => {
    zoomActual.current = valorZoom;
  }, [valorZoom]);

  // El hueco disponible. ResizeObserver avisa también al empezar a observar,
  // así que no hace falta medir a mano. `clientWidth` ya descuenta la barra de
  // scroll, y `scrollbar-gutter: stable` evita que aparecer y desaparecer la
  // barra haga bailar el encaje al ancho.
  useEffect(() => {
    if (!raiz) return;
    const ro = new ResizeObserver(() =>
      setHueco({ ancho: raiz.clientWidth - MARGEN * 2, alto: raiz.clientHeight - MARGEN - MARGEN_PIE }),
    );
    ro.observe(raiz);
    return () => ro.disconnect();
  }, [raiz]);

  // La primera página marca la escala de todas.
  useEffect(() => {
    if (!doc) return;
    let vivo = true;
    doc.getPage(1).then(
      (p) => {
        if (!vivo) return;
        const v = p.getViewport({ scale: 1 });
        setBase({ doc, medidas: { ancho: v.width, alto: v.height } });
      },
      () => {},
    );
    return () => {
      vivo = false;
    };
  }, [doc]);

  useEffect(() => {
    if (!raiz) return;
    function onRueda(e: WheelEvent) {
      if (!e.ctrlKey) return;
      // Sin esto, Ctrl + rueda amplía la web entera.
      e.preventDefault();
      const r = raiz!.getBoundingClientRect();
      const antes = zoomActual.current;
      const despues = acotarZoom(antes * factorRueda(e.deltaY));
      if (despues === antes) return;
      zoomActual.current = despues;
      // Se acumula sobre el ratio pendiente, no se pisa: dos golpes de rueda
      // antes de que llegue a pintar el primero no deben perder la corrección
      // del primero, o el punto bajo el ratón se corre.
      ancla.current = {
        x: e.clientX - r.left,
        y: e.clientY - r.top,
        ratio: (ancla.current?.ratio ?? 1) * (despues / antes),
      };
      setZoom({ clave, valor: despues });
    }
    raiz.addEventListener("wheel", onRueda, { passive: false });
    return () => raiz.removeEventListener("wheel", onRueda);
  }, [raiz, clave]);

  // Tras ampliar, se corre el scroll para que lo que estaba bajo el ratón
  // siga ahí. Antes de pintar (layout effect), o se ve el salto.
  useLayoutEffect(() => {
    const a = ancla.current;
    const el = raizRef.current;
    if (!a || !el) return;
    ancla.current = null;
    el.scrollLeft = (el.scrollLeft + a.x) * a.ratio - a.x;
    el.scrollTop = (el.scrollTop + a.y) * a.ratio - a.y;
  }, [valorZoom, raiz]);

  const medidas = base && base.doc === doc ? base.medidas : null;
  const escala = medidas ? escalaParaEncaje(medidas, giro, hueco, encaje) * valorZoom : 0;
  const provisional: Medidas = medidas
    ? giroIntercambia(giro)
      ? { ancho: medidas.alto * escala, alto: medidas.ancho * escala }
      : { ancho: medidas.ancho * escala, alto: medidas.alto * escala }
    : { ancho: 0, alto: 0 };

  return (
    <div
      ref={asignarRaiz}
      role="document"
      aria-label={titulo}
      tabIndex={0}
      onClick={(e) => e.stopPropagation()}
      className="h-full w-full overflow-auto rounded-xl outline-none [color-scheme:dark] focus-visible:ring-2 focus-visible:ring-brand-400 [scrollbar-gutter:stable]"
    >
      {error ? (
        <div className="grid h-full place-items-center p-6 text-center text-sm text-white/70">
          <p>
            No se ha podido abrir este PDF aquí.{" "}
            <a href={url} target="_blank" rel="noopener" className="underline">
              Ábrelo en otra pestaña
            </a>
            .
          </p>
        </div>
      ) : (
        <div className="mx-auto flex w-fit flex-col items-center gap-8" style={{ padding: `${MARGEN}px ${MARGEN}px ${MARGEN_PIE}px` }}>
          {doc && escala > 0
            ? Array.from({ length: doc.numPages }, (_, i) => (
                <PaginaPdf
                  key={i}
                  doc={doc}
                  numero={i + 1}
                  escala={escala}
                  giro={giro}
                  raiz={raiz}
                  provisional={provisional}
                  poster={i === 0 ? poster : undefined}
                />
              ))
            : poster && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={poster}
                  alt=""
                  aria-hidden="true"
                  className="hoja-3d object-contain"
                  style={{ maxWidth: hueco.ancho || undefined, maxHeight: hueco.alto || undefined }}
                />
              )}
        </div>
      )}
    </div>
  );
}
