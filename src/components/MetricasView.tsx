"use client";

import { useEffect, useState } from "react";
import { ErrorCarga } from "./ErrorCarga";
import {
  periodoAnterior,
  proporcionDevueltas,
  sinActividad,
  ventanaDeDias,
  type Metricas,
  type Tramo,
} from "@/lib/metricas";
import { hoyISO } from "@/lib/types";
import { CAUSAS } from "@/lib/anulacion";
import { fmtMin } from "@/lib/estado";
import type { CausaDevolucion } from "@/lib/causas-cliente";
import { SECCIONES, type SeccionId } from "@/lib/secciones";
import { SelectorFecha } from "./SelectorFecha";

// ─── Lo que se puede mirar hacia atrás ───────────────────────────────────────
// Cuatro apartados, y UNO A LA VEZ. Apilarlos obligaría a leerlo todo para
// llegar al que importaba, y son preguntas distintas con decisiones distintas
// detrás: cuánto sale, si sale bien a la primera, dónde se para el trabajo, y
// qué no hace OT.
//
// TRABAJO VA PRIMERO. Un "33 % vuelve" no se puede leer sin saber si son 3 de 9
// —donde no hay nada que decir todavía— o 70 de 210. El volumen es el contexto
// del resto de la pantalla, así que es lo primero que se ve.
//
// Y CADA TITULAR LLEVA SU COMPARACIÓN. Un número solo no es una noticia: 33 %
// puede ser la mejor racha del año o la peor según cómo viniera el trimestre
// anterior. Por eso el periodo arranca en una ventana fija —90 días— y no en
// todo el histórico: "todo" mete dentro los meses de rodaje, no se mueve nunca
// y no tiene un periodo anterior con el que medirse.
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

const APARTADOS = [
  { id: "trabajo", label: "Trabajo" },
  { id: "devoluciones", label: "Devoluciones" },
  { id: "tiempos", label: "Tiempos" },
  { id: "anuladas", label: "Anuladas" },
] as const;
type Apartado = (typeof APARTADOS)[number]["id"];

/** Los periodos que se piden sin pensar. `dias: null` es todo el histórico. */
const ATAJOS = [
  { label: "30 días", dias: 30 },
  { label: "90 días", dias: 90 },
  { label: "Todo", dias: null },
] as const;

/** Las tres cuentas del volumen, con el color que ya tienen en el resto de la
 *  app: plantear es esmeralda, revisar es violeta y lo aprobado, cian. Aquí no
 *  hay una serie sola, así que el color sí codifica algo — y codifica lo mismo
 *  que en el tablero, que es la única forma de que no haya que aprenderlo. */
const SERIES = [
  {
    clave: "planteos",
    label: "Planteos entregados",
    barra: "bg-emerald-600",
    texto: "text-emerald-800 dark:text-emerald-300",
  },
  {
    clave: "revisiones",
    label: "Revisiones",
    barra: "bg-violet-600",
    texto: "text-violet-700 dark:text-violet-300",
  },
  {
    clave: "terminadas",
    label: "OF terminadas",
    barra: "bg-cyan-700",
    texto: "text-cyan-800 dark:text-cyan-300",
  },
] as const;

/** El mes de hoy, para poder avisar de que aún no ha acabado. En UTC, que es
 *  como se cortan los meses al contar (ver `mesDe` en metricas.ts): mirarlo en
 *  hora local marcaría el mes equivocado durante las primeras horas del día 1.
 *
 *  Del reloj del navegador y no del servidor: solo decide un rótulo, y las
 *  barras se pintan después de montar, así que no hay hidratación que
 *  descuadrar. */
const mesActual = () => new Date().toISOString().slice(0, 7);

/** Qué contesta cada apartado, en una frase. Va debajo del título y cambia con
 *  él: son preguntas distintas y conviene decir cuál se está mirando. */
const DE_QUE_VA: Record<Apartado, string> = {
  trabajo: "Cuánto trabajo sale de la sección, y si el ritmo se mantiene.",
  devoluciones: "Cuántas OF vuelven al autor tras la revisión, y por qué.",
  tiempos: "Dónde se para el trabajo entre que se plantea y se aprueba.",
  anuladas: "Qué trabajo se ha anulado en esta sección, y por qué.",
};

