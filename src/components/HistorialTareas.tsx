"use client";

import { useEffect, useId, useState } from "react";
import type { HistorialOF } from "@/lib/historial";
import { porMinutos } from "@/lib/historial";
import type { SeccionId } from "@/lib/secciones";
import { fmtMin } from "@/lib/estado";
import { useScrollBloqueado } from "@/lib/useScrollBloqueado";
import { agruparCentros, rangoCentro, type HistorialCentro } from "@/lib/historial-centros";

const tareasDe = (centro: HistorialCentro) => centro.ofs.reduce((n, of) => n + (of.tareas?.length ?? 0), 0);

export function HistorialTareas({ pedido, ofs, seccion, className = "mb-2", compacto = false, abrirAlMontar = false }: {
  pedido: string;
  ofs: HistorialOF[];
  seccion: SeccionId;
  /** Márgenes del botón, según dónde vaya. */
  className?: string;
  /** En la lista va en la columna del tiempo, que es estrecha: rótulo corto,
   *  con el largo en el `title`.
   *
   *  Visible siempre, no al pasar el ratón. Vive dentro de un pedido ya
   *  desplegado, y desplegarlos todos no es lo normal: un botón por pedido
   *  abierto no llega a ser ruido, y esconderlo obliga a descubrirlo. */
  compacto?: boolean;
  /** Abrir la ventana nada más montar. Lo usa `TareasDelPedido`: allí el botón
   *  de verdad es otro —el que dispara la carga—, y al llegar los datos este
   *  aparece ya abierto en vez de pedir un segundo clic. */
  abrirAlMontar?: boolean;
}) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    if (!abrirAlMontar) return;
    (document.getElementById(id) as HTMLElement | null)?.showPopover?.();
  }, [abrirAlMontar, id]);
  // Con la ventana abierta, la rueda seguía moviendo lo de detrás —la lista del
  // Historial o la ficha— y al cerrar aparecías en otro sitio. Es un popover
  // nativo: vive en la capa de arriba, pero no congela el `body` por su cuenta.
  // El bloqueo lleva contador, así que convive con el de la ficha sin que uno
  // pise el estilo del otro (ver useScrollBloqueado).
  useScrollBloqueado(abierto);
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-expanded={abierto}
        aria-controls={id}
        title={compacto ? "Tareas y tiempos" : undefined}
        className={`${className} chip-3d shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-text`}
      >
        {compacto ? "Tareas" : "Tareas y tiempos"}
      </button>
      <div id={id} popover="auto" data-historial-extra="" onToggle={(e) => setAbierto(e.newState === "open")}
        onKeyDown={(e) => { if (e.key === "Escape") e.stopPropagation(); }}
        className="ventana-3d scroll-thin m-auto max-h-[75vh] w-[min(680px,92vw)] overflow-y-auto rounded-xl p-4 text-text backdrop:bg-black/30">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Tareas y tiempos · <span className="font-mono">{pedido}</span></h3>
          <button type="button" popoverTarget={id} popoverTargetAction="hide" className="rounded px-2 py-1 text-xs hover:bg-surface-2">Cerrar</button>
        </div>
        {/* Con color, como la consulta: el código de la OF y los tiempos se
            recorren con la vista sin leerlo todo. */}
        <TareasPorCentro ofs={ofs} seccion={seccion} conColor />
      </div>
    </>
  );
}

/** El contenido de «Tareas y tiempos»: los centros con trabajo echado, uno
 *  detrás de otro, y los que no tienen ni un minuto plegados en una línea.
 *
 *  Sale de dentro de la ventana para poder pintarlo TAL CUAL en la consulta sin
 *  login, que enseña lo mismo pero dentro de la ficha del pedido. Una sola
 *  pintura para los dos sitios: si fueran dos, acabarían diciendo cosas
 *  distintas del mismo pedido. */
