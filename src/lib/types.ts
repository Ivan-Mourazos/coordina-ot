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
  | "TOLDO"
  | "SUMINISTRO"
  | "REMOLQUE"
  | "LONA"
  | "CARPA"
  | "TAPIZADO"
  | "REPARACION"
  | "ESPECTACULO"
  | "FUNDA"
  | "PUERTA";

/** RPS trae familias fuera del catálogo (ESPECTACULO, CERRAMIENTOS…): se
 *  aceptan como texto y familiaMeta() les da un tinte neutro con su nombre. */
export type Familia = FamiliaConocida | (string & {});

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
 *  Con la planificación PRESTADA no se puede decir: ahí la fecha es la de
 *  entrega puesta a falta de otra cosa (ver `planificacionEstimada`), y medir
 *  contra ella daba dos respuestas malas seguidas — "vas sobrado" hasta el día
 *  de la entrega y "atrasado" a partir de ese día—, ninguna de las dos sobre el
 *  planteo, que es lo que esto pretende medir. Sin fecha de planteo no hay
 *  retraso de planteo; hay un parte sin planificar. */
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
