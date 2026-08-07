import { diasEntre } from "./fechas";

// ─── Dónde estamos entre la entrada y la entrega ─────────────────────────────
// Un pedido tiene tres fechas que se leen sueltas y no dicen si vamos bien:
// cuándo entró, para cuándo lo planificó Producción y cuándo hay que
// entregarlo. Puestas a escala en una línea, con hoy encima, la pregunta
// "¿voy con tiempo?" se contesta mirando, sin restar fechas de cabeza.

export interface HitoLinea {
  clave: "solicitud" | "planificacion" | "fabricacion" | "entrega";
  etiqueta: string;
  iso: string;
  /** Posición en la línea, de 0 a 100. */
  pct: number;
}

export interface LineaTiempo {
  hitos: HitoLinea[];
  /** Posición de hoy, de 0 a 100. */
  hoyPct: number;
  /** Hoy se sale del tramo dibujado (antes de entrar o después de entregar). */
  hoyFuera: boolean;
  /** Días hasta la entrega: negativo si ya pasó. */
  diasParaEntrega: number;
}

const ETIQUETA = {
  solicitud: "Entrada",
  // OJO con los nombres, que se confunden: `fechaPlanificacion` es el día en
  // que OT debería PLANTEAR (es la que ordena su lista de trabajo), no cuándo
  // se fabrica. La de fabricación es `fechaLimitePlanteo`, que vive por OF y
  // marca cuándo arranca la primera fase posterior al planteo.
  planificacion: "Plantear",
  fabricacion: "Fabricación",
  entrega: "Entrega",
} as const;

/** Reparte las tres fechas a escala real sobre una línea de 0 a 100.
 *
 *  A escala y no a intervalos iguales: si la fabricación cae pegada a la
 *  entrega, eso es justo lo que hay que ver de un vistazo. Cuando las tres
 *  fechas caen el mismo día (o vienen desordenadas) no hay escala posible, así
 *  que se reparten iguales para que la línea siga siendo legible. */
export function lineaTiempo(
  p: {
    fechaSolicitud: string;
    fechaPlanificacion: string;
    fechaEntrega: string;
    /** Cuándo arranca la fabricación, si Producción lo tiene planificado. */
    fechaFabricacion?: string;
  },
  hoy: string,
): LineaTiempo {
  const crudos = [
    { clave: "solicitud" as const, iso: p.fechaSolicitud },
    { clave: "planificacion" as const, iso: p.fechaPlanificacion },
    ...(p.fechaFabricacion ? [{ clave: "fabricacion" as const, iso: p.fechaFabricacion }] : []),
    { clave: "entrega" as const, iso: p.fechaEntrega },
  ];
  const inicio = crudos[0].iso;
  const total = diasEntre(inicio, crudos[crudos.length - 1].iso);

  const hitos: HitoLinea[] = crudos.map((h, i) => ({
    clave: h.clave,
    etiqueta: ETIQUETA[h.clave],
    iso: h.iso,
    pct: total > 0 ? (diasEntre(inicio, h.iso) / total) * 100 : (i / (crudos.length - 1)) * 100,
  }));

  const brutoHoy = total > 0 ? (diasEntre(inicio, hoy) / total) * 100 : 50;
  return {
    hitos,
    // Se recorta a la línea: fuera de ella el punto no se puede dibujar, y que
    // se quede en el extremo ya dice "esto viene de antes" o "esto ya pasó".
    hoyPct: Math.min(100, Math.max(0, brutoHoy)),
    hoyFuera: brutoHoy < 0 || brutoHoy > 100,
    diasParaEntrega: diasEntre(hoy, p.fechaEntrega),
  };
}
