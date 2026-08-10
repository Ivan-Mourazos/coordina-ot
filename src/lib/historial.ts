// ─── Historial permanente: tipos + lógica pura (client-safe) ─────────────────
// Sin acceso a BD: solo los tipos que comparten API y UI, el constructor de
// cláusulas de filtro (parametrizadas, NUNCA interpoladas) y el mapeo de fila.

export const PAGE_SIZE = 40;

/** Códigos de pedido de cualquier serie (AR/BE/SA…): 2 letras . 2 díg . 5 díg. */
export const CODIGO_PEDIDO_RE = /^[A-Z]{2}\.\d{2}\.\d{5}$/;

export interface HistorialFiltros {
  page: number;
  q?: string; // busca en código de pedido o nombre de cliente
  desde?: string; // ISO yyyy-mm-dd (inclusive)
  hasta?: string; // ISO yyyy-mm-dd (exclusivo)
  familia?: string;
  cliente?: string;
}

/** Palabras clave por familia visual (réplica de familiaDeTexto de rps.ts): el
 *  filtro por familia busca estas en la descripción de las MO del pedido. Sus
 *  claves son el catálogo de 7 familias que pintan los chips. */
export const FAMILIA_KEYWORDS: Record<string, string[]> = {
  TOLDO: ["TOLDO"],
  LONA: ["LONA", "ROLLO"],
  CARPA: ["CARPA"],
  REMOLQUE: ["REMOLQUE"],
  TAPIZADO: ["TAPIZ"],
  REPARACION: ["REPARAC"],
  SUMINISTRO: ["SUMINISTRO"],
};

export interface HistorialItem {
  pedido: string;
  cliente: string | null;
  finalizada: string; // ISO
  nOf: number;

  /** Cuándo se pulsó "pasar a Producción" en CoordinaOT (ISO). Más fiel que
   *  `finalizada`, que es cuando OLANET registró el cambio de estado y puede
   *  ir por detrás. Ausente en los pedidos que no se pasaron desde aquí. */
  pasadoAt?: string;
  /** Nombre de quien lo pasó. Puede faltar aunque haya `pasadoAt`: los
   *  pedidos pasados antes de que se guardara el autor no lo tienen. */
  pasadoPor?: string;

  /** Quién lo planteó. En los pedidos hechos ya con la web es un dato
   *  registrado; en los anteriores se deduce del reparto de minutos de RPS
   *  (quien más tiempo le echó es quien lo planteó — ver `deducirRoles`), y si
   *  dos personas van parejas se ponen las dos. Vacío o ausente solo cuando no
   *  hay ni un minuto imputado a nadie. */
  autores?: string[];

  /** Familias visuales del pedido, para los chips de la lista. Se sacan de la
   *  descripción de sus OF de OT con `familiaDeTexto`, el MISMO criterio y el
   *  mismo conjunto de OFs que usa `HistorialPedidoDetalle.familias`: si no,
   *  un pedido saldría como TOLDO por fuera y como LONA al abrirlo. */
  familias?: string[];

  /** Local o negocio de entrega (`Mahou · Casa Perucho`). Sale de la dirección
   *  de entrega del pedido de venta, igual que en el detalle y en el tablero.
   *  Falta en la mayoría: en RPS solo 1 de cada 4 pedidos lo lleva relleno
   *  (1023 de 3962 en la serie AR.26), así que ausente es lo normal, no un
   *  fallo. */
  negocio?: string | null;
}

export interface HistorialOF {
  codigo: string;
  descripcion: string;
  tiempoImputadoMin: number;
  quien: string[]; // nombres (operario mapeado o código de empleado)

  /** Desglose planteo/revisión. Solo existe para lo fichado en CoordinaOT: RPS
   *  no tiene tarea de revisión, así que de sus imputaciones no se puede
   *  deducir el rol. Ausente = no se sabe (OF anterior al fichaje en
   *  CoordinaOT), que no es lo mismo que cero. */
  rol?: {
    planteoMin: number;
    revisionMin: number;
    quienPlanteo: string[]; // nombres
    quienReviso: string[];
  };

  /** Material que lleva la OF, cada línea marcada con si sigue apartado en el
   *  almacén o solo está apuntado (ver `MaterialOF`). Ausente = esa OF no lleva
   *  material ninguno. */
  materiales?: MaterialOF[];

