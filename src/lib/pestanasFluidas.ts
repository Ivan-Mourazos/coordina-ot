import { flushSync } from "react-dom";

// Cambio de pestaña fundido, copiado de Planteamientos (b778cee; Iván,
// 27/10/2026: «hace un salto en vez de ver cómo cambia»). Con una View
// Transition el navegador fotografía la página antes del cambio: la cabecera
// queda quieta, lo viejo se apaga en 120 ms y lo nuevo entra con un pequeño
// ascenso en 220 ms (como las Tabs de HeroUI). La tira pulsada sale de la foto
// para que su píldora siga deslizándose en vivo.
//
// No hay que tocar cada pestaña: se escucha el clic en captura, antes que
// React, se para, se hace la foto y dentro de la transición se repite el clic
// para que React haga el cambio con flushSync.
//
// Fuera quedan los Sí/No de un formulario (`form`) y cualquier tira marcada con
// `data-sin-transicion`: ahí se elige un valor, no se cambia de pantalla.

const PESTANA =
  ':is(.tira-3d, [role="tablist"]):not(form *, [data-sin-transicion]) > button:not(.pestana-activa, .glass-chip-activo, [aria-selected="true"], [aria-pressed="true"], :disabled)';

let repitiendo = false;
let actual: ViewTransition | undefined;

function alPulsar(evento: MouseEvent) {
  if (repitiendo || evento.button !== 0 || evento.defaultPrevented || evento.metaKey || evento.ctrlKey || evento.shiftKey) return;
  const boton = (evento.target as Element | null)?.closest<HTMLButtonElement>(PESTANA);
  if (!boton || !document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  evento.stopPropagation();
  evento.preventDefault();
  actual?.skipTransition();
  const tira = boton.parentElement as HTMLElement;
  tira.style.setProperty("view-transition-name", "tira-pulsada");
  // Se funde la zona más cercana que cambia con la pestaña (useContenidoFluido
  // la marca con data-fluido). Si esa zona lleva la cabecera, la cabecera se
  // fotografía aparte y no se mueve: solo cambia lo de debajo.
  const zona = tira.closest<HTMLElement>("[data-fluido]");
  const cabecera = zona?.querySelector<HTMLElement>(":scope > header");
  zona?.style.setProperty("view-transition-name", "contenido-pestana");
  cabecera?.style.setProperty("view-transition-name", "cabecera-quieta");
  document.documentElement.dataset.transicionPestana = "activa";
  const transicion = document.startViewTransition(() => {
    repitiendo = true;
    try {
      flushSync(() => boton.click());
    } finally {
      repitiendo = false;
    }
  });
  actual = transicion;
  void transicion.finished
    .catch(() => undefined)
    .finally(() => {
      tira.style.removeProperty("view-transition-name");
      zona?.style.removeProperty("view-transition-name");
      cabecera?.style.removeProperty("view-transition-name");
      if (actual !== transicion) return;
      actual = undefined;
      delete document.documentElement.dataset.transicionPestana;
    });
}

/** Lo pone en marcha `PestanasFluidas` (componente cliente del layout). */
export function iniciarPestanasFluidas(): () => void {
  document.addEventListener("click", alPulsar, true);
  return () => document.removeEventListener("click", alPulsar, true);
}
