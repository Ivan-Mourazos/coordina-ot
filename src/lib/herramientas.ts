// ─── Las otras herramientas de Oficina Técnica ───────────────────────────────
// CoordinaOT no es lo único que usa OT: para plantear un toldo, reservar
// material o buscar en Sisgeko hay páginas aparte, y hoy se llega a ellas por
// favoritos del navegador, que cada uno tiene a su manera y nadie comparte con
// el que entra nuevo.
//
// Aquí está el catálogo, en UN sitio. Una herramienta sin `url` es una que
// todavía no está desplegada: sale en la lista, apagada y sin poder pulsarse,
// para que el equipo sepa que viene. En cuanto IT la publique, se le pone la
// dirección aquí y aparece sola — no hay nada más que tocar.
//
// Por qué un fichero y no una variable de entorno: son direcciones internas y
// estables, no secretos, y cambiarlas es tan raro como cambiar el nombre de una
// vista. Un fichero se lee, se comenta y queda en el historial de git; una
// variable de entorno con seis URLs dentro no.
//
// Todas viven en el mismo servidor (192.168.0.90) y se distinguen por puerto;
// CoordinaOT es el 4300. Si algún día se les pone nombre de verdad, se cambia
// aquí y ya está.

export interface Herramienta {
  id: string;
  nombre: string;
  /** Para qué sirve, en una línea. Lo lee quien no la ha usado nunca. */
  descripcion: string;
  /** Dirección completa. Ausente = aún no está desplegada. */
  url?: string;
}

export interface GrupoHerramientas {
  titulo: string;
  items: Herramienta[];
}

export const HERRAMIENTAS: GrupoHerramientas[] = [
  {
    titulo: "Plantear",
    items: [
      {
        // Toldos y remolques en una sola web desde el 02/10/2026 (Iván): la
        // de remolques del 4500 se retira y su puerto redirige aquí.
        id: "planteamientos-tgm",
        nombre: "Planteamientos TGM",
        descripcion: "Cálculo, despiece y planteamiento de toldos y remolques.",
        url: "http://192.168.0.90:4400/",
      },
      {
        id: "reservar-materiales",
        nombre: "Reservar materiales",
        descripcion: "Apartar el material de una OF en RPS.",
        url: "http://192.168.0.90:4200/",
      },
    ],
  },
  {
    titulo: "Consultar",
    items: [
      {
        id: "historial-pedidos",
        nombre: "Pedidos hechos",
        // No es lo mismo que la pestaña Historial de aquí: esa busca un pedido
        // por su código, su cliente o su fecha. Esta busca por MEDIDAS y
        // características, que es la pregunta de "¿cómo resolvimos uno así?".
        descripcion: "Búsqueda de pedidos ya realizados, por medidas o características.",
        url: "http://192.168.0.90:4100/",
      },
      {
        id: "buscador-sisgeko",
        nombre: "Sisgeko",
        descripcion: "Sistema de gestión de conocimiento de Toldos Gómez.",
        url: "http://192.168.0.90:5000/",
      },
      {
        id: "monitorizacion-tgm",
        nombre: "Monitorización TGM",
        descripcion: "Actividad en tiempo real de instalaciones y comerciales.",
        url: "http://192.168.0.90:4000/",
      },
    ],
  },
];

/** Cuántas están ya publicadas. Con cero, el menú lo dice en vez de enseñar una
 *  lista entera de "pronto" sin explicación. */
export const cuantasDisponibles = (grupos: GrupoHerramientas[] = HERRAMIENTAS): number =>
  grupos.reduce((n, g) => n + g.items.filter((h) => h.url).length, 0);

// ─── Plantear un pedido desde su ficha ───────────────────────────────────────
// Para plantear un toldo o un remolque había que abrir Planteamientos TGM y
// teclear allí el número que se tenía delante. El botón «Plantear» de la ficha
// abre esa web con el pedido ya buscado.

/** Lo que Planteamientos TGM sabe plantear. Las dos de toldo: `TOLDO` es la
 *  familia y `TOLDO NUEVO` la subfamilia con que RPS trae la mayoría. */
const FAMILIAS_PLANTEABLES: ReadonlySet<string> = new Set(["TOLDO", "TOLDO NUEVO", "REMOLQUE"]);

/** La dirección que abre Planteamientos TGM con este pedido cargado, o null si
 *  el pedido no lleva ningún toldo ni remolque (o la web no está publicada).
 *
 *  El número va SIN PUNTOS (`AR2604351`, no `AR.26.04351`): es como aquella
 *  web nombra los archivos que genera. Qué pantalla abre —toldos o remolques—
 *  lo decide ella al buscarlo. */
export function enlacePlantear(codigo: string, familias: readonly string[]): string | null {
  if (!familias.some((f) => FAMILIAS_PLANTEABLES.has(f))) return null;
  const base = HERRAMIENTAS.flatMap((g) => g.items).find((h) => h.id === "planteamientos-tgm")?.url;
  if (!base) return null;
  return `${base}?pedido=${encodeURIComponent(codigo.replace(/[.\s]/g, ""))}`;
}
