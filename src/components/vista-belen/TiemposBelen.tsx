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
import { AcentoBloque } from "../AcentoBloque";
import { Desplegable } from "../Desplegable";
import { CaraPersona, colorDePersona } from "./CaraPersona";

// ─── Tareas y tiempos del pedido, en la pantalla de Belén ────────────────────
// Dos maneras de mirar lo mismo:
//   · Por tarea: OF → tarea → quién y cuánto; al desplegar, cada fichaje.
//   · Por persona: quién, cuánto y qué días; al desplegar, cada fichaje con
//     la OF y la tarea, por día.
// Arriba, las cifras del pedido. Todo cerrado al entrar: con 20 tareas
// abiertas no se ve nada; se despliega lo que interesa (con la animación de
// Coordina, Desplegable).

const ESTADO: Record<EstadoOperacion, { texto: string; clase: string; punto: string }> = {
  finalizado: { texto: "Finalizado", clase: "text-emerald-700 dark:text-emerald-300", punto: "bg-emerald-500" },
  interrumpido: { texto: "Interrumpido", clase: "text-amber-700 dark:text-amber-300", punto: "bg-amber-500" },
  sin_empezar: { texto: "Sin empezar", clase: "text-text-muted", punto: "bg-[var(--hero-relleno-encima)]" },
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
    <span
      aria-hidden
      className={`inline-block w-3 text-text-muted transition-transform duration-200 motion-reduce:transition-none ${abierta ? "rotate-90" : ""}`}
    >
      ▸
    </span>
  );
}

function Cifra({ etiqueta, valor, sub }: { etiqueta: string; valor: React.ReactNode; sub?: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-surface px-3 py-2 shadow-[var(--hero-sombra-panel)]">
      <div className="text-[11.5px] font-medium text-text-muted">{etiqueta}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[17px] font-bold leading-tight tabular-nums">{valor}</span>
        {sub && <span className="truncate text-[11.5px] text-text-muted">{sub}</span>}
      </div>
    </div>
  );
}