export function MetricasView({ seccion }: { seccion: SeccionId }) {
  // Trabajo primero, y no Devoluciones: un 33 % no se puede leer sin saber si
  // son 3 de 9 o 70 de 210. El volumen es el contexto del resto de la pantalla.
  const [apartado, setApartado] = useState<Apartado>(() => {
    if (typeof window === "undefined") return "trabajo";
    const m = new URLSearchParams(window.location.search).get("m");
    return APARTADOS.some((a) => a.id === m) ? (m as Apartado) : "trabajo";
  });
  // Arranca en los últimos 90 días, no en "todo". Con el histórico entero
  // dentro, el titular es un promedio de meses que incluyen el rodaje —cuando
  // ni existían las causas— y no se mueve por mucho que cambie el trabajo de
  // esta semana. Una ventana fija además se puede comparar con la anterior,
  // que es lo que convierte un número en una noticia.
  const [{ desde, hasta }, setPeriodo] = useState(() => ventanaDeDias(90, hoyISO()));
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [previo, setPrevio] = useState<Metricas | null>(null);
  const previoVacio = previo !== null && sinActividad(previo);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);

  // Al cambiar el filtro NO se vacía lo que hay: se dejan los números
  // anteriores hasta que llegan los nuevos. La consulta va contra nuestro
  // SQLite y tarda milisegundos, así que parpadear a "Contando…" en cada
  // tecleo de la fecha sería peor que esperar un instante con el dato viejo.
  useEffect(() => {
    let vivo = true;
    // La MISMA sección que se está mirando en el tablero: quien conmuta a
    // Diseño Gráfico y entra en Métricas espera los números de diseño, no los
    // de Oficina Técnica.
    const pedir = (p: { desde: string; hasta: string }) => {
      const q = new URLSearchParams({ seccion });
      if (p.desde) q.set("desde", p.desde);
      if (p.hasta) q.set("hasta", p.hasta);
      return fetch(`/api/metricas?${q}`, { cache: "no-store" }).then((r) =>
        r.ok ? (r.json() as Promise<Respuesta>) : Promise.reject(new Error(String(r.status))),
      );
    };

    pedir({ desde, hasta })
      .then((d) => {
        if (!vivo) return;
        setDatos(d);
        setError(false);
      })
      .catch(() => vivo && setError(true));

    // El periodo anterior va en su propia petición, y si falla no pasa nada:
    // la comparación es un extra y no puede tumbar la pantalla que sí tiene
    // datos. Sin periodo cerrado ("Todo") no hay nada con que comparar.
    const antes = periodoAnterior(desde, hasta);
    (antes
      ? pedir(antes)
          .then((d) => d.metricas)
          .catch(() => null)
      : Promise.resolve(null)
    ).then((mm) => vivo && setPrevio(mm));
    return () => {
      vivo = false;
    };
  }, [desde, hasta, seccion, intento]);

  // El apartado, en la URL. `replaceState` y no un push: moverse entre los
  // tres no es navegar, y llenar el historial obligaría a pulsar Atrás cuatro
  // veces para salir de Métricas.
  useEffect(() => {
    const u = new URL(window.location.href);
    if (apartado === "trabajo") u.searchParams.delete("m");
    else u.searchParams.set("m", apartado);
    window.history.replaceState(null, "", u);
  }, [apartado]);

  const m = datos?.metricas;
  const prop = m ? proporcionDevueltas(m) : null;
  const mesesRevisados = m?.porMes.filter((x) => x.revisiones > 0) ?? [];
  const rotulo = (id: number | null) =>
    id === null
      ? "Sin causa apuntada"
      : (datos?.causas.find((c) => c.id === id)?.etiqueta ?? `Causa ${id}`);

  return (
    // A todo el ancho de la pestaña, con el mismo margen que las demás. El tope
    // lo pone ya el contenedor de la web (1.800 px, en Board): aquí uno más
    // estrecho la dejaba pegada a la izquierda con un hueco a la derecha.
    <div className="flex flex-col gap-4">
      {/* Una sola fila: apartados, de quién son los números y el periodo. El
          título repetía el apartado elegido justo encima de su pestaña
          ("Trabajo" sobre "Trabajo"); se queda para los lectores de pantalla. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="sr-only">{APARTADOS.find((a) => a.id === apartado)?.label}</h2>
        {/* El mismo selector de pastilla que "Lo próximo / Todo el mes" y
            "Solo mías / Todo el equipo": eran botones sueltos con anillo, otro
            estilo para la misma idea. */}
        <div className="glass-chip flex rounded-lg p-0.5">
          {APARTADOS.map((a) => (
            <button
              key={a.id}
              onClick={() => setApartado(a.id)}
              aria-pressed={apartado === a.id}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                apartado === a.id
                  ? "bg-brand-400 text-[#231903] shadow-sm"
                  : "text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        {/* De quién son estos números. Con dos secciones, las mismas
            pantallas enseñan dos juegos distintos y sin decirlo no hay forma
            de saber cuál se está mirando. */}
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-text-muted ring-1 ring-border">
          {SECCIONES[seccion].nombre}
        </span>
        {/* El periodo, con el rótulo DELANTE y en el estilo de los de las
            barras de filtros ("VER", "QUIÉN"): era el único encima. El mismo
            calendario que el tablero y el Historial. */}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            Entre fechas
          </span>
          <SelectorFecha
            desde={desde}
            hasta={hasta}
            onCambiar={(d, h) => setPeriodo({ desde: d, hasta: h })}
          />
          {/* Los tres periodos que se piden de verdad, sin abrir el
              calendario. "Todo" sigue estando, pero ya no es lo primero
              que se ve: mete meses de rodaje dentro del titular. */}
              {ATAJOS.map((a) => {
                const p = a.dias === null ? { desde: "", hasta: "" } : ventanaDeDias(a.dias, hoyISO());
                const puesto = p.desde === desde && p.hasta === hasta;
                return (
                  <button
                    key={a.label}
                    onClick={() => setPeriodo(p)}
                    aria-pressed={puesto}
                    className={`rounded-lg px-2 py-1 text-xs font-medium ${
                      puesto ? "bg-surface-2 text-text ring-1 ring-border" : "text-text-muted hover:text-text"
                    }`}
                  >
                    {a.label}
                  </button>
                );
              })}
        </div>
      </div>
      <p className="-mt-2 text-[11px] text-text-muted">{DE_QUE_VA[apartado]}</p>

      {error && (
        <ErrorCarga mensaje="No se pudieron cargar las métricas." onReintentar={() => { setError(false); setIntento((v) => v + 1); }} />
      )}

      {!datos && !error && (
        <p className="glass-panel rounded-xl p-4 text-xs text-text-muted">Contando…</p>
      )}

      {m && apartado === "trabajo" && (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {/* ── Cuánto sale ── */}
          <section className="glass-panel rounded-xl p-4">
            {m.volumen.terminadas === 0 && m.volumen.planteos === 0 ? (
              <p className="text-xs text-text-muted">
                No consta trabajo terminado en este periodo.
              </p>
            ) : (
              <>
                <p className="text-3xl font-bold text-text">
                  {m.volumen.ofTerminadas}
                  <span className="ml-2 text-xs font-medium text-text-muted">
                    {m.volumen.ofTerminadas === 1 ? "OF terminada" : "OF terminadas"}
                  </span>
                </p>
                <p className="mt-1">
                  <Delta
                    ahora={m.volumen.ofTerminadas}
                    antes={previo?.volumen.ofTerminadas ?? null}
                    masEsMejor
                    sinDatosPrevios={previoVacio}
                  />
                </p>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-muted">
                  <span>
                    <strong className="font-semibold text-text">{m.volumen.planteos}</strong>{" "}
                    {m.volumen.planteos === 1 ? "planteo entregado" : "planteos entregados"}
                  </span>
                  <span>
                    <strong className="font-semibold text-text">{m.revisiones}</strong>{" "}
                    {m.revisiones === 1 ? "revisión" : "revisiones"}
                  </span>
                </div>
                {/* Las dos cifras son distintas cuando algo se reabrió, y ahí
                    está el dato: cerrar 130 veces 120 OF significa que diez
                    volvieron después de darlas por buenas. */}
                {m.volumen.terminadas !== m.volumen.ofTerminadas && (
                  <p className="mt-2.5 border-t border-border pt-2 text-[11px] text-text-muted">
                    Se cerró trabajo {m.volumen.terminadas} veces sobre esas{" "}
                    {m.volumen.ofTerminadas} OF: alguna se reabrió y hubo que volver a darla
                    por buena.
                  </p>
                )}
              </>
            )}
          </section>

          {/* ── Si el ritmo se mantiene ── */}
          {m.porMes.length > 1 && (
            <section className="glass-panel rounded-xl p-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Mes a mes
              </h3>
              {/* Los mismos colores que en el resto de la app: quien plantea va
                  en esmeralda, quien revisa en violeta y lo aprobado en cian.
                  Sin esto serían tres barras grises con una leyenda que hay que
                  memorizar. */}
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
                {SERIES.map((s) => (
                  <li key={s.clave} className="flex items-center gap-1.5">
                    <span className={`size-2 rounded-full ${s.barra}`} />
                    {s.label}
                  </li>
                ))}
              </ul>
              <ul className="mt-3 flex flex-col gap-2.5">
                {m.porMes.map((mes) => (
                  <BarraTrabajo
                    key={mes.mes}
                    mes={mes}
                    max={Math.max(
                      1,
                      ...m.porMes.flatMap((x) => [x.planteos, x.revisiones, x.terminadas]),
                    )}
                    enCurso={mes.mes === mesActual()}
                  />
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-text-muted">
                Un planteo entregado dos veces —porque volvió y se corrigió— cuenta las dos:
                es trabajo hecho otra vez.
              </p>
            </section>
          )}
        </div>
      )}

      {m && apartado === "devoluciones" && (
        <div className="grid items-start gap-4 xl:grid-cols-2">
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
                  {/* En PUNTOS, no en por ciento: pasar del 30 % al 33 % son
                      tres puntos, y llamarlo "un 10 % más" es la confusión
                      clásica de los porcentajes sobre porcentajes. */}
                  <span className="ml-2 block font-normal">
                    <Delta
                      ahora={prop === null ? null : Math.round(prop * 100)}
                      antes={
                        previo && proporcionDevueltas(previo) !== null
                          ? Math.round(proporcionDevueltas(previo)! * 100)
                          : null
                      }
                      sufijo=" pts"
                      masEsMejor={false}
                    />
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
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
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
          {/* Solo los meses en los que se revisó algo. Desde que se cuenta el
              volumen, un mes puede existir con planteos y ninguna revisión, y
              ahí "0 de 0" no es una proporción: es un hueco. */}
          {mesesRevisados.length > 1 && (
            <section className="glass-panel rounded-xl p-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Mes a mes
              </h3>
              <ul className="mt-3 flex flex-col gap-2">
                {mesesRevisados.map((mes) => (
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
        </div>
      )}

      {/* ── Dónde se para el trabajo ── */}
      {/* TRES TARJETAS, UNA POR PASO, lado a lado. Era una sola tarjeta con
          los tres en lista: a todo el ancho cada explicación quedaba en una
          punta y su cifra en la otra, y con tope se quedaba pegada a la
          izquierda con el resto de la pantalla vacío. Así cada paso tiene su
          cifra grande, como "OF terminadas" en Trabajo, y se comparan de un
          vistazo. */}
      {m && apartado === "tiempos" && (
        <section aria-label="Cuánto tarda cada paso" className="flex flex-col gap-3">
          <p className="text-[11px] text-text-muted">
            El tiempo típico, no el medio: una OF que se quedó parada por unas vacaciones
            desviaría la media y haría pensar que todo va lento.
          </p>
          <ul className="grid gap-4 md:grid-cols-3">
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
          <p className="text-[11px] text-text-muted">
            Lo que todavía está esperando no cuenta: no se sabe cuánto va a tardar, y darlo por
            acabado ahora haría que los números bajaran solos. El trabajo fichado solo se mide
            donde hay fichaje en la web; por eso va dicho sobre cuántos casos se pudo mirar.
          </p>
        </section>
      )}

      {/* ── Qué no hace OT ── */}
      {m && apartado === "anuladas" && (
        // Dos columnas, como Trabajo y Devoluciones: la cifra a un lado y el
        // porqué al otro. Era una tarjeta estrecha pegada a la izquierda.
        m.anulaciones === 0 ? (
          <section className="glass-panel rounded-xl p-4">
            <p className="text-xs text-text-muted">No se ha anulado ninguna OF en este periodo.</p>
          </section>
        ) : (
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <section className="glass-panel rounded-xl p-4">
              <p className="text-3xl font-bold text-text">
                {m.anulaciones}
                <span className="ml-2 text-xs font-medium text-text-muted">
                  {m.anulaciones === 1 ? "OF anulada" : "OF anuladas"}
                </span>
              </p>
              <p className="mt-1">
                <Delta
                  ahora={m.anulaciones}
                  antes={previo?.anulaciones ?? null}
                  masEsMejor={false}
                  sinDatosPrevios={previoVacio}
                />
              </p>
            </section>
            <section className="glass-panel rounded-xl p-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
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
            </section>
          </div>
        )
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

/** Cuánto ha cambiado un número respecto al periodo anterior de la misma
 *  longitud.
 *
 *  El color dice si es buena noticia, y para eso hace falta `masEsMejor`: subir
 *  las OF terminadas es bueno y subir las devoluciones no, y una flecha del
 *  mismo color en los dos sitios obligaría a pararse a pensar cada vez.
 *
 *  Sin periodo anterior —"Todo"— no se pinta nada: es mejor no decir nada que
 *  comparar contra una ventana de otro tamaño. */
function Delta({
  ahora,
  antes,
  sufijo = "",
  masEsMejor,
  sinDatosPrevios = false,
}: {
  ahora: number | null;
  antes: number | null;
  sufijo?: string;
  masEsMejor: boolean;
  /** El periodo anterior existe pero está vacío (ver `sinActividad`). */
  sinDatosPrevios?: boolean;
}) {
  if (ahora === null || antes === null) return null;
  if (sinDatosPrevios) {
    return <span className="text-[11px] text-text-muted">sin datos del periodo anterior</span>;
  }
  const d = Math.round((ahora - antes) * 10) / 10;
  if (d === 0) {
    return <span className="text-[11px] text-text-muted">igual que el periodo anterior</span>;
  }
  const mejor = d > 0 === masEsMejor;
  return (
    <span
      className={`text-[11px] font-semibold tabular-nums ${
        mejor ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-400"
      }`}
    >
      {d > 0 ? "▲" : "▼"} {Math.abs(d)}
      {sufijo}{" "}
      <span className="font-normal text-text-muted">vs. el periodo anterior</span>
    </span>
  );
}

/** El nombre corto de un mes: "ago 2026". */
const MESES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];
function nombreMes(mes: string): string {
  const [anio, m] = mes.split("-");
  return `${MESES[Number(m) - 1] ?? m} ${anio}`;
}

/** Un mes de volumen: las tres cuentas, una barra fina cada una.
 *
 *  Tres barras apiladas y no tres columnas: los números van arriba, alineados,
 *  y las barras debajo solo dan la forma. Así se compara un mes con otro de un
 *  vistazo sin tener que leer cifra por cifra. */
function BarraTrabajo({
  mes,
  max,
  enCurso,
}: {
  mes: { mes: string; planteos: number; revisiones: number; terminadas: number };
  max: number;
  enCurso: boolean;
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-text">
          {nombreMes(mes.mes)}
          {/* El mes en curso va dicho y no solo insinuado: sin esto, el último
              siempre parece una caída. */}
          {enCurso && <span className="ml-1.5 text-text-muted">· en curso</span>}
        </span>
        <span className="flex shrink-0 gap-3 tabular-nums font-semibold">
          {SERIES.map((s) => (
            <span key={s.clave} className={s.texto} title={s.label}>
              {mes[s.clave]}
            </span>
          ))}
        </span>
      </div>
      <div className={`mt-1 flex flex-col gap-0.5 ${enCurso ? "opacity-60" : ""}`}>
        {SERIES.map((s) => (
          <div key={s.clave} className="h-1.5 w-full rounded-full bg-[var(--glass-highlight)]">
            <div
              style={{ width: `${Math.min(100, (mes[s.clave] / max) * 100)}%` }}
              className={`h-full rounded-full ${s.barra}`}
            />
          </div>
        ))}
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
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-text">{nombreMes(mes)}</span>
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
    <li className="glass-panel flex flex-col rounded-xl p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{rotulo}</h3>
      <p className="mt-2 text-3xl font-bold tabular-nums text-text">
        {tramo.medianaMin === null ? "—" : fmtMin(tramo.medianaMin)}
      </p>
      <p className="mt-1 text-[11px] text-text-muted">
        {tramo.n === 0 ? "sin datos todavía" : `medido ${tramo.n} ${tramo.n === 1 ? "vez" : "veces"}`}
      </p>
      <p className="mt-3 text-[11px] leading-snug text-text-muted">{explica}</p>
      {/* Lo que de verdad se trabajó dentro de ese rato. Las dos cifras van
          juntas y SIN dividir una por otra: son dos medianas de casos
          distintos, y su cociente no es el de ningún caso real. Puestas al
          lado, la diferencia se ve igual de bien y no se inventa nada. */}
      {tramo.trabajo.n > 0 && (
        <p className="mt-auto border-t border-border pt-2 text-[11px] text-text-muted">
          De ese rato, fichados{" "}
          <strong className="font-semibold text-text">
            {/* Hubo fichaje —si no, esta línea no se pinta—, así que "0m"
                diría que no se trabajó cuando lo que pasa es que duró menos
                de un minuto. */}
            {tramo.trabajo.medianaMin ? fmtMin(tramo.trabajo.medianaMin) : "menos de 1m"}
          </strong>{" "}
          de trabajo · medido en {tramo.trabajo.n} de {tramo.n}
        </p>
      )}
    </li>
  );
}

/** Cómo se llama una causa de anulación. Las de antes de que se pidiera van
 *  con su propio rótulo en vez de en blanco: son un dato, no un hueco. */
function rotuloAnulacion(id: string | null): string {
  if (id === null) return "Sin causa apuntada";
  return CAUSAS.find((c) => c.id === id)?.label ?? id;
}