  /** Notas que Producción escribe en la OF ("BELEN AB - FINALIZO OP. 10").
   *  Poco frecuentes (36 de 579 OF de OT), pero cuando están dicen algo. */
  notasProduccion?: string;

  /** Roles DEDUCIDOS del reparto de minutos de RPS, para las OF anteriores al
   *  fichaje en CoordinaOT: quien más tiempo lleva planteó y quien lleva poco
   *  revisó (ver `deducirRoles`). Va en un campo aparte de `rol` a propósito —
   *  es una suposición, no un dato registrado, y quien lo pinte debe poder
   *  decirlo. Nunca aparecen los dos a la vez. */
  rolDeducido?: {
    quienPlanteo: string[];
    quienReviso: string[];
  };
}

// ─── Material de la OF: lo apartado y lo apuntado ────────────────────────────

/** Una línea de material de la OF, marcada con de dónde sale su cantidad.
 *
 *  Son dos cosas DISTINTAS y por eso viajan separadas:
 *   · apartado — queda reserva viva en `STKStockReserve`: esta cantidad está
 *     separada en el almacén para este trabajo, ahora mismo.
 *   · apuntado — solo lo que Oficina Técnica escribió en la OF
 *     (`CPRMOMaterial`): lo que hacía falta, se haya apartado o no.
 *
 *  Quien lo pinte tiene que poder decir cuál de las dos está enseñando: "está
 *  apartado" y "hacía falta" no significan lo mismo. */
export interface MaterialOF {
  /** "LONA ACRÍLICA MASACRIL 300 :SEDA 2596 :120 AN · 12.8" — mismo formato que
   *  las reservas del tablero, para que las dos pantallas se lean igual. */
  texto: string;
  /** Sigue habiendo reserva viva sobre este material. */
  apartado: boolean;
}

/** Una línea de material tal y como sale de RPS, antes de darle formato. */
export interface MaterialCrudo {
  /** `CPRMOMaterial.Description`. Puede venir vacía: existe de verdad (la OF
   *  0230370 lleva un material con cantidad 2,6 y descripción en blanco). */
  material: string | null;
  /** `CPRMOMaterial.Quantity`: lo apuntado en la OF. */
  cantidad: number | null;
  /** Suma de las reservas VIVAS sobre ese material, o null si no queda ninguna.
   *  null y 0 no son lo mismo: 0 sería una reserva de cero unidades. */
  reservado: number | null;
}

/** Cuánto se pueden separar la cantidad reservada y la apuntada antes de darlas
 *  por distintas. Las dos son `decimal(28,10)` en RPS y llegan como float, así
 *  que compararlas con `===` es pedir problemas; y la propia RPS redondea al
 *  reservar (material 6,725484 → reserva 6,72). */
const MISMA_CANTIDAD = 0.01;

/** Una línea de material con su cantidad, dando preferencia a la reserva.
 *
 *  Manda lo apartado cuando lo hay: es el dato duro —esto está separado en el
 *  almacén— frente a lo apuntado, que es la intención. Cuando ya no queda
 *  reserva (lo normal en un pedido viejo), se enseña lo apuntado.
 *
 *  Las dos cantidades casi siempre coinciden: medido en vivo (08/2026) sobre
 *  los 236 materiales con reserva viva de toda la BD, 230 coinciden, 5 tienen
 *  reservado de menos y 1 de más. Cuando NO coinciden se enseñan las dos
 *  ("· 1 de 6"), porque ahí está la información: se apartó menos de lo que
 *  hacía falta. */
export function aMaterialOF(fila: MaterialCrudo): MaterialOF {
  const nombre =
    (fila.material ?? "").trim().replace(/\s+/g, " ") || "(material sin nombre)";

  // Sin reserva viva: lo apuntado, tal cual. La cantidad puede faltar y entonces
  // se enseña el material a secas, sin dejar el " · " colgando.
  if (fila.reservado == null) {
    return {
      texto: `${nombre}${fila.cantidad != null ? ` · ${fila.cantidad}` : ""}`,
      apartado: false,
    };
  }

  const distinta =
    fila.cantidad != null && Math.abs(fila.reservado - fila.cantidad) >= MISMA_CANTIDAD;
  return {
    texto: `${nombre} · ${fila.reservado}${distinta ? ` de ${fila.cantidad}` : ""}`,
    apartado: true,
  };
}