const FILA =
  "w-full text-left transition-[background-color,transform] enabled:hover:bg-[var(--hero-relleno)] enabled:active:scale-[.995] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus motion-reduce:transition-none";

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
        className={`${FILA} grid grid-cols-[1rem_0.6rem_2.2rem_minmax(0,1fr)_6.5rem_5rem] items-center gap-x-2 px-4 py-2 text-[13px] min-[1000px]:grid-cols-[1rem_0.6rem_2.2rem_minmax(0,1.2fr)_minmax(0,1.3fr)_6.5rem_5rem]`}
      >
        <span>{conFichajes && <Flecha abierta={abierta} />}</span>
        <span className={`size-2 rounded-full ${e.punto}`} aria-hidden />
        <span className="text-right text-[12px] tabular-nums text-text-muted">{t.codigo}</span>
        <span className="min-w-0">
          <span className="block truncate font-medium" title={enFrase(t.descripcion)}>
            {enFrase(t.descripcion)}
          </span>
          {t.maquina && <span className="text-[11px] text-text-muted">{t.maquina}</span>}
        </span>
        {/* Quién, con su cara, en pantallas de 1000 px o más. */}
        <span className="hidden min-w-0 items-center gap-1 min-[1000px]:flex">
          {t.personas.length ? (
            <>
              {t.personas.slice(0, 4).map((p) => (
                <span key={p.persona} title={`${p.persona} · ${min(p.minutos)}`}>
                  <CaraPersona nombre={p.persona} tamano="xs" />
                </span>
              ))}
              <span className="ml-1 truncate text-[12px] text-text-muted">
                {t.personas.length === 1 ? t.personas[0].persona : `${t.personas.length} personas`}
              </span>
            </>
          ) : (
            <span className="text-[12px] text-text-muted">Nadie ha fichado</span>
          )}
        </span>
        <span className={`text-[11.5px] font-semibold ${e.clase}`}>{e.texto}</span>
        <span className="text-right font-bold tabular-nums">{conFichajes ? min(t.minutos) : "—"}</span>
      </button>
      <Desplegable abierto={abierta}>
        <div className="bg-[var(--detalle)] px-4 pb-3 pl-[5rem] pt-2">
          {t.personas.map((p) => (
            <div key={p.persona} className="mt-2 first:mt-0">
              <div className="flex items-center gap-2 text-[13px]">
                <CaraPersona nombre={p.persona} tamano="xs" />
                <span className="font-semibold">{p.persona}</span>
                <span className="ml-auto font-bold tabular-nums">{min(p.minutos)}</span>
              </div>
              <ul className="mt-1 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,9.5rem))] gap-x-6 gap-y-0.5 pl-7 text-[12.5px] text-text-muted">
                {p.fichajes.map((f, i) => (
                  <li key={i} className={`flex justify-between gap-2 tabular-nums ${f.minutos > 0 ? "" : "opacity-60"}`}>
                    <span>
                      {fechaCorta(f.dia)}
                      {f.hora && <span className="ml-1.5">{f.hora}</span>}
                    </span>
                    <span className={f.minutos > 0 ? "font-semibold text-text" : ""}>{min(f.minutos)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Desplegable>
    </li>
  );
}

function FilaPersona({ p, total }: { p: PersonaTiempos; total: number }) {
  const [abierta, setAbierta] = useState(false);
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
        onClick={() => setAbierta((v) => !v)}
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
        {/* Por día: el día con su total y, debajo, cada fichaje. Los de 0
            minutos (abrir la tarea sin echarle tiempo) se ven, pero apagados. */}
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
                      <td className="py-px tabular-nums text-text-muted">{f.hora ?? "—"}</td>
                      <td className="py-px font-mono">{f.of}</td>
                      <td className="truncate py-px" title={enFrase(f.descripcion)}>
                        <span className="tabular-nums text-text-muted">{f.tarea}</span> {enFrase(f.descripcion)}
                      </td>
                      <td className="py-px text-right tabular-nums">{min(f.minutos)}</td>
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

export function TiemposBelen({ tiempos }: { tiempos: TiemposPedido }) {
  const [modo, setModo] = useState<"tarea" | "persona">("tarea");
  const tareas = tiempos.ofs.flatMap((o) => o.tareas);
  const acabadas = tareas.filter((t) => t.estado === "finalizado").length;
  const dias = new Set(tiempos.personas.flatMap((p) => p.fichajes.map((f) => f.dia))).size;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr))]">
        <Cifra etiqueta="Fichado en el pedido" valor={min(tiempos.minutos)} />
        <Cifra etiqueta="Personas" valor={tiempos.personas.length} />
        <Cifra etiqueta="Días con fichajes" valor={dias} />
        <Cifra etiqueta="Tareas acabadas" valor={`${acabadas} de ${tareas.length}`} />
      </div>

      {/* La misma píldora que se desliza del resto de Coordina. */}
      <div role="group" aria-label="Ver por" className="tira-3d glass-chip inline-flex self-start rounded-lg p-[3px]">
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
            className={`h-8 rounded-md px-3.5 text-[13px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              modo === id ? "pestana-activa" : "text-text-muted hover:text-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {modo === "tarea" ? (
        tiempos.ofs.map((of) => (
          <section key={of.of} aria-label={`OF ${of.of}`} className="tarjeta-of overflow-hidden rounded-3xl bg-surface">
            <header className="flex items-center gap-2.5 px-4 pb-2 pt-3">
              <span data-bloque="ofs" className="cabecera-bloque flex items-center">
                <AcentoBloque tipo="ofs" />
              </span>
              <span className="font-mono text-[15px] font-bold">{of.of}</span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{enFrase(of.descripcion)}</span>
              <span className="rounded-lg bg-[var(--hero-relleno)] px-2 py-0.5 text-[13px] font-bold tabular-nums">
                {min(of.minutos)}
              </span>
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
              <FilaPersona key={p.persona} p={p} total={tiempos.minutos} />
            ))}
          </ul>
        </section>
      ) : (
        <p className="px-1 text-sm text-text-muted">Nadie ha fichado todavía en este pedido.</p>
      )}
    </div>
  );
}
