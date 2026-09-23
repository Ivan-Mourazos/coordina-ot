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

/** Aire a los lados de la hoja, en px: que el borde del papel se vea. */
const MARGEN = 24;
/** Arriba y abajo, 16 px: lo mismo que separa del borde el panel de la
 *  derecha de la ficha (`inset-y-4`), así en "ajustar al alto" la hoja empieza
 *  y acaba a la altura del panel. Eran 24 y 64 —el de abajo, para que cupiera
 *  la sombra larga de `.hoja-3d`— y la hoja se quedaba corta. La sombra se
 *  acortó para caber en estos 16: si se alarga en el CSS, esto tiene que
 *  crecer con ella o el canto del visor la corta y se ve una raya. */
const MARGEN_ARRIBA = 16;
const MARGEN_PIE = 16;
/** Sitio de la barra de scroll vertical, que se descuenta SIEMPRE del ancho,
 *  haya barra o no. La del visor es la fina del navegador (~11 px); se deja
 *  algo de holgura. Ver el efecto que mide el hueco. */
const BARRA = 12;
/** Rueda acumulada (px) que pasa de hoja: un golpe de ratón son ~100; el
 *  touchpad manda muchos de 2-10 y hay que sumarlos. */
const UMBRAL_HOJA = 40;
/** Tras pasar de hoja, cuánto se ignora la rueda: la inercia del touchpad
 *  sigue mandando golpes y se saltaría otra hoja más. */
const QUIETO_TRAS_HOJA_MS = 350;

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
  // así que no hace falta medir a mano.
  //
  // SE MIDE POR FUERA (`offsetWidth`/`offsetHeight`), SIN DESCONTAR LAS BARRAS
  // QUE HAYA EN ESE MOMENTO. Con `clientWidth`/`clientHeight` el hueco cambiaba
  // al aparecer una barra, y eso hacía un bucle: el parte girado desbordaba por
  // poco, salía la barra horizontal, el hueco perdía 10 px de alto, la hoja
  // encogía y dejaba de desbordar, la barra se iba, el hueco volvía… y la hoja
  // vibraba sin parar (medido el 23/09/2026 con «Ajustar al ancho» y girado:
  // alto 880↔890 y hoja 732↔744 px, a casi cualquier ancho de ventana). Ahora
  // la barra vertical se descuenta siempre (`BARRA`), esté o no, y la
  // horizontal cae sobre el margen de abajo: ninguna de las dos mueve la escala.
  useEffect(() => {
    if (!raiz) return;
    const ro = new ResizeObserver(() => {
      const ancho = raiz.offsetWidth - BARRA - MARGEN * 2;
      const alto = raiz.offsetHeight - MARGEN_ARRIBA - MARGEN_PIE;
      setHueco((h) => (h.ancho === ancho && h.alto === alto ? h : { ancho, alto }));
    });
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

  // HOJA A HOJA en «página entera» y «al alto» sin zoom: lo que se viene a
  // hacer ahí es ver UNA hoja entera, y con un hueco corto entre páginas
  // asomaba el principio de la siguiente por debajo. Cada hoja ocupa su propio
  // hueco del alto del visor —la siguiente empieza justo al acabar la
  // pantalla— y el scroll encaja de hoja en hoja. Al ancho o ampliada, la hoja
  // es más alta que la pantalla y el scroll vuelve a ser continuo.
  const porHojas = encaje !== "FitH" && valorZoom === 1 && hueco.alto > 0;
  const pasoDeHoja = useRef({ acumulado: 0, quietoHasta: 0 });

  useEffect(() => {
    if (!raiz) return;
    function onRueda(e: WheelEvent) {
      if (!e.ctrlKey) {
        if (!porHojas) return;
        // Hoja a hoja, la rueda la llevamos nosotros. Con el encaje del
        // navegador (`scroll-snap`) un golpe de rueda devolvía la hoja a su
        // sitio en vez de pasar a la siguiente: había que girar tres o cuatro
        // muescas para avanzar una. Aquí cada golpe es una hoja. El touchpad
        // manda muchos golpes pequeños: se suman hasta `UMBRAL_HOJA`, y tras
        // pasar de hoja se ignora la inercia un momento para no saltarse dos.
        e.preventDefault();
        const ahora = performance.now();
        const paso = pasoDeHoja.current;
        if (ahora < paso.quietoHasta) return;
        paso.acumulado += e.deltaY;
        if (Math.abs(paso.acumulado) < UMBRAL_HOJA) return;
        const sentido = Math.sign(paso.acumulado);
        paso.acumulado = 0;
        paso.quietoHasta = ahora + QUIETO_TRAS_HOJA_MS;
        // Cada hoja mide exactamente una pantalla (su hueco más el aire entre
        // dos), así que la hoja N empieza en N pantallas. Medida por fuera, como
        // el hueco: con `clientHeight` una barra horizontal descuadraba el paso.
        const alto = raiz!.offsetHeight;
        const actual = Math.round(raiz!.scrollTop / alto);
        raiz!.scrollTo({ top: (actual + sentido) * alto, behavior: "smooth" });
        return;
      }
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
  }, [raiz, clave, porHojas]);

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
      className="scroll-visor h-full w-full overflow-auto rounded-xl outline-none [color-scheme:dark] focus-visible:ring-2 focus-visible:ring-brand-400 [scrollbar-gutter:stable]"
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
        <div
          className="mx-auto flex w-fit flex-col items-center"
          style={{
            padding: `${MARGEN_ARRIBA}px ${MARGEN}px ${MARGEN_PIE}px`,
            // Hoja a hoja, el hueco entre dos es justo el margen de abajo más
            // el de arriba: así la siguiente queda entera fuera de la vista.
            gap: porHojas ? MARGEN_ARRIBA + MARGEN_PIE : 32,
          }}
        >
          {doc && escala > 0
            ? Array.from({ length: doc.numPages }, (_, i) => (
                <div
                  key={i}
                  // Una hoja apaisada en «página entera» es más baja que el
                  // visor: el hueco sigue midiendo la pantalla y la hoja va
                  // centrada en él, o asomaría igual la de debajo.
                  className={porHojas ? "flex items-center justify-center" : "contents"}
                  style={porHojas ? { height: hueco.alto } : undefined}
                >
                  <PaginaPdf
                    doc={doc}
                    numero={i + 1}
                    escala={escala}
                    giro={giro}
                    raiz={raiz}
                    provisional={provisional}
                    poster={i === 0 ? poster : undefined}
                  />
                </div>
              ))
            : poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={poster}
                  alt=""
                  aria-hidden="true"
                  className="hoja-3d object-contain"
                  style={{ maxWidth: hueco.ancho || undefined, maxHeight: hueco.alto || undefined }}
                />
              ) : (
                // Ni el documento ni su miniatura todavía: una hoja en blanco
                // del tamaño de un A4 que quepa, con el aviso. El telón vacío
                // se leía como "este pedido no tiene parte".
                hueco.alto > 0 && (
                  <div
                    role="status"
                    className="hoja-3d grid place-items-center text-sm text-neutral-500"
                    style={{
                      height: Math.min(hueco.alto, (hueco.ancho || hueco.alto) * Math.SQRT2),
                      width: Math.min(hueco.ancho || hueco.alto, hueco.alto / Math.SQRT2),
                    }}
                  >
                    <span className="animate-pulse">Cargando parte…</span>
                  </div>
                )
              )}
        </div>
      )}
    </div>
  );
}
