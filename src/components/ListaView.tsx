"use client";

import { Fragment, useState } from "react";
import type { OF, Operario, Pedido } from "@/lib/types";
import { estaFinalizado, familiasDe, hoyISO, tiempoTotalOF } from "@/lib/types";
import { ESTADO, fmtMin, PRIORIDAD } from "@/lib/estado";
import { FASES, faseDePedido } from "@/lib/fases-tablero";
import { relativoA, type TonoFecha } from "@/lib/fechas";
import { lineaTiempo, repartirEtiquetas } from "@/lib/linea-tiempo";
import { FamiliaTag, FamiliaIcon } from "./FamiliaTag";
import { LiveDot } from "./LiveBadge";

// ─── Vista Lista ─────────────────────────────────────────────────────────────
// La consulta densa: todo lo que aún no ha pasado a Producción, para mirar de
// un vistazo en qué anda cada pedido, para cuándo es y cuánto lleva. No se
// trabaja desde aquí (eso es el tablero); por eso no hay acciones, solo datos.
//
// Dos decisiones que vienen de ver la vista llena de pedidos reales:
//   · La columna de estado habla el MISMO idioma que el tablero (las cuatro
//     fases), no los siete estados internos de la OF. Los estados de OF siguen
//     estando, pero dentro del despliegue, que es donde se mira el detalle.
//   · El badge rojo "ATRASADO" salía en casi todas las filas —basta con que la
//     planificación sea de ayer— y con él el código y la fecha también en rojo:
//     tres avisos para el mismo dato, y ninguno decía CUÁNTO. Ahora hay un solo
//     sitio donde mirarlo, la fecha, y dice "-1 d" o "-28 d".

/** Color del texto de una fecha según su urgencia. Clases literales: Tailwind
 *  no compila las que se construyen concatenando. */
const TONO: Record<TonoFecha, string> = {
  vencida: "font-semibold text-red-600 dark:text-red-400",
  hoy: "font-semibold text-amber-600 dark:text-amber-400",
  proxima: "text-text",
  lejana: "text-text-muted",
};

function Avatares({ ids, operarios }: { ids: (string | null)[]; operarios: Operario[] }) {
  const unicos = [...new Set(ids.filter(Boolean) as string[])];
  if (unicos.length === 0) return <span className="text-text-muted">—</span>;
  return (
    <div className="flex -space-x-1.5">
      {unicos.map((id) => {
        const o = operarios.find((x) => x.id === id);
        if (!o) return null;
        return (
          <span
            key={id}
            className="grid size-5 place-items-center rounded-full text-[9px] font-bold text-white ring-2 ring-surface"
            style={{ background: o.color }}
            title={o.nombre}
          >
            {o.iniciales}
          </span>
        );
      })}
    </div>
  );
}

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
}: {
  iso: string;
  hoy: string;
  enfasis?: "normal" | "suave" | "ninguno";
}) {
  const r = relativoA(iso, hoy);
  const clase =
    enfasis === "ninguno" || (enfasis === "suave" && r.tono !== "vencida")
      ? TONO.lejana
      : TONO[r.tono];
  return (
    <span className={clase} title={r.completa}>
      {r.etiqueta}
    </span>
  );
}

/** Cuánto texto de fecha ("27/08") ocupa, en % del ancho de la columna. Es la
 *  separación mínima entre etiquetas y lo que sobresale por los extremos. */
const ANCHO_FECHA_PCT = 17;

/** Color de cada tramo del recorrido. Hex y no clases de Tailwind porque van
 *  dentro de un degradado CSS, no de un `class`. */
const TRAMO = {
  espera: "#3b82f6", // pedido dentro, aún sin planificar: no toca a OT
  trabajo: "#10b981", // de la planificación a la fabricación
  aviso: "#f59e0b", // el último tercio antes de la entrega
  limite: "#dc2626", // la fecha solicitada
} as const;

/** Degradado del recorrido con los cortes de color en los hitos.
 *
 *  Los dos primeros cortes son secos (el pedido cambia de tramo un día
 *  concreto), y el último es una rampa: acercarse a la entrega es gradual, no
 *  pasa de golpe de "va bien" a "va mal". */
