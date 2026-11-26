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

/** Coloca etiquetas de ancho conocido lo más cerca posible de su punto.
 *
 *  `repartirEtiquetas` trabaja en % con una separación fija y deja siempre un
 *  margen en los extremos: en una columna ancha eso despegaba la primera y la
 *  última fecha 35-40 px de su punto, y empujaba a la siguiente a un sitio
 *  donde no había nada. Aquí cada texto mide lo que mide (en px) y se coloca
 *  CENTRADO sobre su punto si cabe; si no, lo justo para no salirse de la caja
 *  —así la primera queda alineada al borde izquierdo y la última al derecho— o
 *  para no pisar a la de al lado.
 *
 *  `x` es el centro deseado y `ancho` el de la caja, en px. Devuelve el borde
 *  IZQUIERDO de cada etiqueta, en el orden de entrada. */
export function repartirEtiquetasPx(
  items: { x: number; w: number }[],
  ancho: number,
  hueco = 8,
): number[] {
  if (items.length === 0) return [];
  const orden = items.map((it, i) => ({ ...it, i })).sort((a, b) => a.x - b.x);
  const izq = orden.map((o) => Math.max(0, Math.min(ancho - o.w, o.x - o.w / 2)));
  for (let k = 1; k < orden.length; k++) {
    izq[k] = Math.max(izq[k], izq[k - 1] + orden[k - 1].w + hueco);
  }
  const ult = orden.length - 1;
  if (izq[ult] + orden[ult].w > ancho) {
    izq[ult] = ancho - orden[ult].w;
    for (let k = ult - 1; k >= 0; k--) {
      izq[k] = Math.max(0, Math.min(izq[k], izq[k + 1] - orden[k].w - hueco));
    }
  }
  const salida = new Array<number>(items.length);
  orden.forEach((o, k) => (salida[o.i] = izq[k]));
  return salida;
}

/** Orden en que se leen los hitos cuando las fechas están bien puestas. */
const ORDEN_NATURAL: HitoLinea["clave"][] = ["creacion", "planificacion", "fabricacion", "solicitada"];

/** Nombre corto para cuando una fecha no está donde se espera. */
export const ETIQUETA_CORTA: Record<HitoLinea["clave"], string> = {
  creacion: "Lleg.",
  planificacion: "Plan.",
  fabricacion: "Fab.",
  solicitada: "Solic.",
};

/** Hitos que NO caen en su sitio de siempre.
 *
 *  La fila de Pendientes no repite los nombres —viven una vez en la cabecera—
 *  y eso funciona mientras el orden es el de siempre. Cuando RPS trae la
 *  solicitada antes de la planificada, o la fabricación después de la
 *  solicitada, la cuarta fecha ya no es la solicitada y no hay forma de saber
 *  cuál es cuál (30/10 · 23/11 · 26/11 · 14/12: el 23/11 era la entrega). Esos,
 *  y solo esos, llevan nombre corto delante. Dos fechas del mismo día no
 *  cuentan como desorden. */
export function fueraDeOrden(hitos: HitoLinea[]): Set<HitoLinea["clave"]> {
  const esperado = ORDEN_NATURAL.filter((c) => hitos.some((h) => h.clave === c));
  const real = [...hitos]
    .sort((a, b) => a.iso.localeCompare(b.iso) || ORDEN_NATURAL.indexOf(a.clave) - ORDEN_NATURAL.indexOf(b.clave))
    .map((h) => h.clave);
  return new Set(real.filter((c, i) => esperado[i] !== c));
}

/** Hitos que caen el mismo día, juntos: un solo texto en vez de dos, porque el
 *  segundo acababa empujado a un sitio de la línea donde no había ningún
 *  punto. El primero de cada grupo es el que manda (la referencia, si está). */
export function agruparMismoDia(hitos: HitoLinea[]): { iso: string; pct: number; hitos: HitoLinea[] }[] {
  const grupos: { iso: string; pct: number; hitos: HitoLinea[] }[] = [];
  for (const h of hitos) {
    const g = grupos.find((x) => x.iso === h.iso);
    if (g) {
      if (h.referencia) g.hitos.unshift(h);
      else g.hitos.push(h);
    } else grupos.push({ iso: h.iso, pct: h.pct, hitos: [h] });
  }
  return grupos;
}

/** Dónde termina la línea CONTINUA: en la solicitada.
 *
 *  La solicitada es el día en que el cliente quiere el producto instalado, así
 *  que con las fechas bien puestas es la última (Iván, 26/11/2026). Lo que cae
 *  después —fabricar más tarde, o una planificada posterior a la entrega— se
 *  pinta en discontinua: es lo que no debería pasar. La escala sigue siendo la
 *  real; solo cambia el trazo. */
