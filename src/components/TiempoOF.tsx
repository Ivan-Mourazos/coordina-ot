"use client";

import type { FichandoAhora, OF, Operario } from "@/lib/types";
import { fmtMin, fmtMinEnteros, ROL } from "@/lib/estado";
import { LiveDot } from "./LiveBadge";
import { RelojVivo } from "./RelojVivo";
import { OpDot } from "./Select";

// En minutos enteros (ver `fmtMinEnteros`): lo que corre al segundo es el reloj.
const enMinutos = fmtMinEnteros;

// ─── El tiempo de una OF, en la ficha de Pendientes ──────────────────────────
// LO FICHADO EN LA WEB, Y PARTIDO EN PLANTEAR Y REVISIÓN (Iván, 16/10/2026).
//
// Antes juntaba lo de la web con lo del terminal de RPS, en una o dos
// columnas según el periodo de pruebas, y sin decir de qué rol era cada
// minuto. Aquí, con la OF en marcha, lo que se pregunta es cuánto lleva el
// planteo y cuánto la revisión de lo que se está haciendo ahora; lo de RPS ya
// sale en el Historial y en «Tareas y tiempos».
//
// Una fila por persona y una columna por rol. Quien está fichando lleva su
// reloj, al segundo, en la columna de lo que está haciendo: al lado de sus
// minutos salían «● 0:00:07  0m», dos cuentas que parecían distintas.

interface Fila {
  operarioId: string;
  op: Operario | null;
  planteoMin: number;
  revisionMin: number;
  vivo?: FichandoAhora;
}

function filas(of: OF, opById: (id: string | null) => Operario | null): Fila[] {
  const m = new Map<string, Fila>();
  const dame = (id: string) => {
    let f = m.get(id);
    if (!f) {
      f = { operarioId: id, op: opById(id), planteoMin: 0, revisionMin: 0 };
      m.set(id, f);
    }
    return f;
  };
  // TODO lo fichado en la web, también lo ya traspasado a RPS (ver
  // `OF.fichadoWebTodo`); `fichadoWeb` solo si el servidor aún no lo manda.
  for (const w of of.fichadoWebTodo ?? of.fichadoWeb ?? []) {
    const f = dame(w.operarioId);
    f.planteoMin += w.planteoMin;
    f.revisionMin += w.revisionMin;
  }
  // Quien acaba de pulsar Fichar aún no suma un minuto, pero ya está aquí.
  for (const v of of.fichandoAhora ?? []) dame(v.operarioId).vivo = v;
  return [...m.values()].sort((a, b) => b.planteoMin + b.revisionMin - (a.planteoMin + a.revisionMin));
}

/** Una celda: los minutos, o el reloj si esa persona está fichando ESE rol. */
function Celda({ min, vivo }: { min: number; vivo: FichandoAhora | undefined }) {
  if (vivo)
    return (
      <span
        className={`flex w-[4.75rem] shrink-0 items-center justify-end gap-1 font-semibold ${ROL[vivo.rol].texto}`}
        title={`${vivo.rol === "revisar" ? "Revisando" : "Planteando"} ahora${
          (vivo.parte ?? 1) < 1
            ? ` ${Math.round(1 / (vivo.parte ?? 1))} OF a la vez: a esta le toca su parte, y su reloj va más despacio`
            : ""
        }`}
      >
        {/* Con varias OF en el mismo reloj, esta OF suma solo su parte: sin
            decirlo, su contador avanzando un segundo de cada tres parecía
            atascado. */}
        {(vivo.parte ?? 1) < 1 && (
          <span className="font-normal text-text-muted">÷{Math.round(1 / (vivo.parte ?? 1))}</span>
        )}
        <LiveDot rol={vivo.rol} className="size-1.5" />
        <RelojVivo desde={vivo.desde} previoSeg={vivo.previoSeg} parte={vivo.parte} />
      </span>
    );
  return (
    <span className={`w-[4.75rem] shrink-0 text-right tabular-nums ${min > 0 ? "text-text" : "text-text-muted"}`}>
      {min > 0 ? enMinutos(min) : "—"}
    </span>
  );
}

