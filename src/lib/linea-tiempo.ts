import { diasEntre } from "./fechas";

// ─── Dónde estamos entre la entrada y la entrega ─────────────────────────────
// Un pedido tiene tres fechas que se leen sueltas y no dicen si vamos bien:
// cuándo entró, para cuándo lo planificó Producción y cuándo hay que
// entregarlo. Puestas a escala en una línea, con hoy encima, la pregunta
// "¿voy con tiempo?" se contesta mirando, sin restar fechas de cabeza.

export interface HitoLinea {
  clave: "creacion" | "planificacion" | "fabricacion" | "solicitada";
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

// Los nombres son los de la herramienta vieja, que es el vocabulario del
// taller. No inventar sinónimos: "solicitada" es la entrega, y "planificación"
// es el día de plantear, no el de fabricar.
const ETIQUETA = {
  creacion: "Creación",
  planificacion: "Planificación",
  fabricacion: "Fabricación",
  solicitada: "Solicitada",
} as const;

/** Separa etiquetas que caerían una encima de otra.
 *
 *  Los hitos van a escala real, así que dos fechas próximas comparten sitio: en
 *  AR.26.03914 la creación es el 05/08 y la fabricación el 17/08 sobre un
 *  recorrido de 22 días, y sus textos se pisan. Los PUNTOS se quedan donde les
 *  toca —la escala es el dato— y solo se mueven los textos, lo justo para que
 *  se lean.
 *
 *  `pcts` entra en el orden en que se pinta; devuelve las posiciones ya
 *  separadas, en el mismo orden. `sep` es la distancia mínima entre centros y
 *  `margen` cuánto texto sobresale por los extremos, las dos en % del ancho. */
export function repartirEtiquetas(pcts: number[], sep: number, margen = 0): number[] {
  const min = margen;
  const max = 100 - margen;
  // Se trabaja de izquierda a derecha por posición real, no por orden de
  // pintado: con fechas desordenadas (que RPS las da) no son lo mismo.
  const orden = pcts.map((pct, i) => ({ pct, i })).sort((a, b) => a.pct - b.pct);

  const puestas = orden.map((o) => o.pct);
  // Empujando a la derecha se resuelven todos los solapes salvo el desborde.
  puestas[0] = Math.max(min, puestas[0]);
  for (let k = 1; k < puestas.length; k++) {
    puestas[k] = Math.max(puestas[k], puestas[k - 1] + sep);
  }
  // Si se salió por la derecha, se recoge todo hacia atrás. Puede tocar el
  // borde izquierdo si no cabe: mejor apretado que fuera de la caja.
  if (puestas[puestas.length - 1] > max) {
    puestas[puestas.length - 1] = max;
    for (let k = puestas.length - 2; k >= 0; k--) {
      puestas[k] = Math.max(min, Math.min(puestas[k], puestas[k + 1] - sep));
    }
  }

  const salida = new Array<number>(pcts.length);
  orden.forEach((o, k) => (salida[o.i] = puestas[k]));
  return salida;
}

/** Reparte las tres fechas a escala real sobre una línea de 0 a 100.
 *
 *  A escala y no a intervalos iguales: si la fabricación cae pegada a la
 *  entrega, eso es justo lo que hay que ver de un vistazo. Cuando las tres
 *  fechas caen el mismo día (o vienen desordenadas) no hay escala posible, así
 *  que se reparten iguales para que la línea siga siendo legible. */
export function lineaTiempo(
  p: {
    /** Cuándo entró el pedido (OrderDate). Si falta, la línea arranca en la
     *  planificación: es preferible a fingir una entrada que no se sabe. */
    fechaCreacion?: string;
    fechaPlanificacion: string;
    /** Fin de fabricación previsto, si alguna OF lo tiene puesto. */
    fechaFabricacion?: string;
    /** La entrega que pide el cliente. */
    fechaEntrega: string;
  },
  hoy: string,
): LineaTiempo {
  const crudos = [
    ...(p.fechaCreacion ? [{ clave: "creacion" as const, iso: p.fechaCreacion }] : []),
    { clave: "planificacion" as const, iso: p.fechaPlanificacion },
    ...(p.fechaFabricacion ? [{ clave: "fabricacion" as const, iso: p.fechaFabricacion }] : []),
    { clave: "solicitada" as const, iso: p.fechaEntrega },
  ];
  // Los extremos son los que marcan la escala, y no siempre son el primero y
  // el último de la lista: RPS deja fabricar después de la fecha solicitada
  // (pedido que va tarde) y eso tiene que verse, no salirse de la línea.
  const ordenadas = crudos.map((h) => h.iso).sort();
  const inicio = ordenadas[0];
  const total = diasEntre(inicio, ordenadas[ordenadas.length - 1]);

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
