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
  return urlPlanteamientos(codigo);
}

function urlPlanteamientos(codigo: string): string | null {
  const base = HERRAMIENTAS.flatMap((g) => g.items).find((h) => h.id === "planteamientos-tgm")?.url;
  if (!base) return null;
  return `${base}?pedido=${encodeURIComponent(codigo.replace(/[.\s]/g, ""))}`;
}

// ─── Puertas de lona (22/10/2026) ────────────────────────────────────────────
// Planteamientos TGM plantea ya las puertas de lona: enrollable, plegable
// (apilable) y autorreparable. Pero la familia PUERTA de aquí es más ancha —se
// lleva también seccionales y muelles de carga (ver rps.ts)— y los TRAMOS de
// plegable aquella web los avisa sin convertirlos. Por eso la puerta no entra
// en FAMILIAS_PLANTEABLES: se mira OF a OF.

/** Los artículos de RPS que aquella web plantea. Los tramos (PUERTAPLET,
 *  PUERTAPLETRAM) y la PUERTARAPIDA, no. */
const ARTICULOS_PUERTA_PLANTEABLES: ReadonlySet<string> = new Set(["PUERTAENR", "PUERTAPLE", "PUERTAUTO"]);

/** APAGADO por unos días (Iván, 22/10/2026): Planteamientos TGM aún tiene
 *  errores con las puertas que hay que configurar allí. Mientras, las puertas
 *  no llevan botón. Para volver a encenderlo, `true`: la regla de cuáles
 *  cuentan (`esPuertaDeLona`) sigue aquí y probada. */
export const PUERTAS_EN_PLANTEAMIENTOS = false;

/** ¿Planteamientos TGM sabe plantear esta OF? Toldo y remolque, siempre; una
 *  puerta, si es de lona y el interruptor de arriba está encendido. */
export function ofPlanteable(of: { familia: string; descripcion?: string; codigoArticulo?: string }): boolean {
  if (FAMILIAS_PLANTEABLES.has(of.familia)) return true;
  return PUERTAS_EN_PLANTEAMIENTOS && esPuertaDeLona(of);
}

/** Una puerta de las que plantea aquella web. Con el código de artículo manda
 *  él. Sin él, la descripción: el tipo de puerta, y ni seccional, ni muelle, ni
 *  tramo. RPS escribe «AUTOREPARABLE» con una sola R. */
export function esPuertaDeLona(of: { familia: string; descripcion?: string; codigoArticulo?: string }): boolean {
  if (of.familia !== "PUERTA") return false;
  if (of.codigoArticulo) return ARTICULOS_PUERTA_PLANTEABLES.has(of.codigoArticulo.trim().toUpperCase());
  const d = (of.descripcion ?? "").toUpperCase();
  return (
    /PUERTA/.test(d) &&
    /APILABLE|ENROLLABLE|PLEGABLE|AUTO?R+EPARABLE/.test(d) &&
    !/SECCIONAL|MUELLE|TRAMO/.test(d)
  );
}

// ─── Plantear, Revisar, Corregir o Abrir (Iván, 19/10 y 21/10/2026) ──────────
// Al principio el botón solo sabía Plantear o Revisar, y con un pedido
// devuelto, aprobado o ya generado salía «Plantear»: invitaba a plantear otra
// vez algo que ya estaba hecho. Ahora dice lo que toca. La dirección sigue la
// misma regla: `?pedido=` solo para plantear —es lo que carga el formulario— y
// `?revisar=` para todo lo demás, que en aquella web abre el pedido en su
// bandeja de Pedidos, a la vista. Allí es la propia web la que decide quién
// puede corregir (solo el autor, y solo si está devuelto o nadie lo ha
// empezado a revisar).

/** Qué hace el botón de la ficha del pedido en Planteamientos TGM. */
export type ModoPlantear = "plantear" | "revisar" | "corregir" | "abrir";

/** Estados en que la OF espera al revisor. */
const EN_REVISION: ReadonlySet<string> = new Set(["por_revisar", "en_revision"]);
/** Estados en que la OF ya entró en revisión: lo que NO queda por plantear. */
const YA_EN_REVISION: ReadonlySet<string> = new Set([...EN_REVISION, "aprobada"]);

/** El botón de la ficha del pedido, con su dirección. Se decide en este orden:
 *
 *  1. Corregir: alguna OF devuelta. Es lo más urgente y lo que más confundía.
 *  2. Plantear: alguna OF que aún no ha entrado en revisión (pendiente o en
 *     curso). Mientras quede algo por plantear, el autor tiene trabajo allí.
 *  3. Revisar: alguna por revisar o en revisión.
 *  4. Abrir: todas aprobadas; ya solo queda consultarlo.
 *
 *  Solo cuentan las OF que aquella web plantea (toldo, remolque y puertas de
 *  lona, ver `ofPlanteable`), y nunca las anuladas, que no se hacen.
 *
 *  «Corregir» es cosa del autor: si se sabe quién mira (`miId`) y quién es el
 *  autor de las OF devueltas, a los demás les sale «Abrir», con la misma
 *  dirección. Si falta cualquiera de los dos datos se deja «Corregir»: mejor
 *  un rótulo de más que esconderle al autor que tiene algo que corregir. */
export function botonPlantear(
  codigo: string,
  ofs: readonly {
    familia: string;
    estado: string;
    autorId?: string | null;
    descripcion?: string;
    codigoArticulo?: string;
  }[],
  miId?: string | null,
): { modo: ModoPlantear; url: string } | null {
  const suyas = ofs.filter((o) => ofPlanteable(o) && o.estado !== "anulada");
  if (suyas.length === 0) return null;
  const url = urlPlanteamientos(codigo);
  if (!url) return null;
  const urlRevisar = url.replace("?pedido=", "?revisar=");

  const devueltas = suyas.filter((o) => o.estado === "devuelta");
  if (devueltas.length > 0) {
    // Basta con que UNA devuelta sea de quien mira, o no se sepa de quién es.
    const esSuya = devueltas.some((o) => !miId || !o.autorId || o.autorId === miId);
    return { modo: esSuya ? "corregir" : "abrir", url: urlRevisar };
  }
  if (suyas.some((o) => !YA_EN_REVISION.has(o.estado))) return { modo: "plantear", url };
  if (suyas.some((o) => EN_REVISION.has(o.estado))) return { modo: "revisar", url: urlRevisar };
  return { modo: "abrir", url: urlRevisar };
}