/** Parte los materiales de una OF en los dos grupos que hay que distinguir.
 *
 *  El reparto es POR LÍNEA, no por OF, y no es un capricho: la reserva cuelga
 *  del material apuntado, así que lo apartado es siempre un SUBCONJUNTO de lo
 *  apuntado. Preferir la reserva "para toda la OF" solo podría esconder
 *  material, y esconde mucho — medido en vivo (08/2026) sobre las 150 OF que
 *  hoy conservan alguna reserva, lo normal es que la reserva cubra 1 de sus 5
 *  materiales (la OF 0229033 tiene 9 materiales y 1 reservado). Se enseñan
 *  todos, cada uno diciendo lo que es. */
export function repartirMateriales(materiales: MaterialOF[] | undefined): {
  apartados: MaterialOF[];
  apuntados: MaterialOF[];
} {
  const todos = materiales ?? [];
  return {
    apartados: todos.filter((m) => m.apartado),
    apuntados: todos.filter((m) => !m.apartado),
  };
}

/** Fila cruda de la query de página (antes de mapear). */
export interface FilaPagina {
  pedido: string;
  finalizada: Date | string | null;
  cliente: string | null;
  n_of: number;
  negocio?: string | null;
}

/** Cláusulas AND parametrizadas para el WHERE de la página. Los valores van
 *  como params mssql (request.input), nunca interpolados. */
export function construirFiltros(f: HistorialFiltros): {
  clausulas: string[];
  params: Array<{ nombre: string; valor: string }>;
} {
  const clausulas: string[] = [];
  const params: Array<{ nombre: string; valor: string }> = [];

  const q = f.q?.trim();
  if (q) {
    clausulas.push("(p.pedido LIKE @q OR cli.Description LIKE @q)");
    params.push({ nombre: "q", valor: `%${q}%` });
  }
  if (f.desde?.trim()) {
    clausulas.push("p.finalizada >= @desde");
    params.push({ nombre: "desde", valor: f.desde.trim() });
  }
  if (f.hasta?.trim()) {
    clausulas.push("p.finalizada < @hasta");
    params.push({ nombre: "hasta", valor: f.hasta.trim() });
  }

  const familia = f.familia?.trim();
  if (familia && FAMILIA_KEYWORDS[familia]) {
    const kws = FAMILIA_KEYWORDS[familia];
    const likes = kws.map((_, i) => `mo2.Description LIKE @fam${i}`).join(" OR ");
    clausulas.push(
      `EXISTS (SELECT 1 FROM dbo.FACOrderSL o2 ` +
        `JOIN dbo.FACOrderLineSL l2 ON l2.IDOrder = o2.IDOrder ` +
        `JOIN dbo.CPRManufacturingOrder mo2 ON mo2.IDManufacturingOrder = l2.IDManufacturingOrder AND mo2.CodCompany = '001' ` +
        `WHERE o2.CodOrder = p.pedido AND o2.CodCompany = '001' AND (${likes}))`,
    );
    kws.forEach((kw, i) => params.push({ nombre: `fam${i}`, valor: `%${kw}%` }));
  }

  const cliente = f.cliente?.trim();
  if (cliente) {
    clausulas.push("cli.Description = @cliente");
    params.push({ nombre: "cliente", valor: cliente });
  }

  return { clausulas, params };
}

/** Cuánto del tiempo total tiene que llevar alguien para contar como autor.
 *  Por debajo de esto se le da por revisor: una revisión es un repaso, no
 *  rehacer el trabajo.
 *
 *  Es TAMBIÉN el umbral de empate del "si dudas, pon los dos": con 100 y 40
 *  minutos el segundo se lleva el 28,5 % del total y entra como autor; con 100
 *  y 20 se lleva el 16,6 % y se queda en revisor. El mismo número decide en la
 *  lista y en el detalle a propósito — que el Historial diga "Alberto y Tamara"
 *  por fuera y solo "Alberto" al abrir el pedido sería un fallo evidente. */
export const PARTE_AUTOR = 0.25;

/** Reparto deducido de un minutaje: quién planteó y quién revisó. */
export interface RepartoDeducido {
  autores: string[];
  revisores: string[];
}

