import type {
  Operario,
  Pedido,
  OF,
  Familia,
  Prioridad,
  EstadoOF,
  Situacion,
} from "./types";

// ─── Operarios (las zonas del tablero, como en el boceto) ────────────────────
export const OPERARIOS: Operario[] = [
  { id: "alberto", nombre: "Alberto", iniciales: "AL", color: "#e0533d" },
  { id: "jaime", nombre: "Jaime", iniciales: "JA", color: "#3d7de0" },
  { id: "tamara", nombre: "Tamara", iniciales: "TA", color: "#9b3de0" },
  { id: "adrian", nombre: "Adrián", iniciales: "AD", color: "#1fa37a" },
  { id: "ivan", nombre: "Iván", iniciales: "IV", color: "#d39a1c" },
  { id: "angel", nombre: "Ángel", iniciales: "AN", color: "#5a6472" },
];

type Accent = Pedido["accent"];

// [familia, descripción, piezas, autorId, estado?, revisorId?, fichando?, sinEmpezar?]
type OFSpec = [
  Familia,
  string,
  number,
  string | null,
  EstadoOF?,
  (string | null)?,
  boolean?,
  /** Fuerza tiempoPlanteoMin a 0 aunque el estado sea "en_curso": recién
   *  asignada, el autor todavía no la ha tocado. */
  boolean?,
];

