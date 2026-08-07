"use client";

import { Fragment, useState } from "react";
import type { OF, Operario, Pedido } from "@/lib/types";
import { estaFinalizado, familiasDe, hoyISO, tiempoTotalOF } from "@/lib/types";
import { ESTADO, fmtMin, PRIORIDAD } from "@/lib/estado";
import { FASES, faseDePedido } from "@/lib/fases-tablero";
import { diasEntre, relativoA, type TonoFecha } from "@/lib/fechas";
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

/** Color de cada tramo del recorrido. Escalada, no degradado: el pedido
 *  cambia de tramo un día concreto, y verlo cambiar de golpe es la
 *  información. Hex y no clases de Tailwind porque van en un `style`. */
// OJO con el significado: la fecha límite de OT es la PLANIFICADA, no la
// solicitada. Es el día en que el pedido debería estar planteado, así que
// pasarla ya es ir tarde aunque a Producción le sobren tres semanas. Por eso
// la escalada arranca ahí y no al final.
const TRAMO = {
  /** Hasta la planificación: OT llega a tiempo. */
  holgado: "#10b981",
  /** Pasada la planificación: OT ya va tarde, pero Producción aún llega. */
  trabajo: "#f59e0b",
  /** Pasada la fabricación: el retraso se come el margen de Producción. */
  ajustado: "#dc2626",
  /** Pasada la solicitada. Fuera de la escalada a propósito: no es "más
   *  rojo", es otra cosa — la fecha ya se incumplió. */
  fuera: "#9333ea",
} as const;

/** Los tramos de la línea, ya recortados a [0, 100].
 *
 *  Se calcula aquí y no en el pintado porque RPS da las fechas desordenadas
 *  (la fabricación puede caer después de la solicitada) y un tramo al revés
 *  dibujaría un trozo de ancho negativo. */
export function tramosRecorrido(
  pctPlanificacion: number,
  pctFabricacion: number | undefined,
): { desde: number; hasta: number; color: string }[] {
  const corte = (n: number) => Math.max(0, Math.min(100, n));
  const p = corte(pctPlanificacion);
  const f = pctFabricacion === undefined ? p : Math.max(p, corte(pctFabricacion));
  return [
    { desde: 0, hasta: p, color: TRAMO.holgado },
    { desde: p, hasta: f, color: TRAMO.trabajo },
    { desde: f, hasta: 100, color: TRAMO.ajustado },
  ].filter((t) => t.hasta > t.desde);
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
  const etiquetas = repartirEtiquetas(
    hitos.map((h) => h.pct),
    ANCHO_FECHA_PCT,
    ANCHO_FECHA_PCT / 2,
  );
  const tramos = tramosRecorrido(
    hitos.find((h) => h.clave === "planificacion")?.pct ?? 0,
    hitos.find((h) => h.clave === "fabricacion")?.pct,
  );
  // El retraso que le importa a OT se cuenta desde la PLANIFICADA: ese es el
  // día en que el pedido debería estar planteado. La solicitada es la del
  // cliente y llega mucho después; medir contra ella diría "vas bien" con el
  // planteo dos semanas pasado de fecha.
  const diasTarde = diasEntre(pedido.fechaPlanificacion, hoy);
  const vencido = diasParaEntrega < 0;

  return (
    <div className="flex w-[260px] items-end gap-1.5 pb-0.5 pt-1">
      <div className="min-w-0 flex-1">
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
        {/* El color dice EN QUÉ TRAMO va el pedido, no cuánto lleva: verde
            hasta la planificación (hay margen), naranja mientras el trabajo es
            de OT, rojo en el último tramo. Cortes secos, no degradado: el
            pedido cambia de tramo un día concreto y verlo saltar ES el dato.

            Lo ya recorrido va a todo color y lo que queda apagado, así se ven
            a la vez el plan entero y por dónde se va. */}
        {tramos.map((t) => (
          <div
            key={t.color}
            className="absolute top-[3px] h-0.5"
            style={{
              left: `${t.desde}%`,
              width: `${t.hasta - t.desde}%`,
              background: t.color,
              // Opaco solo si ya está andado ENTERO; el que hoy parte por la
              // mitad se pinta apagado y encima va su trozo andado.
              opacity: t.hasta <= hoyPct ? 1 : 0.28,
            }}
          />
        ))}
        {/* El tramo que hoy parte por la mitad: la parte ya andada, opaca. */}
        {tramos
          .filter((t) => t.desde < hoyPct && t.hasta > hoyPct)
          .map((t) => (
            <div
              key={`${t.color}-andado`}
              className="absolute top-[3px] h-0.5"
              style={{
                left: `${t.desde}%`,
                width: `${hoyPct - t.desde}%`,
                background: t.color,
              }}
            />
          ))}
        {hitos.map((h) => (
          <span
            key={h.clave}
            className="absolute top-0 size-2 -translate-x-1/2 rounded-full bg-border-strong"
            style={{ left: `${h.pct}%` }}
          />
        ))}
        {/* Hoy: el único que se mueve. Sin color propio —el tramo ya lo dice—
            salvo cuando se sale de la línea, que ahí el morado es la señal.
            Más grande que los hitos y con anillo del fondo para despegarlo. */}
        <span
          className="absolute top-[-1px] size-2.5 -translate-x-1/2 rounded-full ring-2 ring-surface"
          style={{
            left: `${hoyPct}%`,
            background: vencido ? TRAMO.fuera : "var(--text)",
            opacity: hoyFuera && !vencido ? 0.5 : 1,
          }}
          title={
            vencido
              ? `Hoy · fuera de fecha, ${-diasParaEntrega} d pasada la solicitada`
              : `Hoy · quedan ${diasParaEntrega} d`
          }
        />
        </div>
      </div>

      {/* Cuánto se ha pasado OT de SU fecha. El número no cabe en la línea
          —hoy se queda pegado al extremo cuando se sale— así que se dice
          aparte. El morado avisa además de que la entrega al cliente ya no se
          cumple: está fuera de la escalada verde-naranja-rojo a propósito,
          porque no es "va muy justo", es que la fecha ya se incumplió. */}
      {diasTarde > 0 && (
        <span
          className="shrink-0 rounded px-1 py-px text-[9px] font-bold leading-none text-white"
          style={{ background: vencido ? TRAMO.fuera : TRAMO.trabajo }}
          title={
            vencido
              ? `${diasTarde} días pasada la planificada — y la entrega solicitada era hace ${-diasParaEntrega}`
              : `${diasTarde} días pasada la fecha planificada para plantearlo`
          }
        >
          +{diasTarde}d
        </span>
      )}
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
