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
  /** Este hito es la fecha que MANDA en el pedido: la que se colorea con la
   *  urgencia y contra la que se mide el retraso.
   *
   *  Normalmente es la planificación. Cuando RPS no la da, el pedido no tiene
   *  hito de planificación —sería repetir la solicitada— y el papel lo hereda
   *  la solicitada, que pasa a ser la única fecha que se sabe de él. */
  referencia?: boolean;
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
  // "Llegada" y no "Creación": desde que este hito es la creación de las OF y
  // no la del pedido de venta, seguir llamándolo creación señalaría a otro día.
  // Es la única palabra que se aparta de la herramienta vieja, y se aparta
  // porque el dato debajo también lo hace.
  creacion: "Llegada",
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
    /** La planificación es la entrega puesta a falta de otra cosa. */
    planificacionEstimada?: boolean;
    /** Fin de fabricación previsto, si alguna OF lo tiene puesto. */
    fechaFabricacion?: string;
    /** La entrega que pide el cliente. */
    fechaEntrega: string;
  },
  hoy: string,
): LineaTiempo {
  // Una fabricación ANTERIOR al planteo es imposible: no se termina de fabricar
  // algo que todavía no se ha planteado. RPS las da (AR.25.02771: planteo el
  // 07/08 y fabricación el 21/05, dos meses antes), y dibujarla a escala la
  // coloca a la izquierda de la planificación y hace dudar de toda la línea.
  // Se deja fuera: mejor tres hitos ciertos que cuatro con uno inventando un
  // recorrido que no ocurrió. Ojo, solo se descarta hacia ATRÁS — fabricar
  // después de la fecha solicitada sí pasa, y es justo lo que hay que ver.
  //
  // Con la planificación prestada no se descarta nada: comparar contra una
  // fecha que no es la de planteo no dice si la fabricación es imposible.
  //
  // Y tampoco puede ser anterior a la CREACIÓN del pedido de venta: no se acaba
  // de fabricar algo que todavía nadie ha pedido. Esta segunda comprobación no
  // depende del planteo, así que caza también los partes sin planificar, que es
  // donde más se cuela. Comprobado en RPS con AR.26.03947: la OF se creó el
  // 10/08, el pedido de venta el 07/08 y su ManualEndDate dice 06/08 — y las
  // cuatro OF del pedido traen la MISMA fecha, que es lo que delata que es un
  // valor heredado de una plantilla y no algo que nadie decidiera.
  const fabAntesDePlanteo =
    !p.planificacionEstimada &&
    p.fechaFabricacion !== undefined &&
    p.fechaFabricacion < p.fechaPlanificacion;
  const fabAntesDelPedido =
    p.fechaCreacion !== undefined &&
    p.fechaFabricacion !== undefined &&
    p.fechaFabricacion < p.fechaCreacion;
  const fabricacionImposible = fabAntesDePlanteo || fabAntesDelPedido;

  // Sin fecha de planteo, la planificación ES la solicitada (ver rps.ts), así
  // que pintar el hito sería repetir la misma fecha dos veces en la misma
  // línea. Se deja fuera y manda la solicitada: la referencia del pedido pasa a
  // ser la entrega, que es lo único que se sabe de él.
  const crudos = [
    ...(p.fechaCreacion ? [{ clave: "creacion" as const, iso: p.fechaCreacion }] : []),
    ...(p.planificacionEstimada
      ? []
      : [{ clave: "planificacion" as const, iso: p.fechaPlanificacion }]),
    ...(p.fechaFabricacion && !fabricacionImposible
      ? [{ clave: "fabricacion" as const, iso: p.fechaFabricacion }]
      : []),
    {
      clave: "solicitada" as const,
      iso: p.fechaEntrega,
      // La solicitada hace de referencia cuando no hay planteo: es la que se
      // colorea, en el sitio donde las demás colorean la planificada.
      referencia: p.planificacionEstimada === true,
    },
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
    // La planificación es la referencia siempre que exista; si no, lo es la
    // solicitada (ver arriba). Así quien pinta no necesita saber por qué.
    ...(h.clave === "planificacion" || ("referencia" in h && h.referencia)
      ? { referencia: true }
      : {}),
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
