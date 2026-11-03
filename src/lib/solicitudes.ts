import type { SeccionId } from "./secciones";

// ─── Solicitudes de comerciales (workflow de RPS) ────────────────────────────
// Un comercial pide un boceto o una consulta con el workflow «SOLICITAR BOCETO O
// INFORMACION» y le llega a OT o a Diseño. RPS guarda cada paso como una tarea
// nueva, así que en sus listas parece que al coger una se crea otra (David e
// Iván, 02/11/2026). Las une `WorkflowInstanceID`: aquí una solicitud es esa
// ejecución entera, con su paso actual y su historial.
//
// `Label` lleva además el comercial, el tipo, la oportunidad y el presupuesto, y
// por la oportunidad se enlazan las solicitudes seguidas sobre el mismo trabajo
// (medido el 02/11/2026: encajan las 91 de los últimos 120 días).
//
// Solo lectura: coger una solicitud se hace en RPS.

export const WORKFLOW_SOLICITUDES = "SOLICITAR BOCETO O INFORMACION";

/** El rol de RPS al que llega cada sección. Compras usa el mismo workflow, pero
 *  no trabaja en Coordina. */
export const ROL_RPS: Partial<Record<SeccionId, string>> = { ot: "OT", diseno: "DISEÑO" };

export function seccionConSolicitudes(s: unknown): s is SeccionId {
  return typeof s === "string" && Object.hasOwn(ROL_RPS, s);
}

export const PASO_ASIGNAR = /^Formulario asignar trabajo/i;
export const PASO_TECNICO = /^Formulario tecnico/i;
export const PASO_AVISO = /^Aviso al comercial/i;
const PASO_PEDIR = /^Formulario pedir datos/i;

export type EstadoSolicitud = "sin_coger" | "cogida" | "terminada";

export const ESTADOS_SOLICITUD: Record<EstadoSolicitud, string> = {
  sin_coger: "Sin coger",
  cogida: "Cogidas",
  terminada: "Terminadas",
};

/** Las terminadas que se enseñan: lo abierto es lo que se viene a mirar. */
export const TOPE_TERMINADAS = 40;

/** Una fila de `BPMTask` con lo que hace falta de su ejecución. */
export interface FilaTarea {
  tarea: string;
  instancia: string;
  rol: string;
  etiqueta: string | null;
  estadoEjecucion: string | null;
  descripcion: string;
  usuario: string | null;
  creadaPor: string | null;
  cerradaPor: string | null;
  creada: string;
  cerrada: string | null;
}

/** Un campo de formulario relleno de una tarea. */
export interface FilaCampo {
  tarea: string;
  campo: string;
  valor: string | null;
}

export interface PasoSolicitud {
  texto: string;
  quien: string | null;
  fecha: string;
  abierto: boolean;
}

export interface AdjuntoSolicitud {
  /** Tarea que lo trae y número de adjunto: nunca la ruta, que no sale de aquí. */
  tarea: string;
  numero: 1 | 2;
  archivo: string;
}

export interface SolicitudRelacionada {
  id: string;
  tipo: string;
  fecha: string;
  estado: EstadoSolicitud;
  tecnico: string | null;
}

/** Una fila de la vista TGM_WF_COORDINA (David, 03/11/2026): la actividad del
 *  comercial y la del técnico de cada ejecución, con lo que contestó y subió. */
export interface FilaVista {
  instancia: string;
  actividadComercial: string | null;
  actividadTecnico: string | null;
  tecnico: string | null;
  comentarioTecnico: string | null;
  fechaRealizacion: string | null;
  documentoTecnico: string | null;
}

/** El documento que subió el técnico. En RPS su ruta no suele llevar extensión:
 *  `archivo` ya trae la que le corresponde por su contenido. */
export interface DocumentoTecnico {
  archivo: string;
}

export interface Solicitud {
  id: string;
  rol: string;
  comercial: string;
  tipo: string;
  oportunidad: string | null;
  presupuesto: string | null;
  /** Qué pide, con las palabras del comercial. */
  descripcion: string;
  comentario: string;
  /** La respuesta del técnico, si la hay. */
  respuesta: string | null;
  estado: EstadoSolicitud;
  tecnico: string | null;
  /** Terminada, pero el comercial aún no ha leído el aviso. */
  avisoPendiente: boolean;
  fecha: string;
  adjuntos: AdjuntoSolicitud[];
  pasos: PasoSolicitud[];
  /** Otras solicitudes de la misma oportunidad. */
  relacionadas: SolicitudRelacionada[];
  /** Lo que añade la vista de RPS, si la hay. */
  actividad?: string | null;
  fechaRealizacion?: string | null;
  documentoTecnico?: DocumentoTecnico | null;
}

