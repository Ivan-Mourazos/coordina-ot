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
        id: "plantear-toldos",
        nombre: "Plantear toldos",
        descripcion: "Cálculo y despiece de toldos.",
      },
      {
        id: "plantear-remolques",
        nombre: "Plantear remolques",
        descripcion: "Cálculo y despiece de remolques.",
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
        nombre: "Historial de pedidos hechos",
        descripcion: "Los pedidos ya terminados, con sus tiempos.",
        url: "http://192.168.0.90:4100/",
      },
      {
        id: "buscador-sisgeko",
        nombre: "Buscador Sisgeko",
        descripcion: "Búsqueda en la documentación de Sisgeko.",
        url: "http://192.168.0.90:5000/",
      },
      {
        id: "monitorizacion-tgm",
        nombre: "Monitorización TGM",
        descripcion: "Estado de las máquinas y la producción.",
        url: "http://192.168.0.90:4000/",
      },
    ],
  },
];

/** Cuántas están ya publicadas. Con cero, el menú lo dice en vez de enseñar una
 *  lista entera de "pronto" sin explicación. */
export const cuantasDisponibles = (grupos: GrupoHerramientas[] = HERRAMIENTAS): number =>
  grupos.reduce((n, g) => n + g.items.filter((h) => h.url).length, 0);
