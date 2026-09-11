// ─── Escape cierra UNA capa, la de arriba ────────────────────────────────────
// Cada ventana escuchaba Escape por su cuenta en el `document`, y todas a la
// vez: con la ficha abierta y el desplegable de autor desplegado, Escape
// cerraba el desplegable Y la ficha. Lo mismo con el cuadro de confirmar, el
// menú "⋯" o el visor del parte ampliado. Materiales lo resolvía a su manera
// (escuchando antes que nadie y cortando el evento), y cada arreglo suelto así
// dependía del orden en que se hubieran registrado los demás.
//
// Aquí se apilan en el orden en que se abren y Escape cierra solo la última.
// Otra pulsación, la siguiente. Es lo que se espera de capas que se tapan
// unas a otras, y deja de depender de quién escuchó primero.
//
// Lo que se escribe (el motivo de devolver, una nota) sigue decidiendo sobre
// su propio Escape: su `onKeyDown` corta la propagación y aquí no llega.

export interface PilaCapas {
  /** Mete una capa encima. Devuelve cómo sacarla, esté donde esté. */
  apilar: (cerrar: () => void) => () => void;
  /** Cierra la de arriba. `false` si no había ninguna abierta. */
  cerrarUltima: () => boolean;
}

export function crearPila(): PilaCapas {
  const capas: { cerrar: () => void }[] = [];
  return {
    apilar(cerrar) {
      // Un objeto por capa y no la función: dos capas pueden compartir la
      // misma, y sacar una no puede llevarse la otra.
      const capa = { cerrar };
      capas.push(capa);
      return () => {
        const i = capas.indexOf(capa);
        if (i >= 0) capas.splice(i, 1);
      };
    },
    cerrarUltima() {
      const capa = capas.at(-1);
      if (!capa) return false;
      capa.cerrar();
      return true;
    },
  };
}

const pila = crearPila();
let escuchando = false;

function alPulsar(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  // Un popover nativo abierto («Tareas y tiempos» del Historial) lo cierra el
  // propio navegador con esta misma pulsación: es suya, no de la capa de debajo.
  if (document.querySelector(":popover-open")) return;
  if (pila.cerrarUltima()) e.preventDefault();
}

/** Registra una capa que se cierra con Escape. Devuelve cómo quitarla. */
export function apilarCapa(cerrar: () => void): () => void {
  if (!escuchando) {
    // En burbuja y no en captura: así lo que se escribe (un `textarea` con su
    // propio Escape) se entera antes y puede quedárselo.
    document.addEventListener("keydown", alPulsar);
    escuchando = true;
  }
  return pila.apilar(cerrar);
}
