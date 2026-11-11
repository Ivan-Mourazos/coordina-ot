"use client";

import { useState } from "react";
import {
  enFrase,
  fechaCorta,
  fmtDuracion,
  type PersonaTiempos,
  type TareaTiempos,
} from "@/lib/vista-belen";
import { Desplegable } from "../Desplegable";
import { CaraPersona, colorDePersona } from "./CaraPersona";

// ─── Los fichajes del pedido, en la pantalla de Belén ────────────────────────
// Antes, una pestaña «Tareas y tiempos» con dos vistas. Desde el 11/11/2026
// (Iván: «si al desplegar la OF salen los tiempos, ¿para qué la pestaña?»):
//   · Por tarea → FichajesDeTarea, dentro de cada tarea de la OF desplegada.
//   · Por persona → TiemposPorPersona, plegado al final del resumen.
// Tiempos exactos de RPS (inicio y fin), sin los fichajes de menos de 1 min.


// Tiempos EXACTOS de RPS (inicio y fin del fichaje), sin redondear; los de
// menos de un minuto ya no llegan (lib/server/rps-belen-comun.ts).
const min = fmtDuracion;
const franja = (f: { hora: string | null; horaFin?: string | null }) =>
  f.hora ? (f.horaFin && f.horaFin !== f.hora ? `${f.hora}–${f.horaFin}` : f.hora) : "—";

/** Los fichajes (ya en orden) agrupados por día, conservando el orden. */
function porDia<T extends { dia: string }>(fichajes: readonly T[]): Array<[string, T[]]> {
  const dias = new Map<string, T[]>();
  for (const f of fichajes) dias.set(f.dia, [...(dias.get(f.dia) ?? []), f]);
  return [...dias];
}

/** «mié 01/10/26»: con el día de la semana se sitúa uno antes que con la fecha. */
function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const semana = new Date(Date.UTC(a, m - 1, d)).toLocaleDateString("es-ES", { weekday: "short", timeZone: "UTC" });
  return `${semana} ${fechaCorta(iso)}`;
}

