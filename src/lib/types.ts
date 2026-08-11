// ─── Modelo de dominio CoordinaOT ───────────────────────────────────────────
// Lo que se escanea y llega de Producción a Oficina Técnica es un PEDIDO (AR...).
// Un pedido contiene una o varias OF (Órdenes de Fabricación). Los datos de las
// OF viven DENTRO del pedido: el pedido nunca se repite por su número de OFs.
//
// El trabajo es por OF y tiene DOS roles distintos:
//   · AUTOR   → quien "plantea" la OF (operario asignado en el tablero).
//   · REVISOR → un compañero (≠ autor) que repasa antes de mandar a Producción.
// Normalmente un mismo operario plantea todas las OF de un pedido, pero una OF
// puede acabar haciéndola otro: por eso autor y revisor viven a nivel de OF.
//
// Tiempos: planteo (autor) + revisión (revisor) SUMAN al total de la OF, pero se
// guardan por separado para saber quién plantea y quién revisa.
//
// Estas formas son el contrato que consume la UI. El mock (lib/mock.ts) las
// rellena hoy; mañana el adaptador SQL Server / RPS devolverá lo mismo.

/** Familias con identidad visual propia (color + icono en familia.ts). */
export type FamiliaConocida =
  // ── Subfamilias de RPS ─────────────────────────────────────────────────────
  // Son el nivel al que de verdad se distingue el trabajo, y por eso mandan
  // sobre la familia (ver familiaDeTexto en server/rps.ts). Estos códigos son
  // los de `GENProductSubFamily.CodProductSubFamily`, tal cual: la clave la
  // pone RPS y aquí solo se le da nombre y color.
  | "PUERTAS"
  | "REPARACIONES"
  | "TOLDO NUEVO"
  | "LONASNUEVAS"
  | "CONFECCION"
  | "ACCESORIOS TF"
  | "YURTAS"
  | "CLONA"
  | "CBASTIDOR"
  | "PORTALES"
  | "PISCINA"
  | "CAPOTA NUEVA"
  | "SERIE50"
  | "LONAS"
  // ── Familias de RPS, para los artículos SIN subfamilia ─────────────────────
  | "TOLDO"
  | "SUMINISTRO"
  | "REMOLQUE"
  | "LONA"
  | "CARPA"
  | "TAPIZADO"
  | "REPARACION"
  | "ESPECTACULO"
  | "FUNDA"
  | "PUERTA"
  // Separada de REMOLQUE: RPS ya las distingue en su catálogo (grupos CAMION y
  // CAPOTA) y no son el mismo trabajo; los juntábamos nosotros.
  | "CAMION"
  // ── Clientes que valen por una familia ─────────────────────────────────────
  // Entra trabajo suyo sin parar y siempre del mismo tipo, y en la oficina se
  // habla de ellos por su nombre. La lista está en CLIENTES_FAMILIA
  // (server/rps.ts) y mandan sobre todo lo demás.
  | "ASSAABLOY"
  | "CCI"
  | "LAYHER";

/** RPS trae familias fuera del catálogo (ESPECTACULO, CERRAMIENTOS…): se
 *  aceptan como texto y familiaMeta() les da un tinte neutro con su nombre. */
export type Familia = FamiliaConocida | (string & {});

// ─── El recorrido del material, tal como lo cuenta IT ───────────────────────
// Son tres manos y tres momentos, y en la oficina se llamaba "reservar" a la
// primera, que es la única que hace Oficina Técnica:
//
//  1. ASIGNAR (Oficina Técnica). Al plantear se le dice a la OF qué material
//     lleva. Queda en `CPRMOMaterial` y es lo que sale en `materiales`.
//  2. RESERVAR (Almacén). Miran lo asignado y apartan ese material del stock.
//     Queda en `STKStockReserve` y es el campo `reservada` de cada línea.
//  3. COMPRAR (Compras). Si no hay, lo piden, y entonces aparecen la fecha de
//     pedido, la de entrega estimada y la real cuando llega. Eso es `compras`.
//
// Los tres pasos NO van encadenados línea a línea, y por eso se enseñan como
// dos listas y no como una: de las 44 compras de las OF del tablero (11/08/2026)
// solo UNA corresponde a un material asignado. Lo que Compras pide para una OF
// suele ser otra cosa —tubo, herrajes, o trabajo de fuera como lacado o vinilo—
// y fingir una cadena por línea sería inventarse un dato que RPS no tiene.

