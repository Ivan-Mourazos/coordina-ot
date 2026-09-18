"use client";

import { useState } from "react";
import type { HistorialOF } from "@/lib/historial";
import { porMinutos } from "@/lib/historial";
import type { SeccionId } from "@/lib/secciones";
import { fmtMin } from "@/lib/estado";
import { BloqueDesplegable } from "./BloqueDesplegable";
import { agruparCentros, rangoCentro, type HistorialCentro } from "@/lib/historial-centros";

const tareasDe = (centro: HistorialCentro) => centro.ofs.reduce((n, of) => n + (of.tareas?.length ?? 0), 0);

/** «Tareas y tiempos»: qué tareas lleva el pedido en RPS y cuánto se ha echado
 *  en cada una.
 *
 *  ERA UN POPOVER, una ventana encima de todo. Se abría justo sobre la ficha
 *  que estabas leyendo, tapándola, y había que cerrarla para volver — con el
 *  añadido de que un popover nativo no congela el `body` por su cuenta, así
 *  que la rueda seguía moviendo lo de detrás y al cerrar aparecías en otro
 *  sitio. Ahora es un bloque que se abre DENTRO, con el mismo borde y fondo
 *  que Documentos y Notas: se lee al lado de lo demás y no tapa nada. */
export function HistorialTareas({
  pedido,
  ofs,
  seccion,
  className = "mb-4",
  compacto = false,
  abrirAlMontar = false,
}: {
  pedido: string;
  ofs: HistorialOF[];
  seccion: SeccionId;
  className?: string;
  /** En la lista del Historial va dentro de una fila ya desplegada: rótulo
   *  corto, con el largo en el `title`. */
  compacto?: boolean;
  /** Abierto nada más montar. Lo usa `TareasDelPedido`: allí el botón de
   *  verdad es el que dispara la carga, y al llegar los datos esto aparece ya
   *  abierto en vez de pedir un segundo clic. */
  abrirAlMontar?: boolean;
}) {
  return (
    <BloqueDesplegable
      titulo={compacto ? "Tareas" : "Tareas y tiempos"}
      sufijo={compacto ? undefined : pedido}
      abiertoDeSalida={abrirAlMontar}
      className={className}
    >
      {/* Con color, como la consulta: el código de la OF y los tiempos se
          recorren con la vista sin leerlo todo. */}
      <TareasPorCentro ofs={ofs} seccion={seccion} conColor />
    </BloqueDesplegable>
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
 *  mirando: esto se abre justo para eso, y dejar Diseño y Taller con un número
 *  y sin nadie obligaba a preguntar por el pasillo quién lo había hecho. */
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
  const acento = conColor ? "text-brand-800 dark:text-brand-300" : "";
  // Con una sola OF su tiempo ES el del centro, que está justo encima: no se
  // escribe dos veces. Con varias sí reparten, y entonces hace falta.
  const variasOF = centro.ofs.length > 1;
  return (
    // Aire entre centro y centro. Iban pegados, y con tres o cuatro no se veía
    // dónde acababa uno.
    <section className="mb-5 last:mb-0">
      <h4
        className="mb-2 flex items-baseline justify-between gap-3 text-sm font-semibold"
        title="Tiempo imputado en RPS"
      >
        <span>{centro.nombre}</span>
        <span className={`font-mono tabular-nums ${acento}`}>{fmtMin(centro.totalMin)}</span>
      </h4>
      {extraCentro?.(centro)}
      {centro.ofs.map((of) => (
        <div key={of.codigo} className="mb-3 border-t border-border pt-2 text-xs last:mb-0">
          {/* TRES ESCALONES, y se distinguen por peso y tamaño, no por sangría
              sola: el centro (14 px, negrita), la OF (12 px, negrita, con su
              código en mono) y las tareas (11 px, normales). Todo iba al mismo
              tamaño y en negrita, y con siete OF seguidas no había forma de
              ver dónde acababa una.

              El código en mono y el resto en la tipografía normal: "0232035"
              es una matrícula que se compara con la vista, y la descripción se
              lee. Mezclarlos en mono hacía la descripción más lenta de leer. */}
          <p className="mb-1 flex items-baseline justify-between gap-3">
            <span className="min-w-0 font-semibold leading-snug">
              <span className={conColor ? `font-mono ${acento}` : "font-mono"}>{of.codigo}</span>
              {" · "}
              {of.descripcion}
            </span>
            {variasOF && (
              <span
                className={`shrink-0 font-mono font-semibold tabular-nums ${acento}`}
                title="Tiempo imputado en RPS"
              >
                {fmtMin(of.tiempoImputadoMin)}
              </span>
            )}
          </p>
          {/* Las tareas, sangradas y con la línea de su OF al lado: dicen de
              qué se compone lo de arriba, y sin el escalón se leían como si
              fueran hermanas suyas. */}
          <div className="ml-1 border-l border-border pl-2.5 text-[11px]">
            <TareasDeOF of={of} conColor={conColor} />
          </div>
          {extraOF?.(of, centro)}
        </div>
      ))}
    </section>
  );
}

/** Las tareas de una OF: qué se hace, quién la echó y cuánto lleva.
 *
 *  TRES COLUMNAS ALINEADAS y no un `flex` de tres trozos. Con flex, el nombre
 *  y el tiempo caían en un sitio distinto en cada línea según lo larga que
 *  fuera la tarea, y la columna de tiempos —que es la que se recorre con la
 *  vista— no existía como columna. El ancho del tiempo es fijo, y `tabular-nums`
 *  hace que "7m" y "1h 20m" ocupen lo mismo por cifra.
 *
 *  Vive aquí y la pintan DOS sitios —este bloque y el lateral de la ficha del
 *  Historial— porque son la misma información. Estuvo duplicada un tiempo y
 *  acabaron diciendo cosas distintas del mismo pedido. */
export function TareasDeOF({ of, conColor = false }: { of: HistorialOF; conColor?: boolean }) {
  if (!of.tareas?.length) {
    return <p className="text-text-muted">Esta OF no tiene tareas en RPS.</p>;
  }
  return (
    <>
      {of.tareas.map((tarea) => {
        const personas = tarea.personas.filter((p) => p.min > 0).sort(porMinutos);
        const vacia = tarea.tiempoImputadoMin <= 0;
        // Con UNA sola persona su tiempo es el de la tarea, que está al final
        // de la misma línea: ponerlo detrás del nombre era escribir dos veces
        // el mismo número. Con varias sí hace falta el de cada uno.
        const solaEllaEntera =
          personas.length === 1 && personas[0].min === tarea.tiempoImputadoMin;
        return (
          // DOS RENGLONES, no tres columnas. Eran
          // `grid-cols-[minmax(0,1fr)_auto_56px]`, y esa columna `auto` del
          // medio se queda con lo que pide su contenido: en la ficha del
          // Historial, que es estrecha, no dejaba sitio a la primera y la
          // descripción salía a una palabra por línea.
          //
          // Arriba QUÉ se hizo y cuánto costó, que es lo que se recorre con la
          // vista; debajo y más apagado, QUIÉN — que solo se mira cuando algo
          // llama la atención. Así la descripción dispone del ancho entero y
          // da igual lo estrecho que sea el hueco.
          <div key={tarea.codigo} className={`py-1 ${vacia ? "text-text-muted" : ""}`}>
            <p className="flex items-baseline gap-3">
              <span className="min-w-0 flex-1 leading-snug">
                <span className="font-mono text-[10px] text-text-muted">{tarea.codigo}</span>{" "}
                {tarea.descripcion}
              </span>
              <span
                className={`shrink-0 font-mono tabular-nums ${vacia ? "" : "font-semibold"} ${
                  conColor && !vacia ? "text-brand-800 dark:text-brand-300" : ""
                }`}
              >
                {fmtMin(tarea.tiempoImputadoMin)}
              </span>
            </p>
            {personas.length > 0 && (
              <p className="mt-0.5 text-[11px] leading-snug text-text-muted">
                {solaEllaEntera
                  ? personas[0].nombre
                  : personas.map((p) => `${p.nombre} ${fmtMin(p.min)}`).join(" · ")}
              </p>
            )}
          </div>
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
  // LA MISMA CAJA que la versión ya cargada de arriba: borde, fondo, chevron
  // y rótulo. Antes esto era un `chip-3d` —un chip suelto y pequeño, distinto
  // de "Documentos de RPS" y "NOTAS", los otros dos bloques con los que
  // convive en la ficha— y solo se volvía un bloque de verdad DESPUÉS de
  // cargar los datos: pulsar cambiaba lo que se veía por algo que no se
  // parecía en nada. Ahora se ve igual desde el principio; lo único que
  // cambia al pulsar es que carga y se abre.
  return (
    <section
      className={`${className ?? "mb-4"} rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)]`}
    >
      <button
        type="button"
        onClick={cargar}
        disabled={estado === "cargando"}
        title="Qué tareas lleva el pedido y cuánto se ha echado en cada una, según RPS"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-text disabled:opacity-60"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-3.5 shrink-0 text-text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {estado === "cargando"
          ? "Cargando tareas…"
          : estado === "error"
            ? "No se pudo cargar · reintentar"
            : "Tareas y tiempos"}
        <span className="ml-auto font-mono text-[10px] font-normal text-text-muted">{pedido}</span>
      </button>
    </section>
  );
}
