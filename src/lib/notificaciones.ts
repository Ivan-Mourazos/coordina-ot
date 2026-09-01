import type { OF, Pedido } from "./types";

// ─── Avisos de la campana: uno por PEDIDO, no uno por OF ─────────────────────
// Mandar a revisar un pedido de cuatro OF encendía cuatro avisos idénticos,
// todos del mismo pedido y todos llevando al mismo sitio. La campana ponía "4"
// y el trabajo era uno. Aquí se agrupan por pedido y tipo.
//
// La excepción es la que tiene sentido en el taller: si de un pedido de cinco
// OF solo te tocan dos, eso NO es "el pedido", y el aviso tiene que decir
// cuáles son. Un solo aviso igualmente, pero nombrando las OF.

/** Los avisos que puede dar la campana.
 *
 *  Todos son HECHOS: algo que ha pasado y que no has provocado tú. Lo que
 *  tienes pendiente no va aquí —para eso están el tablero y Revisión—, y por
 *  eso se cayó "sin empezar": saltaba por cada OF asignada y sin tocar,
 *  incluidas las que te asignabas tú. */
export type NotifTipo =
  | "revisar"
  | "devuelta"
  | "recibida"
  | "cedida"
  | "revisarNueva"
  | "revisarQuitada"
  | "pedidoCompleto"
  // Los dos siguientes son de TODO EL EQUIPO, no de una persona: una nota o un
  // parte re-escaneado le importan a cualquiera que vaya a tocar ese pedido.
  // Los demás avisos nacieron personales ("te toca a ti"), pero la regla de la
  // campana —un hecho que no has provocado tú— vale igual para estos.
  | "notaNueva"
  | "parteNuevo"
  // Trabajo que apareció DESPUÉS de dar el pedido por terminado: RPS habilitó
  // una OF que antes no había que hacer. Es del equipo, como los dos de
  // arriba, y es el más fácil de perderse: el pedido ya estaba archivado en la
  // cabeza de todos.
  | "ofNueva";

/** Un aviso tal y como se detecta: mirando UNA OF. */
export interface AvisoSuelto {
  tipo: NotifTipo;
  pedido: Pedido;
  /** null solo en los avisos que son del pedido entero por naturaleza
   *  (`pedidoCompleto`), no de ninguna OF concreta. */
  of: OF | null;
  quien?: string;
  otro?: string;
  clave?: string;
  /** Lo que se enseña en la segunda línea cuando el aviso no habla de OF: el
   *  texto de la nota. Sin esto habría que meterlo en `otro`, que significa
   *  otra cosa (la otra persona de un traspaso). */
  texto?: string;
}

/** Un aviso ya agrupado: lo que se pinta. */
export interface NotifItem {
  tipo: NotifTipo;
  pedido: Pedido;
  /** Las OF afectadas. Vacío = el aviso no es de ninguna OF concreta. */
  ofs: OF[];
  /** Cubre TODAS las OF vivas del pedido, así que se puede hablar del pedido
   *  entero en vez de enumerar. */
  pedidoEntero: boolean;
  /** Cuántas OF vivas tiene el pedido, para poder decir "2 de 5". */
  totalOFs: number;
  quien?: string;
  otro?: string;
  clave?: string;
  /** Ver `AvisoSuelto.texto`. */
  texto?: string;
}

/** Las OF que cuentan para decidir si un aviso cubre "el pedido entero".
 *
 *  Sin las anuladas: OT ya dijo que no las hace, así que un pedido de cuatro
 *  con una anulada y las otras tres para ti SÍ es todo tu pedido. Si contaran,
 *  el aviso diría "3 de 4" y te mandaría a buscar una cuarta que no existe. */
const vivas = (p: Pedido): OF[] => p.ofs.filter((o) => o.estado !== "anulada");

/** Agrupa por pedido y tipo, conservando el orden de aparición: el primero que
 *  llega manda, que es el orden en que se detectaron y el que ya se veía.
 *
 *  `notaNueva` NO se agrupa: dos notas seguidas en el mismo pedido son dos
 *  recados distintos, cada uno con su texto, y juntarlos se comía el segundo
 *  —salía el primero y el otro no aparecía en ninguna parte—. Se separan por su
 *  `clave`, que lleva el id de la nota. El resto sí se agrupa: ahí lo que se
 *  junta son OF del mismo pedido bajo una misma noticia. */
