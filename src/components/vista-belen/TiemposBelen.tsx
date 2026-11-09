"use client";

import { useState } from "react";
import { fmtMinEnteros } from "@/lib/estado";
import {
  enFrase,
  fechaCorta,
  type EstadoOperacion,
  type PersonaTiempos,
  type TareaTiempos,
  type TiemposPedido,
} from "@/lib/vista-belen";

// ─── Tareas y tiempos del pedido, en la pantalla de Belén ────────────────────
// Dos maneras de mirar lo mismo:
//   · Por tarea: OF → tarea → quién y cuánto; al desplegar, cada fichaje.
//   · Por persona: quién, cuánto y qué días; al desplegar, cada fichaje con
//     la OF y la tarea.
// Todo cerrado al entrar: con 20 tareas abiertas no se ve nada. Se despliega
// lo que interesa.

const ESTADO: Record<EstadoOperacion, { texto: string; clase: string }> = {
  finalizado: { texto: "Finalizado", clase: "text-emerald-700 dark:text-emerald-300" },
  interrumpido: { texto: "Interrumpido", clase: "text-amber-700 dark:text-amber-300" },
  sin_empezar: { texto: "Sin empezar", clase: "text-text-muted" },
};

const min = (m: number) => (m > 0 ? fmtMinEnteros(m) : "0m");

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
    <span aria-hidden className={`inline-block w-3 text-text-muted transition-transform motion-reduce:transition-none ${abierta ? "rotate-90" : ""}`}>
      ▸
    </span>
  );
}

