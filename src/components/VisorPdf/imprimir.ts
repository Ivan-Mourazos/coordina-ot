/** Imprime el PDF de verdad, no el canvas: un `<iframe>` escondido lo carga
 *  con el visor del navegador y se le pide `print()`. El canvas saldría a la
 *  resolución de pantalla y con los márgenes del visor.
 *
 *  Si el navegador no deja (Firefox con la extensión de Adobe puede no meter
 *  el PDF dentro de un iframe), se abre en otra pestaña y se imprime desde ahí.
 *  El iframe se quita al minuto: antes cortaría el diálogo de imprimir. */
export function imprimirPdf(url: string): void {
  const marco = document.createElement("iframe");
  marco.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  marco.setAttribute("aria-hidden", "true");
  marco.src = url;
  marco.onload = () => {
    try {
      const ventana = marco.contentWindow;
      if (!ventana) throw new Error("sin ventana");
      ventana.focus();
      ventana.print();
    } catch {
      window.open(url, "_blank", "noopener");
    }
    window.setTimeout(() => marco.remove(), 60_000);
  };
  document.body.appendChild(marco);
}
