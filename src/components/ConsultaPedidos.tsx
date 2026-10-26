"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { textoFecha, type FiltrosConsulta, type PedidoConsulta, type RespuestaConsulta } from "@/lib/consulta";
import { textoSituacion, type DondeOF } from "@/lib/consulta-donde";
import { agruparPedidosPorDia } from "@/lib/consulta-dias";
import { diasEntre, fmtDiaMesAno } from "@/lib/fechas";
import { TRAMO } from "@/lib/linea-tiempo";
import { nombreBonito, type PedidoConsultaDetalle } from "@/lib/publico";
import { SECCION_POR_DEFECTO } from "@/lib/secciones";
import { BloqueLista } from "./BloqueLista";
import { DocumentosRps } from "./DocumentosRps";
import { ErrorCarga } from "./ErrorCarga";
import { FamiliaTag } from "./FamiliaTag";
import { FilaDesplegable } from "./FilaDesplegable";
import { OFsDeLaFicha } from "./HistorialCentros";
import { MarcaNotas, NotasPublicas } from "./NotasPublicas";

// ─── Los pedidos de la casa, para quien solo mira ────────────────────────────
// Una sola lista. Se entra buscando; sin buscar, las próximas entregas. Cada
// fila dice de quién es, dónde está y para cuándo, y al abrirla sale la misma
// ficha que ve el equipo, con quién lo tiene. Ni un botón que guarde.

type Filtros = Omit<FiltrosConsulta, "page">;

/** Las mismas columnas que el Historial del equipo (Iván, 13/10/2026): flecha,
 *  pedido, cliente, familia, dónde está y fecha. Literales: Tailwind no compila
 *  las concatenadas. */
const COLUMNAS =
  "grid grid-cols-[28px_136px_minmax(0,1fr)_112px_minmax(150px,18rem)_104px] items-center gap-x-3";

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
  // Uno abierto a la vez: al desplegar otro, el anterior se cierra (Iván,
  // 13/10/2026). Con varios abiertos la lista se alargaba y se perdía de vista
  // qué fila era cuál.
  const [abierto, setAbierto] = useState<string | null>(null);
  const fila = (p: PedidoConsulta) => (
    <FilaConsulta
      key={p.codigo}
      pedido={p}
      conFecha={!dias}
      abierto={abierto === p.codigo}
      onAlternar={() => setAbierto((a) => (a === p.codigo ? null : p.codigo))}
    />
  );
  const cabecera = (
    <>
      <span /><span>Pedido</span><span>Cliente</span><span>Familia</span><span>Dónde está</span>
      <span>{dias ? "" : "Fecha"}</span>
    </>
  );

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

      {/* UN BLOQUE POR DÍA, con la fecha fuera de él, y cada pedido su propia
          tarjeta: igual que el Historial del equipo. La cabecera de columnas,
          una vez y encima de todo. */}
      <div className="flex flex-col gap-5">
        {pedidos.length > 0 && (
          <div aria-hidden="true" className={`${COLUMNAS} px-3 text-[11px] font-semibold text-text-muted`}>
            {cabecera}
          </div>
        )}
        {dias
          ? dias.map((dia, i) => (
              <section key={`${dia.clave}-${i}`} aria-label={dia.titulo}>
                <BloqueLista
                  columnas={COLUMNAS}
                  sinCaja
                  rotulo={{ texto: dia.titulo, sufijo: `· ${dia.total} pedido${dia.total === 1 ? "" : "s"}` }}
                >
                  {dia.pedidos.map(fila)}
                </BloqueLista>
              </section>
            ))
          : pedidos.length > 0 && (
              <BloqueLista columnas={COLUMNAS} sinCaja>
                {pedidos.map(fila)}
              </BloqueLista>
            )}
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

/** Código · cliente · ciudad · familia · dónde está · fecha, con la forma de
 *  las filas del Historial. Al desplegar, la ficha del pedido. */
