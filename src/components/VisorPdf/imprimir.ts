/** Cuánto se espera a que el iframe cargue antes de rendirse y abrir pestaña. */
const ESPERA_CARGA_MS = 8_000;

// Un solo iframe a la vez: imprimir tres veces seguidas no debe dejar tres PDF
// cargados escondidos durante un minuto. Con él va su espera de carga, que hay
// que cancelar al quitarlo: si no, abriría una pestaña de un PDF que ya nadie
// quiere imprimir.
let marcoAnterior: { marco: HTMLIFrameElement; sinCargar: number } | null = null;

function quitarAnterior(): void {
  if (!marcoAnterior) return;
  window.clearTimeout(marcoAnterior.sinCargar);
  marcoAnterior.marco.remove();
  marcoAnterior = null;
}

/** Imprime el PDF de verdad, no el canvas: un `<iframe>` escondido lo carga
 *  con el visor del navegador y se le pide `print()`. El canvas saldría a la
 *  resolución de pantalla y con los márgenes del visor.
 *
 *  Si el navegador no deja (Firefox con la extensión de Adobe puede no meter
 *  el PDF dentro de un iframe), se abre en otra pestaña y se imprime desde ahí.
 *  Lo mismo si en 8 s no ha cargado (lo descarga en vez de enseñarlo, o se
 *  queda colgado): pulsar ⎙ y que no pase nada es lo peor.
 *  El iframe se quita al minuto: antes cortaría el diálogo de imprimir. */
export function imprimirPdf(url: string): void {
  quitarAnterior();
  const marco = document.createElement("iframe");
  marco.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  marco.setAttribute("aria-hidden", "true");
  marco.src = url;
  const sinCargar = window.setTimeout(() => {
    quitarAnterior();
    window.open(url, "_blank", "noopener");
  }, ESPERA_CARGA_MS);
  const este = { marco, sinCargar };
  marcoAnterior = este;
  marco.onload = () => {
    window.clearTimeout(sinCargar);
    try {
      const ventana = marco.contentWindow;
      if (!ventana) throw new Error("sin ventana");
      ventana.focus();
      ventana.print();
    } catch {
      window.open(url, "_blank", "noopener");
    }
    window.setTimeout(() => {
      if (marcoAnterior === este) quitarAnterior();
    }, 60_000);
  };
  document.body.appendChild(marco);
}