/** Añade a cada solicitud lo que trae la vista: la respuesta del técnico, cuándo
 *  la terminó y su documento. La vista manda en la respuesta, que es la que
 *  queda en la actividad; el formulario del workflow es la copia. `archivoDe`
 *  da el nombre con extensión de un documento ya comprobado, o null. */
export function enriquecer(
  solicitudes: readonly Solicitud[],
  filas: readonly FilaVista[],
  archivoDe: (instancia: string) => string | null,
): Solicitud[] {
  const porInstancia = new Map(filas.map((f) => [f.instancia.toLowerCase(), f]));
  return solicitudes.map((s) => {
    const f = porInstancia.get(s.id.toLowerCase());
    if (!f) return s;
    const archivo = f.documentoTecnico ? archivoDe(f.instancia) : null;
    return {
      ...s,
      actividad: f.actividadComercial,
      respuesta: f.comentarioTecnico?.trim() || s.respuesta,
      tecnico: s.tecnico ?? nombreUsuario(f.tecnico),
      fechaRealizacion: f.fechaRealizacion,
      documentoTecnico: archivo ? { archivo } : null,
    };
  });
}

/** La extensión por las primeras bytes del fichero: los documentos del técnico
 *  se guardan sin ella, y sin extensión el visor no sabe qué es. */
export function extensionPorContenido(inicio: Uint8Array): string | null {
  const es = (...b: number[]) => b.every((x, i) => inicio[i] === x);
  if (es(0x25, 0x50, 0x44, 0x46)) return "pdf";
  if (es(0x89, 0x50, 0x4e, 0x47)) return "png";
  if (es(0xff, 0xd8, 0xff)) return "jpg";
  return null;
}

/** Los códigos de usuario de RPS, para leer: `IVAN.SANCHEZ` → «Ivan Sanchez». */
export function nombreUsuario(codigo: string | null): string | null {
  if (!codigo) return null;
  return codigo
    .trim()
    .split(/[.\s_]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toLocaleUpperCase("es-ES") + p.slice(1).toLocaleLowerCase("es-ES"))
    .join(" ");
}

/** «COMERCIAL - TIPO - 044634 -PT26003761 -texto». El presupuesto puede faltar:
 *  entonces viene como «- -». Lo que no encaje se conserva entero como texto. */
export function leerEtiqueta(etiqueta: string | null): {
  comercial: string | null;
  tipo: string | null;
  oportunidad: string | null;
  presupuesto: string | null;
  texto: string;
} {
  const limpia = (etiqueta ?? "").trim();
  const m = /^(.+?) - (.+?) - (\d+) ?- ?(PT\d+)? ?-? ?([\s\S]*)$/.exec(limpia);
  if (!m) return { comercial: null, tipo: null, oportunidad: null, presupuesto: null, texto: limpia };
  return { comercial: m[1], tipo: m[2], oportunidad: m[3], presupuesto: m[4] ?? null, texto: m[5].trim() };
}

/** Los adjuntos guardan la ruta de red tal cual, y `segmentosEnShare` espera la
 *  forma de los documentos de RPS, con `file://` delante. */
export function comoDocumentoRps(ruta: string): string {
  const limpia = ruta.trim();
  return limpia.startsWith("\\\\") ? `file://${limpia}` : limpia;
}

/** El texto del paso, sin la jerga del formulario. */
function textoDePaso(descripcion: string): string {
  if (PASO_PEDIR.test(descripcion)) return "Pide el comercial";
  if (PASO_ASIGNAR.test(descripcion)) return "Para coger";
  if (PASO_TECNICO.test(descripcion)) return "Trabajo del técnico";
  if (PASO_AVISO.test(descripcion)) return "Aviso al comercial";
  return descripcion;
}

const CUENTAN = [PASO_PEDIR, PASO_ASIGNAR, PASO_TECNICO, PASO_AVISO];
const ADJUNTOS: readonly [string, 1 | 2][] = [["Adjunto 1 comercial", 1], ["Adjunto 2 comercial", 2]];

