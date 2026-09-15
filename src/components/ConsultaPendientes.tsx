"use client";

import { useCallback, useEffect, useState } from "react";
import type { PedidoPublico, PedidoPublicoDetalle } from "@/lib/publico";
import { lineaTiempo } from "@/lib/linea-tiempo";
import { hoyISO } from "@/lib/types";
import { fmtDiaMesAno, fmtFechaLarga } from "@/lib/fechas";
import { SECCION_POR_DEFECTO } from "@/lib/secciones";
import { ErrorCarga } from "./ErrorCarga";
import { HistorialOFsCompactas } from "./HistorialOFsCompactas";
import { DocumentosRps } from "./DocumentosRps";
import { HistorialTareas } from "./HistorialTareas";
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
        <span className="text-xs font-semibold text-red-700 dark:text-red-300">
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
  // La fecha que se enseña cambia con la pestaña: la entrega en Pendientes,
  // el cierre en Realizados. Es lo único que distingue una fila de la otra.
  const fecha = lista === "pendientes" ? pedido.fechaEntrega : pedido.fechaFinalizacion;

  // Regla que no puede romperse (ver consulta-fila.test.ts): el invitado no
  // tiene la fecha de planificación de OT — la recalcula en bloque el
  // planificador de RPS y fuera de OT no significa nada —, así que el
  // recorrido se mide siempre contra la ENTREGA, con `planificacionEstimada`
  // puesto para que `lineaTiempo` sepa que esa fecha es prestada.
  const vencido =
    lista === "pendientes" &&
    pedido.fechaEntrega !== null &&
    lineaTiempo(
      {
        fechaCreacion: pedido.fechaPedido ?? undefined,
        fechaPlanificacion: pedido.fechaEntrega,
        planificacionEstimada: true,
        fechaEntrega: pedido.fechaEntrega,
      },
      hoyISO(),
    ).diasParaEntrega < 0;

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
        <span className="min-w-0 flex-1 truncate text-sm text-text-muted">
          {pedido.cliente ?? "—"}
          {pedido.negocio && <span> · {pedido.negocio}</span>}
        </span>
        <span
          className={`shrink-0 text-xs font-semibold ${
            vencido ? "text-red-700 dark:text-red-300" : "text-text-muted"
          }`}
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
      <p className="px-4 pb-2 text-[13px] text-text-muted">{pedido.estado}</p>
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

  // Sin repetir a nadie: la misma persona sale en varias OF del mismo pedido.
  const quienes = [...new Set(detalle.ofs.flatMap((of) => of.quien))];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {detalle.familias.map((f) => (
          <FamiliaTag key={f} familia={f} />
        ))}
        {detalle.ciudadEntrega && (
          <span className="text-xs text-text-muted">Entrega en {detalle.ciudadEntrega}</span>
        )}
        <a
          href={detalle.scanUrl}
          target="_blank"
          rel="noreferrer"
          className="chip-3d ml-auto shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-text"
        >
          Ver PDF del pedido
        </a>
      </div>
      {/* QUIÉN LO LLEVÓ, antes de las OF y sin desplegar nada más. La lista de
          OF solo pone nombres cuando el pedido tiene más de una, y lo normal
          es que tenga una sola: sin esto, la segunda pregunta de quien llama
          —después de "¿por dónde va?"— obligaba a abrir el desglose. */}
      {quienes.length > 0 && (
        <p className="text-xs text-text-muted">
          Lo llevó <span className="font-semibold text-text">{quienes.join(", ")}</span>
        </p>
      )}
      <div className="bloque-3d overflow-hidden rounded-xl px-3 py-2">
        <HistorialOFsCompactas
          ofs={detalle.ofs}
          seccion={SECCION_POR_DEFECTO}
          accion={
            <HistorialTareas pedido={detalle.codigo} ofs={detalle.ofs} seccion={SECCION_POR_DEFECTO} compacto />
          }
        />
      </div>
      {/* Lo que RPS tiene colgado del pedido: planteamiento, presupuesto y las
          fotos de la visita y de la instalación. Casi todos llevan algo (3.960
          de 3.962 en la serie AR.26), y es lo que un comercial quiere poder
          enseñarle al cliente sin llamar a Oficina Técnica. La misma pieza que
          usa el equipo, con las URL ya reescritas a la ruta pública. */}
      <div className="bloque-3d rounded-xl px-3 py-2">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          Documentos de RPS
        </p>
        <DocumentosRps documentos={detalle.documentos} />
      </div>
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
