"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { textoFecha, type FiltrosConsulta, type PedidoConsulta, type RespuestaConsulta } from "@/lib/consulta";
import { textoSituacion, type DondeOF, type PasoDonde } from "@/lib/consulta-donde";
import { agruparPedidosPorDia } from "@/lib/consulta-dias";
import { fmtDiaMesAno } from "@/lib/fechas";
import { TRAMO } from "@/lib/linea-tiempo";
import { nombreBonito, type PedidoConsultaDetalle } from "@/lib/publico";
import { SECCION_POR_DEFECTO } from "@/lib/secciones";
import { DocumentosRps } from "./DocumentosRps";
import { ErrorCarga } from "./ErrorCarga";
import { FamiliaTag } from "./FamiliaTag";
import { TareasPorCentro } from "./HistorialTareas";

// ─── Los pedidos de la casa, para quien solo mira ────────────────────────────
// Una sola lista. Se entra buscando; sin buscar, las próximas entregas. Cada
// fila dice de quién es, dónde está y para cuándo, y al abrirla sale la misma
// ficha que ve el equipo, con quién lo tiene. Ni un botón que guarde.

type Filtros = Omit<FiltrosConsulta, "page">;

function consultaDe(f: Filtros): string {
  const sp = new URLSearchParams({ estado: f.estado });
  for (const k of ["paso", "familia", "desde", "hasta", "q"] as const) {
    const v = f[k]?.trim();
    if (v) sp.set(k, v);
  }
  return sp.toString();
}

