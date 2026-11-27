"use client";

import type { FichandoAhora, OF, Operario, Rol } from "@/lib/types";
import { fmtMin, fmtMinEnteros } from "@/lib/estado";
import { LiveDot } from "./LiveBadge";
import { Pista } from "./Pista";
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
// EN LA CABECERA DE LA OF, Y EL DETALLE AL PASAR EL RATÓN (Iván, 27/11/2026,
// elegido entre maquetas de un comité). La caja «Tiempo en la web» ocupaba
// 55-80 px de cada tarjeta —con «Todavía no se ha fichado nada» cuando estaba
// vacía— y repetía el nombre que ya sale en Autor. Ahora la cabecera lleva el
// total en el color de cada fase (verde el planteo, morado la revisión) contra
// el estimado, y la tabla por persona sale en la pista.

// Colores fijos para dentro del globo: la pista es oscura en los dos temas, y
// los de `ROL[…].texto` en claro (esmeralda 800, violeta 700) no se leían.
const EN_GLOBO: Record<Rol, string> = {
  plantear: "text-emerald-300",
  revisar: "text-violet-300",
};

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
      <span className={`flex w-16 shrink-0 items-center justify-end gap-1 font-semibold ${EN_GLOBO[vivo.rol]}`}>
        {/* Con varias OF en el mismo reloj, esta OF suma solo su parte: sin
            decirlo, su contador avanzando un segundo de cada tres parecía
            atascado. */}
        {(vivo.parte ?? 1) < 1 && <span className="font-normal opacity-60">÷{Math.round(1 / (vivo.parte ?? 1))}</span>}
        <LiveDot rol={vivo.rol} className="size-1.5" />
        <RelojVivo desde={vivo.desde} previoSeg={vivo.previoSeg} parte={vivo.parte} />
      </span>
    );
  return (
    <span className={`w-16 shrink-0 text-right tabular-nums ${min > 0 ? "" : "opacity-50"}`}>
      {min > 0 ? enMinutos(min) : "—"}
    </span>
  );
}

/** Una persona por fila y una columna por rol, para el globo. */
function Tabla({
  gente,
  conRevision,
  planteo,
  revision,
  estimadoMin,
}: {
  gente: Fila[];
  conRevision: boolean;
  planteo: number;
  revision: number;
  estimadoMin: number;
}) {
  return (
    <div className="mt-1 w-72 text-[11px]">
      {gente.length === 0 ? (
        <p className="opacity-70">Todavía no se ha fichado nada en la web.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide">
            <span className="flex-1" />
            <span className={`w-16 text-right ${EN_GLOBO.plantear}`}>Plantear</span>
            {conRevision && <span className={`w-16 text-right ${EN_GLOBO.revisar}`}>Revisión</span>}
          </div>
          <ul className="mt-0.5 space-y-0.5">
            {gente.map((f) => (
              <li key={f.operarioId} className="flex items-center gap-2">
                {f.op ? (
                  <OpDot color={f.op.color} iniciales={f.op.iniciales} />
                ) : (
                  <span className="size-4.5 shrink-0 rounded-full ring-1 ring-inset ring-white/30" />
                )}
                <span className="min-w-0 flex-1 truncate">{f.op?.nombre ?? "Nombre no disponible"}</span>
                <Celda min={f.planteoMin} vivo={f.vivo?.rol === "plantear" ? f.vivo : undefined} />
                {conRevision && <Celda min={f.revisionMin} vivo={f.vivo?.rol === "revisar" ? f.vivo : undefined} />}
              </li>
            ))}
          </ul>
          {/* La suma de cada columna, solo con más de una persona: con una,
              es su misma fila. */}
          {gente.length > 1 && (
            <div className="mt-1 flex items-center gap-2 border-t border-white/15 pt-1 font-semibold">
              <span className="flex-1 opacity-70">Total</span>
              <span className="w-16 text-right tabular-nums">{planteo > 0 ? enMinutos(planteo) : "—"}</span>
              {conRevision && (
                <span className="w-16 text-right tabular-nums">{revision > 0 ? enMinutos(revision) : "—"}</span>
              )}
            </div>
          )}
        </>
      )}
      {estimadoMin > 0 && <p className="mt-1 opacity-70">Estimado: {fmtMin(estimadoMin)}</p>}
    </div>
  );
}

/** El tiempo de la OF en su cabecera: planteo en verde, revisión en morado,
 *  contra el estimado. Al pasar el ratón, quién y cuánto en cada fase. */
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
  const vivoPlanteo = gente.some((f) => f.vivo?.rol === "plantear");
  const vivoRevision = gente.some((f) => f.vivo?.rol === "revisar");
  const verPlanteo = planteo > 0 || vivoPlanteo;
  const verRevision = revision > 0 || vivoRevision;

  const leido = [
    `Tiempo en la web: ${enMinutos(planteo)} de planteo`,
    conRevision ? `, ${enMinutos(revision)} de revisión` : "",
    of.tiempoEstimadoMin > 0 ? `; estimado ${fmtMin(of.tiempoEstimadoMin)}` : "",
    pasado ? " (pasado del estimado)" : "",
  ].join("");

  return (
    <Pista
      lado="abajo"
      texto="Tiempo en la web"
      contenido={
        <Tabla
          gente={gente}
          conRevision={conRevision}
          planteo={planteo}
          revision={revision}
          estimadoMin={of.tiempoEstimadoMin}
        />
      }
    >
      {/* Sin foco propio: con la OF plegable, la cabecera entera es el botón
          que la abre, y dentro de un botón no puede ir otro elemento con foco.
          Lo que dice va en `aria-label`. */}
      <span
        role="img"
        aria-label={leido}
        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-[11px] tabular-nums"
      >
        {!verPlanteo && !verRevision ? (
          <>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3 text-text-muted" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-semibold text-text-muted">0m</span>
          </>
        ) : (
          <>
            {verPlanteo && (
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-800 dark:text-emerald-300">
                {vivoPlanteo && <LiveDot rol="plantear" className="size-1.5" />}
                {enMinutos(planteo)}
              </span>
            )}
            {verPlanteo && verRevision && <span className="text-text-muted">+</span>}
            {verRevision && (
              <span className="inline-flex items-center gap-1 font-semibold text-violet-700 dark:text-violet-300">
                {vivoRevision && <LiveDot rol="revisar" className="size-1.5" />}
                {enMinutos(revision)}
              </span>
            )}
          </>
        )}
        {of.tiempoEstimadoMin > 0 && (
          <span className={pasado ? "text-amber-700 dark:text-amber-300" : "text-text-muted"}>
            / {fmtMin(of.tiempoEstimadoMin)}
          </span>
        )}
      </span>
    </Pista>
  );
}