/** Una línea de material de la OF: lo que lleva y lo que Almacén ha apartado. */
export interface MaterialAsignado {
  descripcion: string;
  /** Lo que la OF necesita (lo asignó Oficina Técnica al plantear). */
  cantidad: number;
  /** Lo que Almacén ha apartado del stock. 0 = asignado y aún sin reservar. */
  reservada: number;
}

/** En qué punto está una línea de material. */
export type EstadoMaterial = "sinReservar" | "reservado" | "aMedias";

/** Cuánto puede bailar la reserva respecto a lo asignado sin que cuente como
 *  "falta material".
 *
 *  Almacén reserva con lo que hay en el rollo, no con el decimal exacto del
 *  escandallo, así que la cifra no cuadra al milímetro. Medido sobre las 265
 *  líneas reservadas de los últimos 12 meses: 254 (95,8 %) cuadran exactas y
 *  las once restantes son de dos clases muy distintas.
 *
 *  · REDONDEO, y hay que dejarlo pasar: 3,9627 → 3,97, 7,3998 → 7,4,
 *    6,725484 → 6,72, 18,5 → 19, 3,25 → 4. Céntimos de metro, o el metro
 *    entero hacia arriba.
 *  · FALTA DE VERDAD, y hay que verlo: 31 → 6, 21 → 19, 6,6 → 5, 6 → 1.
 *
 *  El margen es el mayor entre 5 centésimas y el 1 % de lo asignado: cubre el
 *  primer grupo entero y no se traga ninguno del segundo (para 21 el margen es
 *  0,21 y faltan 2). */
export function margenReserva(cantidad: number): number {
  return Math.max(0.05, Math.abs(cantidad) * 0.01);
}

/** Si Almacén ya ha cubierto esta línea, se ha quedado corto, o ni la ha
 *  tocado. Reservar de MÁS es cubrir: sobra material, no falta. */
export function estadoMaterial(m: MaterialAsignado): EstadoMaterial {
  if (m.reservada <= 0) return "sinReservar";
  return m.reservada >= m.cantidad - margenReserva(m.cantidad) ? "reservado" : "aMedias";
}

/** Una línea de compra hecha PARA esta OF. */
export interface CompraOF {
  articulo: string;
  pedida: number;
  recibida: number;
  /** Cuándo se hizo el pedido al proveedor (ISO). */
  fechaPedido?: string;
  /** Entrega estimada (ISO). Cuando ya está recibida, es la fecha en que se
   *  esperaba: RPS no guarda la de llegada real por línea. */
  estimada?: string;
  proveedor?: string;
}

/** Prioridad del trabajo: 1 = poca, 2 = normal, 3 = urgente. Si es 3, la
 *  fecha de planificación se respeta al 100% (no se puede retrasar). */
export type Prioridad = 1 | 2 | 3;

/** Situación respecto a Producción.
 *  - procesado: ya escaneado, con OF asignada y pasado a Oficina Técnica
 *    (= "completamente grabado"). Es el trabajo real de OT.
 *  - pendiente: aún no procesado por Producción. No entra en el tablero de
 *    trabajo; solo se puede consultar/buscar en la Lista. */
export type Situacion = "procesado" | "pendiente" | "completado";

/** Ciclo de vida de una OF. */
export type EstadoOF =
  | "pendiente" // sin autor o sin empezar
  | "en_curso" // el autor la está planteando
  | "por_revisar" // planteo terminado, falta asignar/empezar revisor
  | "en_revision" // un revisor (≠ autor) la está repasando
  | "aprobada" // revisada OK → lista para Producción
  | "devuelta" // el revisor la devolvió con observaciones
  | "anulada"; // OF que no se hace en OT

export type Rol = "plantear" | "revisar";

export interface Operario {
  id: string;
  nombre: string;
  iniciales: string;
  color: string; // acento del encabezado de su zona
}

/** Orden de Fabricación: una unidad del pedido (p.ej. cada remolque). */
export interface OF {
  id: string;
  codigo: string; // p.ej. "OF-01"
  descripcion: string;
  familia: Familia;
  piezas: number;