export function TiempoOF({
  of,
  opById,
  sinRevision = false,
}: {
  of: OF;
  opById: (id: string | null) => Operario | null;
  /** La sección no revisa (Diseño, Impresión): sin columna de revisión,
   *  salvo que la OF traiga tiempo de revisión de antes, que no se esconde. */
  sinRevision?: boolean;
}) {
  const gente = filas(of, opById);
  const planteo = gente.reduce((n, f) => n + f.planteoMin, 0);
  const revision = gente.reduce((n, f) => n + f.revisionMin, 0);
  const total = planteo + revision;
  const pasado = of.tiempoEstimadoMin > 0 && total > of.tiempoEstimadoMin;
  const conRevision = !sinRevision || revision > 0;

  return (
    // `detalle-hundido` y no `recuadro`: dentro de la tarjeta de la OF, el
    // hundido de siempre (casi negro en oscuro) era un agujero y lo que más
    // llamaba de la ficha, siendo un dato de consulta. Este es un escalón
    // menos, el del interior de las filas desplegadas (Iván, 16/10/2026).
    <div className="detalle-hundido mt-2 rounded-lg px-2 py-1.5">
      <div className="flex items-baseline gap-2">
        <p
          className="text-[10px] font-semibold uppercase tracking-wide text-text-muted"
          title="Lo fichado en Coordina. Lo del terminal de RPS está en el Historial y en «Tareas y tiempos»."
        >
          Tiempo en la web
        </p>
        <p className="ml-auto text-[11px]">
          <b className={`font-semibold ${pasado ? "text-amber-700 dark:text-amber-300" : "text-text"}`}>
            {enMinutos(total)}
          </b>
          {of.tiempoEstimadoMin > 0 && (
            <span className="text-text-muted"> / est. {fmtMin(of.tiempoEstimadoMin)}</span>
          )}
        </p>
      </div>

      {gente.length === 0 ? (
        // Fuera en pantalla baja: el "0m / est." de arriba ya lo dice, y esta
        // línea era lo que dejaba el botón de fichar por debajo del borde.
        <p className="mt-1 text-[11px] text-text-muted bajo:hidden">Todavía no se ha fichado nada en la web.</p>
      ) : (
        <>
          <div className="mt-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            <span className="flex-1" />
            <span className={`w-[4.75rem] text-right ${ROL.plantear.texto}`}>Plantear</span>
            {conRevision && <span className={`w-[4.75rem] text-right ${ROL.revisar.texto}`}>Revisión</span>}
          </div>
          <ul className="mt-0.5 space-y-0.5">
            {gente.map((f) => (
              <li key={f.operarioId} className="flex items-center gap-2 text-[11px]">
                {f.op ? (
                  <OpDot color={f.op.color} iniciales={f.op.iniciales} />
                ) : (
                  <span className="size-4.5 shrink-0 rounded-full ring-1 ring-inset ring-border" />
                )}
                <span className="min-w-0 flex-1 truncate text-text">{f.op?.nombre ?? "Nombre no disponible"}</span>
                <Celda min={f.planteoMin} vivo={f.vivo?.rol === "plantear" ? f.vivo : undefined} />
                {conRevision && <Celda min={f.revisionMin} vivo={f.vivo?.rol === "revisar" ? f.vivo : undefined} />}
              </li>
            ))}
          </ul>
          {/* La suma de cada columna, solo con más de una persona: con una,
              es su misma fila. */}
          {gente.length > 1 && (
            <div className="mt-1 flex items-center gap-2 border-t border-border pt-1 text-[11px] font-semibold text-text">
              <span className="flex-1 text-text-muted">Total</span>
              <span className="w-[4.75rem] text-right tabular-nums">{planteo > 0 ? enMinutos(planteo) : "—"}</span>
              {conRevision && <span className="w-[4.75rem] text-right tabular-nums">{revision > 0 ? enMinutos(revision) : "—"}</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