export function TareasPorCentro({
  ofs,
  seccion,
  /** Con el color de marca en los códigos, los nombres y los tiempos. */
  conColor = false,
  extraCentro,
  extraOF,
}: {
  ofs: HistorialOF[];
  seccion: SeccionId;
  conColor?: boolean;
  /** Lo que la ficha del equipo enseña de cada centro y que la ventana no: el
   *  tiempo por persona con su papel (planteó / revisó). */
  extraCentro?: (centro: HistorialCentro) => React.ReactNode;
  /** Lo que la ficha añade a cada OF: quién la hizo (cuando el centro tiene
   *  varias) y el material asignado. Van por aquí y no dentro de esta pieza
   *  porque la consulta sin login NO puede enseñar el material. */
  extraOF?: (of: HistorialOF, centro: HistorialCentro) => React.ReactNode;
}) {
  const centros = agruparCentros(ofs)
    .filter((centro) => centro.ofs.length)
    .sort((a, b) => rangoCentro(a.id, seccion) - rangoCentro(b.id, seccion));
  // Los centros sin un minuto no dicen nada: van plegados en una línea.
  const conTiempo = centros.filter((centro) => centro.totalMin > 0);
  const sinTiempo = centros.filter((centro) => centro.totalMin <= 0);
  const pinta = (centro: HistorialCentro) => (
    <CentroTareas
      key={centro.id}
      centro={centro}
      conColor={conColor}
      extraCentro={extraCentro}
      extraOF={extraOF}
    />
  );
  return (
    <>
      {conTiempo.map(pinta)}
      {sinTiempo.length > 0 && (
        <details className={`text-xs ${conTiempo.length ? "mt-4 border-t border-border pt-2" : ""}`}>
          <summary className="cursor-pointer text-text-muted hover:text-text">
            Sin tiempo echado: {sinTiempo.map((centro) => {
              const n = tareasDe(centro);
              return n ? `${centro.nombre} (${n} ${n === 1 ? "tarea" : "tareas"})` : centro.nombre;
            }).join(" · ")}
          </summary>
          <div className="mt-3">{sinTiempo.map(pinta)}</div>
        </details>
      )}
    </>
  );
}

/** Un centro con sus OF y, dentro, sus tareas.
 *
 *  QUIÉN ECHÓ CADA TAREA SALE EN TODOS LOS CENTROS, no solo en el que se está
 *  mirando. Esta ventana se abre justo para eso, y dejar Diseño y Taller con un
 *  número y sin nadie obligaba a preguntar por el pasillo quién lo había hecho.
 *  Fuera de aquí la regla no cambia: la lista y la ficha siguen enseñando la
 *  gente de la sección consultada (ver `centrosConDesglose`). */
function CentroTareas({
  centro,
  conColor = false,
  extraCentro,
  extraOF,
}: {
  centro: HistorialCentro;
  conColor?: boolean;
  extraCentro?: (centro: HistorialCentro) => React.ReactNode;
  extraOF?: (of: HistorialOF, centro: HistorialCentro) => React.ReactNode;
}) {
  const acento = conColor ? "text-brand-700 dark:text-brand-300" : "";
  // Con una sola OF su tiempo ES el del centro, que está justo encima: no se
  // escribe dos veces. Con varias sí reparten, y entonces hace falta.
  const variasOF = centro.ofs.length > 1;
  return (
    <section className="mb-4 last:mb-0">
      <h4 className="mb-2 flex justify-between text-sm font-semibold" title="Tiempo imputado en RPS">
        <span>{centro.nombre}</span>
        <span className={acento}>{fmtMin(centro.totalMin)}</span>
      </h4>
      {extraCentro?.(centro)}
      {centro.ofs.map((of) => (
        <div key={of.codigo} className="mb-2 border-t border-border pt-2 text-xs">
          <p className="mb-1 flex items-baseline justify-between gap-3 font-semibold">
            <span>
              <span className={conColor ? `font-mono ${acento}` : undefined}>{of.codigo}</span> · {of.descripcion}
            </span>
            {variasOF && (
              <span className={`shrink-0 font-mono tabular-nums ${acento}`} title="Tiempo imputado en RPS">
                {fmtMin(of.tiempoImputadoMin)}
              </span>
            )}
          </p>
          <TareasDeOF of={of} conColor={conColor} />
          {extraOF?.(of, centro)}
        </div>
      ))}
    </section>
  );
}

