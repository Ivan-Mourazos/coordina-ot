"use client";

import { useCallback, useEffect, useState } from "react";
import type { PedidoPublico, PedidoPublicoDetalle } from "@/lib/publico";
import { agruparOfsPublicas, esPedidoTerminado, recorridoPublico } from "@/lib/publico";
import { lineaTiempo, TRAMO, urgenciaRecorrido } from "@/lib/linea-tiempo";
import { hoyISO } from "@/lib/types";
import { fmtDiaMesAno, fmtFechaLarga } from "@/lib/fechas";
import { ESTADO, fmtMin } from "@/lib/estado";
import { ErrorCarga } from "./ErrorCarga";
import { DocumentosRps } from "./DocumentosRps";
import { FamiliaTag } from "./FamiliaTag";

// ─── Los pedidos de la casa, para quien solo mira ────────────────────────────
// La misma pregunta de siempre —"¿por dónde va mi pedido?"— hoy se hace por
// teléfono. Esta lista es la respuesta sin llamar: lo que se entrega antes
// arriba, lo vencido en rojo, y al desplegar, las OF con sus tareas y quién
// las hizo. Nada que escribir: ni un botón que guarde, solo "Actualizar".
//
// "Pendientes" y "Realizados" son la MISMA fila con otra fecha (entrega o
// cierre) — no dos componentes, que es como acababan diciendo cosas
// distintas del mismo pedido dentro de un mes.

/** Qué fecha se enseña, el título de la pestaña y qué se dice cuando no hay
 *  resultados, según la lista. Quien llega aquí no ha visto la web nunca: el
 *  título dice sin ambigüedad qué se está mirando. */
const TEXTOS: Record<
  "pendientes" | "realizados",
  { columna: string; titulo: string; sub: string; vacio: string }
> = {
  pendientes: {
    columna: "Entrega",
    titulo: "Pedidos pendientes",
    sub: "Lo que se entrega antes, primero. Lo vencido, en rojo.",
    vacio: "No hay pedidos pendientes con esa búsqueda.",
  },
  realizados: {
    columna: "Cierre",
    titulo: "Pedidos realizados",
    sub: "Lo cerrado más recientemente, primero.",
    vacio: "No hay pedidos realizados con esa búsqueda.",
  },
};

/** La respuesta de `/api/publico/pedidos`: las filas de la página y, solo en
 *  pendientes sin pedir el apartado de vencidos, el total de verdad de
 *  vencidos (no el de esta página — ver filtrarPublico en lib/publico.ts). */
type RespuestaLista = { pedidos: PedidoPublico[]; hasMore: boolean; vencidos?: number };

