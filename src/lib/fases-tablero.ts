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
  | "listoParaPasar"
  | "parado";

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
  // Fuera del recorrido, y la última a propósito: aquí no hay trabajo que
  // hacer ni decisión que tomar. Producción tiene el pedido detenido y OT no
  // puede ni fichar ni darlo por terminado — liberarlo no está en nuestra mano.
  //
  // Existe para que estos pedidos dejen de disfrazarse: caían en "Sin empezar"
  // por descarte (no tenían ninguna OF que contar) y volvían al panel como si
  // tocara empezarlos. Quien pinta el tablero los saca de las columnas de
  // trabajo y los deja a mano para consultarlos — ver ZonaPersonal.
  //
  // Se resuelve solo: en cuanto RPS deja de decir DETENIDA, el pedido vuelve a
  // su fase de siempre sin que nadie tenga que acordarse de nada.
  { id: "parado", label: "Parado por Producción", color: "#a16207" },
];

/** Las fases que son TRABAJO, en el orden del recorrido. Es lo que se pinta en
 *  columnas; "parado" queda fuera porque no hay nada que hacer con él. */
export const FASES_DE_TRABAJO: readonly FaseMeta[] = FASES.filter((f) => f.id !== "parado");

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
/** Las OF que cuentan para hablar del PEDIDO: lo que Oficina Técnica tiene que
 *  plantear, y nada más.
 *
 *  Quedan fuera tres cosas que no son trabajo pendiente nuestro y que, contadas,
 *  dejaban el pedido colgado para siempre:
 *
 *  · Las ANULADAS: OT ya dijo que no las hace.
 *  · Las de TALLER: no son nuestras (ver `ofDeTaller`).
 *  · Las DETENIDAS por Producción: son nuestras pero no se pueden ni fichar, y
 *    liberarlas no está en nuestra mano. El caso fue AR.26.03626: su toldo
 *    estaba aprobado y el pedido seguía diciendo "Planteando" y sin dejar
 *    pasarlo a Producción, por tres detenidas y una capota de taller.
 *
 *  Si NO queda ninguna, el pedido no tiene NADA pendiente en Oficina Técnica, y
 *  eso es lo que dicen `faseDePedido` ("listo para pasar") y
 *  `pedidoListoParaPasar` (sí). */
export function ofsQueCuentan(p: ConOFs): OF[] {
  return p.ofs.filter((o) => o.estado !== "anulada" && !ofDeTaller(o) && !o.detenida);
}

/** OF nuestra que Producción tiene parada: es trabajo de OT (no de taller, no
 *  anulada) pero está detenida, así que no se puede ni fichar ni terminar hasta
 *  que la liberen. Es lo que distingue un pedido PARADO de uno que OT ya ha
 *  despachado. */
function hayQueEsperarAProduccion(of: OF): boolean {
  return of.detenida === true && of.estado !== "anulada" && !ofDeTaller(of);
}

/** ¿Está el pedido parado por Producción, sin nada que OT pueda hacer? */
export function pedidoParado(p: ConOFs): boolean {
  return faseDePedido(p) === "parado";
}

export function faseDePedido(p: ConOFs): Fase {
  // Un pedido sin ninguna OF no es un pedido sin trabajo: es un pedido del que
  // todavía no sabemos nada.
  if (p.ofs.length === 0) return "sinEmpezar";
  const cuentan = ofsQueCuentan(p);
  if (cuentan.length === 0) {
    // Sin trabajo de OT y con algo detenido: PARADO. No es "sin empezar" (no
    // hay nada que empezar, ni se puede fichar) ni "listo para pasar" (no hay
    // nada que mandar, y RPS ni siquiera acepta darlo por terminado mientras
    // esté detenido). Es el caso de AR.26.03703: dos OFs que Jaime ya tenía
    // empezadas y que Producción paró para volver a medir.
    if (p.ofs.some(hayQueEsperarAProduccion)) return "parado";
    // Sin nada detenido: lo que queda es de taller o lo anulasteis vosotros.
    // Ahí OT sí ha decidido, así que el pedido se puede soltar.
    return "listoParaPasar";
  }
  const fases = cuentan.map(faseDeOF);
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
  // Sin OF que cuente el `every` da true, y es lo correcto: no queda nada
  // pendiente en OT. Antes se exigía que hubiera al menos una, y eso dejaba
  // atrapado al pedido cuyo trabajo está todo detenido — el botón apagado sin
  // más, sin nada que se pudiera hacer para encenderlo, porque liberar una OF
  // detenida no está en nuestra mano. Pasarlo es justo lo que hay que poder
  // hacer: OT dice "por mí, hecho", y deja de ocupar sitio.
  //
  // Un pedido sin OF ninguna sí sigue sin poder pasarse: ahí no es que no quede
  // trabajo, es que todavía no se sabe cuál es.
  //
  // Y tampoco los PARADOS. Pasarlos los sacaría del tablero para siempre, y
  // esos vuelven: en cuanto Producción los libera hay que replantearlos. Se
  // quedan en su cajón hasta que RPS diga otra cosa (o hasta que los cancelen,
  // y entonces desaparecen solos de la vista).
  if (p.ofs.length === 0) return false;
  const cuentan = ofsQueCuentan(p);
  // Ojo con el orden: mientras QUEDE trabajo de OT, una detenida al lado no
  // estorba — es el caso AR.26.03626, con su toldo aprobado y tres detenidas
  // que no están en nuestra mano. Solo cuando no queda nada hay que mirar por
  // qué: si es por detenidas, el pedido está parado y no se suelta.
  if (cuentan.length === 0) return !p.ofs.some(hayQueEsperarAProduccion);
  return cuentan.every((o) => o.estado === "aprobada");
}

/** Quién tiene todavía trabajo en este pedido, para poder decir a quién se
 *  espera en vez de un botón apagado sin explicación. */
export function autoresQueFaltan(p: ConOFs): Array<{ autorId: string | null; n: number }> {
  const cuenta = new Map<string | null, number>();
  // Las mismas que deciden si el pedido está listo (`ofsQueCuentan`): si no, el
  // aviso decía "falta sin asignar (3 OF)" señalando OF detenidas o de taller,
  // que no espera nadie.
  for (const of of ofsQueCuentan(p)) {
    if (of.estado === "aprobada") continue;
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

/** ¿Hay que avisar de que a este pedido le apareció trabajo nuevo?
 *
 *  El aviso —el chip de la tarjeta, la línea de la Lista y el de la campana—
 *  contesta a UNA pregunta: por qué ha vuelto al tablero un pedido que ya se
 *  dio por cerrado. En cuanto alguien coge la OF, la pregunta está contestada
 *  y el aviso sobra; antes se quedaba puesto hasta que la OF se aprobaba, o
 *  sea días, y acababa siendo parte del decorado.
 *
 *  NO decide si el pedido se ve: de eso se encarga `reabiertoPor` en el
 *  overlay, y el pedido tiene que seguir en el tablero mientras le quede
 *  trabajo. Si fueran la misma cosa, coger la OF haría desaparecer el pedido a
 *  media faena, que es justo lo contrario de lo que hace falta. */
export function avisaDeOFNueva(p: ConOFs & { reabiertoPor?: string[] }): boolean {
  const nuevas = p.reabiertoPor ?? [];
  return p.ofs.some((of) => nuevas.includes(of.id) && of.autorId === null);
}