export function degradadoRecorrido(pctPlanificacion: number, pctFabricacion?: number): string {
  const p = Math.max(0, Math.min(100, pctPlanificacion));
  const paradas = [`${TRAMO.espera} 0%`, `${TRAMO.espera} ${p}%`, `${TRAMO.trabajo} ${p}%`];
  if (pctFabricacion !== undefined) {
    const f = Math.max(p, Math.min(100, pctFabricacion));
    paradas.push(`${TRAMO.trabajo} ${f}%`, `${TRAMO.aviso} ${f + (100 - f) / 2}%`);
  } else {
    paradas.push(`${TRAMO.aviso} ${p + (100 - p) * 0.6}%`);
  }
  paradas.push(`${TRAMO.limite} 100%`);
  return `linear-gradient(to right, ${paradas.join(", ")})`;
}

/** El recorrido del pedido en una fila: los hitos a escala con su fecha
 *  encima, y el punto de hoy moviéndose por encima.
 *
 *  Sustituye a las columnas de fechas sueltas, no se suma a ellas. Con las
 *  fechas en columnas propias hacían falta tres colores para decir lo mismo
 *  —planificada en rojo, solicitada en rojo, barra en rojo— y la lista era un
 *  muro. Aquí las fechas son grises y lo único que grita es dónde está hoy.
 *
 *  Los rótulos (Creación, Planificación…) NO se repiten por fila: el orden es
 *  el mismo en todas, así que viven una sola vez en la cabecera. */
function Recorrido({ pedido, hoy }: { pedido: Pedido; hoy: string }) {
  const { hitos, hoyPct, hoyFuera, diasParaEntrega } = lineaTiempo(pedido, hoy);
  const urgente = diasParaEntrega <= 2;
  const etiquetas = repartirEtiquetas(
    hitos.map((h) => h.pct),
    ANCHO_FECHA_PCT,
    ANCHO_FECHA_PCT / 2,
  );
  const degradado = degradadoRecorrido(
    hitos.find((h) => h.clave === "planificacion")?.pct ?? 0,
    hitos.find((h) => h.clave === "fabricacion")?.pct,
  );

  return (
    <div className="w-[260px] pb-0.5 pt-1">
      <div className="relative h-3">
        {hitos.map((h, i) => (
          <span
            key={h.clave}
            className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[9px] leading-none text-text-muted"
            style={{ left: `${etiquetas[i]}%` }}
            title={`${h.etiqueta}: ${h.iso.split("-").reverse().join("/")}`}
          >
            {h.iso.slice(8)}/{h.iso.slice(5, 7)}
          </span>
        ))}
      </div>

      <div className="relative h-2">
        {/* El color dice EN QUÉ TRAMO va el pedido, no solo cuánto lleva: azul
            mientras espera a que OT lo planifique, verde mientras se trabaja, y
            calentándose hacia el rojo según se acerca la entrega. Va en un
            degradado y no en trozos sueltos porque los cortes tienen que caer
            justo en los hitos, que están a escala real.

            La línea entera se pinta apagada y solo lo recorrido va a todo
            color: así se ve a la vez el plan completo y por dónde se va. */}
        <div
          className="absolute inset-x-0 top-[3px] h-0.5 rounded-full opacity-25"
          style={{ background: degradado }}
        />
        <div
          className="absolute left-0 top-[3px] h-0.5 overflow-hidden rounded-full"
          style={{ width: `${hoyPct}%` }}
        >
          {/* Ancho fijo al 100 % del PADRE de arriba para que el degradado no
              se comprima según avanza el día: los cortes de color tienen que
              seguir cayendo en los hitos. */}
          <div
            className="h-0.5 rounded-full"
            style={{ background: degradado, width: `${(100 / Math.max(hoyPct, 0.01)) * 100}%` }}
          />
        </div>
        {hitos.map((h) => (
          <span
            key={h.clave}
            className="absolute top-0 size-2 -translate-x-1/2 rounded-full bg-border-strong"
            style={{ left: `${h.pct}%` }}
          />
        ))}
        {/* Hoy: el único que se mueve, y el único con color. Más grande que
            los hitos y con anillo del fondo para que se despegue de ellos. */}
        <span
          className={`absolute top-[-1px] size-2.5 -translate-x-1/2 rounded-full ring-2 ring-surface ${
            urgente ? "bg-red-600" : "bg-brand-500"
          } ${hoyFuera ? "opacity-50" : ""}`}
          style={{ left: `${hoyPct}%` }}
          title={
            diasParaEntrega < 0
              ? `Hoy · vencido hace ${-diasParaEntrega} d`
              : `Hoy · quedan ${diasParaEntrega} d`
          }
        />
      </div>
    </div>
  );
}

