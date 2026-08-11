import type { OF } from "./types";

// ─── Las cuatro fases del tablero ────────────────────────────────────────────
// Definición ÚNICA. Antes vivía copiada en PedidosPorEstado (bucketDe),
// TecnicoCard (faseDe) y Zona (faseIdx), con etiquetas y colores distintos en
// cada sitio; al cambiar un nombre había que acordarse de los tres.

export type Fase =
  | "devuelta"
  | "sinEmpezar"
  | "planteando"
  | "esperandoRevision"
  | "listoParaPasar";

export interface FaseMeta {
  id: Fase;
  label: string;
  /** Color del punto y de la barra de carga. Literal, no clase de Tailwind:
   *  se usa en `style`, porque Tailwind no compila clases construidas. */
  color: string;
}

export const FASES: readonly FaseMeta[] = [
  // Primera, y no en su sitio del recorrido, a propósito: una devolución es la
  // única fase que existe porque alguien te está esperando. Iba metida en
  // "Planteando" y el resultado fue el esperable — te devuelven un pedido, la
  // campana avisa una vez, y en el tablero aparece indistinguible de lo que ya
  // tenías a medias: nada dice que hubo devolución.
  { id: "devuelta", label: "A corregir", color: "#dc2626" },
  { id: "sinEmpezar", label: "Sin empezar", color: "#9ca3af" },
  { id: "planteando", label: "Planteando", color: "#059669" },
  // "Esperando revisión", no "Para revisar": es MI trabajo en manos de otro.
  // Lo que me toca revisar a mí vive en la pestaña Revisión.
  { id: "esperandoRevision", label: "Esperando revisión", color: "#7c3aed" },
  { id: "listoParaPasar", label: "Listo para pasar", color: "#0891b2" },
];

/** Pedido visto desde el tablero: solo hacen falta sus OFs. */
export interface ConOFs {
  ofs: OF[];
}

/** ¿Esta OF está fuera del trabajo de OT ahora mismo?
 *
 *  Las que entran por una tarea de taller (capotas, faldones) no son nuestras
 *  y no deben ocupar sitio en el tablero. Pero a veces sí resulta que el
 *  pedido lo llevamos nosotros, y entonces basta con asignarle autor: tener
 *  autor ES el rescate, no hace falta guardar nada más.
 *
 *  Al revés funciona igual de solo: devolver el pedido a la bandeja le quita
 *  el autor y vuelve a esconderse. Y anularla sigue estando disponible como
 *  para cualquier otra. */
export function ofOcultaDeOT(of: OF): boolean {
  return of.ajenaOT === true && of.autorId === null;
}

/** ¿Entra por una tarea de TALLER? Sin la excepción del rescate.
 *
 *  Para decidir si una OF ocupa sitio en el tablero, el rescate manda: te la
 *  asignas y es tuya. Pero para CONTAR y AGRUPAR dentro de la ficha del pedido
 *  lo que importa es de dónde viene, y ahí el rescate estorba de dos maneras:
 *
 *  · El autor de una OF no siempre lo pone alguien. Cuando RPS trae tiempo
 *    imputado, el autor se deduce de quién lo echó (ver `autorImputado` en
 *    server/rps.ts), así que una tarea de taller que el taller ya empezó
 *    aparece "con autor" sin que nadie de OT la haya tocado — y se colaba en
 *    la ficha como si fuera trabajo nuestro.
 *  · Y una OF de taller detenida por Producción marcaba el pedido entero como
 *    "Detenido" cuando lo detenido no era cosa de Oficina Técnica.
 *
 *  La única excepción es que se esté fichando AHORA: si alguien tiene el reloj
 *  corriendo en ella, es trabajo de verdad y esconderla sería mentir. */
export function ofDeTaller(of: OF): boolean {
  return of.ajenaOT === true && !of.fichandoRol;
}