/** Ordena a la gente por minutos y decide quiénes son autores y quiénes
 *  revisores. Es el criterio ÚNICO de deducción del Historial: lo usan tanto
 *  `deducirRoles` (por OF, para el detalle) como la lista (por pedido). Si se
 *  toca aquí, cambian los dos a la vez, que es justo lo que se quiere.
 *
 *  Devuelve null cuando no hay nada que interpretar: sin gente, o con gente
 *  pero sin un solo minuto entre todos. Null significa "no se sabe", que no es
 *  lo mismo que "no lo planteó nadie". */
export function repartirPorTiempo(
  minutosPorPersona: Map<string, number> | undefined,
): RepartoDeducido | null {
  if (!minutosPorPersona || minutosPorPersona.size === 0) return null;

  const gente = [...minutosPorPersona.entries()].sort((a, b) => b[1] - a[1]);
  // Una sola persona: lo planteó ella, no hay revisor que deducir. Se resuelve
  // antes de mirar el total porque aquí el reparto da igual: aunque tenga 0
  // minutos imputados, es la única que tocó la OF.
  if (gente.length === 1) return { autores: [gente[0][0]], revisores: [] };

  const total = gente.reduce((n, [, min]) => n + min, 0);
  // Varias personas y ni un minuto entre todas: no hay reparto que interpretar.
  if (total <= 0) return null;

  // El primero es autor siempre (aunque el reparto sea parejo: alguien lo
  // planteó). Del resto, autor quien pase del umbral y revisor quien no.
  const autores = [gente[0][0]];
  const revisores: string[] = [];
  for (const [nombre, min] of gente.slice(1)) {
    if (min / total >= PARTE_AUTOR) autores.push(nombre);
    else revisores.push(nombre);
  }
  return { autores, revisores };
}

export function filaAItem(fila: FilaPagina): HistorialItem {
  const finalizada =
    fila.finalizada instanceof Date
      ? fila.finalizada.toISOString()
      : (fila.finalizada ?? "");
  // Negocio vacío se omite en vez de viajar como "": la lista lo pinta como
  // "cliente · negocio" y un negocio en blanco dejaría el separador colgando.
  const negocio = (fila.negocio ?? "").trim();
  return {
    pedido: (fila.pedido ?? "").trim(),
    cliente: fila.cliente,
    finalizada,
    nOf: fila.n_of ?? 0,
    ...(negocio ? { negocio } : {}),
  };
}

/** Un fichero de RPS colgado del pedido o de una de sus OF.
 *
 *  RPS no guarda el fichero en la BD: guarda un enlace (`GENEntityDocument`)
 *  con la ruta al share (`file://\\192.168.0.128\RPS\VENTAS\…`). Aquí no viaja
 *  la ruta, solo una URL nuestra que la resuelve en el servidor — ver la ruta
 *  `/api/historial/[pedido]/documento/[indice]`. */
export interface DocumentoRps {
  /** Cómo lo describe RPS ("Planteamiento del pedido AR.26.02932, version 1"). */
  descripcion: string;
  /** Nombre del fichero, para cuando la descripción no distingue versiones. */
  archivo: string;
  /** De qué es, deducido de la carpeta (ver `claseDeDocumento`). */
  clase: string;
  /** URL para abrirlo, o null si no hay nada que abrir.
   *
   *  Null cuando lo que RPS tiene apuntado no es un fichero del archivo: los
   *  `gdoc://{uuid}`, que viven dentro del gestor documental de RPS y no se
   *  pueden servir, y los enlaces a discos ajenos (ver `segmentosEnShare`). No
   *  se tiran de la lista porque su descripción sigue diciendo qué había ahí;
   *  simplemente no son un enlace. Son 344 de los 18 975 documentos de la serie
   *  AR.26, un 1,8 %.
   *
   *  Con URL, la descarga aún puede dar 404: el enlace de RPS se guarda para
   *  siempre y el fichero puede haberse movido del share. */
  url: string | null;
}

/** Carpeta del share de RPS → qué es el documento. RPS no tiene un campo con
 *  el tipo: lo que hay es la carpeta donde lo dejó, y resulta ser fiable.
 *  Verificado sobre los 15 556 documentos de los pedidos AR.26. El orden
 *  importa: las subcarpetas van antes que su padre. */
