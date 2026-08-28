// ─── Qué ha cambiado en la web ───────────────────────────────────────────────
// Lo que el equipo ve al entrar después de una actualización. Se escribe A MANO
// y en el idioma de quien lo va a leer: los mensajes de los commits dicen cosas
// como "la migración de `revisada` podía dejar la base a medias", y eso no le
// dice nada a nadie que no haya escrito el código.
//
// LA REGLA PARA AÑADIR UNA ENTRADA: cuéntalo como se lo contarías a un
// compañero en el pasillo. Qué cambia para él y qué tiene que hacer, si es que
// tiene que hacer algo. Nada de nombres de ficheros, de campos ni de estados
// internos.
//
// Y solo lo que SE NOTA. Un arreglo de base de datos que nadie va a percibir no
// va aquí: llenar esto de cosas invisibles enseña a saltárselo.

export type TipoCambio = "nuevo" | "arreglado" | "mejor";

export interface Cambio {
  tipo: TipoCambio;
  /** Una frase que se entienda sola. */
  titulo: string;
  /** El detalle, si hace falta. Dos líneas como mucho. */
  detalle?: string;
}

export interface Novedad {
  /** El día que sale, en ISO. Hace de identificador: no hay dos el mismo día. */
  fecha: string;
  cambios: Cambio[];
}

/** De la más reciente a la más antigua, que es como se lee. */
export const NOVEDADES: readonly Novedad[] = [
  {
    fecha: "2026-08-31",
    cambios: [
      {
        tipo: "nuevo",
        titulo: "Al devolver una OF ahora dices por qué vuelve",
        detalle:
          "Marcas una o varias causas —error en cotas, error en medidas, material equivocado— y escribes qué hay que corregir, como hasta ahora. Si la causa que necesitas no está en la lista, la creas ahí mismo y queda para todos.",
      },
      {
        tipo: "nuevo",
        titulo: "Pestaña nueva: Métricas",
        detalle:
          "Cuántas OF vuelven después de la revisión y por qué. Los números empiezan a contarse ahora, así que tardarán unas semanas en decir algo.",
      },
      {
        tipo: "nuevo",
        titulo: "Revisar, aprobar y devolver el pedido entero de una vez",
        detalle:
          "En la ficha del pedido, cuando te tocan varias OF ya no hace falta ir una por una. La que necesite un motivo distinto se sigue devolviendo desde su fila.",
      },
      {
        tipo: "nuevo",
        titulo: "En el Historial se ve cuánto echó cada persona",
        detalle:
          "Antes ponía «Adrián, Iván — 45m» y no se sabía de quién era cada minuto. Ahora dice «Adrián 30m · Iván 15m».",
      },
      {
        tipo: "arreglado",
        titulo: "El aviso de partes vueltos a escanear estaba parado",
        detalle:
          "Cuando alguien volvía a escanear el parte de un pedido, la web tenía que avisar. Llevaba tiempo sin hacerlo y no se notaba. Ya funciona otra vez.",
      },
      {
        tipo: "arreglado",
        titulo: "Las notas de un compañero no se apagaban",
        detalle:
          "La campana se quedaba con el aviso puesto días después de haberlas leído. Y si te dejaban dos notas en el mismo pedido, solo salía una.",
      },
      {
        tipo: "arreglado",
        titulo: "Una OF podía figurar como revisada sin que nadie la revisara",
        detalle:
          "Pasaba si la mandabas a revisar y la recuperabas antes de que la miraran. Ahora el histórico dice lo que ocurrió de verdad.",
      },
      {
        tipo: "arreglado",
        titulo: "Una OF que revisaba otra persona ponía «No fichable»",
        detalle: "Era mentira: se podía fichar. Ahora dice quién la tiene.",
      },
      {
        tipo: "arreglado",
        titulo: "«Pausar» se quedaba en pantalla unos segundos después de aprobar",
      },
      {
        tipo: "arreglado",
        titulo: "«Finalizar» no dejaba pulsarse si abrías el pedido desde el buscador",
      },
      {
        tipo: "arreglado",
        titulo: "En modo oscuro casi no se veían los calendarios del Historial",
      },
      {
        tipo: "mejor",
        titulo: "Un botón menos al revisar",
        detalle:
          "«Empezar revisión» y «Fichar revisión» hacían exactamente lo mismo. Queda uno.",
      },
      {
        tipo: "mejor",
        titulo: "El aviso de fichar varias OF se lee mejor",
        detalle:
          "Era un bloque de texto seguido. Ahora las OF salen en lista, con su pedido, y se ve claro que el tiempo se reparte entre todas.",
      },
      {
        tipo: "mejor",
        titulo: "Para quien se mueve con el teclado",
        detalle:
          "Los cuadros de confirmación y los paneles ya no dejan el cursor perdido por detrás, y al cerrarlos vuelve donde estaba.",
      },
    ],
  },
];

/** La última actualización que hay. `null` si no hay ninguna. */
export const ULTIMA: string | null = NOVEDADES[0]?.fecha ?? null;

/** ¿Hay algo que esta persona no haya visto?
 *
 *  `visto` es la fecha de la última que leyó. Sin nada guardado —navegador
 *  nuevo, o alguien que entra por primera vez— NO se avisa: estrenar la web con
 *  un aviso de "novedades" de cosas que nunca ha visto de otra forma es ruido.
 *  Se marca como visto al vuelo y a partir de ahí sí se entera de las próximas. */
export function hayNuevas(visto: string | null): boolean {
  if (ULTIMA === null || visto === null) return false;
  return ULTIMA > visto;
}

/** Cuántas actualizaciones se ha perdido, para poder decirlo: quien no entra en
 *  dos semanas tiene que ver que hay varias, no solo la última. */
export function cuantasNuevas(visto: string | null): number {
  if (visto === null) return 0;
  return NOVEDADES.filter((n) => n.fecha > visto).length;
}

export const ETIQUETA: Record<TipoCambio, string> = {
  nuevo: "Nuevo",
  arreglado: "Arreglado",
  mejor: "Mejor",
};