  /** Autor = operario que plantea. null = sin asignar (bandeja). */
  autorId: string | null;
  /** Revisor (≠ autor). null mientras no se asigne. */
  revisorId: string | null;
  estado: EstadoOF;
  observacion?: string; // motivo si fue devuelta

  /** Si se está fichando ahora mismo, con qué rol. */
  fichandoRol: Rol | null;
  /** Detenida por Producción: se omite SIEMPRE del fichaje (dato de RPS). */
  detenida?: boolean;
  /** false = la situación en RPS no admite imputaciones (CREADA, FINALIZADA…):
   *  fichar aquí sería tiempo que NO sube a RPS. undefined = sin dato (mock). */
  fichable?: boolean;
  /** La tarea por la que esta OF entra en la vista de RPS es de TALLER, no de
   *  Oficina Técnica ("PLANTEAR EN TALLER"): capotas, faldones y demás. No es
   *  trabajo nuestro salvo que alguien la rescate asignándole autor.
   *  Ver docs/superpowers/specs/2026-08-07-of-ajenas-a-ot-design.md */
  ajenaOT?: boolean;
  /** Texto de rotulación del parte (dato de RPS, no siempre existe). */
  rotulacion?: string;
  /** Fecha ISO en la que llega el material de compras pedido y aún no
   *  recibido. Informativo: OT plantea por orden de planificación/llegada. */
  materialPendienteHasta?: string;
  /** Nº de reservas de material hechas en RPS para esta OF. Informativo
   *  (las hace OT al plantear, no es obligatorio): sirve para darse cuenta
   *  de si ya se hicieron. undefined = sin dato (mock). */
  reservasMaterial?: number;
  /** Material reservado (descripción + cantidad), para saber QUÉ se reservó. */
  reservasDetalle?: string[];
  /** El material que la OF LLEVA, esté reservado o no.
   *
   *  Son dos cosas distintas y hacían falta las dos: lo asignado es lo que la
   *  OF necesita para hacerse (viene del escandallo, lo pone Producción), y la
   *  reserva es haberlo apartado del almacén. Enseñando solo las reservas, una
   *  OF con material pero sin reservar parecía no llevar nada — que es justo
   *  lo que pasó con AR.26.03981, con 20 m de lona asignados y 0 reservas. */
  materiales?: MaterialAsignado[];
  /** Lo que Compras ha pedido para esta OF, con sus fechas. Ver el comentario
   *  de `CompraOF`: va aparte del material asignado porque en RPS no están
   *  encadenados. */
  compras?: CompraOF[];
  /** Avisos de producción: "tareas-nota" de la ruta de la OF en RPS
   *  (p.ej. "22/06 VISITA MEDIR"). Solo informativos. */
  avisos?: string[];
  /** Fecha ISO en la que Producción tiene planificado arrancar la primera
   *  fase posterior al planteo: el "para cuándo" real del trabajo de OT. */
  fechaLimitePlanteo?: string;
  /** Cuándo se imputó por primera vez tiempo a esta OF en RPS (ISO yyyy-mm-dd).
   *
   *  Es un DÍA, no un instante: RPS guarda la fecha de imputación sin hora (ver
   *  `CPRImputationMO.ImputationDate` en rps.ts). No pasarlo por un formateador
   *  de hora — saldría la medianoche, que es inventada.
   *
   *  Existe porque "Mi fichaje" deducía el "parado desde" del último tramo
   *  fichado EN LA WEB, así que una OF que se empezó en el terminal de RPS
   *  antes de que existiera CoordinaOT decía "Aún sin fichar", y era mentira:
   *  sí se fichó, solo que no aquí. Este campo es la fuente de verdad de RPS.
   *
   *  Cubre la misma tarea de OT cuyos minutos van en `tiempoPlanteoMin`, así
   *  que las dos cifras hablan del mismo trabajo. Ojo: puede llegar con
   *  `tiempoPlanteoMin` a 0, porque RPS admite imputaciones de cero minutos;
   *  no es contradicción, es que se tocó la OF y no se acumuló tiempo.
   *
   *  undefined = nunca se le imputó tiempo (o mock, que no lo rellena). */
  fichadaDesde?: string;
  /** Subfamilia del artículo en RPS ("PUERTAS", "TOLDO NUEVO", "REPARACIONES"…).
   *
   *  Es el nivel de detalle que le falta a `familia`, que en RPS es muy ancha:
   *  bajo "SUMINISTRO" conviven las puertas rápidas de Assa Abloy con material
   *  suelto. Algunas subfamilias ya deciden la familia (ver
   *  FAMILIA_POR_SUBFAMILIA en server/rps.ts); el resto se enseñan tal cual,
   *  porque afinan sin tener que inventarles un sitio en el catálogo propio.
   *
   *  undefined = el artículo no tiene subfamilia puesta en RPS, que es normal
   *  (39 de las 136 OF pendientes el 11/08/2026). */
  subfamilia?: string;
  tiempoEstimadoMin: number;
  tiempoPlanteoMin: number; // acumulado por el/los autores
  tiempoRevisionMin: number; // acumulado por el/los revisores
  /** Archivos del planteamiento subidos a RPS (solo OF aprobadas). */
  archivosRps?: string[];
}

