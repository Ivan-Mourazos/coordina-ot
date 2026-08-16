"use client";

import { hoyISO } from "@/lib/types";

// ─── Calendario de un mes, con los días que tienen visita marcados ───────────
// Se dibuja a mano y no con un componente de librería: lo único que tiene que
// hacer es decir QUÉ DÍAS hay algo y dejar elegir uno, y para eso una tabla de
// siete columnas es todo el código que hace falta. Una librería traería su
// propio tema, su propio idioma y su propio tamaño, y habría que pelearse con
// los tres para que se pareciera al resto de la app.
//
// La semana empieza en LUNES, como el calendario de la pared del taller. En
// JavaScript la semana empieza en domingo (getDay() = 0), así que hay que
// correrlo: es el `(dia + 6) % 7` de más abajo, y es el fallo clásico de estas
// rejillas — un día de desfase que solo se ve mirando un mes concreto.

const DIAS = ["L", "M", "X", "J", "V", "S", "D"];

export interface DiaConVisitas {
  /** ISO yyyy-mm-dd. */
  fecha: string;
  total: number;
  /** Cuántas de ellas siguen pendientes. Manda para el color: un día con algo
   *  por hacer no es lo mismo que uno ya resuelto. */
  pendientes: number;
}

/** Primer día (ISO) del mes al que pertenece `iso`. */
export const primerDiaDelMes = (iso: string): string => `${iso.slice(0, 7)}-01`;

/** Último día (ISO) del mes al que pertenece `iso`. */
export function ultimoDiaDelMes(iso: string): string {
  const [a, m] = iso.split("-").map(Number);
  // Día 0 del mes siguiente = último del actual, y el `Date` en UTC ya rueda
  // solo de diciembre a enero.
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

/** Corre el mes `delta` meses. Se opera con el día 1 para que no haya que
 *  pensar en los meses de 30 y 31: sumar un mes al 31 de enero da el 2 o el 3
 *  de marzo según el año. */
export function correrMes(iso: string, delta: number): string {
  const [a, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + delta, 1)).toISOString().slice(0, 10);
}

function nombreMes(iso: string): string {
  const texto = new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
  return texto[0].toLocaleUpperCase("es") + texto.slice(1);
}

/** Las celdas del mes, ya con los huecos del principio y del final para que las
 *  columnas caigan bajo su día de la semana. `null` = hueco. */
export function celdasDelMes(mes: string): (string | null)[] {
  const primero = primerDiaDelMes(mes);
  const ultimo = Number(ultimoDiaDelMes(mes).slice(8));
  const huecos = (new Date(`${primero}T12:00:00Z`).getUTCDay() + 6) % 7;
  const celdas: (string | null)[] = Array(huecos).fill(null);
  for (let d = 1; d <= ultimo; d++) celdas.push(`${mes.slice(0, 7)}-${String(d).padStart(2, "0")}`);
  // Se completa la última semana para que la rejilla no quede dentada.
  while (celdas.length % 7 !== 0) celdas.push(null);
  return celdas;
}

export function CalendarioVisitas({
  mes,
  dias,
  seleccionado,
  onSeleccionar,
  onCambiarMes,
}: {
  /** Cualquier día del mes que se enseña. */
  mes: string;
  dias: DiaConVisitas[];
  /** Día elegido, o null para "el mes entero". */
  seleccionado: string | null;
  onSeleccionar: (fecha: string | null) => void;
  onCambiarMes: (mes: string) => void;
}) {
  const hoy = hoyISO();
  const porFecha = new Map(dias.map((d) => [d.fecha, d]));
  const celdas = celdasDelMes(mes);
  const totalMes = dias.reduce((n, d) => n + d.total, 0);

  return (
    <div className="glass-panel rounded-2xl p-3">
      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => onCambiarMes(correrMes(mes, -1))}
          aria-label="Mes anterior"
          className="grid size-7 place-items-center rounded-lg text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
        >
          ‹
        </button>
        <span className="min-w-0 flex-1 text-center text-sm font-semibold text-text">
          {nombreMes(mes)}
        </span>
        <button
          type="button"
          onClick={() => onCambiarMes(correrMes(mes, 1))}
          aria-label="Mes siguiente"
          className="grid size-7 place-items-center rounded-lg text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
        >
          ›
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-text-muted">
        {DIAS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {celdas.map((fecha, i) => {
          if (!fecha) return <span key={`h${i}`} />;
          const info = porFecha.get(fecha);
          const esHoy = fecha === hoy;
          const activo = fecha === seleccionado;
          const tiene = (info?.total ?? 0) > 0;
          const pendiente = (info?.pendientes ?? 0) > 0;
          return (
            <button
              key={fecha}
              type="button"
              // Volver a pulsar el día elegido deselecciona: es la forma de
              // volver al mes entero sin buscar un botón de "quitar".
              onClick={() => onSeleccionar(activo ? null : fecha)}
              disabled={!tiene}
              aria-pressed={activo}
              title={
                tiene
                  ? `${info!.total} visita${info!.total === 1 ? "" : "s"}${
                      pendiente ? ` · ${info!.pendientes} sin cerrar` : " · todas cerradas"
                    }`
                  : undefined
              }
              // `disabled:cursor-default` a propósito: un día sin visitas no es
              // una acción prohibida —que es lo que dice el "no permitido" que
              // pone la regla base—, es que ahí no hay nada. El mes está lleno
              // de días así y con la señal de prohibido parecía todo bloqueado.
              className={`relative grid aspect-square place-items-center rounded-lg text-xs tabular-nums transition-colors disabled:cursor-default ${
                activo
                  ? "bg-brand-400 font-bold text-[#231903]"
                  : tiene
                    ? "font-semibold text-text hover:bg-[var(--glass-highlight)]"
                    : "text-text-muted/50"
              } ${esHoy && !activo ? "ring-1 ring-brand-400" : ""}`}
            >
              {Number(fecha.slice(8))}
              {/* El punto dice que hay algo; el color, si queda algo por hacer.
                  Un número dentro de la celda no cabe a este tamaño y compite
                  con el día, que es lo que se lee. */}
              {tiene && !activo && (
                <span
                  aria-hidden="true"
                  className={`absolute bottom-1 size-1 rounded-full ${
                    pendiente ? "bg-brand-500" : "bg-cyan-600"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--glass-border)] pt-2 text-[10px] text-text-muted">
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-brand-500" /> por hacer
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-cyan-600" /> hechas
        </span>
        <span className="ml-auto">
          {totalMes} en el mes
        </span>
      </div>

      {seleccionado && (
        <button
          type="button"
          onClick={() => onSeleccionar(null)}
          className="mt-2 w-full rounded-lg border border-border py-1 text-[11px] font-semibold text-text-muted hover:border-border-strong hover:text-text"
        >
          Ver el mes entero
        </button>
      )}
    </div>
  );
}
