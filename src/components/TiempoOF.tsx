"use client";

import type { OF, Operario } from "@/lib/types";
import { tiempoTotalOF } from "@/lib/types";
import { fmtMin } from "@/lib/estado";
import { fmtFechaLarga } from "@/lib/fechas";
import { nombreRps } from "@/lib/nombre-rps";
import { OpDot } from "./Select";

// ─── El tiempo de una OF, en UN solo sitio ───────────────────────────────────
// Estaba dicho cuatro veces en la misma tarjeta, con los mismos números:
//
//   Autor    [Adrián]                    planteo 2h 05m   ← lo fichado en la web
//   Revisor  [Tamara]                   revisión    30m   ← lo fichado en la web
//   YA FICHADO EN RPS · Adrián 2h 10m                     ← lo del terminal
//   Total 2h 40m / est. 3h                                ← la suma
//   RPS 2h 10m · CoordinaOT 2h 35m — el mismo trabajo     ← las dos otra vez
//
// Las dos últimas líneas no añadían nada: repetían, sumadas, lo que ya estaba
// en las tres de arriba. Y para saber si una persona había echado su rato aquí
// o en la herramienta vieja había que emparejar de cabeza el nombre de la línea
// de rol con el del bloque de RPS.
//
// Ahora es una tabla: una fila por PERSONA y una columna por HERRAMIENTA. Se lee
// de un vistazo quién ha tocado la OF, cuánto y dónde lo apuntó, que son las
// tres preguntas. Las líneas de Autor y Revisor se quedan arriba diciendo de
// quién es la OF —que es otra cosa: el encargo, no el trabajo hecho— y ya sin
// minutos.

interface Fila {
  clave: string;
  nombre: string;
  /** Operario de OT, si lo es: para el punto de color. */
  op: Operario | null;
  rpsMin: number;
  webMin: number;
  /** Día de su primera imputación en RPS, si RPS lo da. */
  desde?: string;
  /** Qué hizo en la web. RPS no distingue roles (no hay tarea de revisión en su
   *  ruta), así que esto solo se sabe de lo fichado aquí. */
  soloRevision: boolean;
}

/** Junta los dos registros por persona. La clave es el operario de OT cuando se
 *  le reconoce, y el empleado de RPS cuando no: así el mismo Adrián no sale dos
 *  veces por venir de dos sitios. */
function filas(of: OF, opById: (id: string | null) => Operario | null): Fila[] {
  const m = new Map<string, Fila>();
  const dame = (clave: string, nombre: string, op: Operario | null): Fila => {
    let f = m.get(clave);
    if (!f) {
      f = { clave, nombre, op, rpsMin: 0, webMin: 0, soloRevision: false };
      m.set(clave, f);
    }
    return f;
  };

  for (const i of of.imputaciones ?? []) {
    const op = opById(i.operarioId);
    const f = dame(i.operarioId ?? `rps:${i.empleado}`, op?.nombre ?? nombreRps(i.nombre), op);
    f.rpsMin += i.minutos;
    if (i.desde && (!f.desde || i.desde < f.desde)) f.desde = i.desde;
  }
  for (const w of of.fichadoWeb ?? []) {
    const op = opById(w.operarioId);
    const f = dame(w.operarioId, op?.nombre ?? w.operarioId, op);
    f.webMin += w.planteoMin + w.revisionMin;
    if (w.revisionMin > 0 && w.planteoMin === 0) f.soloRevision = true;
  }
  return [...m.values()].sort((a, b) => b.rpsMin + b.webMin - (a.rpsMin + a.webMin));
}

