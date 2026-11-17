"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  ETIQUETA_ESTADO,
  limitesMes,
  mesAnterior,
  mesSiguiente,
  type DisponibilidadMes,
  type EstadoDia,
  type PersonaDisponibilidad,
  type RespuestaDisponibilidad,
} from "@/lib/disponibilidad";
import { nombreMes } from "@/lib/calendario";
import { hoyISO } from "@/lib/types";
import { Select } from "./Select";
import { FueraHoyTira, LETRA_ESTADO, TONO_ESTADO } from "./Disponibilidad";
import { useFueraHoy } from "./useFueraHoy";

// ─── Equipo: quién está y quién no (Bizneo) ──────────────────────────────────
// Personas × días del mes. Antes había que entrar en Bizneo a mirarlo; aquí
// está donde se reparte el trabajo. Solo lectura: las ausencias se siguen
// pidiendo y aprobando en Bizneo.
//
// Lo que se busca con la vista es quién NO está, así que los días normales van
// en blanco y las ausencias en color macizo con su letra. De una ausencia no
// se dice el motivo (ver lib/disponibilidad.ts).

const DIAS_CORTOS = ["D", "L", "M", "X", "J", "V", "S"];
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
/** Orden de la leyenda: primero lo que interesa encontrar. */
const LEYENDA: EstadoDia[] = ["vacaciones", "fuera", "parcial", "teletrabajo", "festivo", "libre"];
const TODOS = "__todos";
const MI_EQUIPO = "__coordina";

