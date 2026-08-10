import type { OF, Pedido } from "./types";

// ─── Avisos de la campana: uno por PEDIDO, no uno por OF ─────────────────────
// Mandar a revisar un pedido de cuatro OF encendía cuatro avisos idénticos,
// todos del mismo pedido y todos llevando al mismo sitio. La campana ponía "4"
// y el trabajo era uno. Aquí se agrupan por pedido y tipo.
//
// La excepción es la que tiene sentido en el taller: si de un pedido de cinco
// OF solo te tocan dos, eso NO es "el pedido", y el aviso tiene que decir
// cuáles son. Un solo aviso igualmente, pero nombrando las OF.

export type NotifTipo =
  | "revisar"
  | "devuelta"
  | "sinEmpezar"
  | "recibida"
  | "cedida"
  | "revisarNueva"
  | "revisarQuitada"
  | "pedidoCompleto";

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
}

/** Las OF que cuentan para decidir si un aviso cubre "el pedido entero".
 *
 *  Sin las anuladas: OT ya dijo que no las hace, así que un pedido de cuatro
 *  con una anulada y las otras tres para ti SÍ es todo tu pedido. Si contaran,
 *  el aviso diría "3 de 4" y te mandaría a buscar una cuarta que no existe. */
const vivas = (p: Pedido): OF[] => p.ofs.filter((o) => o.estado !== "anulada");

/** Agrupa por pedido y tipo, conservando el orden de aparición: el primero que
 *  llega manda, que es el orden en que se detectaron y el que ya se veía. */
export function agruparAvisos(sueltos: readonly AvisoSuelto[]): NotifItem[] {
  const porClave = new Map<string, NotifItem>();
  for (const a of sueltos) {
    const clave = `${a.pedido.id}:${a.tipo}`;
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