export function faseDeOF(of: OF): Fase {
  if (of.estado === "aprobada") return "listoParaPasar";
  if (of.estado === "por_revisar" || of.estado === "en_revision") return "esperandoRevision";
  // Antes que en_curso: una devuelta que ya se está retomando pasa a en_curso
  // sola (la acción "retomar" cambia el estado), así que mientras siga diciendo
  // "devuelta" es que nadie la ha tocado desde que volvió.
  if (of.estado === "devuelta") return "devuelta";
  if (of.estado === "en_curso") return "planteando";
  // Anulada: no es trabajo activo, aunque conserve tiempo fichado de antes de
  // anularse. Cae en "sin empezar" en vez de "planteando" para no aparecer
  // como si hubiera algo en marcha. Hoy Board.tsx filtra las anuladas antes
  // de llegar aquí, pero esta función se presenta como la definición única y
  // reutilizable de la fase, así que necesita su propio caso explícito.
  if (of.estado === "anulada") return "sinEmpezar";
  // Pendiente pero con tiempo o con alguien fichando: ya está en marcha.
  return of.tiempoPlanteoMin > 0 || of.fichandoRol ? "planteando" : "sinEmpezar";
}

/** Fase del pedido entero. Manda lo que está más "en marcha": un pedido con
 *  una OF planteándose está planteándose, aunque las demás estén aprobadas. */
export function faseDePedido(p: ConOFs): Fase {
  if (p.ofs.length === 0) return "sinEmpezar";
  const fases = p.ofs.map(faseDeOF);
  if (fases.every((f) => f === "listoParaPasar")) return "listoParaPasar";
  // Manda sobre todo lo demás: si una OF del pedido volvió a corregir, eso es
  // lo primero que hay que saber del pedido, aunque las otras vayan bien.
  if (fases.some((f) => f === "devuelta")) return "devuelta";
  if (fases.some((f) => f === "planteando")) return "planteando";
  if (fases.some((f) => f === "esperandoRevision")) return "esperandoRevision";
  return "sinEmpezar";
}

/** ¿Se puede mandar este pedido a Producción?
 *
 *  Mira el pedido ENTERO, no las OF de quien pregunta. El tablero reparte cada
 *  pedido por autor, así que quien acabe su parte vería su trozo "listo para
 *  pasar" y, si el botón mirase solo eso, mandaría a Producción la OF que otro
 *  tiene a medias. Producción recibe el pedido completo o no lo recibe. */
export function pedidoListoParaPasar(p: ConOFs): boolean {
  const activas = p.ofs.filter((o) => o.estado !== "anulada");
  return activas.length > 0 && activas.every((o) => o.estado === "aprobada");
}

/** Quién tiene todavía trabajo en este pedido, para poder decir a quién se
 *  espera en vez de un botón apagado sin explicación. */
export function autoresQueFaltan(p: ConOFs): Array<{ autorId: string | null; n: number }> {
  const cuenta = new Map<string | null, number>();
  for (const of of p.ofs) {
    if (of.estado === "anulada" || of.estado === "aprobada") continue;
    cuenta.set(of.autorId, (cuenta.get(of.autorId) ?? 0) + 1);
  }
  return [...cuenta].map(([autorId, n]) => ({ autorId, n }));
}

export interface GrupoFase<T> extends FaseMeta {
  items: T[];
}

/** Reparte pedidos en las cuatro fases. Devuelve SIEMPRE las cuatro, también
 *  vacías: quien pinta decide si una fase vacía ocupa sitio o no. */
export function agruparPorFase<T extends ConOFs>(pedidos: readonly T[]): GrupoFase<T>[] {
  return FASES.map((meta) => ({
    ...meta,
    items: pedidos.filter((p) => faseDePedido(p) === meta.id),
  }));
}

/** Recorta a `tope` elementos y dice cuántos se quedan fuera. Es lo que hace
 *  que la zona personal mida lo mismo con 5 pedidos que con 40. */
export function conTope<T>(items: readonly T[], tope: number): { visibles: T[]; resto: number } {
  return {
    visibles: items.slice(0, tope),
    resto: Math.max(0, items.length - tope),
  };
}

/** Por qué no se puede tocar el pedido de un compañero: el candado del panel
 *  de solo consulta necesita un motivo, no una acción (el arrastre para
 *  quitárselo a otro se eliminó; ver PanelCompanero).
 *
 *  No repite el tiempo: ya sale a la izquierda de la propia fila, y decir
 *  "1 OF · 17m … 17m fichados" obliga a leer dos veces lo mismo. */
export function motivoBloqueo(p: ConOFs): string {
  if (p.ofs.some((o) => o.fichandoRol)) return "fichando";
  const minutos = p.ofs.reduce((n, o) => n + o.tiempoPlanteoMin + o.tiempoRevisionMin, 0);
  if (minutos > 0) return "empezado";
  if (p.ofs.some((o) => o.revisorId)) return "con revisor";
  return "no disponible";
}