export function ListaView({
  pedidos,
  operarios,
  onOpen,
}: {
  pedidos: Pedido[];
  operarios: Operario[];
  onOpen: (p: Pedido) => void;
}) {
  const hoy = hoyISO();
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          {/* Pegada arriba: con 40 pedidos, a mitad de scroll ya no se sabía
              qué columna era cuál. */}
          <tr className="sticky top-0 z-10 border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-text-muted">
            <Th className="w-8" />
            <Th>Pedido</Th>
            <Th>Cliente</Th>
            <Th>Familias</Th>
            <Th className="text-center">OF</Th>
            <Th>Autor → revisor</Th>
            <Th>Fase</Th>
            {/* Los rótulos de los hitos van aquí, una vez, en lugar de
                repetirse en cada fila: el orden es el mismo en todas. Los
                nombres son los de la herramienta vieja. */}
            <Th className="w-[260px]">
              <span className="block">Recorrido</span>
              <span className="mt-0.5 block text-[9px] font-normal normal-case tracking-normal text-text-muted/80">
                creación · planificada · fabricación · solicitada
              </span>
            </Th>
            <Th className="text-right">Fichado</Th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map((p) => {
            const fase = FASES.find((f) => f.id === faseDePedido(p))!;
            const total = p.ofs.reduce((n, of) => n + tiempoTotalOF(of), 0);
            // Terminado = la planificación vencida ya no es un problema
            // pendiente. Misma regla que `estaAtrasado`, que también los
            // excluye; si no, media lista salía en rojo por trabajo hecho.
            const hecho = estaFinalizado(p);
            const pendienteProc = p.situacion === "pendiente";
            const fichando = p.ofs.find((o) => o.fichandoRol)?.fichandoRol ?? null;
            const abierto = expandidos.has(p.id);
            return (
              <Fragment key={p.id}>
                <tr
                  onClick={() => toggle(p.id)}
                  className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface-2 ${
                    pendienteProc ? "opacity-60" : ""
                  } ${abierto ? "bg-surface-2" : ""}`}
                >
                  <Td>
                    {/* El clic en la fila entera despliega, pero una <tr> no se
                        puede enfocar sin romper la semántica de la tabla: el
                        botón de la flecha es la misma acción, alcanzable con
                        el tabulador. */}
                    <button
                      type="button"
                      onClick={(e) => {
                        // La fila también escucha el clic: sin esto, el toggle
                        // se ejecutaría dos veces y se quedaría como estaba.
                        e.stopPropagation();
                        toggle(p.id);
                      }}
                      aria-expanded={abierto}
                      aria-label={`${abierto ? "Plegar" : "Desplegar"} ${p.codigo}`}
                      className="grid place-items-center rounded p-0.5 hover:bg-surface-2"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        className={`size-3.5 text-text-muted transition-transform ${abierto ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3.5 w-1 rounded-full"
                        style={{ background: PRIORIDAD[p.prioridad].color }}
                        title={`Prioridad ${PRIORIDAD[p.prioridad].label}`}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(p);
                        }}
                        className="font-mono font-semibold text-text hover:underline"
                        title="Abrir detalle del pedido"
                      >
                        {p.codigo}
                      </button>
                      {fichando && (
                        <span
                          title={fichando === "revisar" ? "Revisando ahora" : "Planteando ahora"}
                          className="inline-flex"
                        >
                          <LiveDot rol={fichando} />
                        </span>
                      )}
                      {p.interno && (
                        <span
                          className="rounded bg-surface-2 px-1.5 py-0.5 text-[9px] font-bold uppercase text-text-muted ring-1 ring-border"
                          title="Proyecto interno: sin pedido de venta"
                        >
                          Interno
                        </span>
                      )}
                      {pendienteProc && (
                        <span
                          className="rounded bg-gray-400 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white dark:bg-gray-600"
                          title="Producción todavía no lo ha pasado a Oficina Técnica"
                        >
                          Sin procesar
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td className="text-text">
                    {p.cliente}
                    {p.negocio && <span className="text-text-muted"> · {p.negocio}</span>}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {familiasDe(p).map((f) => (
                        <FamiliaTag key={f} familia={f} />
                      ))}
                    </div>
                  </Td>
                  <Td className="text-center font-medium text-text">{p.ofs.length}</Td>
                  <Td>
                    {/* Juntos y en el orden del flujo: quien lo plantea y a
                        quién le toca repasarlo se leen como una frase. */}
                    <span className="flex items-center gap-1.5">
                      <Avatares ids={p.ofs.map((o) => o.autorId)} operarios={operarios} />
                      <span className="text-text-muted">→</span>
                      <Avatares ids={p.ofs.map((o) => o.revisorId)} operarios={operarios} />
                    </span>
                  </Td>
                  <Td>
                    <span className="flex items-center gap-1.5 whitespace-nowrap text-text">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: fase.color }}
                      />
                      {fase.label}
                    </span>
                  </Td>
                  <Td>
                    {/* Terminado = el recorrido ya no dice nada: el pedido no
                        se mueve más. Se apaga entero en vez de teñir media
                        lista de rojo por trabajo que ya está hecho. */}
                    <span className={hecho ? "block opacity-40 grayscale" : undefined}>
                      <Recorrido pedido={p} hoy={hoy} />
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap text-right font-medium text-text">
                    {total > 0 ? fmtMin(total) : <span className="text-text-muted">—</span>}
                  </Td>
                </tr>
                {abierto && (
                  <tr className="border-b border-border bg-surface-2/60 last:border-0">
                    <td colSpan={9} className="px-3 py-3">
                      <Detalle p={p} hoy={hoy} operarios={operarios} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Lo que se ve al desplegar una fila: el resto de fechas y el reparto del
 *  tiempo (que en la fila solo cabe sumado), y una línea por OF. Es la
 *  respuesta a "¿por qué este pedido está así?" sin tener que abrirlo. */
function Detalle({ p, hoy, operarios }: { p: Pedido; hoy: string; operarios: Operario[] }) {
  const planteo = p.ofs.reduce((n, of) => n + of.tiempoPlanteoMin, 0);
  const revision = p.ofs.reduce((n, of) => n + of.tiempoRevisionMin, 0);
  const estimado = p.ofs.reduce((n, of) => n + of.tiempoEstimadoMin, 0);
  return (
    <div className="space-y-2.5">
      <dl className="flex flex-wrap gap-x-6 gap-y-1.5 text-[11px]">
        {/* Creación, no "solicitado": la solicitada es la entrega y ya está en
            su columna. Aquí lo que aporta el desplegable es cuándo entró. */}
        {p.fechaCreacion && (
          <Dato label="Creación">
            <Fecha iso={p.fechaCreacion} hoy={hoy} enfasis="ninguno" />
          </Dato>
        )}
        <Dato label="Planificada">
          <Fecha iso={p.fechaPlanificacion} hoy={hoy} />
        </Dato>
        {p.fechaFabricacion && (
          <Dato label="Fabricación">
            <Fecha iso={p.fechaFabricacion} hoy={hoy} enfasis="ninguno" />
          </Dato>
        )}
        <Dato label="Solicitada">
          <Fecha iso={p.fechaEntrega} hoy={hoy} enfasis="suave" />
        </Dato>
        <Dato label="Planteo">{fmtMin(planteo)}</Dato>
        <Dato label="Revisión">{fmtMin(revision)}</Dato>
        {estimado > 0 && <Dato label="Estimado">{fmtMin(estimado)}</Dato>}
        {p.ciudadEntrega && <Dato label="Destino">{p.ciudadEntrega}</Dato>}
      </dl>
      {p.comentarioVenta && (
        <p className="rounded-lg bg-surface px-2.5 py-1.5 text-[11px] leading-5 text-text ring-1 ring-border">
          <span className="font-semibold text-text-muted">Comercial: </span>
          {p.comentarioVenta}
        </p>
      )}
      <ul className="space-y-1.5">
        {p.ofs.map((of) => (
          <OFRowLista key={of.id} of={of} operarios={operarios} hoy={hoy} />
        ))}
      </ul>
    </div>
  );
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="text-text">{children}</dd>
    </div>
  );
}

function OFRowLista({ of, operarios, hoy }: { of: OF; operarios: Operario[]; hoy: string }) {
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

function Th({
  children,
  className = "",
  title,
}: {
  children?: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <th className={`px-3 py-2.5 font-semibold ${className}`} title={title}>
      {children}
    </th>
  );
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 ${className}`}>{children}</td>;
}