/** Las tareas de una OF: qué se hace, quién la echó y cuánto lleva.
 *
 *  Vive aquí y la pintan DOS sitios —esta ventana y el lateral de la ficha del
 *  Historial— porque son la misma información. Estuvo duplicada un tiempo y la
 *  ventana acabó enseñando cosas que el lateral no: quien tiene que acordarse
 *  de tocar los dos, tarde o temprano toca uno. */
export function TareasDeOF({ of, conColor = false }: { of: HistorialOF; conColor?: boolean }) {
  if (!of.tareas?.length) {
    return <p className="text-text-muted">Sin desglose de tareas disponible.</p>;
  }
  return (
    <>
      {of.tareas.map((tarea) => {
        const personas = tarea.personas.filter((p) => p.min > 0).sort(porMinutos);
        const vacia = tarea.tiempoImputadoMin <= 0;
        // Con UNA sola persona su tiempo es el de la tarea, que está al
        // final de la misma línea: ponerlo detrás del nombre era escribir
        // dos veces el mismo número. Con varias sí hace falta el de cada
        // uno, que es lo que el total no dice.
        const solaEllaEntera =
          personas.length === 1 && personas[0].min === tarea.tiempoImputadoMin;
        return (
          <p key={tarea.codigo} className={`flex items-baseline gap-3 py-1 ${vacia ? "text-text-muted" : ""}`}>
            <span className="min-w-0 flex-1">{tarea.codigo} · {tarea.descripcion}</span>
            {personas.length > 0 && (
              <span className={`text-right ${conColor && !vacia ? "font-medium text-text" : "text-text-muted"}`}>
                {solaEllaEntera
                  ? personas[0].nombre
                  : personas.map((p) => `${p.nombre} ${fmtMin(p.min)}`).join(" · ")}
              </span>
            )}
            <span
              className={`shrink-0 ${vacia ? "" : "font-semibold"} ${
                conColor && !vacia ? "text-brand-700 dark:text-brand-300" : ""
              }`}
            >
              {fmtMin(tarea.tiempoImputadoMin)}
            </span>
          </p>
        );
      })}
    </>
  );
}

/** «Tareas y tiempos» para un pedido que TODAVÍA no está en el Historial.
 *
 *  El desglose por tarea y centro sale del detalle del Historial, y ese dato
 *  no lo tiene el tablero: hay que pedirlo a RPS, y cuesta entre 2,5 y 5
 *  segundos (medido). Por eso NO se carga al abrir la ficha —como los
 *  documentos, por lo mismo—, sino al pulsar; cuando llega, la ventana se abre
 *  sola para no cobrar un segundo clic.
 *
 *  Sirve para un pedido a medias: enseña lo que lleva imputado hasta ahora. */
export function TareasDelPedido({
  pedido,
  seccion,
  className,
}: {
  pedido: string;
  seccion: SeccionId;
  className?: string;
}) {
  const [ofs, setOfs] = useState<HistorialOF[] | null>(null);
  const [estado, setEstado] = useState<"quieto" | "cargando" | "error">("quieto");

  async function cargar() {
    setEstado("cargando");
    try {
      const r = await fetch(`/api/historial/${pedido}?seccion=${seccion}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { ofs?: HistorialOF[] };
      setOfs(d.ofs ?? []);
      setEstado("quieto");
    } catch {
      setEstado("error");
    }
  }

  if (ofs) {
    return <HistorialTareas pedido={pedido} ofs={ofs} seccion={seccion} className={className} abrirAlMontar />;
  }
  return (
    <button
      type="button"
      onClick={cargar}
      disabled={estado === "cargando"}
      title="Qué tareas lleva el pedido y cuánto se ha echado en cada una, según RPS"
      className={`${className ?? "mb-2"} chip-3d shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-text disabled:opacity-60`}
    >
      {estado === "cargando"
        ? "Cargando tareas…"
        : estado === "error"
          ? "No se pudo cargar · reintentar"
          : "Tareas y tiempos"}
    </button>
  );
}