function FilaTarea({ t }: { t: TareaTiempos }) {
  const [abierta, setAbierta] = useState(false);
  const e = ESTADO[t.estado];
  const conFichajes = t.personas.length > 0;
  return (
    <li className="border-t border-border first:border-t-0">
      <button
        type="button"
        disabled={!conFichajes}
        aria-expanded={conFichajes ? abierta : undefined}
        onClick={() => setAbierta((v) => !v)}
        className="grid w-full grid-cols-[1rem_2.2rem_minmax(0,1fr)_6.5rem_5rem] items-baseline gap-x-2 px-4 py-1.5 text-left text-[13px] enabled:hover:bg-[var(--hero-relleno)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus min-[1000px]:grid-cols-[1rem_2.2rem_minmax(0,1.3fr)_minmax(0,1.4fr)_6.5rem_5rem]"
      >
        <span>{conFichajes && <Flecha abierta={abierta} />}</span>
        <span className="text-right tabular-nums text-text-muted">{t.codigo}</span>
        <span className="min-w-0">
          <span className="block truncate" title={enFrase(t.descripcion)}>
            {enFrase(t.descripcion)}
          </span>
          {t.maquina && <span className="text-[11px] text-text-muted">{t.maquina}</span>}
        </span>
        {/* Quién, en la misma línea en pantallas de 1000 px o más. */}
        <span className="hidden min-w-0 truncate text-[12.5px] text-text-muted min-[1000px]:block">
          {t.personas.map((p) => `${p.persona} ${min(p.minutos)}`).join(" · ") || "Nadie ha fichado"}
        </span>
        <span className={`text-[11.5px] font-semibold ${e.clase}`}>{e.texto}</span>
        <span className="text-right font-semibold tabular-nums">{conFichajes ? min(t.minutos) : "—"}</span>
      </button>
      {abierta && (
        <div className="bg-[var(--detalle)] px-4 pb-2.5 pl-[4.4rem] pt-1.5">
          {t.personas.map((p) => (
            <div key={p.persona} className="mt-1 first:mt-0">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="font-semibold">{p.persona}</span>
                <span className="font-semibold tabular-nums">{min(p.minutos)}</span>
              </div>
              <ul className="mt-0.5 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,9.5rem))] gap-x-6 gap-y-0.5 text-[12.5px] text-text-muted">
                {p.fichajes.map((f, i) => (
                  <li key={i} className="flex justify-between gap-2 tabular-nums">
                    <span>
                      {fechaCorta(f.dia)}
                      {f.hora && <span className="ml-1.5">{f.hora}</span>}
                    </span>
                    <span>{min(f.minutos)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

function FilaPersona({ p }: { p: PersonaTiempos }) {
  const [abierta, setAbierta] = useState(false);
  const rango =
    p.primerDia && p.ultimoDia && p.primerDia !== p.ultimoDia
      ? `del ${fechaCorta(p.primerDia)} al ${fechaCorta(p.ultimoDia)}`
      : p.primerDia
        ? `el ${fechaCorta(p.primerDia)}`
        : "";
  return (
    <li className="border-t border-border first:border-t-0">
      <button
        type="button"
        aria-expanded={abierta}
        onClick={() => setAbierta((v) => !v)}
        className="grid w-full grid-cols-[1rem_minmax(0,1fr)_minmax(0,1.3fr)_5rem] items-baseline gap-x-2 px-4 py-2 text-left text-[13px] hover:bg-[var(--hero-relleno)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
      >
        <Flecha abierta={abierta} />
        <span className="truncate font-semibold">{p.persona}</span>
        <span className="truncate text-[12.5px] text-text-muted">
          {p.dias} {p.dias === 1 ? "día" : "días"} {rango} · {p.fichajes.length} {p.fichajes.length === 1 ? "fichaje" : "fichajes"}
        </span>
        <span className="text-right font-semibold tabular-nums">{min(p.minutos)}</span>
      </button>
      {abierta && (
        // Por día: el día con su total y, debajo, cada fichaje. Los de 0
        // minutos (abrir la tarea sin echarle tiempo) se ven, pero apagados.
        <div className="bg-[var(--detalle)] pb-2 pt-1">
          {porDia(p.fichajes).map(([dia, fichajes]) => (
            <section key={dia} aria-label={fechaCorta(dia)} className="px-4 pl-[2.6rem] pt-1.5">
              <div className="flex justify-between border-b border-border pb-0.5 text-[12.5px] font-semibold">
                <span className="tabular-nums">{fechaLarga(dia)}</span>
                <span className="tabular-nums">{min(fichajes.reduce((s, f) => s + f.minutos, 0))}</span>
              </div>
              <table className="w-full table-fixed text-[12.5px]">
                {/* Los anchos van en <col>: con table-fixed manda la primera fila,
                    y la cabecera es solo para lectores de pantalla. */}
                <colgroup>
                  <col className="w-14" />
                  <col className="w-20" />
                  <col />
                  <col className="w-16" />
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
                    <tr key={i} className={f.minutos > 0 ? "text-text" : "text-text-muted opacity-70"}>
                      <td className="w-14 py-px tabular-nums text-text-muted">{f.hora ?? "—"}</td>
                      <td className="w-20 py-px font-mono">{f.of}</td>
                      <td className="truncate py-px" title={enFrase(f.descripcion)}>
                        <span className="tabular-nums text-text-muted">{f.tarea}</span> {enFrase(f.descripcion)}
                      </td>
                      <td className="w-16 py-px text-right tabular-nums">{min(f.minutos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </li>
  );
}

export function TiemposBelen({ tiempos }: { tiempos: TiemposPedido }) {
  const [modo, setModo] = useState<"tarea" | "persona">("tarea");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div role="group" aria-label="Ver por" className="inline-flex rounded-full bg-[var(--hero-relleno)] p-[3px]">
          {(
            [
              ["tarea", "Por tarea"],
              ["persona", "Por persona"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={modo === id}
              onClick={() => setModo(id)}
              className={`h-7 rounded-full px-3 text-[13px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                modo === id ? "bg-surface text-text shadow-[var(--hero-sombra-pildora)]" : "text-text-muted hover:text-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-text-muted">
          Total fichado en el pedido: <span className="font-bold text-text tabular-nums">{min(tiempos.minutos)}</span>
          {" · "}
          {tiempos.personas.length} {tiempos.personas.length === 1 ? "persona" : "personas"}
        </p>
      </div>

      {modo === "tarea" ? (
        tiempos.ofs.map((of) => (
          <section key={of.of} aria-label={`OF ${of.of}`} className="tarjeta-of overflow-hidden rounded-3xl bg-surface">
            <header className="flex items-baseline gap-3 px-4 pb-1.5 pt-3">
              <span className="font-mono text-[14px] font-bold">{of.of}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-text-muted">{enFrase(of.descripcion)}</span>
              <span className="text-[13px] font-bold tabular-nums">{min(of.minutos)}</span>
            </header>
            <ul>
              {of.tareas.map((t) => (
                <FilaTarea key={t.codigo} t={t} />
              ))}
            </ul>
          </section>
        ))
      ) : tiempos.personas.length ? (
        <section aria-label="Tiempo por persona" className="tarjeta-of overflow-hidden rounded-3xl bg-surface py-1">
          <ul>
            {tiempos.personas.map((p) => (
              <FilaPersona key={p.persona} p={p} />
            ))}
          </ul>
        </section>
      ) : (
        <p className="px-1 text-sm text-text-muted">Nadie ha fichado todavía en este pedido.</p>
      )}
    </div>
  );
}
