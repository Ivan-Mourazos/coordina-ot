"use client";

import { useEffect, useState } from "react";
import { proporcionDevueltas, type Metricas, type Tramo } from "@/lib/metricas";
import { CAUSAS } from "@/lib/anulacion";
import { fmtMin } from "@/lib/estado";
import type { CausaDevolucion } from "@/lib/causas-cliente";
import { SECCIONES, type SeccionId } from "@/lib/secciones";

// ─── Lo que se puede mirar hacia atrás ───────────────────────────────────────
// Tres apartados, y UNO A LA VEZ. Apilarlos obligaría a leerlo todo para llegar
// al que importaba, y son preguntas distintas con decisiones distintas detrás:
// si sale bien a la primera, dónde se para el trabajo, y qué no hace OT.
//
// Píldoras y no una segunda fila de pestañas: dos barras de navegación apiladas
// pesan mucho y se confunde cuál manda. El apartado va en la URL para poder
// pasar un enlace directo al que interesa.
//
// El filtro de fechas queda FUERA de las píldoras y vale para los tres:
// repetirlo dentro de cada uno haría pensar que es distinto en cada sitio.
//
// Dentro de cada apartado, el orden es el de quien mira: primero cuánto pasa,
// después por qué, y al final si va a mejor.
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

const APARTADOS = [
  { id: "devoluciones", label: "Devoluciones" },
  { id: "tiempos", label: "Tiempos" },
  { id: "anuladas", label: "Anuladas" },
] as const;
type Apartado = (typeof APARTADOS)[number]["id"];

/** Qué contesta cada apartado, en una frase. Va debajo del título y cambia con
 *  él: son preguntas distintas y conviene decir cuál se está mirando. */
const DE_QUE_VA: Record<Apartado, string> = {
  devoluciones: "Cuántas OF vuelven al autor tras la revisión, y por qué.",
  tiempos: "Dónde se para el trabajo entre que se plantea y se aprueba.",
  anuladas: "Qué trabajo no hace Oficina Técnica, y por qué.",
};