export function ConsultaPendientes({ lista }: { lista: "pendientes" | "realizados" }) {
  const [pedidos, setPedidos] = useState<PedidoPublico[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  // Cuántos pedidos vencidos hay EN TOTAL (no los cargados): lo manda el
  // servidor con cada página de "pendientes", porque es el único que ve el
  // filtro entero y no solo las 40 filas de la pantalla.
  const [vencidos, setVencidos] = useState(0);
  const [q, setQ] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  /** La lista existe pero todavía no está construida (ver el 503 de abajo). */
  const [preparando, setPreparando] = useState(false);

  const cargar = useCallback(
    async (paginaAcargar: number, reemplazar: boolean) => {
      setCargando(true);
      setError(false);
      try {
        const sp = new URLSearchParams({ lista, page: String(paginaAcargar) });
        if (q.trim()) sp.set("q", q.trim());
        const res = await fetch(`/api/publico/pedidos?${sp}`, { cache: "no-store" });
        // 503 = la lista aún se está construyendo (unos 35 s al arrancar el
        // servidor). No es un fallo: se dice que espere y se reintenta solo,
        // porque quien entra justo después de un despliegue no tiene por qué
        // saber que hay que recargar.
        if (res.status === 503) {
          setPreparando(true);
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const json: RespuestaLista = await res.json();
        setPreparando(false);
        setPedidos((previos) => (reemplazar ? json.pedidos : [...previos, ...json.pedidos]));
        setHasMore(json.hasMore);
        setVencidos(json.vencidos ?? 0);
        setPage(paginaAcargar);
      } catch {
        setError(true);
      } finally {
        setCargando(false);
      }
    },
    [lista, q],
  );

  // Al cambiar de pestaña o de búsqueda se vuelve a la página 0. Con debounce
  // para no lanzar una consulta por cada tecla del buscador.
  useEffect(() => {
    const t = setTimeout(() => void cargar(0, true), 300);
    return () => clearTimeout(t);
  }, [cargar]);

  // Mientras se construye la lista, se vuelve a preguntar sola cada diez
  // segundos: tarda unos 35 s y nadie tiene por qué saber que hay que recargar.
  useEffect(() => {
    if (!preparando) return;
    const t = setTimeout(() => void cargar(0, true), 10_000);
    return () => clearTimeout(t);
  }, [preparando, cargar]);

  const texto = TEXTOS[lista];
  const cargaInicial = cargando && pedidos.length === 0;
  // La página nunca trae vencidos entre sus 40 filas (el servidor ya los
  // aparta, ver filtrarPublico): lo cargado son solo pedidos por venir y,
  // detrás, los sin fecha de entrega. Se separan aquí para meter el apartado
  // plegado justo entre los dos grupos, sin tocar el orden de cada uno.
  const conFecha = lista === "pendientes" ? pedidos.filter((p) => p.fechaEntrega !== null) : pedidos;
  const sinFecha = lista === "pendientes" ? pedidos.filter((p) => p.fechaEntrega === null) : [];
  // Puede haber pedidos pendientes de verdad y que TODOS estén vencidos (la
  // página principal, entonces, llega vacía): decir "no hay pedidos" ahí
  // sería mentir, así que el vacío de verdad exige también que no haya
  // vencidos que enseñar.
  const listaVacia = pedidos.length === 0 && vencidos === 0;

  return (
    <main className="mx-auto w-full max-w-[1100px] space-y-3 p-4">
      <header className="glass-panel space-y-3 rounded-2xl px-4 py-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-700 dark:text-brand-300">
            Consulta pública · solo lectura
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-text">{texto.titulo}</h1>
          <p className="mt-0.5 text-xs text-text-muted">{texto.sub}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-56 flex-1 text-xs text-text-muted">
            <span className="sr-only">Buscar pedidos</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pedido, cliente o descripción…"
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 pr-8 text-sm text-text outline-none focus:border-brand-400"
            />
            {q && (
              <button
                type="button"
                aria-label="Vaciar la búsqueda"
                onClick={() => setQ("")}
                className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-text-muted hover:bg-surface-2"
              >
                ✕
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => void cargar(0, true)}
            disabled={cargando}
            className="chip-3d h-9 shrink-0 rounded-lg px-3 text-xs font-semibold text-text disabled:cursor-wait disabled:opacity-60"
          >
            Actualizar
          </button>
        </div>

        {/* Sin esto, quien busca un pedido de hace tres años y no lo encuentra
            en la lista de siempre pensará que no existe. La lista sin buscar
            se para en 2025 a propósito (ver lib/publico.ts): detrás hay más
            de 100.000 pedidos que RPS nunca cerró, y enseñarlos de entrada
            enterraría lo que de verdad está en marcha. Buscando, no hay corte. */}
        {lista === "pendientes" && (
          <p className="text-[11px] text-text-muted">
            La lista, sin buscar, solo baja hasta 2025. Escribe el pedido, el cliente o la
            descripción y aparece aunque sea de hace años.
          </p>
        )}
      </header>

      {error && <ErrorCarga mensaje="No se pudieron cargar los pedidos." onReintentar={() => void cargar(0, true)} />}

      {preparando && !error && (
        <div className="glass-panel grid min-h-32 place-items-center rounded-2xl px-6 text-center">
          <div>
            <p className="text-sm font-semibold text-text">Preparando la lista de pedidos…</p>
            <p className="mt-1 text-xs text-text-muted">
              Pasa la primera vez después de una actualización y tarda menos de un minuto.
              Esta pantalla se actualiza sola.
            </p>
          </div>
        </div>
      )}

      {/* «No hay pedidos» solo cuando de verdad se ha mirado: mientras la
          lista se construye, lo que toca decir es que espere. */}
      {!error && !preparando && !cargaInicial && listaVacia && (
        <div className="glass-panel grid min-h-32 place-items-center rounded-2xl px-6 text-center">
          <p className="text-sm text-text-muted">{texto.vacio}</p>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {conFecha.map((p) => (
          <FilaPublica key={p.codigo} pedido={p} lista={lista} />
        ))}
        {/* Arriba, lo que se entrega de hoy en adelante; los vencidos aquí,
            plegados y con su número; los pedidos sin fecha de entrega, al
            final (ver el reparto de conFecha/sinFecha más arriba). */}
        {lista === "pendientes" && vencidos > 0 && <ApartadoVencidos total={vencidos} q={q} />}
        {sinFecha.map((p) => (
          <FilaPublica key={p.codigo} pedido={p} lista={lista} />
        ))}
      </ul>

      {cargaInicial && <p role="status" className="py-2 text-center text-xs text-text-muted">Cargando…</p>}
      {/* El botón se queda montado mientras haya más que traer, también
          mientras carga: si desaparece justo al pulsarlo, quien lo tocó con
          el teclado pierde el foco y no sabe dónde ha ido a parar. */}
      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void cargar(page + 1, false)}
            disabled={cargando}
            className="chip-3d h-9 rounded-lg px-4 text-xs font-semibold text-text disabled:cursor-wait disabled:opacity-60"
          >
            {cargando ? "Cargando…" : "Ver más"}
          </button>
        </div>
      )}
    </main>
  );
}

/** El apartado plegado de lo vencido (Cambio 1, task-7c). No forma parte de
 *  la página principal: solo pide sus propias filas —con su propia
 *  paginación de 40 en 40— cuando alguien lo despliega, igual que
 *  `DetallePublico` no pide una OF hasta que se abre la fila. El número de la
 *  cabecera SÍ llega ya cargado (lo manda cada página de la lista principal,
 *  ver `vencidos` en `ConsultaPendientes`): es el total de verdad, y no hay
 *  que abrir nada para conocerlo. */
function ApartadoVencidos({ total, q }: { total: number; q: string }) {
  const [abierto, setAbierto] = useState(false);
  const [tocado, setTocado] = useState(false);
  const [pedidos, setPedidos] = useState<PedidoPublico[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);

  const cargar = useCallback(
    async (paginaAcargar: number, reemplazar: boolean) => {
      setCargando(true);
      setError(false);
      try {
        const sp = new URLSearchParams({ lista: "pendientes", page: String(paginaAcargar), vencidos: "1" });
        if (q.trim()) sp.set("q", q.trim());
        const res = await fetch(`/api/publico/pedidos?${sp}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const json: RespuestaLista = await res.json();
        setPedidos((previos) => (reemplazar ? json.pedidos : [...previos, ...json.pedidos]));
        setHasMore(json.hasMore);
        setPage(paginaAcargar);
      } catch {
        setError(true);
      } finally {
        setCargando(false);
      }
    },
    [q],
  );

  // Si ya estaba abierto y cambia la búsqueda, se vuelve a pedir desde la
  // página 0: si no, un apartado abierto seguiría enseñando el resultado de
  // la búsqueda anterior mientras el resto de la pantalla ya cambió. Envuelto
  // en un timeout (como `DetallePublico`, más abajo) para no llamar a
  // `setState` en el cuerpo mismo del efecto.
  useEffect(() => {
    if (!tocado) return;
    const id = setTimeout(() => void cargar(0, true), 0);
    return () => clearTimeout(id);
    // Solo cuando cambia la búsqueda: abrir el apartado ya dispara su propia
    // carga inicial (ver el botón, abajo) y no debe repetirla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <li className="glass-panel overflow-hidden rounded-xl">
      <button
        type="button"
        onClick={() => {
          setAbierto((a) => !a);
          if (!tocado) {
            setTocado(true);
            void cargar(0, true);
          }
        }}
        aria-expanded={abierto}
        aria-controls="apartado-vencidos"
        /* `flex-wrap` e `items-baseline` como la fila de un pedido: en pantalla
           estrecha la frase de al lado pasa a dos líneas, y con `items-center`
           el número y la flecha quedaban centrados respecto a un bloque de dos
           líneas, descuadrados con la fila de debajo. */
        className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-[var(--glass-highlight)] focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
      >
        {/* Mismo morado que la línea de tiempo de cada fila (`TRAMO.fuera`) y
            no un rojo aparte: "vencido" es un solo color en toda la
            pantalla, el que ya usa `Recorrido` (ListaView.tsx) para lo
            mismo. */}
        <span className="text-xs font-semibold" style={{ color: TRAMO.fuera }}>
          {total} vencido{total === 1 ? "" : "s"}
        </span>
        <span className="text-xs text-text-muted">Se acumulan con entrega ya pasada. Toca para verlos.</span>
        <span aria-hidden="true" className={`ml-auto shrink-0 text-text-muted transition-transform ${abierto ? "rotate-180" : ""}`}>
          <ChevronIcon />
        </span>
      </button>
      <div id="apartado-vencidos" hidden={!abierto} className="border-t border-border">
        {error && (
          <div className="p-3">
            <ErrorCarga mensaje="No se pudieron cargar los pedidos vencidos." onReintentar={() => void cargar(0, true)} />
          </div>
        )}
        {!error && (
          <ul className="flex flex-col gap-2 p-2">
            {pedidos.map((p) => (
              <FilaPublica key={p.codigo} pedido={p} lista="pendientes" />
            ))}
            {cargando && pedidos.length === 0 && (
              <p role="status" className="py-2 text-center text-xs text-text-muted">Cargando…</p>
            )}
            {hasMore && (
              <div className="flex justify-center pb-1">
                <button
                  type="button"
                  onClick={() => void cargar(page + 1, false)}
                  disabled={cargando}
                  className="chip-3d h-9 rounded-lg px-4 text-xs font-semibold text-text disabled:cursor-wait disabled:opacity-60"
                >
                  {cargando ? "Cargando…" : "Ver más"}
                </button>
              </div>
            )}
          </ul>
        )}
      </div>
    </li>
  );
}

function FilaPublica({ pedido, lista }: { pedido: PedidoPublico; lista: "pendientes" | "realizados" }) {
  const [abierto, setAbierto] = useState(false);
  // Una vez abierta la primera vez, el detalle se queda montado (solo oculto)
  // para no repetir la consulta a RPS cada vez que se pliega y despliega la
  // misma fila.
  const [tocado, setTocado] = useState(false);
  const texto = TEXTOS[lista];
  const hoy = hoyISO();
  // La fecha que se enseña cambia con la pestaña: la entrega en Pendientes,
  // el cierre en Realizados. Es lo único que distingue una fila de la otra.
  const fecha = lista === "pendientes" ? pedido.fechaEntrega : pedido.fechaFinalizacion;

  // Regla que no puede romperse (ver consulta-fila.test.ts): el invitado no
  // tiene la fecha de planificación de OT — la recalcula en bloque el
  // planificador de RPS y fuera de OT no significa nada —, así que el
  // recorrido se mide siempre contra la ENTREGA, con `planificacionEstimada`
  // puesto para que `lineaTiempo` sepa que esa fecha es prestada
  // (`recorridoPublico`, lib/publico.ts).
  const vencido =
    lista === "pendientes" &&
    pedido.fechaEntrega !== null &&
    lineaTiempo(recorridoPublico({ fechaPedido: pedido.fechaPedido ?? undefined, fechaEntrega: pedido.fechaEntrega }), hoy)
      .diasParaEntrega < 0;

  return (
    <li className="glass-panel overflow-hidden rounded-xl">
      <button
        type="button"
        onClick={() => {
          setAbierto((a) => !a);
          setTocado(true);
        }}
        aria-expanded={abierto}
        aria-controls={`detalle-${pedido.codigo}`}
        className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-[var(--glass-highlight)] focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
      >
        <span className="font-mono text-sm font-semibold text-text">{pedido.codigo}</span>
        {/* Cliente, negocio y ciudad de entrega en UNA sola pieza recortada:
            comparados con la fila de Realizados, que Iván prefiere por ser una
            sola línea, aquí caben tres datos más y no hay sitio para todos
            enteros. Se trunca con puntos suspensivos y el texto completo
            queda en el `title` — apoyo suficiente para este dato secundario
            (el principal es el estado, justo al lado, que NO se trunca así,
            ver más abajo). Con `min-w-0` para que SÍ pueda encogerse (sin él,
            un texto largo empuja el resto de la fila fuera en vez de
            recortarse). */}
        <span
          className="min-w-0 flex-1 truncate text-sm text-text-muted"
          title={[pedido.cliente ?? "—", pedido.negocio, pedido.ciudadEntrega].filter(Boolean).join(" · ")}
        >
          {pedido.cliente ?? "—"}
          {pedido.negocio && <span> · {pedido.negocio}</span>}
          {pedido.ciudadEntrega && <span> · {pedido.ciudadEntrega}</span>}
        </span>
        {/* El estado ("Pendiente de: Corte, Confección…"), en la MISMA línea:
            es la respuesta a la pregunta por la que se entra aquí, así que
            tiene que estar SIEMPRE visible entero, pero una fila de Realizados
            de una sola línea (el diseño que a Iván le gustó más, comparando
            las dos listas ya con datos) no deja sitio para una segunda línea
            fija. Por eso NO se trunca con `title` como el bloque de arriba
            —esta pantalla la mira gente de fuera, probablemente desde el
            móvil, donde el `title` no se ve nunca—: al no llevar `flex-1` ni
            `truncate`, ocupa lo que necesita en esta línea y, si no cabe,
            `flex-wrap` (en el botón) lo baja entero a una segunda —justo la
            otra idea de Iván: "que la segunda línea solo aparezca cuando de
            verdad haga falta". Solo en Pendientes — en Realizados la frase es
            siempre "Entregado" (sale de la MISMA regla que decide quién entra
            en esa lista: sin tarea abierta y sin nada por entregar, ver
            `filtrarPublico`, publico.ts) y repetirlo en cada fila no informa,
            solo ocupa sitio. */}
        {lista === "pendientes" && <span className="text-xs text-text-muted">{pedido.estado}</span>}
        <span
          className="shrink-0 text-xs font-semibold text-text-muted"
          style={vencido ? { color: TRAMO.fuera } : undefined}
          title={fecha ? `${texto.columna}: ${fmtFechaLarga(fecha)}` : `Sin fecha de ${texto.columna.toLowerCase()}`}
        >
          {vencido && "Vencido · "}
          {/* Con año: la lista mezcla pedidos de varias campañas (2025, 2026,
              y buscando hasta de 2019), y un día y mes sueltos no dicen de
              cuál es (ver fmtDiaMesAno en lib/fechas.ts). */}
          {texto.columna} {fecha ? fmtDiaMesAno(fecha) : "—"}
        </span>
        <span
          aria-hidden="true"
          className={`shrink-0 text-text-muted transition-transform ${abierto ? "rotate-180" : ""}`}
        >
          <ChevronIcon />
        </span>
      </button>
      {/* El recorrido, visible sin desplegar: es donde se contesta "para
          cuándo es y llega o no llega" (encargo de Iván: "así los comerciales
          ven las fechas"). COMPACTO a propósito —sin caja, sin rótulo visible,
          sin leyenda aparte— porque la fila ya no puede permitirse más alto:
          es justo lo que Iván pidió al comparar las dos listas ("que
          Pendientes se parezca a Realizados, más limpia y compactada"). El
          listón de altura es `Recorrido` en ListaView.tsx (la barra de la
          fila de Pendientes del tablero del equipo); ver el comentario de
          `LineaTiempoPublica` para el porqué de no compartir pieza con ella.
          Solo en Pendientes — en Realizados ya se entregó y no hay recorrido
          que mirar. El margen va DENTRO de `LineaTiempoPublica`: cuando falta
          alguna fecha esa función no pinta nada (`return null`), y si el
          hueco lo pusiera un `div` aquí fuera quedaría un margen colgando sin
          nada dentro. */}
      {lista === "pendientes" && <LineaTiempoPublica pedido={pedido} hoy={hoy} />}
      {/* El contenedor va SIEMPRE montado (con `hidden`, no desmontado): si
          desapareciera al cerrar, `aria-controls` del botón de arriba
          apuntaría a un id que no existe en el DOM mientras la fila está
          cerrada, que es la mayoría del tiempo. */}
      <div id={`detalle-${pedido.codigo}`} hidden={!abierto} className="border-t border-border px-4 py-3">
        {tocado && <DetallePublico codigo={pedido.codigo} />}
      </div>
    </li>
  );
}

/** El recorrido del pedido, a escala, con hoy encima: cuándo entró y para
 *  cuándo se pide, para que se LEAN las fechas sin restar de cabeza (encargo
 *  de Iván). SOLO DOS hitos —entrada y entrega—: ni planificación ni
 *  fabricación entran aquí a propósito (otro recorte de Iván), son fechas de
 *  OT que fuera de aquí no significan lo que parecen.
 *
 *  COMPACTO a propósito: la primera versión copiaba la caja grande de
 *  `LineaTiempoPedido` (la ficha del equipo) y, con datos reales, se comía
 *  demasiado alto — Iván comparó las dos listas y pidió que Pendientes se
 *  pareciera a Realizados, "más limpia y compactada". El listón pasa a ser
 *  `Recorrido` (ListaView.tsx, la barra de la fila de Pendientes del
 *  tablero): fecha encima, barra fina debajo, sin caja ni rótulo ni leyenda
 *  aparte. Se toma la MISMA idea, no una pieza compartida ni su
 *  `repartirEtiquetas`: aquella reparte hasta CUATRO fechas que pueden caer
 *  juntas, en una columna de ancho fijo en píxeles. Aquí SIEMPRE son
 *  exactamente DOS —los dos extremos del recorrido: con dos únicos hitos,
 *  `lineaTiempo` los pone siempre en 0 % y 100 %, así que nunca pueden
 *  pisarse— y la fila es de ancho variable (de un móvil a un escritorio).
 *  Por eso cada fecha se ancla a SU borde (la de la entrada a la izquierda,
 *  la de la entrega a la derecha) en vez de repartirse: así no se abre un
 *  hueco creciente entre el texto y su punto al ensanchar la pantalla, que es
 *  justo lo que pasaba calculando la separación en porcentaje.
 *
 *  Con la entrega prestada, `urgenciaRecorrido` no colorea tramos (no hay
 *  planificación de la que graduarlos: ver su comentario, "sin fecha de
 *  planteo no se colorea nada"), así que el color sale de `vencido`
 *  directamente, con los MISMOS dos tonos de la escalada (`TRAMO.holgado`,
 *  `TRAMO.fuera`) y no unos inventados — el mismo morado que ya usa
 *  `Recorrido` para "vencido" y no un rojo aparte. El chip "+Nd" (mismo que
 *  el de `Recorrido`) dice cuánto se pasó; mientras se llega no hace falta
 *  chip, las fechas ya lo dicen.
 *
 *  Sin las dos fechas no hay línea honesta que dibujar (mejor ninguna que una
 *  inventada): se calla del todo. */
function LineaTiempoPublica({ pedido, hoy }: { pedido: PedidoPublico; hoy: string }) {
  if (pedido.fechaPedido === null || pedido.fechaEntrega === null) return null;

  const datos = recorridoPublico({ fechaPedido: pedido.fechaPedido, fechaEntrega: pedido.fechaEntrega });
  const linea = lineaTiempo(datos, hoy);
  const { hitos, hoyPct, hoyFuera, diasParaEntrega } = linea;
  const { vencido } = urgenciaRecorrido(linea, datos, hoy);
  const colorRecorrido = vencido ? TRAMO.fuera : TRAMO.holgado;

  // Con el año cuando el recorrido cruza de un año a otro: la lista mezcla
  // 2025 y 2026, y buscando salen pedidos de 2019 (mismo criterio que
  // `Recorrido`, ListaView.tsx, y que la fecha suelta de la fila).
  const aniosDistintos = new Set(hitos.map((h) => h.iso.slice(0, 4))).size > 1;
  const fmtHito = (iso: string) =>
    `${iso.slice(8, 10)}/${iso.slice(5, 7)}${aniosDistintos ? `/${iso.slice(2, 4)}` : ""}`;

  return (
    <div className="px-4 pb-2.5" title="Recorrido del pedido: de la entrada a la entrega">
      {/* Sin rótulo visible (para no gastar una línea de más), pero con uno
          para quien no puede ver el `title` de arriba (táctil, lector de
          pantalla): el `div` no es interactivo y su `title` no es fiable en
          ninguno de los dos casos. */}
      <span className="sr-only">Recorrido del pedido: de la entrada a la entrega</span>
      {/* Fecha de entrada anclada a la izquierda, fecha de entrega anclada a
          la derecha — los dos únicos hitos, siempre en los extremos (ver el
          comentario de la función). A 10 px como `Recorrido`: la fecha es lo
          único que hay que LEER de esta pieza. */}
      <div className="relative h-3">
        {hitos.map((h, i) => {
          const esUltimo = i === hitos.length - 1;
          return (
            <span
              key={h.clave}
              className={`absolute top-0 whitespace-nowrap text-[10px] leading-none ${esUltimo ? "right-0" : "left-0"} ${
                h.referencia ? "font-bold" : "text-text-muted"
              }`}
              style={{ color: h.referencia ? colorRecorrido : undefined }}
            >
              {fmtHito(h.iso)}
            </span>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5">
        <div className="relative h-2 flex-1">
          <div className="absolute inset-x-0 top-[3px] h-0.5 rounded-full bg-border" />
          {/* Lo recorrido hasta hoy: en marcha mientras se llega, rojo en
              cuanto la entrega ya se pasó. */}
          <div
            className="absolute top-[3px] h-0.5 rounded-full"
            style={{ left: "0%", width: `${hoyPct}%`, background: colorRecorrido }}
          />
          {hitos.map((h) => (
            <span
              key={h.clave}
              className="absolute top-0 size-2 -translate-x-1/2 rounded-full bg-border-strong"
              style={{ left: `${h.pct}%` }}
            />
          ))}
          {/* Hoy, por encima de los hitos. Si cae fuera del recorrido (antes
              de que entrara el pedido) se queda en el extremo, algo apagado;
              una vez vencido se queda pegado al extremo derecho pero a toda
              opacidad, que es justo lo que hay que seguir leyendo cuando el
              pedido lleva mucho retraso. */}
          <span
            className="absolute top-[-1px] size-2.5 -translate-x-1/2 rounded-full ring-2 ring-surface"
            style={{
              left: `${hoyPct}%`,
              background: vencido ? TRAMO.fuera : "var(--text)",
              opacity: hoyFuera && !vencido ? 0.5 : 1,
            }}
            title={
              hoyFuera && !vencido
                ? "Hoy, antes de que entrara el pedido"
                : vencido
                  ? `Hoy · fuera de fecha, ${-diasParaEntrega} d pasada la entrega`
                  : `Hoy · quedan ${diasParaEntrega} d`
            }
          />
          {/* El matiz de "hoy es antes de que entrara el pedido" solo vivía en
              el `title` de arriba, que ni se ve al tacto ni lo leen todos los
              lectores de pantalla — y esta pantalla la mira gente de fuera,
              probablemente desde el móvil. El de "vencido" no hace falta
              duplicarlo: ya está en el chip de al lado y en "Vencido" de la
              fecha de la cabecera. */}
          {hoyFuera && !vencido && <span className="sr-only">Hoy, antes de que entrara el pedido</span>}
        </div>
        {/* Cuánto se pasó, cuando se pasó: mientras se llega las fechas ya lo
            dicen (quedan tantos días hasta la de la derecha) y un chip de más
            sería ruido. Mismo chip que `Recorrido` (ListaView.tsx). */}
        {vencido && (
          <span
            className="shrink-0 rounded px-1 py-px text-[9px] font-bold leading-none"
            style={{ background: TRAMO.fuera, color: "var(--surface)" }}
          >
            +{-diasParaEntrega}d
          </span>
        )}
      </div>
    </div>
  );
}

/** Las OF con sus tareas y tiempos, y el PDF del pedido. Se pide al abrir y no
 *  con la lista: son 40 pedidos por página y casi ninguno se abre. */
function DetallePublico({ codigo }: { codigo: string }) {
  const [detalle, setDetalle] = useState<PedidoPublicoDetalle | null>(null);
  const [error, setError] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(() => {
    setCargando(true);
    setError(false);
    fetch(`/api/publico/pedidos/${encodeURIComponent(codigo)}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<PedidoPublicoDetalle>;
      })
      .then(setDetalle)
      .catch(() => setError(true))
      .finally(() => setCargando(false));
  }, [codigo]);

  useEffect(() => {
    const id = setTimeout(() => cargar(), 0);
    return () => clearTimeout(id);
  }, [cargar]);

  if (cargando) return <p className="text-sm text-text-muted">Cargando…</p>;
  if (error || !detalle) return <ErrorCarga mensaje="No se pudo cargar el pedido." onReintentar={cargar} />;

  // Sigue el pedido pendiente o ya está todo hecho: el rótulo del bloque de
  // abajo tiene que decirlo con la misma verdad. Misma señal que ya decide
  // qué campo trae cada tarea (`esPedidoTerminado`, lib/publico.ts): no es
  // una segunda regla, es la primera leída del propio dato que llegó.
  const terminado = esPedidoTerminado(detalle.ofs);

  return (
    <div className="space-y-3">
      {/* El PDF del pedido escaneado NO lleva botón aparte: ya sale abajo,
          entre los documentos de RPS, como "Pedido escaneado" (comprobado
          contra RPS en AR.26.04434, AR.26.03793 y AR.26.04082). Dos botones
          para lo mismo en la misma ficha es ruido, y quitar este se lleva
          también su ruta pública (ver publico.ts). Tampoco va "Lo llevó…":
          quién hizo el trabajo es cosa de casa, no algo que le diga nada a
          quien pregunta desde fuera. La ciudad de entrega tampoco se repite
          aquí: ya va en la cabecera de la fila, junto al cliente (ver
          `FilaPublica`). */}
      <div className="flex flex-wrap items-center gap-2">
        {detalle.familias.map((f) => (
          <FamiliaTag key={f} familia={f} />
        ))}
      </div>
      <div className="bloque-3d rounded-xl px-3 py-2">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          {terminado ? "Qué llevó el pedido" : "Qué lleva y qué falta"}
        </p>
        <OfsPublicas ofs={detalle.ofs} />
      </div>
      {/* Lo que RPS tiene colgado del pedido: planteamiento, presupuesto y las
          fotos de la visita y de la instalación. Casi todos llevan algo (3.960
          de 3.962 en la serie AR.26), y es lo que un comercial quiere poder
          enseñarle al cliente sin llamar a Oficina Técnica. La misma pieza que
          usa el equipo, con las URL ya reescritas a la ruta pública, y el
          "Pedido escaneado" puesto primero (ver `clasePrimero`,
          DocumentosRps.tsx): es el documento que todo el mundo busca aquí. */}
      <div className="bloque-3d rounded-xl px-3 py-2">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          Documentos de RPS
        </p>
        <DocumentosRps documentos={detalle.documentos} clasePrimero="Pedido escaneado" />
      </div>
    </div>
  );
}

/** Las OF del pedido con sus tareas: qué queda por hacer si el pedido sigue
 *  vivo, o cuánto costó cada paso si ya terminó — nunca las dos cosas a la
 *  vez, lo decide el servidor por tarea (`TareaPublica`, lib/publico.ts) y
 *  aquí solo se pinta lo que llega.
 *
 *  Pintura PROPIA y no `HistorialOFsCompactas`/`HistorialTareas` (las del
 *  equipo, en sus propios ficheros): esas dan por hecho el nombre de quien
 *  hizo cada tarea, que es justo lo que el servidor quita para el invitado en
 *  cualquier pedido —decisión de Iván al ver la ficha en marcha—. Forzarlas a
 *  vivir sin ese dato las dejaba con huecos que no dicen nada (y las usa el
 *  equipo a diario, así que tocarlas para esto las habría estropeado para
 *  ellos).
 *
 *  `detalle.ofs` trae una entrada por OF Y CENTRO (ver `HistorialPedidoDetalle`
 *  en historial.ts), así que se agrupa primero con `agruparOfsPublicas`: una
 *  cabecera por OF (o por varias OF idénticas juntas, sin esconder ninguna),
 *  con TODAS sus tareas debajo, una por línea y el tiempo o el estado
 *  alineado a la derecha — Iván lo vio "apretado" en fichas horizontales y
 *  pidió que se leyera en columna. El color de "hecho/falta" es el mismo que
 *  "Aprobada"/"Pendiente" en el resto de la web (`ESTADO`, lib/estado.ts),
 *  para no inventar uno nuevo. */
function OfsPublicas({ ofs }: { ofs: PedidoPublicoDetalle["ofs"] }) {
  const grupos = agruparOfsPublicas(ofs);
  if (!grupos.length) {
    return <p className="py-1 text-xs text-text-muted">Sin OF vinculadas al pedido en RPS.</p>;
  }
  return (
    <ul className="space-y-3">
      {grupos.map((g, i) => (
        <li key={g.codigos.join("+")} className={i > 0 ? "border-t border-border pt-3" : undefined}>
          <p className="mb-1 text-xs">
            {/* Casi siempre un solo código. Cuando son varios (OF idénticas,
                ver `agruparOfsPublicas`) van TODOS, separados: ninguno se
                esconde detrás de un "×4". */}
            <span className="font-mono font-semibold text-text">{g.codigos.join(" · ")}</span>{" "}
            <span className="text-text-muted">{g.descripcion}</span>
          </p>
          {g.tareas.length > 0 && (
            <ul aria-label={`Tareas de ${g.codigos.join(", ")}`}>
              {g.tareas.map((t) => (
                <li key={t.codigo} className="flex items-baseline gap-3 py-0.5 text-xs">
                  {/* Pedido terminado (`tiempoImputadoMin` puesto): ya está
                      todo hecho, así que aquí no hace falta el punto de
                      hecho/falta — solo su tiempo. Pedido con algo pendiente
                      (`cerrada` puesto): el punto dice hecho/falta y lo que
                      queda se resalta; lo hecho se apaga. */}
                  {t.tiempoImputadoMin !== undefined ? (
                    <>
                      <span className="min-w-0 flex-1 text-text">{t.descripcion}</span>
                      <span className="shrink-0 font-semibold text-text-muted">{fmtMin(t.tiempoImputadoMin)}</span>
                    </>
                  ) : (
                    <>
                      <span
                        aria-hidden="true"
                        className={`mt-1 size-1.5 shrink-0 rounded-full ${t.cerrada ? ESTADO.aprobada.dot : ESTADO.pendiente.dot}`}
                      />
                      <span className={`min-w-0 flex-1 ${t.cerrada ? "text-text-muted line-through" : "font-medium text-text"}`}>
                        <span className="sr-only">{t.cerrada ? "Hecho: " : "Falta: "}</span>
                        {t.descripcion}
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
