// ─── Imprimir un PDF desde el navegador ──────────────────────────────────────
// Para los planteamientos que no son todo A4: se carga el PDF en un iframe
// oculto y se abre el cuadro de imprimir, donde se elige impresora y páginas.
// Si el navegador no deja imprimir el iframe, se abre en una pestaña nueva.
// Se llama DENTRO del clic de confirmar: fuera de un gesto del usuario el
// navegador bloquearía la pestaña de respaldo.

export function abrirParaImprimir(url: string): void {
  const marco = document.createElement("iframe");
  marco.style.position = "fixed";
  marco.style.width = "0";
  marco.style.height = "0";
  marco.style.border = "0";
  marco.src = url;
  marco.onload = () => {
    try {
      marco.contentWindow?.focus();
      marco.contentWindow?.print();
    } catch {
      window.open(url, "_blank", "noopener");
    }
    // Se quita pasado un rato: si se quita antes de que cierre el cuadro,
    // algunos navegadores cancelan la impresión.
    setTimeout(() => marco.remove(), 120_000);
  };
  document.body.appendChild(marco);
}