export function MetricasView({ seccion }: { seccion: SeccionId }) {
  const [apartado, setApartado] = useState<Apartado>(() => {
    if (typeof window === "undefined") return "devoluciones";
    const m = new URLSearchParams(window.location.search).get("m");
    return APARTADOS.some((a) => a.id === m) ? (m as Apartado) : "devoluciones";
  });
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
    // La MISMA sección que se está mirando en el tablero: quien conmuta a
    // Diseño Gráfico y entra en Métricas espera los números de diseño, no los
    // de Oficina Técnica.
    q.set("seccion", seccion);
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
  }, [desde, hasta, seccion]);

  // El apartado, en la URL. `replaceState` y no un push: moverse entre los
  // tres no es navegar, y llenar el historial obligaría a pulsar Atrás cuatro
  // veces para salir de Métricas.
  useEffect(() => {
    const u = new URL(window.location.href);
    if (apartado === "devoluciones") u.searchParams.delete("m");
    else u.searchParams.set("m", apartado);
    window.history.replaceState(null, "", u);
  }, [apartado]);

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
          {/* La cabecera sigue al apartado elegido: dejarla fija en
              "Devoluciones" hacía que dijera una cosa y se enseñara otra. */}
          <h2 className="flex items-center gap-2 text-sm font-bold text-text">
            {APARTADOS.find((a) => a.id === apartado)?.label}
            {/* De quién son estos números. Con dos secciones, las mismas
                pantallas enseñan dos juegos distintos y sin decirlo no hay
                forma de saber cuál se está mirando. */}
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-text-muted ring-1 ring-border">
              {SECCIONES[seccion].nombre}
            </span>
          </h2>
          <p className="text-[11px] text-text-muted">{DE_QUE_VA[apartado]}</p>
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

      <div className="flex flex-wrap gap-1.5">
        {APARTADOS.map((a) => (
          <button
            key={a.id}
            onClick={() => setApartado(a.id)}
            aria-pressed={apartado === a.id}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ${
              apartado === a.id
                ? "bg-brand-500 text-white ring-transparent"
                : "text-text-muted ring-border hover:text-text"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="glass-panel rounded-xl p-4 text-xs text-text-muted">
          No se pudieron cargar las métricas. Vuelve a intentarlo.
        </p>
      )}

      {!datos && !error && (
        <p className="glass-panel rounded-xl p-4 text-xs text-text-muted">Contando…</p>
      )}

      {m && apartado === "devoluciones" && (
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
              {/* Sin esto el mes en curso se lee como una mejora. Cada
                  devolución cuenta en el mes de su revisión, así que las de las
                  revisiones de estos días todavía no han llegado. */}
              <p className="mt-3 text-[11px] text-text-muted">
                Cada devolución cuenta en el mes en que se revisó la OF, no en el
                que volvió. El mes en curso siempre sale bajo: le faltan las
                devoluciones que aún no han pasado.
              </p>
            </section>
          )}
        </>
      )}

      {/* ── Dónde se para el trabajo ── */}
      {m && apartado === "tiempos" && (
        <section className="glass-panel rounded-xl p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-text-muted">
            Cuánto tarda cada paso
          </h3>
          <p className="mt-0.5 text-[11px] text-text-muted">
            El tiempo típico, no el medio: una OF que se quedó parada por unas
            vacaciones desviaría la media y haría pensar que todo va lento.
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            <FilaTramo
              rotulo="Esperando a que la revisen"
              explica="Desde que se manda a revisar hasta que alguien la coge"
              tramo={m.tiempos.esperaCola}
            />
            <FilaTramo
              rotulo="Revisándola"
              explica="Desde que se empieza el repaso hasta que se aprueba o se devuelve"
              tramo={m.tiempos.repaso}
            />
            <FilaTramo
              rotulo="Corrigiéndola"
              explica="Desde que vuelve al autor hasta que la da por corregida"
              tramo={m.tiempos.correccion}
            />
          </ul>
          <p className="mt-3 border-t border-border pt-2 text-[11px] text-text-muted">
            Lo que todavía está esperando no cuenta: no se sabe cuánto va a tardar, y
            darlo por acabado ahora haría que los números bajaran solos.
          </p>
        </section>
      )}

      {/* ── Qué no hace OT ── */}
      {m && apartado === "anuladas" && (
        <section className="glass-panel rounded-xl p-4">
          {m.anulaciones === 0 ? (
            <p className="text-xs text-text-muted">
              No se ha anulado ninguna OF en este periodo.
            </p>
          ) : (
            <>
              <p className="text-3xl font-bold text-text">
                {m.anulaciones}
                <span className="ml-2 text-xs font-medium text-text-muted">
                  {m.anulaciones === 1 ? "OF anulada" : "OF anuladas"}
                </span>
              </p>
              <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-text-muted">
                Por qué
              </h3>
              <ul className="mt-2 flex flex-col gap-2">
                {m.porCausaAnulacion.map((c) => (
                  <BarraCausa
                    key={c.causa ?? "sin"}
                    etiqueta={rotuloAnulacion(c.causa)}
                    n={c.n}
                    max={m.porCausaAnulacion[0].n}
                    total={m.anulaciones}
                    apagada={c.causa === null}
                  />
                ))}
              </ul>
              {m.porCausaAnulacion.some((c) => c.causa === null) && (
                <p className="mt-2.5 border-t border-border pt-2 text-[11px] text-text-muted">
                  Las anuladas sin causa son de antes de que anular la pidiera.
                </p>
              )}
            </>
          )}
        </section>
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
      {/* La barra se capa al 100 % aunque la proporción no lo esté. Con un
          150 % —que salía al contar la devolución en un mes y su revisión en
          otro— la barra se pintaba media pantalla por fuera del panel. Eso ya
          no pasa (ver metricas.ts), pero una barra no puede depender de que el
          número que la alimenta esté bien: ninguna medida se sale de su caja. */}
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--glass-highlight)]">
        <div
          style={{ width: `${Math.min(100, (prop ?? 0) * 100)}%` }}
          className="h-full rounded-full bg-red-600"
        />
      </div>
    </li>
  );
}


/** Un tramo del ciclo: cuánto tarda y sobre cuántos casos se ha medido.
 *
 *  El número de casos va al lado y no escondido: con tres medidas, «2 horas»
 *  no es un dato, es una anécdota, y quien lo lea tiene que poder saberlo. */
function FilaTramo({
  rotulo,
  explica,
  tramo,
}: {
  rotulo: string;
  explica: string;
  tramo: Tramo;
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-text">{rotulo}</span>
        <span className="shrink-0 text-sm font-bold tabular-nums text-text">
          {tramo.medianaMin === null ? "—" : fmtMin(tramo.medianaMin)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-text-muted">
        <span>{explica}</span>
        <span className="shrink-0 tabular-nums">
          {tramo.n === 0 ? "sin datos todavía" : `${tramo.n} ${tramo.n === 1 ? "vez" : "veces"}`}
        </span>
      </div>
    </li>
  );
}

/** Cómo se llama una causa de anulación. Las de antes de que se pidiera van
 *  con su propio rótulo en vez de en blanco: son un dato, no un hueco. */
function rotuloAnulacion(id: string | null): string {
  if (id === null) return "Sin causa apuntada";
  return CAUSAS.find((c) => c.id === id)?.label ?? id;
}