export function ConsultaPedidos({
  filtros,
  onFamilias,
}: {
  filtros: Filtros;
  /** Las familias que hay con los demás filtros puestos, para el desplegable. */
  onFamilias: (familias: string[]) => void;
}) {
  const [pedidos, setPedidos] = useState<PedidoConsulta[]>([]);
  const [resto, setResto] = useState<Omit<RespuestaConsulta, "pedidos"> | null>(null);
  const [page, setPage] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  /** 503: la lista en memoria se está construyendo (unos 45 s tras arrancar). */
  const [preparando, setPreparando] = useState(false);
  const peticion = useRef(0);
  // Un texto y no el objeto: el objeto es nuevo en cada render y dispararía
  // una consulta por render.
  const consulta = consultaDe(filtros);

  const cargar = useCallback(
    async (pagina: number, reemplazar: boolean) => {
      const esta = ++peticion.current;
      setCargando(true);
      setError(false);
      try {
        const sp = new URLSearchParams(consulta);
        sp.set("page", String(pagina));
        const res = await fetch(`/api/publico/pedidos?${sp}`, { cache: "no-store" });
        if (esta !== peticion.current) return;
        // 503 = la lista aún se está construyendo. No es un fallo: se dice que
        // espere y se reintenta solo, porque quien entra justo después de un
        // despliegue no tiene por qué saber que hay que recargar.
        if (res.status === 503) {
          setPreparando(true);
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const json: RespuestaConsulta = await res.json();
        // Llegó tarde: ya se escribió otra cosa en el buscador.
        if (esta !== peticion.current) return;
        const { pedidos: nuevos, ...demas } = json;
        setPreparando(false);
        setPedidos((previos) => (reemplazar ? nuevos : [...previos, ...nuevos]));
        setResto(demas);
        setPage(pagina);
        onFamilias(json.familias);
      } catch {
        if (esta === peticion.current) setError(true);
      } finally {
        if (esta === peticion.current) setCargando(false);
      }
    },
    [consulta, onFamilias],
  );

  // Con espera, para no lanzar una consulta por cada tecla del buscador.
  useEffect(() => {
    const t = setTimeout(() => void cargar(0, true), 300);
    return () => clearTimeout(t);
  }, [cargar]);

  // Mientras se construye la lista, se vuelve a preguntar sola: nadie tiene
  // por qué saber que hay que recargar.
  useEffect(() => {
    if (!preparando) return;
    const t = setTimeout(() => void cargar(0, true), 10_000);
    return () => clearTimeout(t);
  }, [preparando, cargar]);

  const dias = resto?.porDia ? agruparPedidosPorDia(pedidos, { hoy: new Date(), totales: resto.porDia }) : null;
  // Agrupado por días, la fecha ya está en el rótulo de la tarjeta: repetirla
  // en las cuarenta filas de debajo no dice nada. Buscando o en «Todos» no hay
  // días, y entonces sí hace falta en cada fila.
  const fila = (p: PedidoConsulta) => <FilaConsulta key={p.codigo} pedido={p} conFecha={!dias} />;

  return (
    <main className="mx-auto w-full max-w-[1100px] space-y-3 p-4">
      {error && <ErrorCarga mensaje="No se pudieron cargar los pedidos." onReintentar={() => void cargar(0, true)} />}

      {preparando && !error && (
        <div className="glass-panel grid min-h-32 place-items-center rounded-2xl px-6 text-center">
          <div>
            <p className="text-sm font-semibold text-text">Preparando la lista de pedidos…</p>
            <p className="mt-1 text-xs text-text-muted">
              Pasa la primera vez después de una actualización y tarda menos de un minuto. Esta pantalla se
              actualiza sola.
            </p>
          </div>
        </div>
      )}

      {/* «No hay pedidos» solo cuando de verdad se ha mirado: mientras la lista
          se construye, lo que toca decir es que espere. */}
      {!error && !preparando && !cargando && pedidos.length === 0 && (
        <div className="grid min-h-32 place-items-center rounded-xl border border-dashed border-border px-6 text-center">
          <p className="text-sm text-text-muted">
            {filtros.q?.trim() ? "Ningún pedido con esa búsqueda." : "No hay pedidos con estos filtros."}
          </p>
        </div>
      )}

      {/* Buscando o en «Todos» no hay días: van por fecha del pedido. */}
      {!dias && pedidos.length > 0 && (
        <p className="px-3 text-[11px] text-text-muted">
          {pedidos.length}
          {resto?.hasMore ? " y más" : ""} pedido{pedidos.length === 1 ? "" : "s"} · los más recientes primero
        </p>
      )}

      {/* UN BLOQUE POR DÍA, con la fecha fuera de él: el mismo relieve que el
          Historial del equipo, donde el corte entre un día y otro se ve sin
          leer nada. */}
      <div className="flex flex-col gap-3">
        {dias
          ? dias.map((dia, i) => (
              <section key={`${dia.clave}-${i}`} aria-label={dia.titulo}>
                <h3 className="mb-1 flex items-baseline gap-2 px-3 text-[11px] font-semibold text-text">
                  {dia.titulo}
                  <span className="font-normal text-text">
                    · {dia.total} pedido{dia.total === 1 ? "" : "s"}
                  </span>
                </h3>
                <ul className="bloque-3d overflow-hidden rounded-xl border-border [background:var(--surface)]">{dia.pedidos.map(fila)}</ul>
              </section>
            ))
          : pedidos.length > 0 && <ul className="bloque-3d overflow-hidden rounded-xl border-border [background:var(--surface)]">{pedidos.map(fila)}</ul>}
      </div>

      {/* Lo que carga se dice SIEMPRE, no solo con la lista vacía: con «Ver
          más», las cuarenta filas nuevas aparecían en silencio para quien no
          las ve. */}
      <p role="status" className="sr-only">
        {cargando ? "Cargando pedidos…" : `${pedidos.length} pedidos en la lista`}
      </p>
      {cargando && pedidos.length === 0 && !preparando && (
        <p aria-hidden="true" className="py-2 text-center text-xs text-text-muted">Cargando…</p>
      )}
      {/* El botón se queda montado mientras haya más que traer, también
          mientras carga: si desaparece justo al pulsarlo, quien lo tocó con el
          teclado pierde el foco. */}
      {resto?.hasMore && (
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

/** Código · cliente · ciudad · dónde está · fecha. Sin línea de tiempo: la
 *  fecha ya dice lo que hacía falta. */
function FilaConsulta({ pedido, conFecha }: { pedido: PedidoConsulta; conFecha: boolean }) {
  const [abierto, setAbierto] = useState(false);
  // Abierta una vez, la ficha se queda montada: no se repite la consulta a RPS
  // cada vez que se pliega y despliega.
  const [tocado, setTocado] = useState(false);
  const donde = textoSituacion(pedido.situacion, pedido.donde);
  // RPS los guarda a gritos; en una lista de cuarenta filas, las mayúsculas
  // tapan al código del pedido, que es lo que se busca.
  const cliente = pedido.cliente ? nombreBonito(pedido.cliente) : "—";
  const ciudad = pedido.ciudadEntrega ? nombreBonito(pedido.ciudadEntrega) : null;
  const id = `ficha-${pedido.codigo}`;

  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => {
          setAbierto((a) => !a);
          setTocado(true);
        }}
        className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-left hover:bg-[var(--glass-highlight)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
      >
        <span className="font-mono text-sm font-semibold text-text">{pedido.codigo}</span>
        {/* Con suelo: un «dónde está» largo no puede aplastar de quién es el
            pedido. Si no caben los dos, baja «dónde está» a otra línea. */}
        {/* El destino con el color de marca: es lo que se busca al repasar la
            lista después del cliente («¿cuál es el de Ourense?»). */}
        <span
          className="min-w-[12rem] flex-1 truncate text-sm text-text"
          title={[cliente, ciudad].filter(Boolean).join(" · ")}
        >
          {cliente}
          {ciudad && <span className="text-brand-700 dark:text-brand-300"> · {ciudad}</span>}
        </span>
        {donde && <span className="text-xs font-medium text-text">{donde}</span>}
        {/* Fuera de plazo se dice SIEMPRE: el rótulo del día dice para cuándo
            era, no si ya pasó. */}
        {(conFecha || pedido.fueraDePlazo) && (
          <span
            className="shrink-0 text-xs font-semibold text-text"
            style={pedido.fueraDePlazo ? { color: TRAMO.fuera } : undefined}
          >
            {pedido.fueraDePlazo && (conFecha ? "Fuera de plazo · " : "Fuera de plazo")}
            {conFecha && textoFecha(pedido)}
          </span>
        )}
        <svg
          viewBox="0 0 24 24"
          className={`size-4 shrink-0 self-center text-text-muted transition-transform ${abierto ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {/* Siempre montado (con `hidden`): `aria-controls` no puede apuntar a un
          id que no existe mientras la fila está cerrada. */}
      {/* Con el fondo del lienzo, más oscuro que la fila: lo desplegado se ve
          DENTRO del pedido que se abrió, y las cajas blancas de dentro
          (dónde está, centros) se recortan encima. */}
      <div id={id} hidden={!abierto} className="border-t border-border px-3 py-3 [background:var(--bg)]">
        {tocado && <FichaConsulta codigo={pedido.codigo} />}
      </div>
    </li>
  );
}

/** La ficha: dónde está ahora, la de centros del equipo y los documentos. Se
 *  pide al abrir: son 40 filas por página y casi ninguna se abre. */
function FichaConsulta({ codigo }: { codigo: string }) {
  const [detalle, setDetalle] = useState<PedidoConsultaDetalle | null>(null);
  const [error, setError] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(() => {
    setCargando(true);
    setError(false);
    fetch(`/api/publico/pedidos/${encodeURIComponent(codigo)}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<PedidoConsultaDetalle>;
      })
      .then(setDetalle)
      .catch(() => setError(true))
      .finally(() => setCargando(false));
  }, [codigo]);

  useEffect(() => {
    const t = setTimeout(() => cargar(), 0);
    return () => clearTimeout(t);
  }, [cargar]);

  // Con `role="status"`: quien abre la ficha con el teclado no oía nada hasta
  // que llegaban los datos.
  if (cargando) return <p role="status" className="text-sm text-text-muted">Cargando el pedido…</p>;
  if (error || !detalle) return <ErrorCarga mensaje="No se pudo cargar el pedido." onReintentar={cargar} />;

  return (
    <div className="space-y-3">
      {detalle.familias.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {detalle.familias.map((f) => (
            <FamiliaTag key={f} familia={f} />
          ))}
        </div>
      )}
      {/* La respuesta por la que se abre la ficha: con el acento de marca a la
          izquierda, para que no sea una caja más entre las tres. */}
      {detalle.donde.length > 0 && (
        <div className="rounded-xl border border-l-4 border-border border-l-brand-400 bg-surface px-3 py-2.5 shadow-sm">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
            Dónde está ahora
          </p>
          <DondeEsta donde={detalle.donde} />
        </div>
      )}
      {detalle.situacion === "salir" && (
        <p className="text-xs font-semibold text-text">Fabricado, esperando salir.</p>
      )}
      {/* El MISMO desglose que la ventana «Tareas y tiempos» del equipo, sin
          cajas dentro de cajas: centro, OF y debajo sus tareas con quién las
          echó y cuánto. Con color, que aquí es el cuerpo de la ficha y no una
          ventana que se abre un momento. */}
      <div className="bloque-3d rounded-xl border-border px-3 py-2.5 [background:var(--surface)]">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Tareas y tiempos</p>
        <TareasPorCentro ofs={detalle.ofs} seccion={SECCION_POR_DEFECTO} conColor />
      </div>
      {/* Lo que RPS tiene colgado del pedido, con el parte escaneado el
          primero: es el documento que todo el mundo busca aquí. Misma tarjeta
          que los centros de arriba; lo que manda la jerarquía es el acento de
          «Dónde está ahora», no un estilo de caja distinto por bloque. */}
      <div className="bloque-3d rounded-xl border-border px-3 py-2 [background:var(--surface)]">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Documentos de RPS</p>
        <DocumentosRps documentos={detalle.documentos} clasePrimero="Pedido escaneado" />
      </div>
    </div>
  );
}

/** Una línea por OF: quién lo está haciendo, quién lo tiene pausado o qué
 *  viene ahora. Con el nombre, que es a quien hay que llamar. */
function DondeEsta({ donde }: { donde: DondeOF[] }) {
  return (
    <ul className="space-y-1.5">
      {donde.map((d) => (
        <li key={d.orden} className="text-xs">
          <span className="font-mono font-semibold text-text">OF {d.orden}</span>
          <ul className="mt-0.5 space-y-0.5 pl-3">
            {d.enCurso.map((p, i) => (
              <li key={`curso-${i}`}>
                <LineaPaso paso={p} conNombre="Lo está haciendo" sinNombre="En curso" />
              </li>
            ))}
            {d.pausadas.map((p, i) => (
              <li key={`pausa-${i}`}>
                <LineaPaso paso={p} conNombre="Lo tiene pausado" sinNombre="Pausado" />
              </li>
            ))}
            {d.siguientes.length > 0 && (
              <li className="text-text-muted">Siguiente: {d.siguientes.map((p) => p.paso).join(", ")}</li>
            )}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function LineaPaso({ paso, conNombre, sinNombre }: { paso: PasoDonde; conNombre: string; sinNombre: string }) {
  return (
    <span className="text-text">
      {paso.quien ? (
        <>
          {conNombre} <strong>{paso.quien}</strong>
        </>
      ) : (
        sinNombre
      )}
      <span className="text-text-muted">
        {" "}
        — {paso.paso}
        {paso.tarea !== paso.paso ? ` · ${paso.tarea}` : ""}
        {paso.desde ? ` · desde el ${fmtDiaMesAno(paso.desde)}` : ""}
      </span>
    </span>
  );
}