export function TiempoOF({
  of,
  opById,
  dobleFichaje,
}: {
  of: OF;
  opById: (id: string | null) => Operario | null;
  /** OT ficha también en la herramienta vieja: las dos columnas cuentan el
   *  mismo rato y NO se suman (ver `aplicarTiemposFichaje`). */
  dobleFichaje: boolean;
}) {
  const gente = filas(of, opById);
  const total = tiempoTotalOF(of);
  const hayWeb = gente.some((f) => f.webMin > 0);
  const hayRps = gente.some((f) => f.rpsMin > 0);
  // Las dos columnas SOLO durante el doble fichaje, y solo si hay algo en las
  // dos. Una columna de guiones no dice nada.
  //
  // Fuera del periodo de pruebas no se parten: ya no son dos herramientas
  // contando lo mismo, sino dos momentos de la MISMA cuenta —lo que ya subió a
  // RPS y lo que todavía no— y el worker de OLANET tarda un minuto en igualarlo.
  // Enseñarlo partido invitaba a sumar dos números que son el mismo trabajo, y
  // encima sin la frase que lo explicaba (esa ya iba atada a `dobleFichaje`, así
  // que en activo desaparecía y las columnas se quedaban mudas).
  const dosColumnas = dobleFichaje && hayWeb && hayRps;
  const pasado = of.tiempoEstimadoMin > 0 && total > of.tiempoEstimadoMin;

  return (
    <div className="mt-2 rounded-lg bg-surface-2/70 px-2 py-1.5">
      <div className="flex items-baseline gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          Tiempo
        </p>
        <p className="ml-auto text-[11px]">
          <b className={`font-semibold ${pasado ? "text-amber-700 dark:text-amber-300" : "text-text"}`}>
            {fmtMin(total)}
          </b>
          {of.tiempoEstimadoMin > 0 && (
            <span className="text-text-muted"> / est. {fmtMin(of.tiempoEstimadoMin)}</span>
          )}
        </p>
      </div>

      {gente.length === 0 ? (
        <p className="mt-1 text-[11px] text-text-muted">Todavía no se ha fichado nada en esta OF.</p>
      ) : (
        <>
          {dosColumnas && (
            <div className="mt-1 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-wide text-text-muted">
              <span className="flex-1" />
              <span className="w-14 text-right" title="Lo fichado en el terminal de siempre">
                RPS
              </span>
              <span className="w-14 text-right" title="Lo fichado en CoordinaOT">
                Aquí
              </span>
            </div>
          )}
          <ul className="mt-0.5 space-y-0.5">
            {gente.map((f) => (
              <li key={f.clave} className="flex items-center gap-2 text-[11px]">
                {f.op ? (
                  <OpDot color={f.op.color} iniciales={f.op.iniciales} />
                ) : (
                  // Quien no está en el mapa de operarios de OT no tiene color
                  // ni iniciales nuestras, pero el tiempo es suyo y tiene que
                  // verse: un hueco del mismo tamaño para que no bailen las filas.
                  <span className="size-4.5 shrink-0 rounded-full ring-1 ring-inset ring-border" />
                )}
                <span className="min-w-0 flex-1 truncate text-text">
                  {f.nombre}
                  {f.soloRevision && (
                    <span className="ml-1 text-text-muted" title="Solo ha fichado revisión">
                      · revisión
                    </span>
                  )}
                  {f.desde && (
                    <span
                      className="ml-1 text-text-muted"
                      title="Primera vez que fichó en esta OF, según RPS"
                    >
                      desde {fmtFechaLarga(f.desde)}
                    </span>
                  )}
                </span>
                {dosColumnas ? (
                  <>
                    <span className="w-14 shrink-0 text-right tabular-nums text-text">
                      {f.rpsMin > 0 ? fmtMin(f.rpsMin) : "—"}
                    </span>
                    <span className="w-14 shrink-0 text-right tabular-nums text-text">
                      {f.webMin > 0 ? fmtMin(f.webMin) : "—"}
                    </span>
                  </>
                ) : (
                  <span className="shrink-0 font-semibold tabular-nums text-text">
                    {fmtMin(f.rpsMin + f.webMin)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {/* La única frase que hace falta, y solo cuando de verdad hay dos
              cuentas del mismo rato. Sin ella, ver 2h 10m y 2h 05m en la misma
              fila se lee como 4h 15m de trabajo. */}
          {dosColumnas && (
            <p className="mt-1 text-[10px] leading-snug text-text-muted">
              Periodo de pruebas: lo mismo se ficha en los dos sitios, así que las dos
              columnas hablan del mismo rato y no se suman. El total lleva la mayor.
            </p>
          )}
        </>
      )}
    </div>
  );
}