const CLASE_POR_CARPETA: Array<[RegExp, string]> = [
  [/\\PLANTEAMIENTOS\\/i, "Planteamiento"],
  [/\\PRESUPUESTOS\\.*\\DIGITALIZADOS\\/i, "Presupuesto escaneado"],
  [/\\PRESUPUESTOS\\.*\\DISE/i, "Diseño"],
  [/\\PRESUPUESTOS\\/i, "Presupuesto"],
  [/\\PEDIDOS\\.*\\REMATES\\/i, "Remates"],
  [/\\PEDIDOS\\/i, "Pedido escaneado"],
  [/\\ROTULACIONES\\/i, "Rotulación"],
  [/\\FOTOS TRABAJOS\\/i, "Foto del trabajo"],
  [/\\ETIQUETAS_BOLSAS\\/i, "Etiquetas"],
  [/\\HOJAS_ALMACEN\\/i, "Hoja de almacén"],
  [/\\OF\\OF\\/i, "Adjunto de la OF"],
  [/\\SAT\\/i, "Mantenimiento (SAT)"],
];

export function claseDeDocumento(ruta: string): string {
  for (const [re, clase] of CLASE_POR_CARPETA) if (re.test(ruta)) return clase;
  return "Documento";
}

/** Nombre de fichero de una ruta de RPS (siempre con separador de Windows). */
export function archivoDeRuta(ruta: string): string {
  const limpia = ruta.replace(/\/+$/, "");
  const i = Math.max(limpia.lastIndexOf("\\"), limpia.lastIndexOf("/"));
  return i >= 0 ? limpia.slice(i + 1) : limpia;
}

/** Cómo empieza una ruta que SÍ está dentro del share de documentos de RPS.
 *  `GENEntityDocument.Path` guarda una URL `file://` seguida de la ruta UNC. */
const PREFIJO_SHARE_RPS = "file://\\\\192.168.0.128\\RPS\\";

/** Trocea la ruta de RPS en los segmentos que cuelgan del share, o null si esa
 *  ruta no se puede servir.
 *
 *  Esta función es la ÚNICA defensa entre lo que RPS tiene apuntado y lo que la
 *  web abre del disco, y hace falta porque el campo `Path` es texto libre que
 *  lleva 20 años recogiendo de todo. Medido sobre los 607 190 enlaces de pedido
 *  y de OF de la BD (08/2026):
 *    · 451 910 cuelgan del share de RPS — los únicos que se sirven.
 *    ·   1 941 son `gdoc://{uuid}`: viven dentro del gestor documental de RPS,
 *              no son ficheros y no hay nada que abrir.
 *    · 153 339 son `file://` a OTRO sitio: otros servidores
 *              (`\\192.168.0.114\…`, `\\Megabeast\…`) y, lo peligroso, rutas
 *              LOCALES tipo `file://C:\Users\{quien fuera}\Desktop\…`. Esas
 *              resolverían contra el disco DEL SERVIDOR WEB, así que servirlas
 *              sería dejar leer ficheros nuestros a quien abra un pedido.
 *  Todo lo que no empiece por el share se rechaza, y punto.
 *
 *  Devuelve segmentos sueltos y no una cadena a propósito: en Linux la barra
 *  invertida es un carácter válido en un nombre de fichero, así que un
 *  `path.join(raíz, "OF\\OF\\x.pdf")` NO baja dos carpetas, crea un fichero con
 *  barras en el nombre. Con segmentos, quien llame hace `path.join(raíz, ...s)`
 *  y sale bien en las dos plataformas. Cada segmento se valida además contra
 *  `.`/`..` y separadores, que es lo que convierte el path traversal en
 *  imposible en vez de en improbable. */
export function segmentosEnShare(ruta: string): string[] | null {
  const limpia = (ruta ?? "").trim();
  if (!limpia.toLowerCase().startsWith(PREFIJO_SHARE_RPS.toLowerCase())) return null;

  const segmentos = limpia
    .slice(PREFIJO_SHARE_RPS.length)
    .split(/[\\/]+/)
    .filter(Boolean);
  if (segmentos.length === 0) return null;
  // Ni "..", ni ".", ni un segmento que se cuele con separador o dos puntos de
  // unidad ("C:"). Con esto, `path.join` no puede salir de la raíz.
  for (const s of segmentos) {
    if (s === "." || s === ".." || /[\\/:]/.test(s)) return null;
  }
  return segmentos;
}

