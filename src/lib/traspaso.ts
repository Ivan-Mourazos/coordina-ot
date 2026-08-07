import type { OF } from "./types";

// ─── Pasarle trabajo a otro ──────────────────────────────────────────────────
// Las dos operaciones que mueven una OF de manos, como funciones puras: el
// estado, los tiempos y la observación son datos del TRABAJO y sobreviven al
// cambio; lo que cambia es quién lo tiene.

/** Traspasar la autoría solo tiene sentido donde queda trabajo del autor. En
 *  `por_revisar`, `en_revision` y `aprobada` su parte ya terminó: cambiar el
 *  nombre ahí no movería trabajo, solo reescribiría quién lo hizo. */
export function puedeTraspasarAutor(of: OF): boolean {
  return of.estado === "pendiente" || of.estado === "en_curso" || of.estado === "devuelta";
}

/** La OF cambia de manos tal como está: mismo estado, mismos tiempos, misma
 *  observación. No empieza de cero.
 *
 *  El revisor SÍ se borra: se nombró para el trabajo del autor anterior, y el
 *  nuevo lo elegirá cuando mande a revisar (que es el único momento en que se
 *  nombra revisor). De paso evita que el nuevo autor herede el papel de
 *  revisor de la misma OF, que la regla dura del dominio prohíbe. Por eso
 *  TODAS las vías de cambiar de autor pasan por aquí, también la de asignar el
 *  pedido entero (ver `moverOFs` en Board.tsx): si alguna se lo saltara,
 *  volvería a ser alcanzable ese estado imposible. */
export function traspasarAutor(of: OF, autorId: string): OF {
  return { ...of, autorId, revisorId: null };
}

/** Cambiar un revisor YA nombrado —cambio de última hora, alguien que se pone
 *  malo— no contradice la regla de "el revisor se nombra al mandar a revisar":
 *  no es elegirlo antes de tiempo, es corregir una elección hecha. */
export function puedeCambiarRevisor(of: OF): boolean {
  return of.estado === "por_revisar" || of.estado === "en_revision";
}

/** Si la revisión ya había empezado, la OF vuelve a `por_revisar` y el nuevo
 *  arranca cuando pulse "Empezar revisión". No se deja en `en_revision`
 *  esperando: quedaría marcada como "se está revisando" sin que nadie la esté
 *  revisando. El tiempo del anterior no se toca, es suyo y ya está fichado. */
export function cambiarRevisor(of: OF, revisorId: string): OF {
  if (revisorId === of.autorId)
    throw new Error("El revisor no puede ser el autor de la OF");
  return { ...of, revisorId, estado: "por_revisar" };
}