/** Pedido = lo que se escanea (un parte). Code "AR…". Contiene sus OF. */
export interface Pedido {
  id: string;
  codigo: string; // p.ej. "AR.26.03376"
  cliente: string;
  situacion: Situacion;
  fechaSolicitud: string; // ISO yyyy-mm-dd
  /** Fecha ISO yyyy-mm-dd en la que se creó el pedido de venta en RPS
   *  (FACOrderSL.OrderDate). undefined = sin dato (mock, OF sin pedido). */
  fechaCreacion?: string;
  /** Fecha que Producción planifica antes de enviarlo a Oficina Técnica.
   *  Es la fecha por la que se ordena la lista de trabajo. En RPS:
   *  TGM_PENDIENTE_OT.FechaPlanificada. Lo que en la herramienta vieja se
   *  llama "planificación". */
  fechaPlanificacion: string; // ISO yyyy-mm-dd
  /** La planificación NO viene de RPS: es la fecha de entrega puesta ahí para
   *  que el pedido tenga por dónde ordenarse. Uno de cada cuatro llega así.
   *
   *  Quien la pinte tiene que decir que es prestada, y quien mida retrasos no
   *  debe contarla: un parte al que nadie ha puesto fecha de planteo no está
   *  atrasado, está sin planificar, que es otro problema y de otra persona. */
  planificacionEstimada?: boolean;
  /** Fin de fabricación planificado (CPRManufacturingOrder.PlannedEndDate, la
   *  más tardía de las OF del pedido). Lo que la herramienta vieja llama
   *  "fabricación". undefined = ninguna OF lo tiene puesto. */
  fechaFabricacion?: string;
  /** La fecha de ENTREGA que pide el cliente — "solicitada" en la herramienta
   *  vieja (FechaSolicitada de la vista = ReceptionDemandDate del pedido de
   *  venta). OJO: durante un tiempo esto se pintó como la fecha de entrada del
   *  pedido, y por eso la línea de tiempo salía al revés; la de entrada es
   *  `fechaCreacion`. */
  fechaEntrega: string; // ISO yyyy-mm-dd
  prioridad: Prioridad;
  ofs: OF[];

  /** URL de la 1ª página del PDF del pedido (foto). Cuando RPS la dé, la
   *  tarjeta muestra la imagen real en lugar de la réplica dibujada. */
  scanUrl?: string;

  /** Comentario del pedido de venta en RPS (condiciones, avisos del comercial). */
  comentarioVenta?: string;
  /** Ciudad de entrega del pedido de venta. */
  ciudadEntrega?: string;
  /** Negocio/local de entrega ("NOVA CAMELIAS"): distingue pedidos del mismo
   *  cliente-empresa (p.ej. los de MAHOU, que si no son casi iguales). */
  negocio?: string;
  /** Proyecto interno: OF sin pedido de venta (mantenimiento, desarrollos…).
   *  No es trabajo de pedidos: fuera del tablero de asignación; se ficha
   *  desde Mi fichaje y se consulta en la Lista. */
  interno?: boolean;