export function pctSolicitada(hitos: HitoLinea[]): number {
  return hitos.find((h) => h.clave === "solicitada")?.pct ?? 100;
}

/** Parte un trozo de línea [desde, hasta] en lo que va antes de la solicitada
 *  (continuo) y lo que va después (discontinuo). Cualquiera de los dos puede
 *  faltar. */
export function partirEnSolicitada(
  desde: number,
  hasta: number,
  corte: number,
): { continuo?: [number, number]; discontinuo?: [number, number] } {
  const a = Math.min(hasta, corte);
  const b = Math.max(desde, corte);
  return {
    ...(a > desde ? { continuo: [desde, a] as [number, number] } : {}),
    ...(hasta > b ? { discontinuo: [b, hasta] as [number, number] } : {}),
  };
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

// ─── La escalada de urgencia ─────────────────────────────────────────────────
// El mismo pedido se pinta en dos sitios —la fila de Pendientes y el detalle—
// y hasta ahora cada uno tenía su propio código de color: la fila usaba esta
// escalada de cuatro tramos y el detalle, dos dorados de marca y un rojo. Eran
// dos líneas que decían cosas distintas del mismo pedido, y el dorado 400
// contra el 500 no se distinguía ni de cerca. De aquí sale ahora el color de
// las dos.
//
// OJO con el significado: la fecha límite de OT es la PLANIFICADA, no la
// solicitada. Es el día en que el pedido debería estar planteado, así que
// pasarla ya es ir tarde aunque a Producción le sobren tres semanas. Por eso la
// escalada arranca ahí y no al final.

/** Color de cada tramo. Variables de tema y no hex: los mismos tonos no valen
 *  en claro y en oscuro (ver el bloque `--tramo-*` en globals.css). Van en un
 *  `style`, no en clases de Tailwind, porque el valor se elige en tiempo de
 *  ejecución. */
export const TRAMO = {
  /** Hasta la planificación, el día incluido: OT llega a tiempo. */
  holgado: "var(--tramo-holgado)",
  /** Pasada la planificación: OT ya va tarde, pero Producción aún llega. */
  trabajo: "var(--tramo-trabajo)",
  /** Pasada la fabricación: el retraso se come el margen de Producción. */
  ajustado: "var(--tramo-ajustado)",
  /** Pasada la solicitada. Fuera de la escalada a propósito: no es "más rojo",
   *  es otra cosa — la fecha ya se incumplió. */
  fuera: "var(--tramo-fuera)",
} as const;

export interface Tramo {
  desde: number;
  hasta: number;
  color: string;
}

/** Los tramos de la línea, ya recortados a [0, 100].
 *
 *  Se calcula aquí y no en el pintado porque RPS da las fechas desordenadas (la
 *  fabricación puede caer después de la solicitada) y un tramo al revés
 *  dibujaría un trozo de ancho negativo. */
export function tramosRecorrido(
  pctPlanificacion: number,
  pctFabricacion: number | undefined,
): Tramo[] {
  const corte = (n: number) => Math.max(0, Math.min(100, n));
  const p = corte(pctPlanificacion);
  // Sin fecha de fabricación, el tramo de trabajo llega hasta el FINAL, no se
  // queda en cero. Antes valía `p`, así que el naranja desaparecía y bastaba
  // pasarse un día de la planificada para pintar la línea entera de rojo: un
  // pedido con un día de retraso se veía igual de grave que uno vencido, y con
  // la regla que descarta fabricaciones imposibles eso le pasaba a media lista.
  const f = pctFabricacion === undefined ? 100 : Math.max(p, corte(pctFabricacion));
  return [
    { desde: 0, hasta: p, color: TRAMO.holgado },
    { desde: p, hasta: f, color: TRAMO.trabajo },
    { desde: f, hasta: 100, color: TRAMO.ajustado },
  ].filter((t) => t.hasta > t.desde);
}

export interface Urgencia {
  /** Los tramos a pintar. Vacío = el pedido no tiene fecha de planteo y no se
   *  colorea nada (ver `sinPlanificar`). */
  tramos: Tramo[];
  /** El tramo en el que cae hoy, que es el ÚNICO que se pinta a color. */
  actual: Tramo | null;
  /** Color de la fecha de referencia y del tramo actual. `undefined` = no se
   *  colorea: sin fecha de planteo no hay retraso que afirmar. */
  color: string | undefined;
  /** El pedido no trae fecha de planificación de RPS: la que se enseña es la
   *  entrega, prestada, y contra ella no se mide retraso. */
  sinPlanificar: boolean;
  /** Días pasados de la planificada; negativo si aún queda margen. */
  diasTarde: number;
  /** Hoy ES el día planificado. Cuenta como en plazo: quien lo tiene para hoy
   *  va a tiempo hasta que acabe la jornada. */
  esHoyLaPlanificada: boolean;
  /** Aún se llega (incluido el mismo día de la planificada). */
  enPlazo: boolean;
  /** La entrega al cliente ya se incumplió. */
  vencido: boolean;
  /** Color del tramo actual y de la raya de hoy.
   *
   *  Manda el plazo de OT (Iván, 26/11/2026): con la entrega vencida pero la
   *  planificada aún por llegar, la línea sigue en verde. Antes la barra se
   *  pintaba morada mientras la planificada y el punto de hoy iban en verde
   *  —"vas a tiempo" y "está incumplido" en la misma fila—. El morado solo
   *  tiñe la línea cuando OT también va tarde; la entrega pasada se ve en la
   *  propia solicitada (ver `colorSolicitada`). */
  colorTramo: string | undefined;
  /** Color de la solicitada: morado si ya pasó, `undefined` (el del texto) si
   *  no. Sin fecha de planteo no se colorea: la entrega en esos partes viene
   *  mal más veces que bien y no se afirma nada contra ella. */
  colorSolicitada: string | undefined;
}

/** En qué punto de la escalada está el pedido HOY.
 *
 *  Solo se pinta a color el tramo en el que cae hoy; el resto queda en gris.
 *  Pintarlos todos teñía de rojo el último trozo de cada fila, y ese tramo es
 *  normal: todos los pedidos pasan por él llegando a tiempo. Así el color
 *  aparece únicamente cuando dice algo de ESTE pedido, ahora. */
export function urgenciaRecorrido(
  l: Pick<LineaTiempo, "hitos" | "hoyPct" | "diasParaEntrega">,
  pedido: { fechaPlanificacion: string; planificacionEstimada?: boolean },
  hoy: string,
): Urgencia {
  // Sin fecha de planteo NO se colorea nada. La escalada mide contra el día en
  // que esto debería estar planteado, y aquí ese día no se sabe: lo que hay es
  // la entrega, que en estos partes viene mal más veces que bien (7 de 25 la
  // traen ya pasada el día que entran). AR.26.03947 entró el 07/08 con la
  // entrega el 13/08 y salía en rojo: la línea afirmaba un retraso que nadie
  // había medido. Gris y un rótulo que lo explica dice la verdad.
  const sinPlanificar = pedido.planificacionEstimada === true;
  const pctPlan = l.hitos.find((h) => h.clave === "planificacion")?.pct;
  const tramos =
    pctPlan === undefined
      ? []
      : tramosRecorrido(pctPlan, l.hitos.find((h) => h.clave === "fabricacion")?.pct);

  // El retraso que le importa a OT se cuenta desde la PLANIFICADA: ese es el
  // día en que el pedido debería estar planteado. La solicitada es la del
  // cliente y llega mucho después; medir contra ella diría "vas bien" con el
  // planteo dos semanas pasado de fecha.
  const diasTarde = diasEntre(pedido.fechaPlanificacion, hoy);
  const esHoyLaPlanificada = diasTarde === 0;
  const enPlazo = diasTarde <= 0;
  const vencido = l.diasParaEntrega < 0;

  // El día planificado, `hoyPct` cae JUSTO en el corte entre el tramo holgado y
  // el de trabajo, y `hoyPct >= t.desde` se lo lleva el de trabajo: la línea se
  // ponía naranja a primera hora del día en que tocaba, avisando de un retraso
  // que todavía no existía. Ese día manda el verde, que es lo que dice la
  // verdad — aún se llega.
  const actual = esHoyLaPlanificada
    ? (tramos[0] ?? null)
    : (tramos.find((t) => l.hoyPct >= t.desde && l.hoyPct < t.hasta) ??
      // Hoy pegado al extremo derecho (o pasado): el último tramo es el suyo.
      (l.hoyPct >= 100 ? (tramos[tramos.length - 1] ?? null) : null));

  return {
    tramos,
    actual,
    color: sinPlanificar
      ? undefined
      : enPlazo
        ? TRAMO.holgado
        : vencido
          ? TRAMO.fuera
          : (actual?.color ?? TRAMO.trabajo),
    sinPlanificar,
    diasTarde,
    esHoyLaPlanificada,
    enPlazo,
    vencido,
    colorTramo: actual ? (vencido && !enPlazo ? TRAMO.fuera : actual.color) : undefined,
    colorSolicitada: vencido && !sinPlanificar ? TRAMO.fuera : undefined,
  };
}