function FilaConsulta({
  pedido,
  conFecha,
  abierto,
  onAlternar,
}: {
  pedido: PedidoConsulta;
  conFecha: boolean;
  abierto: boolean;
  onAlternar: () => void;
}) {
  // Abierta una vez, la ficha se queda montada: no se repite la consulta a RPS
  // cada vez que se pliega y despliega.
  const [tocado, setTocado] = useState(false);
  // RPS los guarda a gritos; en una lista de cuarenta filas, las mayúsculas
  // tapan al código del pedido, que es lo que se busca.
  const cliente = pedido.cliente ? nombreBonito(pedido.cliente) : "—";
  const ciudad = pedido.ciudadEntrega ? nombreBonito(pedido.ciudadEntrega) : null;
  const familias = pedido.familias;

  return (
    <FilaDesplegable
      columnas={COLUMNAS}
      abierta={abierto}
      onAlternar={() => {
        onAlternar();
        setTocado(true);
      }}
      etiqueta={pedido.codigo}
      idDetalle={`ficha-${pedido.codigo}`}
      tarjeta
      celdas={
        <>
          <span className="pointer-events-none whitespace-nowrap font-mono text-sm font-semibold text-text">
            {pedido.codigo}
            {pedido.notas ? <MarcaNotas n={pedido.notas} /> : null}
          </span>
          {/* El destino con el color de marca: es lo que se busca al repasar la
              lista después del cliente («¿cuál es el de Ourense?»). */}
          <span
            className="pointer-events-none min-w-0 truncate text-[11px] text-text"
            title={[cliente, ciudad].filter(Boolean).join(" · ")}
          >
            {cliente}
            {ciudad && <span className="text-brand-800 dark:text-brand-300"> · {ciudad}</span>}
          </span>
          <span className="pointer-events-none flex min-w-0 items-center gap-1 overflow-hidden" title={familias.join(", ")}>
            {familias.slice(0, 1).map((f) => <FamiliaTag key={f} familia={f} />)}
            {familias.length > 1 && <span className="text-[10px] text-text-muted">+{familias.length - 1}</span>}
          </span>
          <span className="pointer-events-none min-w-0">
            <CeldaDonde pedido={pedido} />
          </span>
          {/* Fuera de plazo se dice SIEMPRE: el rótulo del día dice para cuándo
              era, no si ya pasó. */}
          <span
            className="pointer-events-none truncate text-[11px] font-semibold text-text"
            style={pedido.fueraDePlazo ? { color: TRAMO.fuera } : undefined}
            title={conFecha ? textoFecha(pedido) : undefined}
          >
            {pedido.fueraDePlazo ? "Fuera de plazo" : conFecha ? textoFecha(pedido) : ""}
          </span>
        </>
      }
      detalle={tocado ? <FichaConsulta codigo={pedido.codigo} /> : null}
    />
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
      {/* Una sola ya está en la fila; aquí solo si hay más de las que caben. */}
      {detalle.familias.length > 1 && (
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
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-800 dark:text-brand-300">
            Dónde está ahora
          </p>
          <DondeEsta donde={detalle.donde} />
        </div>
      )}
      {detalle.situacion === "salir" && (
        <p className="text-xs font-semibold text-text">Fabricado, esperando salir.</p>
      )}
      {/* Lo que OT marcó «para todos»: delante de las OF, que es un recado
          para quien abre la ficha. */}
      <NotasPublicas notas={detalle.notas ?? []} />
      {/* Las OF como en la ficha del Historial del equipo: cada una con su
          autor y revisor, y al desplegarla sus tareas por centro, con su
          color, quién y cuánto y qué días. Que el mismo pedido se lea igual en
          las dos webs (Iván, 09/10/2026). Sin el material, que el invitado no
          ve, ni el gastado. */}
      <div className="bloque-3d rounded-xl border-border px-3 py-2.5 [background:var(--surface)]">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          Órdenes de fabricación ({new Set(detalle.ofs.map((o) => o.codigo)).size})
        </p>
        <OFsDeLaFicha ofs={detalle.ofs} seccion={SECCION_POR_DEFECTO} conGastado={false} sinMaterial />
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

// ─── Dónde está: los mismos colores en la fila y en la ficha ─────────────────
// Lo que se viene a mirar, con una palabra y un color delante: se distingue
// «lo están haciendo» de «está parado en la mano de alguien» sin leer la frase
// (Iván, 13/10/2026: la línea de texto suelta no se leía).

type ClaseDonde = "haciendo" | "pausado" | "siguiente" | "salir" | "fabrica";

const DONDE: Record<ClaseDonde, { palabra: string; punto: string; chip: string }> = {
  haciendo: {
    palabra: "Haciendo",
    punto: "bg-emerald-500",
    chip: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300",
  },
  pausado: {
    palabra: "Pausado",
    punto: "bg-amber-500",
    chip: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  },
  siguiente: {
    palabra: "Siguiente",
    punto: "bg-sky-500",
    chip: "bg-sky-500/12 text-sky-800 dark:text-sky-300",
  },
  salir: {
    palabra: "Fabricado",
    punto: "bg-violet-500",
    chip: "bg-violet-500/12 text-violet-800 dark:text-violet-300",
  },
  fabrica: {
    palabra: "En fábrica",
    punto: "bg-text-muted",
    chip: "bg-surface-2 text-text-muted",
  },
};

function ChipDonde({ clase }: { clase: ClaseDonde }) {
  const m = DONDE[clase];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-px text-[10px] font-semibold ${m.chip}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${m.punto}`} />
      {m.palabra}
    </span>
  );
}

/** La celda de la fila: lo más vivo que haya (alguien trabajando gana a algo
 *  pausado, y eso a lo que viene) y sus pasos. El resto, en el `title` y en la
 *  ficha. Entregado no dice nada: la fecha de al lado ya lo cuenta. */
function CeldaDonde({ pedido }: { pedido: PedidoConsulta }) {
  if (pedido.situacion === "entregado") return <span className="text-[11px] text-text-muted">—</span>;
  if (pedido.situacion === "salir")
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <ChipDonde clase="salir" />
        <span className="truncate text-[11px] text-text">esperando salir</span>
      </span>
    );
  const d = pedido.donde;
  const enCurso = [...new Set(d.flatMap((o) => o.enCurso).map((p) => p.paso))];
  const pausadas = [...new Set(d.flatMap((o) => o.pausadas).map((p) => p.paso))];
  const siguientes = [...new Set(d.flatMap((o) => o.siguientes).map((p) => p.paso))];
  const [clase, pasos]: [ClaseDonde, string[]] = enCurso.length
    ? ["haciendo", enCurso]
    : pausadas.length
      ? ["pausado", pausadas]
      : siguientes.length
        ? ["siguiente", siguientes]
        : ["fabrica", []];
  const mas = (clase === "haciendo" ? pausadas.length : 0) + (clase !== "siguiente" ? siguientes.length : 0);
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={textoSituacion(pedido.situacion, d) ?? undefined}>
      <ChipDonde clase={clase} />
      <span className="min-w-0 truncate text-[11px] text-text">{pasos.join(", ")}</span>
      {mas > 0 && <span className="shrink-0 text-[10px] text-text-muted">+{mas}</span>}
    </span>
  );
}

/** Una fila por paso abierto, con su OF a la izquierda: qué, quién y desde
 *  cuándo. Con el nombre, que es a quien hay que llamar. */
function DondeEsta({ donde }: { donde: DondeOF[] }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const filas = donde.flatMap((d) => [
    ...d.enCurso.map((p) => ({ of: d.orden, clase: "haciendo" as const, p })),
    ...d.pausadas.map((p) => ({ of: d.orden, clase: "pausado" as const, p })),
    ...d.siguientes.map((p) => ({ of: d.orden, clase: "siguiente" as const, p })),
  ]);
  return (
    <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-xs">
      {filas.map(({ of, clase, p }, i) => {
        const primeraDeSuOF = i === 0 || filas[i - 1].of !== of;
        const dias = p.desde ? diasEntre(p.desde, hoy) : null;
        return (
          <Fragment key={`${of}-${clase}-${i}`}>
            <span className={`font-mono text-[11px] font-semibold ${primeraDeSuOF ? "text-text" : "invisible"}`}>
              OF {of}
            </span>
            <ChipDonde clase={clase} />
            <span className="min-w-0 truncate text-text" title={p.tarea !== p.paso ? `${p.paso} · ${p.tarea}` : p.paso}>
              <span className="font-medium">{p.paso}</span>
              {p.tarea !== p.paso && <span className="text-text-muted"> · {p.tarea}</span>}
            </span>
            <span className="text-right text-[11px] text-text-muted">
              {p.quien && <strong className="font-semibold text-text">{p.quien}</strong>}
              {p.quien && p.desde && " · "}
              {p.desde &&
                (dias !== null && dias <= 0
                  ? "desde hoy"
                  : `desde el ${fmtDiaMesAno(p.desde)}${dias !== null ? ` (${dias} ${dias === 1 ? "día" : "días"})` : ""}`)}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}