function estadoDe(tareas: readonly FilaTarea[], ejecucion: string | null) {
  const abierta = (re: RegExp) => tareas.find((t) => !t.cerrada && re.test(t.descripcion));
  const asignar = abierta(PASO_ASIGNAR);
  const tecnico = abierta(PASO_TECNICO);
  const delTecnico = [...tareas].reverse().find((t) => PASO_TECNICO.test(t.descripcion) || PASO_ASIGNAR.test(t.descripcion));
  const quien = nombreUsuario(tecnico?.usuario ?? asignar?.usuario ?? delTecnico?.cerradaPor ?? delTecnico?.usuario ?? null);
  if (ejecucion && ejecucion !== "Started") return { estado: "terminada" as const, tecnico: quien, aviso: false };
  if (asignar && !asignar.usuario) return { estado: "sin_coger" as const, tecnico: null, aviso: false };
  if (asignar || tecnico) return { estado: "cogida" as const, tecnico: quien, aviso: false };
  return { estado: "terminada" as const, tecnico: quien, aviso: Boolean(abierta(PASO_AVISO)) };
}

/** De filas de tareas a solicitudes del rol, lo más nuevo arriba. Cada campo se
 *  toma del último paso que lo trae: el técnico ve el comentario del comercial
 *  copiado, y la copia puede venir recortada o ampliada. */
export function componerSolicitudes(
  tareas: readonly FilaTarea[],
  campos: readonly FilaCampo[],
  rol: string,
): Solicitud[] {
  const porInstancia = new Map<string, FilaTarea[]>();
  for (const t of tareas) {
    const lista = porInstancia.get(t.instancia);
    if (lista) lista.push(t);
    else porInstancia.set(t.instancia, [t]);
  }
  const camposDe = new Map<string, FilaCampo[]>();
  for (const c of campos) {
    const lista = camposDe.get(c.tarea);
    if (lista) lista.push(c);
    else camposDe.set(c.tarea, [c]);
  }

  const todas: Solicitud[] = [];
  for (const [instancia, sinOrden] of porInstancia) {
    const orden = [...sinOrden].sort((a, b) => a.creada.localeCompare(b.creada));
    const primera = orden[0];
    const etiqueta = leerEtiqueta(primera.etiqueta);
    const { estado, tecnico, aviso } = estadoDe(orden, primera.estadoEjecucion);

    const ultimo = (nombre: string): { valor: string; tarea: string } | null => {
      for (const t of [...orden].reverse()) {
        const c = camposDe.get(t.tarea)?.find((x) => x.campo === nombre && x.valor?.trim());
        if (c) return { valor: c.valor!.trim(), tarea: t.tarea };
      }
      return null;
    };
    const adjuntos = ADJUNTOS.flatMap(([campo, numero]) => {
      const a = ultimo(campo);
      if (!a) return [];
      const archivo = a.valor.split(/[\\/]/).pop() || a.valor;
      return [{ tarea: a.tarea, numero, archivo }];
    });

    todas.push({
      id: instancia,
      rol: primera.rol,
      comercial: nombreUsuario(etiqueta.comercial ?? primera.creadaPor) ?? "Sin comercial",
      tipo: etiqueta.tipo ?? "Solicitud",
      oportunidad: etiqueta.oportunidad,
      presupuesto: etiqueta.presupuesto,
      descripcion: ultimo("Descripcion oportunidad")?.valor ?? "",
      comentario: ultimo("Comentario comercial")?.valor ?? etiqueta.texto,
      respuesta: ultimo("Comentarios")?.valor ?? null,
      estado,
      tecnico,
      avisoPendiente: aviso,
      fecha: primera.creada,
      adjuntos,
      pasos: orden
        .filter((t) => CUENTAN.some((re) => re.test(t.descripcion)))
        .map((t) => ({
          texto: textoDePaso(t.descripcion),
          quien: nombreUsuario(t.cerradaPor ?? t.usuario),
          fecha: t.cerrada ?? t.creada,
          abierto: !t.cerrada,
        })),
      relacionadas: [],
    });
  }

  const porOportunidad = new Map<string, Solicitud[]>();
  for (const s of todas) {
    if (!s.oportunidad) continue;
    const lista = porOportunidad.get(s.oportunidad);
    if (lista) lista.push(s);
    else porOportunidad.set(s.oportunidad, [s]);
  }
  for (const s of todas) {
    if (!s.oportunidad) continue;
    s.relacionadas = (porOportunidad.get(s.oportunidad) ?? [])
      .filter((o) => o.id !== s.id)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map((o) => ({ id: o.id, tipo: o.tipo, fecha: o.fecha, estado: o.estado, tecnico: o.tecnico }));
  }

  const delRol = todas.filter((s) => s.rol === rol).sort((a, b) => b.fecha.localeCompare(a.fecha));
  let terminadas = 0;
  return delRol.filter((s) => s.estado !== "terminada" || ++terminadas <= TOPE_TERMINADAS);
}

export const sinCoger = (solicitudes: readonly Solicitud[]): number =>
  solicitudes.filter((s) => s.estado === "sin_coger").length;
