import { flushSync } from "react-dom";

// Al pasar un pedido a Producción (Iván, 18/11/2026: «una transición animada
// o algo así»). El pedido sale del tablero; en vez de desaparecer de golpe, su
// fila se encoge y vuela hasta la pestaña «Historial», que es donde se va a
// poder consultar, y las demás filas se recolocan para cerrar el hueco. Nadie
// cambia de pestaña: quien pasa un pedido suele seguir con el siguiente.
//
// Es una View Transition de documento, como el cambio de pestaña
// (pestanasFluidas.ts): la fila lleva el nombre `pedido-a-produccion` en la
// foto de antes, y la pestaña «Historial» lo lleva en la de después; el
// navegador anima de una a otra. Las demás filas de la misma lista llevan un
// nombre propio mientras dura, para recolocarse en vez de saltar. Solo las de
// esa lista: las de otras listas con scroll saldrían volando por encima.
//
// Con la ficha del pedido abierta, lo que vuela es la ficha (ver abajo).
//
// Sin soporte o sin nada a la vista (ni ficha ni fila): el cambio se aplica
// tal cual, como antes.

const NOMBRE = "pedido-a-produccion";
let actual: ViewTransition | undefined;

const aLaVista = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
};

export function animarPaseAProduccion(pedidoId: string, aplicar: () => void): void {
  if (typeof document === "undefined" || !document.startViewTransition) {
    aplicar();
    return;
  }
  // Casi siempre se pasa desde DENTRO del pedido (Iván, 18/11/2026). Entonces
  // lo que vuela es la ficha, no la fila: esa está tapada por el telón, y con
  // nombre propio se pintaría POR ENCIMA de la ficha durante el vuelo (lo
  // nombrado sale de su capa, también del top layer del <dialog>). Por lo
  // mismo, con la ficha abierta las hermanas no llevan nombre: se recolocan
  // detrás, en el fundido de la página.
  const ficha = document.querySelector<HTMLElement>("dialog.marco-ficha[open] .pedido-panel");
  const desdeFicha = !!ficha && aLaVista(ficha);
  const fila = desdeFicha
    ? ficha
    : Array.from(document.querySelectorAll<HTMLElement>(`[data-pedido="${CSS.escape(pedidoId)}"]`)).find(aLaVista);
  if (!fila) {
    aplicar();
    return;
  }
  actual?.skipTransition();
  fila.style.setProperty("view-transition-name", NOMBRE);
  // Inline y en el mismo nodo: React no toca propiedades de estilo que no
  // pone él, así que el nombre sigue ahí en la foto de después.
  const hermanas = desdeFicha
    ? []
    : Array.from(fila.parentElement?.children ?? []).filter(
        (el): el is HTMLElement => el instanceof HTMLElement && el !== fila && el.matches("[data-pedido]") && aLaVista(el),
      );
  hermanas.forEach((el, i) => {
    el.style.setProperty("view-transition-name", `pase-hermana-${i}`);
    el.style.setProperty("view-transition-class", "pase-hermana");
  });
  document.documentElement.dataset.transicionPase = desdeFicha ? "ficha" : "fila";
  // La pestaña «Historial» es la puerta (transiciones.css, `pestana-cajon`).
  // Lleva nombre ya en la foto de ANTES para quedarse en su sitio y abrirse;
  // lo que vuela aterriza en un hueco vacío que se le mete dentro (el buzón):
  // así la pestaña sigue siendo la puerta y no la foto de llegada.
  const pestana = document.querySelector<HTMLElement>('[data-vista="historial"]');
  const conPuerta = !!pestana && aLaVista(pestana);
  if (conPuerta) pestana.style.setProperty("view-transition-name", "pestana-cajon");
  let buzon: HTMLSpanElement | null = null;
  const transicion = document.startViewTransition(() => {
    flushSync(aplicar);
    // Solo si la ficha o la fila se ha ido de verdad. Si no, se desvanece en
    // su sitio y la puerta no se mueve.
    if (!conPuerta || fila.isConnected) return;
    buzon = document.createElement("span");
    buzon.setAttribute("aria-hidden", "true");
    buzon.style.cssText = `position:absolute;inset:8px 12px;pointer-events:none;view-transition-name:${NOMBRE}`;
    pestana.style.position = "relative";
    pestana.append(buzon);
    document.documentElement.dataset.cajon = "";
  });
  actual = transicion;
  void transicion.finished
    .catch(() => undefined)
    .finally(() => {
      fila.style.removeProperty("view-transition-name");
      for (const el of hermanas) {
        el.style.removeProperty("view-transition-name");
        el.style.removeProperty("view-transition-class");
      }
      (buzon as HTMLSpanElement | null)?.remove();
      if (conPuerta) {
        pestana.style.removeProperty("view-transition-name");
        pestana.style.removeProperty("position");
      }
      if (actual !== transicion) return;
      actual = undefined;
      delete document.documentElement.dataset.transicionPase;
      delete document.documentElement.dataset.cajon;
    });
}
