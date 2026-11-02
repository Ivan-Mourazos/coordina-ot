// ─── El botón de Planteamientos, en la pestaña que ya esté abierta ───────────
// Antes cada clic abría una pestaña nueva (Iván, 02/11/2026). Ahora la pestaña
// lleva nombre: el primer clic la crea y los siguientes la reutilizan.
//
// A una pestaña ya abierta no se le cambia la dirección, porque recargarla
// perdería el pedido a medias: se le manda el pedido y es Planteamientos quien
// pregunta si guardar un borrador, limpiar o cancelar. Si no contesta (una
// versión antigua, o la pestaña ha ido a otro sitio), se abre una pestaña nueva:
// nunca se pisa lo que hubiera.
//
// Limitación del navegador: solo se ve la pestaña abierta desde esta pestaña de
// CoordinaOT, no una abierta a mano.

export const PESTANA_PLANTEAMIENTOS = "planteamientos-tgm";
export const MENSAJE_ABRIR_PEDIDO = "coordina:abrir-pedido";
export const MENSAJE_PEDIDO_RECIBIDO = "planteamientos:pedido-recibido";

/** Lo que tarda en contestar una pestaña que escucha. */
const ESPERA_MS = 700;

/** ¿Es la pestaña en blanco que acaba de crear `window.open`? Una con
 *  Planteamientos dentro es de otro origen: leer su dirección lanza. */
function estaEnBlanco(ventana: Window): boolean {
  try {
    return ventana.location.href === "about:blank";
  } catch {
    return false;
  }
}

export function abrirEnPlanteamientos(url: string): void {
  const ventana = window.open("", PESTANA_PLANTEAMIENTOS);
  if (!ventana) {
    // Bloqueador de ventanas: que lo resuelva el navegador como un enlace normal.
    window.location.assign(url);
    return;
  }
  if (estaEnBlanco(ventana)) {
    ventana.location.href = url;
    return;
  }

  const origen = new URL(url).origin;
  const terminar = () => {
    clearTimeout(reloj);
    window.removeEventListener("message", alContestar);
  };
  const alContestar = (evento: MessageEvent) => {
    if (evento.origin !== origen || evento.source !== ventana) return;
    if ((evento.data as { tipo?: unknown } | null)?.tipo !== MENSAJE_PEDIDO_RECIBIDO) return;
    terminar();
    ventana.focus();
  };
  const reloj = setTimeout(() => {
    terminar();
    window.open(url, "_blank");
  }, ESPERA_MS);
  window.addEventListener("message", alContestar);
  ventana.postMessage({ tipo: MENSAJE_ABRIR_PEDIDO, url }, origen);
  ventana.focus();
}