function Flecha({ abierta }: { abierta: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block w-3 text-text-muted transition-transform duration-200 motion-reduce:transition-none ${abierta ? "rotate-90" : ""}`}
    >
      ▸
    </span>
  );
}


const FILA =
  "w-full text-left transition-[background-color,transform] enabled:hover:bg-[var(--hero-relleno)] enabled:active:scale-[.995] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus motion-reduce:transition-none";

/** Los fichajes de una persona, una LÍNEA POR DÍA: el día una sola vez, cada
 *  fichaje como una pastilla «07:33–07:39 · 5m 36s» y el total del día al
 *  final (Iván, 10/11/2026). */
function FichajesPorDia({ fichajes }: { fichajes: readonly { dia: string; hora: string | null; horaFin?: string | null; minutos: number }[] }) {
  const dias = porDia(fichajes);
  return (
    <ul className="mt-1 flex flex-col gap-1 pl-7">
      {dias.map(([dia, delDia]) => (
        <li key={dia} className="flex items-start gap-3 text-[12.5px]">
          <span className="w-[5.5rem] shrink-0 pt-0.5 tabular-nums text-text-muted">{fechaLarga(dia)}</span>
          <span className="flex min-w-0 flex-1 flex-wrap gap-1">
            {delDia.map((f, i) => (
              <span
                key={i}
                className="whitespace-nowrap rounded-lg bg-surface px-2 py-0.5 font-medium tabular-nums text-text shadow-[var(--hero-sombra-campo)]"
              >
                {franja(f)} · <b className="font-bold">{min(f.minutos)}</b>
              </span>
            ))}
          </span>
          {/* Con un solo día, su total es el de la persona: no se repite. */}
          {dias.length > 1 && (
            <span className="shrink-0 whitespace-nowrap pt-0.5 font-semibold tabular-nums text-text-muted">
              {min(delDia.reduce((s, x) => s + x.minutos, 0))}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Quién fichó en una tarea y cuándo: cada persona con su total y, debajo,
 *  sus fichajes por día con la franja horaria. Va dentro del desplegable de la
 *  tarea, en la ficha de la OF. */
export function FichajesDeTarea({ tarea }: { tarea: TareaTiempos }) {
  if (!tarea.personas.length) return <p className="text-[12.5px] text-text-muted">Nadie ha fichado en esta tarea.</p>;
  return (
    <div className="flex flex-col gap-2">
      {tarea.personas.map((p) => (
        <div key={p.persona}>
          <div className="flex items-center gap-2 text-[13px]">
            <CaraPersona nombre={p.persona} tamano="xs" />
            <span className="font-semibold">{p.persona}</span>
            <span className="ml-auto font-bold tabular-nums">{min(p.minutos)}</span>
          </div>
          <FichajesPorDia fichajes={p.fichajes} />
        </div>
      ))}
    </div>
  );
}

function FilaPersona({
  p,
  total,
  abierta,
  onAlternar,
}: {
  p: PersonaTiempos;
  total: number;
  abierta: boolean;
  onAlternar: () => void;
}) {
  const rango =
    p.primerDia && p.ultimoDia && p.primerDia !== p.ultimoDia
      ? `del ${fechaCorta(p.primerDia)} al ${fechaCorta(p.ultimoDia)}`
      : p.primerDia
        ? `el ${fechaCorta(p.primerDia)}`
        : "";
  const parte = total > 0 ? Math.max(2, Math.round((p.minutos / total) * 100)) : 0;
  return (
    <li className="border-t border-border first:border-t-0">
      <button
        type="button"
        aria-expanded={abierta}
        onClick={onAlternar}
        className={`${FILA} grid grid-cols-[1rem_1.75rem_minmax(0,1fr)_minmax(0,1.4fr)_5rem] items-center gap-x-2.5 px-4 py-2.5 text-[13px]`}
      >
        <Flecha abierta={abierta} />
        <CaraPersona nombre={p.persona} />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{p.persona}</span>
          <span className="block truncate text-[11.5px] text-text-muted">
            {p.dias} {p.dias === 1 ? "día" : "días"} {rango} · {p.fichajes.length}{" "}
            {p.fichajes.length === 1 ? "fichaje" : "fichajes"}
          </span>
        </span>
        {/* Cuánto del pedido lleva esta persona, en su color. */}
        <span className="flex items-center gap-2" title={`${parte} % del tiempo del pedido`}>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--hero-relleno)]">
            <span className="block h-full rounded-full" style={{ width: `${parte}%`, background: colorDePersona(p.persona) }} />
          </span>
          <span className="w-9 text-right text-[11.5px] tabular-nums text-text-muted">{parte} %</span>
        </span>
        <span className="text-right font-bold tabular-nums">{min(p.minutos)}</span>
      </button>
      <Desplegable abierto={abierta}>
        {/* Por día: el día con su total y, debajo, cada fichaje con su franja. */}
        <div className="bg-[var(--detalle)] pb-2 pt-1">
          {porDia(p.fichajes).map(([dia, fichajes]) => (
            <section key={dia} aria-label={fechaCorta(dia)} className="px-4 pl-[3.6rem] pt-1.5">
              <div className="flex justify-between border-b border-border pb-0.5 text-[12.5px] font-semibold">
                <span className="tabular-nums">{fechaLarga(dia)}</span>
                <span className="tabular-nums">{min(fichajes.reduce((s, f) => s + f.minutos, 0))}</span>
              </div>
              <table className="w-full table-fixed text-[12.5px]">
                {/* Los anchos van en <col>: con table-fixed manda la primera fila,
                    y la cabecera es solo para lectores de pantalla. */}
                <colgroup>
                  <col className="w-24" />
                  <col className="w-20" />
                  <col />
                  <col className="w-20" />
                </colgroup>
                <thead className="sr-only">
                  <tr>
                    <th>Hora</th>
                    <th>OF</th>
                    <th>Tarea</th>
                    <th>Tiempo</th>
                  </tr>
                </thead>
                <tbody>
                  {fichajes.map((f, i) => (
                    <tr key={i}>
                      <td className="py-px tabular-nums text-text-muted">{franja(f)}</td>
                      <td className="py-px font-mono">{f.of}</td>
                      <td className="truncate py-px" title={enFrase(f.descripcion)}>
                        <span className="tabular-nums text-text-muted">{f.tarea}</span> {enFrase(f.descripcion)}
                      </td>
                      <td className="whitespace-nowrap py-px text-right tabular-nums">{min(f.minutos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </Desplegable>
    </li>
  );
}

/** Tiempo por persona: quién, cuánto y qué días; al desplegar, cada fichaje
 *  con su tarea. Antes era la vista «Por persona» de la pestaña «Tareas y
 *  tiempos»; ahora es el «Por persona» de cada OF desplegada. */
export function TiemposPorPersona({ personas, total }: { personas: readonly PersonaTiempos[]; total: number }) {
  // Una persona abierta a la vez (Iván, 10/11/2026).
  const [abierta, setAbierta] = useState<string | null>(null);
  if (!personas.length) return <p className="py-2 text-[12.5px] text-text-muted">Nadie ha fichado todavía.</p>;
  return (
    <ul>
      {personas.map((p) => (
        <FilaPersona
          key={p.persona}
          p={p}
          total={total}
          abierta={abierta === p.persona}
          onAlternar={() => setAbierta((a) => (a === p.persona ? null : p.persona))}
        />
      ))}
    </ul>
  );
}