/** Extensión → Content-Type, y si se puede enseñar en el navegador.
 *
 *  Solo entran los formatos que el navegador pinta sin descargar nada. Los 4376
 *  `.msg` de Outlook, los `.doc`, los `.dwg`… no están porque no hay nada que
 *  enseñar, y sobre todo NO están los 32 `.htm`/`.html`: servir HTML ajeno
 *  desde nuestro propio origen es un XSS almacenado de manual. Todo lo que no
 *  esté en esta tabla se manda como descarga opaca. */
const TIPO_POR_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  tif: "image/tiff",
  tiff: "image/tiff",
};

/** Cómo servir un fichero del share: tipo MIME y si va incrustado o de bajada.
 *
 *  Reparto real de los enlaces de pedido/OF (08/2026): 476 553 `.pdf` y 122 339
 *  imágenes se ven en el navegador; el resto (`.msg`, `.doc`, `.xls`, `.dwg`,
 *  `.cdr`…) suma menos del 1,2 % y se baja. */
export function comoServir(archivo: string): { tipo: string; incrustable: boolean } {
  const ext = (archivo.split(".").pop() ?? "").toLowerCase();
  const tipo = TIPO_POR_EXTENSION[ext];
  return tipo
    ? { tipo, incrustable: true }
    : { tipo: "application/octet-stream", incrustable: false };
}

export interface HistorialPedidoDetalle {
  codigo: string;
  cliente: string | null;
  negocio: string | null;
  ciudadEntrega: string | null;
  prioridad: 1 | 2 | 3;
  fechaSolicitud: string | null; // ISO yyyy-mm-dd
  fechaFinalizacion: string | null; // ISO
  piezas: number;
  familias: string[];
  comentarioVenta: string | null;
  scanUrl: string; // /api/pedidos/{codigo}.pdf (puede dar 404)
  ofs: HistorialOF[];

  /** Todo lo que RPS tiene colgado del pedido y de sus OF: planteamiento,
   *  presupuesto, fotos, rotulación… Casi todos los pedidos llevan algo (3960
   *  de 3962 en la serie AR.26, unos 4 documentos por pedido). */
  documentos: DocumentoRps[];

  /** Lo que se vendió, línea a línea (`FACOrderLineSL.Comment`). Es el texto
   *  que describe el trabajo de verdad —medidas, modelo, color— y está casi
   *  siempre relleno (7578 de 7585 líneas de 2026), al revés que el comentario
   *  de cabecera. */
  comentariosLinea: string[];

  /** Instrucciones de montaje/envío del pedido ("FECHA SOLICITADA 07/09,
   *  PERSONAL 2, TIEMPO 1 HORA"). La mitad de los pedidos lo llevan. */
  comentarioEnvio: string | null;
}

/** Fila cruda de la cabecera del pedido (antes de mapear). */
export interface FilaCabecera {
  pedido: string;
  cliente: string | null;
  negocio: string | null;
  ciudad: string | null;
  comentario: string | null;
  solicitada: Date | string | null;
  prioridad: number | null;
  piezas: number | null;
}

/** Fecha de venta a yyyy-mm-dd; centinela RPS (<2000) o inválida → null. */
function fechaSolicitudISO(v: Date | string | null): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Lo que RPS sabe del pedido además de la cabecera y las OF. Opcional para
 *  que el mock y los tests puedan armar un detalle sin tener que inventárselo. */
export interface ExtrasDetalle {
  documentos?: DocumentoRps[];
  comentariosLinea?: string[];
  comentarioEnvio?: string | null;
}

export function cabeceraADetalle(
  fila: FilaCabecera,
  ofs: HistorialOF[],
  finalizada: string | null,
  familias: string[],
  extras: ExtrasDetalle = {},
): HistorialPedidoDetalle {
  const codigo = (fila.pedido ?? "").trim();
  const prioridad = fila.prioridad === 1 || fila.prioridad === 2 || fila.prioridad === 3 ? fila.prioridad : 1;
  return {
    codigo,
    cliente: fila.cliente,
    negocio: fila.negocio,
    ciudadEntrega: fila.ciudad,
    prioridad,
    fechaSolicitud: fechaSolicitudISO(fila.solicitada),
    fechaFinalizacion: finalizada,
    piezas: fila.piezas ?? 0,
    familias,
    comentarioVenta: fila.comentario,
    scanUrl: `/api/pedidos/${codigo}.pdf`,
    ofs,
    documentos: extras.documentos ?? [],
    comentariosLinea: extras.comentariosLinea ?? [],
    comentarioEnvio: extras.comentarioEnvio ?? null,
  };
}