function fechasDelMes(mes: string): string[] {
  const { hasta } = limitesMes(mes);
  const n = Number(hasta.slice(8));
  return Array.from({ length: n }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`);
}

function diaSemana(iso: string): number {
  return new Date(`${iso}T12:00:00`).getDay();
}

function fmtHora(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** Los grupos con gente de Coordina primero; luego por nombre. */
function agrupar(personas: PersonaDisponibilidad[]): [string, PersonaDisponibilidad[]][] {
  const mapa = new Map<string, PersonaDisponibilidad[]>();
  for (const p of personas) mapa.set(p.grupo, [...(mapa.get(p.grupo) ?? []), p]);
  const delEquipo = (g: PersonaDisponibilidad[]) => (g.some((p) => p.operarioId) ? 0 : 1);
  return [...mapa.entries()]
    .map(([g, ps]) => [g, ps.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))] as [string, PersonaDisponibilidad[]])
    .sort((a, b) => delEquipo(a[1]) - delEquipo(b[1]) || a[0].localeCompare(b[0], "es"));
}

export function EquipoView() {
  const hoy = hoyISO();
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [datos, setDatos] = useState<DisponibilidadMes | null>(null);
  const [inactivo, setInactivo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grupo, setGrupo] = useState<string>(TODOS);
  const [busca, setBusca] = useState("");
  const fueraHoy = useFueraHoy();
  const idTitulo = useId();
  const idGrupo = useId();

  useEffect(() => {
    let vivo = true;
    fetch(`/api/disponibilidad?mes=${mes}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<RespuestaDisponibilidad>;
      })
      .then((d) => {
        if (!vivo) return;
        setError(null);
        if (!d.activo) setInactivo(true);
        else setDatos(d);
      })
      .catch(() => {
        if (vivo) setError("No se pudo leer Bizneo. Prueba otra vez en un momento.");
      });
    return () => {
      vivo = false;
    };
  }, [mes]);

  // Lo pintado es del mes pedido o nada: al cambiar de mes no se enseñan los
  // días del anterior debajo del título nuevo.
  const delMes = datos?.mes === mes ? datos : null;
  const fechas = useMemo(() => fechasDelMes(mes), [mes]);

  const opcionesGrupo = useMemo(() => {
    const grupos = [...new Set((delMes?.personas ?? []).map((p) => p.grupo))].sort((a, b) => a.localeCompare(b, "es"));
    return [
      { value: TODOS, label: "Todos" },
      { value: MI_EQUIPO, label: "Equipo de Coordina" },
      ...grupos.map((g) => ({ value: g, label: g })),
    ];
  }, [delMes]);

  const grupos = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase("es");
    const filtradas = (delMes?.personas ?? []).filter(
      (p) =>
        (grupo === TODOS || (grupo === MI_EQUIPO ? p.operarioId !== null : p.grupo === grupo)) &&
        (!q || p.nombre.toLocaleLowerCase("es").includes(q)),
    );
    return agrupar(filtradas);
  }, [delMes, grupo, busca]);

  if (inactivo) {
    return (
      <section className="mx-auto max-w-2xl">
        <div className="tarjeta-rectificado p-6 text-sm text-text">
          <h1 className="text-lg font-semibold">Calendario del equipo</h1>
          <p className="mt-2 text-text-muted">Bizneo todavía no está conectado a Coordina.</p>
        </div>
      </section>
    );
  }

  const tituloMes = nombreMes(`${mes}-01`);

  return (
    <section className="mx-auto max-w-[1600px]">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-text">Calendario del equipo</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Quién trabaja y quién está fuera, según Bizneo.
            {delMes && <> Actualizado a las {fmtHora(delMes.actualizado)}.</>}
            {delMes?.demo && <strong className="ml-1 font-semibold text-text"> Datos de ejemplo: Bizneo sin conectar.</strong>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar persona"
            aria-label="Buscar persona"
            autoComplete="off"
            className="campo-hundido h-9 w-48 rounded-lg px-3 text-sm text-text outline-none placeholder:text-text-muted"
          />
          <span id={idGrupo} className="sr-only">Departamento</span>
          <Select
            value={grupo}
            onChange={(v) => setGrupo(v ?? TODOS)}
            options={opcionesGrupo}
            placeholder={null}
            ariaLabelledBy={idGrupo}
            className="w-52"
          />
          <div className="tira-3d glass-chip inline-flex items-center rounded-lg p-[3px]" role="group" aria-label="Mes">
            <button type="button" onClick={() => setMes(mesAnterior(mes))} className="h-9 rounded-lg px-3 text-sm font-semibold text-text-muted hover:text-text" aria-label="Mes anterior">
              ‹
            </button>
            <span className="inline-block min-w-36 px-2 text-center text-sm font-semibold text-text first-letter:uppercase" aria-live="polite">
              {tituloMes}
            </span>
            <button type="button" onClick={() => setMes(mesSiguiente(mes))} className="h-9 rounded-lg px-3 text-sm font-semibold text-text-muted hover:text-text" aria-label="Mes siguiente">
              ›
            </button>
          </div>
          {mes !== hoy.slice(0, 7) && (
            <button type="button" onClick={() => setMes(hoy.slice(0, 7))} className="chip-3d h-9 px-3.5 text-xs font-semibold text-text">
              Hoy
            </button>
          )}
        </div>
      </header>

      <FueraHoyTira fuera={fueraHoy} hoy={hoy} className="mb-4" />

      {error && (
        <p role="alert" className="mb-4 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-text">
          {error}
        </p>
      )}

      {!delMes && !error ? (
        <div aria-label="Cargando" className="tarjeta-rectificado h-96 animate-pulse motion-reduce:animate-none" />
      ) : delMes ? (
        <div
          tabIndex={0}
          role="region"
          aria-labelledby={idTitulo}
          className="tarjeta-rectificado scroll-thin max-h-[calc(100dvh-15rem)] overflow-auto"
        >
          <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
            <caption id={idTitulo} className="sr-only">
              Calendario del equipo, {tituloMes}
            </caption>
            <thead className="sticky top-0 z-20">
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-semibold text-text-muted">
                  Persona
                </th>
                {fechas.map((f) => {
                  const dow = diaSemana(f);
                  const esHoy = f === hoy;
                  return (
                    <th
                      key={f}
                      scope="col"
                      abbr={`${DIAS_LARGOS[dow]} ${Number(f.slice(8))}`}
                      className={`bg-surface px-0 py-1.5 text-center font-semibold tabular-nums ${dow === 0 || dow === 6 ? "text-text-muted" : "text-text"}`}
                    >
                      <span className={`mx-auto grid w-7 rounded-lg py-0.5 ${esHoy ? "bg-brand-400 text-brand-950" : ""}`}>
                        <span className="text-[10px] font-normal">{DIAS_CORTOS[dow]}</span>
                        {Number(f.slice(8))}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            {grupos.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={fechas.length + 1} className="px-3 py-8 text-center text-sm text-text-muted">
                    Nadie con ese filtro.
                  </td>
                </tr>
              </tbody>
            ) : (
              grupos.map(([g, personas]) => (
                <tbody key={g}>
                  <tr>
                    <th
                      scope="rowgroup"
                      colSpan={fechas.length + 1}
                      className="bg-[var(--hero-relleno)] px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted"
                    >
                      <span className="sticky left-3">
                        {g} <span className="font-normal normal-case">· {personas.length}</span>
                      </span>
                    </th>
                  </tr>
                  {personas.map((p) => (
                    <tr key={p.id}>
                      <th
                        scope="row"
                        className={`sticky left-0 z-10 max-w-56 truncate bg-surface px-3 py-1 text-left font-medium ${p.operarioId ? "text-text" : "text-text-muted"}`}
                        title={p.nombre}
                      >
                        {p.nombre}
                      </th>
                      {fechas.map((f) => {
                        const d = p.dias[f] ?? { estado: "sin_dato" as const };
                        const dow = diaSemana(f);
                        const etiqueta = `${DIAS_LARGOS[dow]} ${Number(f.slice(8))}: ${ETIQUETA_ESTADO[d.estado]}${d.nota ? ` · ${d.nota}` : ""}`;
                        return (
                          <td key={f} className={`p-0.5 text-center ${f === hoy ? "bg-brand-400/10" : ""}`} title={`${p.nombre} · ${etiqueta}`}>
                            <span className={`grid h-6 w-7 place-items-center rounded-md text-[11px] font-bold ${TONO_ESTADO[d.estado]}`}>
                              <span aria-hidden>{LETRA_ESTADO[d.estado]}</span>
                              <span className="sr-only">{ETIQUETA_ESTADO[d.estado]}{d.nota ? ` · ${d.nota}` : ""}</span>
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              ))
            )}
          </table>
        </div>
      ) : null}

      <ul aria-label="Leyenda" className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-text-muted">
        {LEYENDA.map((e) => (
          <li key={e} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`grid h-5 w-6 place-items-center rounded-md text-[10px] font-bold ${TONO_ESTADO[e]}`}>
              {LETRA_ESTADO[e]}
            </span>
            {ETIQUETA_ESTADO[e]}
          </li>
        ))}
        <li>Sin color: trabaja. Pasa el ratón por un día para ver el horario.</li>
      </ul>
    </section>
  );
}