interface Spec {
  codigo: string;
  cliente: string;
  prioridad: Prioridad;
  entrega: string;
  solicitud: string;
  /** Fecha de planificación (Producción). Si falta, se deriva de la solicitud. */
  plan?: string;
  /** Por defecto "procesado". "pendiente" = aún no procesado por Producción. */
  situacion?: Situacion;
  accent: Accent;
  croquis: boolean;
  ofs: OFSpec[];
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const SPECS: Spec[] = [
  // ── Alberto ──
  { codigo: "AR2605501", cliente: "MAHOU", prioridad: 3, entrega: "2026-07-01", solicitud: "2026-06-12", plan: "2026-06-27", accent: "verde", croquis: true,
    ofs: [["LONA", "Lona publicitaria fachada", 2, "alberto", "en_revision", "jaime", true], ["SUMINISTRO", "Herrajes inox", 1, "alberto", "en_curso"]] },
  { codigo: "AR2605508", cliente: "Estrella Galicia", prioridad: 2, entrega: "2026-07-04", solicitud: "2026-06-14", accent: "ninguno", croquis: false,
    ofs: [["TOLDO", "Toldo cofre 4×3", 1, "alberto", "aprobada", "tamara"]] },
  { codigo: "AR2605512", cliente: "Hotel Pazo Real", prioridad: 1, entrega: "2026-07-08", solicitud: "2026-06-15", accent: "azul", croquis: true,
    ofs: [["TAPIZADO", "Cojines exterior terraza", 8, "alberto", "en_curso"], ["TOLDO", "Punto recto 5m", 1, "alberto", "por_revisar"], ["REPARACION", "Ajuste brazos", 1, "alberto", "en_curso"]] },

  // ── Jaime ──
  { codigo: "AR2605516", cliente: "Náutica Vigo", prioridad: 3, entrega: "2026-06-30", solicitud: "2026-06-10", plan: "2026-06-26", accent: "rojo", croquis: true,
    ofs: [["TAPIZADO", "Tapizado náutico cabina", 1, "jaime", "en_curso", null, true]] },
  { codigo: "AR2605521", cliente: "Camping Ría de Muros", prioridad: 2, entrega: "2026-07-05", solicitud: "2026-06-16", accent: "ninguno", croquis: false,
    ofs: [["CARPA", "Carpa evento 6×12", 1, "jaime", "por_revisar"], ["LONA", "Faldón lateral", 4, "jaime", "en_curso"]] },

  // ── Tamara ──
  { codigo: "AR2605525", cliente: "Remolcar", prioridad: 3, entrega: "2026-07-02", solicitud: "2026-06-11", plan: "2026-06-29", accent: "verde", croquis: true,
    ofs: [["REMOLQUE", "Lona remolque basculante 6m", 1, "tamara", "en_curso", null, true], ["REMOLQUE", "Lona remolque 5m", 1, "tamara", "en_curso"], ["REMOLQUE", "Cobertor remolque 4m", 1, "tamara", "por_revisar"]] },
  { codigo: "AR2605530", cliente: "Talleres Lema", prioridad: 2, entrega: "2026-07-06", solicitud: "2026-06-17", accent: "azul", croquis: false,
    ofs: [["REPARACION", "Cambio tela motor", 1, "tamara", "devuelta", "adrian"]] },
  { codigo: "AR2605533", cliente: "Concello de Arzúa", prioridad: 1, entrega: "2026-07-10", solicitud: "2026-06-18", accent: "ninguno", croquis: true,
    ofs: [["LONA", "Pancartas festas", 6, "tamara", "aprobada", "ivan"], ["SUMINISTRO", "Ojales y cabos", 1, "tamara", "en_curso"]] },

  // ── Adrián ──
  { codigo: "AR2605537", cliente: "Restaurante O Forno", prioridad: 2, entrega: "2026-07-03", solicitud: "2026-06-13", accent: "verde", croquis: false,
    ofs: [["TOLDO", "Toldo brazo invisible 3,5m", 1, "adrian", "en_curso"]] },
  { codigo: "AR2605541", cliente: "Hostal A Ponte", prioridad: 1, entrega: "2026-07-09", solicitud: "2026-06-19", accent: "ninguno", croquis: true,
    ofs: [["TOLDO", "Toldo corredera patio", 1, "adrian", "en_revision", "ivan"], ["REPARACION", "Engrase guías", 1, "adrian", "en_curso"]] },

  // ── Iván ──
  { codigo: "AR2605544", cliente: "Supermercado Día", prioridad: 3, entrega: "2026-07-01", solicitud: "2026-06-12", accent: "rojo", croquis: false,
    ofs: [["LONA", "Lona rótulo entrada", 1, "ivan", "en_curso", null, true], ["SUMINISTRO", "Precintos y cinta", 3, "ivan", "en_curso", null, false, true]] },
  { codigo: "AR2605548", cliente: "Gandería Souto", prioridad: 2, entrega: "2026-07-07", solicitud: "2026-06-16", accent: "azul", croquis: true,
    ofs: [["CARPA", "Cubierta nave 8×20", 1, "ivan", "devuelta", "angel"], ["SUMINISTRO", "Cables tensores", 12, "ivan", "por_revisar"]] },

  // ── PARTIDO entre operarios ──
  { codigo: "AR2605552", cliente: "Comunidade Veciños Sar", prioridad: 3, entrega: "2026-07-02", solicitud: "2026-06-10", accent: "rojo", croquis: true,
    ofs: [["TOLDO", "Toldo portal A", 1, "alberto", "en_curso"], ["TOLDO", "Toldo portal B", 1, "ivan", "en_revision", "tamara"], ["SUMINISTRO", "Tornillería", 1, null, "pendiente"]] },

  // ── Bandeja (sin asignar) ──
  { codigo: "AR2605555", cliente: "Remolcar", prioridad: 3, entrega: "2026-07-04", solicitud: "2026-06-20", plan: "2026-06-24", accent: "verde", croquis: true,
    ofs: [["REMOLQUE", "Lona remolque basculante", 1, null], ["REMOLQUE", "Lona remolque tándem", 1, null]] },
  { codigo: "AR2605559", cliente: "Bar Central", prioridad: 2, entrega: "2026-07-11", solicitud: "2026-06-21", accent: "ninguno", croquis: false,
    ofs: [["TOLDO", "Toldo barra exterior", 1, null]] },
  { codigo: "AR2605562", cliente: "Cafetería Goz", prioridad: 1, entrega: "2026-07-14", solicitud: "2026-06-22", accent: "azul", croquis: false,
    ofs: [["TOLDO", "Punto recto 4m", 1, null], ["SUMINISTRO", "Tela acrílica naranja", 1, null]] },
  { codigo: "AR2605566", cliente: "Concello de Melide", prioridad: 2, entrega: "2026-07-12", solicitud: "2026-06-22", accent: "rojo", croquis: true,
    ofs: [["LONA", "Lonas mercado", 10, null], ["CARPA", "Carpa plegable 3×3", 2, null], ["SUMINISTRO", "Contrapesos", 8, null]] },
  { codigo: "AR2605570", cliente: "Hotel Pazo Real", prioridad: 1, entrega: "2026-07-16", solicitud: "2026-06-24", accent: "ninguno", croquis: false,
    ofs: [["TAPIZADO", "Fundas asientos piscina", 14, null]] },
  { codigo: "AR2605573", cliente: "Náutica Vigo", prioridad: 3, entrega: "2026-07-05", solicitud: "2026-06-23", accent: "verde", croquis: true,
    ofs: [["REPARACION", "Reparación bimini", 1, null], ["TAPIZADO", "Cojín bañera", 2, null]] },
  { codigo: "AR2605577", cliente: "MAHOU", prioridad: 2, entrega: "2026-07-13", solicitud: "2026-06-25", accent: "ninguno", croquis: false,
    ofs: [["LONA", "Lona camión 13,6m", 1, null]] },
  { codigo: "AR2605581", cliente: "Talleres Lema", prioridad: 1, entrega: "2026-07-18", solicitud: "2026-06-26", accent: "azul", croquis: false,
    ofs: [["SUMINISTRO", "Suministro lona PVC rollo", 2, null]] },

  // ── Historial (finalizados: todas las OF aprobadas) ──
  { codigo: "AR2605490", cliente: "Camping As Sinas", prioridad: 2, entrega: "2026-06-26", solicitud: "2026-06-02", plan: "2026-06-18", accent: "verde", croquis: true,
    ofs: [["CARPA", "Carpa restaurante 8×15", 1, "jaime", "aprobada", "alberto"], ["LONA", "Faldones laterales", 6, "jaime", "aprobada", "alberto"]] },
  { codigo: "AR2605487", cliente: "Pazo de Lestrove", prioridad: 3, entrega: "2026-06-25", solicitud: "2026-06-01", plan: "2026-06-16", accent: "rojo", croquis: false,
    ofs: [["TOLDO", "Toldo cofre jardín 5×3,5", 1, "tamara", "aprobada", "ivan"]] },
  { codigo: "AR2605495", cliente: "Bar O Recuncho", prioridad: 1, entrega: "2026-06-28", solicitud: "2026-06-05", plan: "2026-06-20", accent: "azul", croquis: false,
    ofs: [["TOLDO", "Toldo brazo invisible barra", 1, "adrian", "aprobada", "jaime"], ["REPARACION", "Cambio lona vieja", 1, "adrian", "aprobada", "jaime"]] },

  // ── Pendientes de procesar por Producción (aún NO llegan a OT) ──
  { codigo: "AR2605590", cliente: "Camping Costa Verde", prioridad: 2, entrega: "2026-07-20", solicitud: "2026-06-28", situacion: "pendiente", accent: "ninguno", croquis: false,
    ofs: [["TOLDO", "Toldo terraza (sin definir)", 1, null]] },
  { codigo: "AR2605593", cliente: "Náutica Vigo", prioridad: 3, entrega: "2026-07-15", solicitud: "2026-06-29", situacion: "pendiente", accent: "ninguno", croquis: false,
    ofs: [["TAPIZADO", "Tapizado (pendiente medidas)", 1, null]] },
  { codigo: "AR2605596", cliente: "Concello de Arzúa", prioridad: 1, entrega: "2026-07-22", solicitud: "2026-06-30", situacion: "pendiente", accent: "ninguno", croquis: false,
    ofs: [["LONA", "Lonas festas (sin procesar)", 4, null]] },
];

const OBSERVACIONES: Record<string, string> = {
  "AR2605530": "Falta cota de la guía y referencia de la tela. Revisar medidas antes de Producción.",
  "AR2605548": "Faltan las medidas de anclaje de la nave. Revisar in situ antes de replantear.",
};

let ofSeq = 0;
function buildOF(pedidoId: string, codigoPedido: string, idx: number, spec: OFSpec): OF {
  ofSeq += 1;
  const [familia, descripcion, piezas, autorId, estadoIn, revisorId, fichando, sinEmpezar] = spec;
  const estado: EstadoOF = estadoIn ?? (autorId ? "en_curso" : "pendiente");
  const tiempoEstimadoMin = 90 + piezas * 25;

  // tiempos coherentes con el estado
  const planteoDone = ["por_revisar", "en_revision", "aprobada", "devuelta"];
  const tiempoPlanteoMin =
    estado === "pendiente"
      ? 0
      : estado === "en_curso"
        ? sinEmpezar
          ? 0
          : Math.round(tiempoEstimadoMin * 0.45)
        : Math.round(tiempoEstimadoMin * (0.85 + (idx % 3) * 0.05));
  const tiempoRevisionMin =
    estado === "en_revision"
      ? 20 + (idx % 3) * 8
      : estado === "aprobada"
        ? 28 + (idx % 4) * 7
        : estado === "devuelta"
          ? 18
          : 0;
  void planteoDone;

  return {
    id: `${pedidoId}-of${idx + 1}`,
    codigo: `OF-${String(ofSeq).padStart(3, "0")}`,
    descripcion,
    familia,
    piezas,
    autorId: autorId ?? null,
    revisorId: revisorId ?? null,
    estado,
    observacion: estado === "devuelta" ? OBSERVACIONES[codigoPedido] : undefined,
    fichandoRol: fichando ? (estado === "en_revision" ? "revisar" : "plantear") : null,
    tiempoEstimadoMin,
    tiempoPlanteoMin,
    tiempoRevisionMin,
    archivosRps:
      estado === "aprobada"
        ? [`plano_${familia.toLowerCase()}.pdf`, `medidas_OF.dwg`, `fotos_montaje.zip`]
        : undefined,
  };
}

export const PEDIDOS: Pedido[] = SPECS.map((s, i) => {
  const id = `ped-${i + 1}`;
  return {
    id,
    codigo: s.codigo,
    cliente: s.cliente,
    situacion: s.situacion ?? "procesado",
    fechaSolicitud: s.solicitud,
    fechaPlanificacion: s.plan ?? addDays(s.solicitud, 12),
    fechaEntrega: s.entrega,
    prioridad: s.prioridad,
    accent: s.accent,
    lineas: 4 + (i % 5),
    croquis: s.croquis,
    ofs: s.ofs.map((of, j) => buildOF(id, s.codigo, j, of)),
  };
});