export function agruparAvisos(sueltos: readonly AvisoSuelto[]): NotifItem[] {
  const porClave = new Map<string, NotifItem>();
  for (const a of sueltos) {
    const clave =
      a.tipo === "notaNueva" ? `${a.pedido.id}:${a.tipo}:${a.clave}` : `${a.pedido.id}:${a.tipo}`;
    const ya = porClave.get(clave);
    if (ya) {
      if (a.of) ya.ofs.push(a.of);
      continue;
    }
    porClave.set(clave, {
      tipo: a.tipo,
      pedido: a.pedido,
      ofs: a.of ? [a.of] : [],
      pedidoEntero: false, // se calcula al cerrar, con todas sus OF ya dentro
      totalOFs: vivas(a.pedido).length,
      quien: a.quien,
      otro: a.otro,
      clave: a.clave,
      texto: a.texto,
    });
  }

  return [...porClave.values()].map((item) => ({
    ...item,
    // Se compara por cantidad y no por conjunto porque las OF de un aviso
    // salen siempre del propio pedido y no se repiten: cada una se recorre una
    // vez. Cubrirlas todas es, por tanto, llegar a su número.
    pedidoEntero: item.ofs.length > 0 && item.ofs.length === item.totalOFs,
  }));
}

// ─── Apagar un aviso DEDUCIDO al abrirlo ─────────────────────────────────────
// Los de movimiento se apagan al abrir el pedido: nacen de una fila del
// registro, se marca vista y no vuelve. Los deducidos no tienen dónde marcarse,
// porque no son un hecho pasado sino la foto de cómo está la OF ahora mismo:
// abrir el pedido no cambia que te siga tocando revisarlo, así que al render
// siguiente el aviso volvía a estar ahí. Para siempre, hasta cambiar de estado.
//
// Se apagan guardando la IDENTIDAD de lo que se abrió, y esa identidad NO puede
// ser `pedido + tipo` a secas: si mañana te mandan a revisar otra OF del mismo
// pedido sería "el mismo aviso" y no volvería a salir — te perderías trabajo
// nuevo por haber abierto el de ayer. Lo que hace única a una situación es de
// QUÉ OF se avisó, así que la identidad es `pedido + tipo + las OF concretas`.
// Cambiar ese conjunto es un hecho nuevo y vuelve a avisar.
//
// El estado de la OF queda fuera a propósito: "me toca revisar" cubre
// por_revisar y en_revision, y si el estado contara, ponerte a revisar lo que
// acabas de abrir lo encendería otra vez.
//
// Lo que cierra el círculo es PODAR: un descarte solo vive mientras siga
// existiendo el aviso que apaga. En cuanto deja de ser cierto —corriges la OF
// devuelta y se va del listado— el descarte se borra; si te la devuelven una
// segunda vez el aviso es nuevo y suena. Y de paso la lista guardada no crece
// sin fin: no puede tener más entradas que avisos vivos.

/** Los avisos que se deducen mirando la OF, los únicos que hay que descartar a
 *  mano. Los de movimiento ya se apagan por su `clave` contra el servidor. */
const DEDUCIDOS: ReadonlySet<NotifTipo> = new Set<NotifTipo>([
  "revisar",
  "devuelta",
  "pedidoCompleto",
  // Sale de mirar el pedido (`reabiertoPor`), no de una fila del registro, así
  // que tampoco tiene dónde marcarse. Su identidad lleva las OF concretas: si
  // mañana habilitan OTRA, vuelve a sonar.
  "ofNueva",
  // La nota de un compañero no es un movimiento (no hay fila del registro que
  // marcar) y tampoco se apagaba sola, así que se quedaba encendida hasta que
  // la nota dejaba de contar como reciente: leías el recado y la campana
  // seguía con el punto puesto durante días.
  "notaNueva",
]);

export const esDescartable = (item: NotifItem): boolean => DEDUCIDOS.has(item.tipo);

/** Qué situación concreta es este aviso. Las OF van ordenadas para que el orden
 *  en que se recorra el pedido no invente una situación distinta. */
export function identidadAviso(item: NotifItem): string {
  // Una nota no va por OF sino por pedido, así que "las OF concretas" no la
  // distingue de la siguiente: sin el id de la nota, apagar el recado de hoy
  // apagaría también el de mañana. Su `clave` (`nota:<id>`) sí es única.
  if (item.tipo === "notaNueva") return `${item.pedido.id}:${item.tipo}:${item.clave ?? ""}`;
  const ofs = item.ofs
    .map((o) => o.id)
    .sort()
    .join(",");
  return `${item.pedido.id}:${item.tipo}:${ofs}`;
}

export interface AvisosTrasDescartes {
  /** Lo que se pinta en la campana. */
  visibles: NotifItem[];
  /** Los descartes que siguen apagando algo. El resto sobra: su situación ya no
   *  existe, y guardarlo solo serviría para tragarse el aviso si vuelve. */
  vigentes: string[];
}

export function aplicarDescartes(
  items: readonly NotifItem[],
  descartados: readonly string[],
): AvisosTrasDescartes {
  const fuera = new Set(descartados);
  // Solo cuentan los deducidos: un descarte no debe sobrevivir agarrado a un
  // aviso de movimiento que casualmente sea del mismo pedido.
  const vivas = new Set(items.filter(esDescartable).map(identidadAviso));
  return {
    visibles: items.filter((i) => !esDescartable(i) || !fuera.has(identidadAviso(i))),
    vigentes: descartados.filter((d) => vivas.has(d)),
  };
}
