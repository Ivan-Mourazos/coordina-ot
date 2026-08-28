"use client";

import { useEffect, useState } from "react";
import { proporcionDevueltas, type Metricas } from "@/lib/metricas";
import type { CausaDevolucion } from "@/lib/causas-cliente";

// ─── Cuántas OF vuelven, y por qué ───────────────────────────────────────────
// Tres preguntas y nada más, que son las que se pidieron. El orden es el de
// quien mira: primero cuánto pasa, después por qué, y al final si va a mejor.
//
// La primera NO es un gráfico. Lo que se quiere saber es "1 de cada 5", y eso
// una barra no lo dice mejor que el número escrito.
//
// UNA SOLA SERIE, así que un solo color: el rojo de `devuelta`, que ya es el
// que la app usa para esto en el tablero y en las fichas. Sin paleta de varios
// colores no hay identidad que codificar y las barras solo miden.

interface Respuesta {
  metricas: Metricas;
  causas: CausaDevolucion[];
}

/** Un día en formato de `input[type=date]`. */
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function MetricasView() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState(false);

  // Al cambiar el filtro NO se vacía lo que hay: se dejan los números
  // anteriores hasta que llegan los nuevos. La consulta va contra nuestro
  // SQLite y tarda milisegundos, así que parpadear a "Contando…" en cada
  // tecleo de la fecha sería peor que esperar un instante con el dato viejo.
  useEffect(() => {
    let vivo = true;
    const q = new URLSearchParams();
    if (desde) q.set("desde", desde);
    if (hasta) q.set("hasta", hasta);
    fetch(`/api/metricas?${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Respuesta) => {
        if (!vivo) return;
        setDatos(d);
        setError(false);
      })
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, [desde, hasta]);

  const m = datos?.metricas;
  const prop = m ? proporcionDevueltas(m) : null;
  const rotulo = (id: number | null) =>
    id === null
      ? "Sin causa apuntada"
      : (datos?.causas.find((c) => c.id === id)?.etiqueta ?? `Causa ${id}`);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="text-sm font-bold text-text">Devoluciones</h2>
          <p className="text-[11px] text-text-muted">
            Cuántas OF vuelven al autor tras la revisión, y por qué.
          </p>
        </div>
        {/* Los filtros en una fila sobre los datos, no repartidos entre ellos. */}
        <div className="ml-auto flex items-end gap-1.5 text-xs text-text-muted">
          <label className="flex flex-col">
            Desde
            <input
              type="date"
              value={desde}
              max={hasta || undefined}
              onChange={(e) => setDesde(e.target.value)}
              className="mt-1 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text"
            />
          </label>
          <label className="flex flex-col">
            Hasta
            <input
              type="date"
              value={hasta}
              min={desde || undefined}
              max={iso(new Date())}
              onChange={(e) => setHasta(e.target.value)}
              className="mt-1 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text"
            />
          </label>
          {(desde || hasta) && (
            <button
              onClick={() => {
                setDesde("");
                setHasta("");
              }}
              className="rounded-lg px-2 py-1 text-xs font-medium text-text-muted hover:text-text"
            >
              Todo
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="glass-panel rounded-xl p-4 text-xs text-text-muted">
          No se pudieron cargar las métricas. Vuelve a intentarlo.
        </p>
      )}

      {!datos && !error && (
        <p className="glass-panel rounded-xl p-4 text-xs text-text-muted">Contando…</p>
      )}

      {m && (
        <>
          {/* ── Cuánto pasa ── */}
          <section className="glass-panel rounded-xl p-4">
            {m.revisiones === 0 ? (
              // Vacío con dirección, no un "no hay datos" a secas: aquí lo
              // normal al empezar es que no haya nada todavía, y hay que decir
              // por qué y desde cuándo cuenta.
              <p className="text-xs text-text-muted">
                Todavía no se ha revisado nada en este periodo. Las devoluciones se
                cuentan desde que se empiezan a marcar causas: los primeros números
                tardan unas semanas en decir algo.
              </p>
            ) : (
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                <p className="text-3xl font-bold text-text">
                  {prop === null ? "—" : `${Math.round(prop * 100)}%`}
                  <span className="ml-2 text-xs font-medium text-text-muted">
                    de las revisiones acaban en devolución
                  </span>
                </p>
                <p className="text-xs text-text-muted">
                  <strong className="font-semibold text-text">{m.devoluciones}</strong>{" "}
                  {m.devoluciones === 1 ? "devolución" : "devoluciones"} sobre{" "}
                  <strong className="font-semibold text-text">{m.revisiones}</strong>{" "}
                  {m.revisiones === 1 ? "revisión" : "revisiones"}
                </p>
              </div>
            )}
          </section>

          {/* ── Por qué ── */}
          {m.porCausa.length > 0 && (
            <section className="glass-panel rounded-xl p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-text-muted">
                Por qué vuelven
              </h3>
              {/* Se dice que suman más que el total. Sin esto, quien sume las
                  barras y no le cuadre con las devoluciones piensa que está mal. */}
              <p className="mt-0.5 text-[11px] text-text-muted">
                Una devolución puede llevar varias causas, así que estas suman más que{" "}
                {m.devoluciones}.
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {m.porCausa.map((c) => (
                  <BarraCausa
                    key={c.id ?? "sin"}
                    etiqueta={rotulo(c.id)}
                    n={c.n}
                    max={m.porCausa[0].n}
                    total={m.devoluciones}
                    apagada={c.id === null}
                  />
                ))}
              </ul>
              {m.porCausa.some((c) => c.id === null) && (
                <p className="mt-2.5 border-t border-border pt-2 text-[11px] text-text-muted">
                  Las devoluciones sin causa son de antes de que se pudieran marcar, o
                  se escribieron sin elegir ninguna.
                </p>
              )}
            </section>
          )}

          {/* ── Si va a mejor ── */}
          {/* Con un solo mes no hay tendencia que enseñar: dos puntos son lo
              mínimo para poder decir "sube" o "baja", y uno solo invita a leer
              una raya donde no hay nada. */}
          {m.porMes.length > 1 && (
            <section className="glass-panel rounded-xl p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-text-muted">
                Mes a mes
              </h3>
              <ul className="mt-3 flex flex-col gap-2">
                {m.porMes.map((mes) => (
                  <BarraMes key={mes.mes} {...mes} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** Una causa y cuántas veces salió.
 *
 *  Barra fina, con el rótulo encima y el número al final: los nombres de las
 *  causas son frases ("Material equivocado") y en vertical no caben sin girar
 *  el texto, que no se lee. */
function BarraCausa({
  etiqueta,
  n,
  max,
  total,
  apagada,
}: {
  etiqueta: string;
  n: number;
  max: number;
  total: number;
  apagada: boolean;
}) {
  const pct = total > 0 ? Math.round((n / total) * 100) : 0;
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className={apagada ? "text-text-muted" : "text-text"}>{etiqueta}</span>
        <span className="shrink-0 tabular-nums text-text-muted">
          <strong className="font-semibold text-text">{n}</strong> · {pct}%
        </span>
      </div>
      <div className="mt-1 h-2 w-full rounded-full bg-[var(--glass-highlight)]">
        <div
          // Contra la MÁS ALTA, no contra el total: así la más frecuente llena
          // la barra y las demás se comparan con ella de un vistazo. El
          // porcentaje sobre el total ya va escrito al lado.
          style={{ width: `${max > 0 ? (n / max) * 100 : 0}%` }}
          className={`h-full rounded-full ${apagada ? "bg-text-muted/40" : "bg-red-600"}`}
        />
      </div>
    </li>
  );
}

/** Un mes: cuántas se revisaron y cuántas volvieron. */
function BarraMes({
  mes,
  revisiones,
  devoluciones,
}: {
  mes: string;
  revisiones: number;
  devoluciones: number;
}) {
  const prop = proporcionDevueltas({ revisiones, devoluciones });
  const [anio, m] = mes.split("-");
  const MESES = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
  ];
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-text">
          {MESES[Number(m) - 1] ?? m} {anio}
        </span>
        <span className="shrink-0 tabular-nums text-text-muted">
          <strong className="font-semibold text-text">
            {prop === null ? "—" : `${Math.round(prop * 100)}%`}
          </strong>{" "}
          · {devoluciones} de {revisiones}
        </span>
      </div>
      <div className="mt-1 h-2 w-full rounded-full bg-[var(--glass-highlight)]">
        <div
          style={{ width: `${(prop ?? 0) * 100}%` }}
          className="h-full rounded-full bg-red-600"
        />
      </div>
    </li>
  );
}