  // --- pistas visuales para simular el "parte escaneado" ---
  accent: "verde" | "rojo" | "azul" | "ninguno"; // círculo a mano del scan
  lineas: number; // nº de renglones de texto manuscrito simulado
  croquis: boolean; // lleva un dibujo/croquis
}

// ─── Helpers derivados (sin estado) ──────────────────────────────────────────

export type EstadoAsignacion = "sin" | "parcial" | "completo";

export function familiasDe(p: Pedido): Familia[] {
  return [...new Set(p.ofs.map((of) => of.familia))];
}

export function piezasTotal(p: Pedido): number {
  return p.ofs.reduce((n, of) => n + of.piezas, 0);
}

/** OFs cuyo AUTOR es `autorId` (null = bandeja sin asignar). */
export function ofsDe(p: Pedido, autorId: string | null): OF[] {
  return p.ofs.filter((of) => of.autorId === autorId);
}

export function estadoAsignacion(p: Pedido): EstadoAsignacion {
  const asignadas = p.ofs.filter((of) => of.autorId !== null).length;
  if (asignadas === 0) return "sin";
  if (asignadas === p.ofs.length) return "completo";
  return "parcial";
}

export function tiempoTotalOF(of: OF): number {
  return of.tiempoPlanteoMin + of.tiempoRevisionMin;
}

export function tiempoTotalPedido(p: Pedido): number {
  return p.ofs.reduce((n, of) => n + tiempoTotalOF(of), 0);
}

/** Today en ISO yyyy-mm-dd (zona local). */
export function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Finalizado = no le queda trabajo a OT: todas sus OF ACTIVAS están aprobadas
 *  (revisadas, listas para Producción). Las anuladas no cuentan, mismo criterio
 *  que `pedidoListoParaPasar` y `faseDeOF` en fases-tablero.ts: anular es
 *  "esto no lo hace OT" (normalmente lo acaba el taller), no trabajo pendiente,
 *  aunque la OF conserve el tiempo que se fichó antes de anularse.
 *
 *  Antes se exigía que TODAS estuvieran aprobadas y una anulada nunca va a
 *  estarlo, así que un pedido con una anulada y el resto aprobadas no se daba
 *  por finalizado jamás: `estaAtrasado` lo devolvía atrasado para siempre y
 *  salía en rojo y el primero de la lista de por vida, por trabajo ya hecho.
 *
 *  Pedido con TODAS las OF anuladas → finalizado: a OT no le queda nada que
 *  hacer ahí, que es justo lo que mide esta función. Que `pedidoListoParaPasar`
 *  diga lo contrario en ese mismo caso no es incoherencia: responde a otra
 *  pregunta —"¿hay algo que mandar a Producción?"— y sin ninguna OF activa no
 *  hay nada que mandar, así que su botón debe seguir apagado.
 *
 *  Sin OFs de ninguna clase sigue siendo false: un pedido vacío es uno que
 *  todavía no ha llegado, no uno terminado. */
export function estaFinalizado(p: Pedido): boolean {
  if (p.ofs.length === 0) return false;
  const activas = p.ofs.filter((o) => o.estado !== "anulada");
  return activas.every((o) => o.estado === "aprobada");
}

/** Atrasado = pasó la fecha de planificación y aún no está finalizado.
 *
 *  Sin fecha de planificación no se puede decir, así que no se dice: ahí
 *  `fechaPlanificacion` es la entrega puesta a falta de otra cosa (ver
 *  `planificacionEstimada`), y en esos partes viene mal más veces que bien —7
 *  de 25 la traen ya pasada el día que entran—. Medir contra ella declaraba
 *  atrasado un pedido recién llegado.
 *
 *  Va de la mano de la línea de tiempo, que a esos tampoco les pinta color:
 *  ninguna de las dos afirma un retraso que nadie ha medido. */
export function estaAtrasado(p: Pedido, hoy: string): boolean {
  if (p.planificacionEstimada) return false;
  return p.fechaPlanificacion < hoy && !estaFinalizado(p);
}

export function algunFichando(p: Pedido, autorId?: string | null): boolean {
  return p.ofs.some(
    (of) =>
      of.fichandoRol !== null &&
      (autorId === undefined || of.autorId === autorId),
  );
}
