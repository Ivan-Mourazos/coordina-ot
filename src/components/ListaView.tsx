"use client";

import { Fragment, useState } from "react";
import type { OF, Operario, Pedido } from "@/lib/types";
import { estaFinalizado, familiasDe, hoyISO, tiempoTotalOF } from "@/lib/types";
import { ESTADO, fmtMin, PRIORIDAD } from "@/lib/estado";
import { FASES, faseDePedido } from "@/lib/fases-tablero";
import { relativoA, type TonoFecha } from "@/lib/fechas";
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
            <Th title="Fecha en la que Producción planificó el trabajo de OT">Planif.</Th>
            <Th>Entrega</Th>
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
                  aria-expanded={abierto}
                  className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface-2 ${
                    pendienteProc ? "opacity-60" : ""
                  } ${abierto ? "bg-surface-2" : ""}`}
                >
                  <Td>
                    <svg
                      viewBox="0 0 24 24"
                      className={`size-3.5 text-text-muted transition-transform ${abierto ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
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
                  <Td className="whitespace-nowrap">
                    <Fecha iso={p.fechaPlanificacion} hoy={hoy} enfasis={hecho ? "ninguno" : "normal"} />
                  </Td>
                  <Td className="whitespace-nowrap">
                    <Fecha iso={p.fechaEntrega} hoy={hoy} enfasis={hecho ? "ninguno" : "suave"} />
                  </Td>
                  <Td className="whitespace-nowrap text-right font-medium text-text">
                    {total > 0 ? fmtMin(total) : <span className="text-text-muted">—</span>}
                  </Td>
                </tr>
                {abierto && (
                  <tr className="border-b border-border bg-surface-2/60 last:border-0">
                    <td colSpan={10} className="px-3 py-3">
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
        <Dato label="Solicitado">
          <Fecha iso={p.fechaSolicitud} hoy={hoy} enfasis="ninguno" />
        </Dato>
        <Dato label="Planificado">
          <Fecha iso={p.fechaPlanificacion} hoy={hoy} />
        </Dato>
        <Dato label="Entrega">
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
