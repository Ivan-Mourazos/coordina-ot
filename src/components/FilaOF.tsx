import type { OF, Operario } from "@/lib/types";
import { tiempoTotalOF } from "@/lib/types";
import { ESTADO, fmtMin } from "@/lib/estado";
import { relativoA, type TonoFecha } from "@/lib/fechas";
import { FamiliaIcon } from "./FamiliaTag";
import { LiveDot } from "./LiveBadge";

// ─── Una OF dentro del detalle de un pedido ──────────────────────────────────
// Nace en Pendientes y la usa también Revisiones: las dos abren un pedido para
// ver "qué hay dentro y cómo va cada OF", y hasta ahora cada vista dibujaba esa
// lista a su manera —aquí una tarjeta con estado, avisos y tiempo; en
// Revisiones una `<ul>` sencilla con solo código, autor y revisor—. Es
// justo el tipo de duplicación que el trabajo de unificar vistas viene a
// quitar, así que sale a un componente y las dos lo comparten en vez de
// mantener el mismo dato pintado dos veces.

/** Color del texto de una fecha según su urgencia. Clases literales: Tailwind
 *  no compila las que se construyen concatenando. */
const TONO: Record<TonoFecha, string> = {
  vencida: "font-semibold text-red-600 dark:text-red-400",
  hoy: "font-semibold text-amber-600 dark:text-amber-400",
  proxima: "text-text",
  lejana: "text-text-muted",
};

function Avatar({ op, title }: { op: Operario | undefined; title: string }) {
  if (!op) return <span className="text-text-muted italic">—</span>;
  return (
    <span
      className="grid size-5 place-items-center rounded-full text-[9px] font-bold text-white"
      style={{ background: op.color }}
      title={`${title}: ${op.nombre}`}
    >
      {op.iniciales}
    </span>
  );
}

/** `enfasis` gradúa cuánto grita la fecha:
 *  · "normal"  → su urgencia real (la planificación, que es la que manda).
 *  · "suave"   → solo destaca si ya venció (la entrega: informa, no apremia).
 *  · "ninguno" → siempre en gris, aunque haya vencido: trabajo ya terminado. */
function Fecha({
  iso,
  hoy,
  enfasis = "normal",
  absoluta = false,
}: {
  iso: string;
  hoy: string;
  enfasis?: "normal" | "suave" | "ninguno";
  /** Enseñar la fecha, no lo que falta o sobra. Para las que son HISTORIA y no
   *  un plazo: la creación salía como "-26 d" al lado de "FABRICACIÓN 19/08",
   *  y leídas juntas parecían dos cosas distintas cuando son cuatro fechas del
   *  mismo recorrido. Cuánto hace que entró se sigue viendo en el `title`. */
  absoluta?: boolean;
}) {
  const r = relativoA(iso, hoy);
  const clase =
    enfasis === "ninguno" || (enfasis === "suave" && r.tono !== "vencida")
      ? TONO.lejana
      : TONO[r.tono];
  return (
    <span className={clase} title={`${r.completa} · ${r.etiqueta}`}>
      {absoluta ? `${iso.slice(8)}/${iso.slice(5, 7)}` : r.etiqueta}
    </span>
  );
}

/** Una OF, una línea: código, descripción, píldora de estado, avisos que
 *  paran el trabajo (taller, detenida, material) y autor → revisor con el
 *  tiempo a la derecha. */
export function FilaOF({ of, operarios, hoy }: { of: OF; operarios: Operario[]; hoy: string }) {
  const meta = ESTADO[of.estado];
  const autor = operarios.find((o) => o.id === of.autorId);
  const revisor = operarios.find((o) => o.id === of.revisorId);
  const total = tiempoTotalOF(of);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface px-2.5 py-1.5 text-[11px] ring-1 ring-border">
      <FamiliaIcon familia={of.familia} className="size-3.5 shrink-0" />
      <span className="font-mono font-semibold text-text">{of.codigo}</span>
      <span className="truncate text-text">{of.descripcion}</span>
      {of.fichandoRol && (
        <span
          title={of.fichandoRol === "revisar" ? "Revisando ahora" : "Planteando ahora"}
          className="inline-flex"
        >
          <LiveDot rol={of.fichandoRol} />
        </span>
      )}
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${meta.chip}`}>
        {meta.label}
      </span>
      {of.ajenaOT && (
        <span
          className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-text-muted ring-1 ring-border"
          title="Entra por una tarea de taller (PLANTEAR EN TALLER): no es trabajo de OT. Se recupera asignándole autor."
        >
          Taller
        </span>
      )}
      {of.detenida && (
        <span
          className="rounded bg-red-600/12 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700 dark:text-red-300"
          title="Detenida por Producción: no se puede fichar"
        >
          Detenida
        </span>
      )}
      {of.materialPendienteHasta && (
        <span className="whitespace-nowrap text-text-muted" title="Llegada del material pedido">
          Material <Fecha iso={of.materialPendienteHasta} hoy={hoy} />
        </span>
      )}
      <span className="ml-auto flex items-center gap-1.5">
        <Avatar op={autor} title="Autor" />
        <span className="text-text-muted">→</span>
        <Avatar op={revisor} title="Revisor" />
      </span>
      <span
        className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-semibold text-text ring-1 ring-border"
        title={`Planteo ${fmtMin(of.tiempoPlanteoMin)} · Revisión ${fmtMin(of.tiempoRevisionMin)}`}
      >
        {total > 0 ? fmtMin(total) : "—"}
      </span>
    </li>
  );
}
