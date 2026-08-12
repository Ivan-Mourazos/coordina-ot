"use client";

import type { Operario, Rol } from "@/lib/types";
import type { Facet } from "./PedidoCard";
import {
  FASES,
  autoresQueFaltan,
  motivoBloqueo,
  ofDeTaller,
  pedidoListoParaPasar,
  type Fase,
} from "@/lib/fases-tablero";
import { ofsFichablesDe } from "@/lib/accion-pedido";
import { fmtMin } from "@/lib/estado";

/** Una línea por pedido: código, cliente, descripción y nº de OF. El detalle
 *  largo sale al abrir el pedido; aquí manda que quepan muchos sin crecer.
 *
 *  UN botón por fila, pegado al borde derecho, y se revela al pasar el ratón:
 *  en reposo la fila es para leerla. La fase decide cuál — fichar/reanudar
 *  mientras hay planteo, pasar cuando ya no queda nada— y lo demás vive en el
 *  detalle, que es donde hay sitio para explicarlo.
 *
 *  Una sola excepción queda fija: la PAUSA del pedido que estás fichando. Es la
 *  que más se pulsa y esconderla hasta pasar el ratón obligaba a buscarla.
 *
 *  "Pasar a revisión" estaba aquí y se fue: es la acción que hay que pensar
 *  —hay que nombrar revisor— y no la que se pulsa de pasada. Se hace desde
 *  dentro del pedido.
 *
 *  El borde izquierdo lleva el color de la fase, salvo en urgentes, que lo
 *  pintan en rojo: la prioridad tiene que verse sin leer. */
export function PedidoLinea({
  facet,
  fase,
  onOpen,
  onFichar,
  onDesfichar,
  completarPedido,
  operarios,
  ofIdsFichandoYo,
  soloConsulta = false,
}: {
  facet: Facet;
  fase: Fase;
  onOpen: (f: Facet) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  completarPedido: (pedidoId: string) => void;
  /** Solo para poner nombre a quien falta en "listo para pasar". */
  operarios?: Operario[];
  /** OFs de MI intervalo abierto. Sin esto no se puede distinguir mi fichaje
   *  del de otra persona sobre la misma OF. */
  ofIdsFichandoYo?: ReadonlySet<string>;
  /** Panel de un compañero: sobre su trabajo no se ficha ni se cambia estado. */
  soloConsulta?: boolean;
}) {
  const { pedido, ofs } = facet;
  const urgente = pedido.prioridad === 3;
  // OJO: `fichandoRol` significa "alguien está fichando esta OF", no "la estoy
  // fichando yo": puede ser el revisor, o cualquiera desde el mini-olanet. Solo
  // se ofrece «Pausar» si la OF está en MI intervalo abierto; si no, pausar
  // cortaría mi propio fichaje, que es otro.
  const fichandoAlguien = ofs.find((o) => o.fichandoRol);
  const fichando = ofs.find((o) => ofIdsFichandoYo?.has(o.id));
  const minutos = ofs.reduce((n, o) => n + o.tiempoPlanteoMin + o.tiempoRevisionMin, 0);
  const color = urgente ? "#dc2626" : FASES.find((f) => f.id === fase)?.color;
  const descripcion = ofs[0]?.descripcion ?? "";

  // `pedido` son TODAS las OF del pedido, no solo las de este facet: por eso
  // se puede saber desde aquí si falta gente sin pedir nada más.
  const nombreDe = (autorId: string | null) =>
    operarios?.find((o) => o.id === autorId)?.nombre ?? "sin asignar";
  const faltan = autoresQueFaltan(pedido);
  const faltanTexto = faltan.map((f) => `${nombreDe(f.autorId)} (${f.n} OF)`).join(", ");
  // Versión corta para la fila: el caso normal es UNA persona y entra entera;
  // con varias se recorta a la primera + cuántas quedan, para no depender de
  // que el texto quepa por casualidad (el detalle completo sigue en el title).
  const faltanResumen =
    faltan.length <= 1
      ? faltanTexto
      : `${nombreDe(faltan[0].autorId)} (${faltan[0].n} OF) +${faltan.length - 1} más`;
  const listoParaPasar = pedidoListoParaPasar(pedido);
  // "Listo para pasar" pero con gente pendiente: el aviso ocupa el mismo
  // hueco que la descripción en vez de superponerse, que era lo que tapaba
  // código/cliente/descripción con pedidos repartidos.
  const mostrandoFalta = !soloConsulta && fase === "listoParaPasar" && !listoParaPasar;

  // Solo las que son trabajo de OT. Una capota detenida en el taller no tiene
  // por qué marcar TU pedido como detenido: no lo está para ti, y no está en tu
  // mano resolverlo. `ofDeTaller` ignora a propósito el rescate por autor —el
  // autor puede venir deducido de RPS—, ver su comentario.
  const deOT = ofs.filter((o) => !ofDeTaller(o));
  const detenidas = deOT.filter((o) => o.detenida).length;

  // El motor de fichaje solo admite un rol corriendo a la vez (ver el
  // comentario de ofsFichablesDe): esta fila solo ficha planteo. En
  // "esperandoRevision" el pedido es MI trabajo en manos de otro — lo que se
  // ficha ahí es la revisión, que le toca al revisor, no a mí — así que no
  // se ofrece fichar en absoluto en esa fase.
  const fichables = fase === "esperandoRevision" ? [] : ofsFichablesDe(facet, "plantear");

  return (
    <div
      style={{ borderLeftColor: color }}
      className={`group relative flex items-center gap-2 rounded-lg border border-l-[3px] border-[var(--glass-border)] px-2 py-1 text-[11px] transition-colors hover:border-brand-400 ${
        fichandoAlguien ? "bg-emerald-500/10" : "bg-surface-2/60"
      }`}
    >
      <button
        onClick={() => onOpen(facet)}
        title={`${pedido.codigo} · ${pedido.cliente} · ${descripcion}`}
        className={`flex min-w-0 items-center gap-2 text-left ${mostrandoFalta ? "shrink-0" : "flex-1"}`}
      >
        {fichandoAlguien && (
          <span
            title={fichando ? "Lo estás fichando tú" : "Alguien lo está fichando ahora"}
            className="size-1.5 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30"
          />
        )}
        <b className="shrink-0 font-semibold tabular-nums text-text">{pedido.codigo}</b>
        {/* Detenidas por Producción: no se pueden fichar y no está en mano de
            OT resolverlo. Se avisa en la fila para no coger un pedido que no
            se puede tocar y descubrirlo al intentar fichar. */}
        {detenidas > 0 && (
          <span
            className="shrink-0 rounded bg-red-600/12 px-1 py-0.5 text-[9px] font-bold uppercase text-red-700 dark:text-red-300"
            title={
              detenidas === deOT.length
                ? "Detenida por Producción: no admite fichaje"
                : `${detenidas} de ${deOT.length} OF detenidas por Producción`
            }
          >
            {detenidas === deOT.length ? "Detenido" : `${detenidas} detenida${detenidas === 1 ? "" : "s"}`}
          </span>
        )}
        {/* Al pedir revisor, o al avisar de que falta gente, se recorta a
            solo el código: el hueco que suelta la descripción es el que
            necesita el selector o el aviso para no quedar apretados en
            filas estrechas (zona personal). */}
        {!mostrandoFalta && (
          <>
            <span className="min-w-0 flex-1 truncate text-text-muted">
              {pedido.cliente}
              {descripcion && ` · ${descripcion}`}
            </span>
            <span className="shrink-0 text-[10px] text-text-muted">
              {ofs.length} OF{minutos > 0 && ` · ${fmtMin(minutos)}`}
            </span>
          </>
        )}
      </button>

      {/* Trabajo de otro: ni se ficha ni se cambia de estado, el panel es
          solo consulta. El candado dice por qué no está disponible, para
          que no haga falta adivinarlo. */}
      {soloConsulta ? (
        <span className="shrink-0 text-[10px] text-text-muted">
          <span title={motivoBloqueo(facet)}>🔒 {motivoBloqueo(facet)}</span>
        </span>
      ) : mostrandoFalta ? (
        // Lo tuyo está hecho pero el pedido va entero a Producción: se dice a
        // quién se espera, que si no el botón desaparece sin más. Ocupa el
        // mismo hueco reservado que la descripción (min-w-0 flex-1 truncate)
        // en vez de superponerse como los botones: con varias personas
        // repartidas el texto no cabía y tapaba código, cliente y descripción.
        <span
          className="min-w-0 flex-1 truncate text-[10px] text-text-muted"
          title={`El pedido se pasa a Producción cuando están aprobadas todas sus OF — falta ${faltanTexto}`}
        >
          falta {faltanResumen}
        </span>
      ) : (
        // Los botones se superponen al final de la fila en vez de reservar
        // sitio: así los minutos van siempre pegados al borde y, al pasar el
        // ratón, no se mueve nada. Heredan el fondo de la fila para tapar
        // limpiamente lo que quede debajo. Sirve para botones cortos
        // ("Pasar", "Fichar"); el aviso de "falta …", que puede ser largo,
        // tiene su propia rama arriba con hueco reservado.
        // Los textos eran de 10 px en negrita sobre color, y en negrita a ese
        // tamaño las letras se empastan: "Pasar a revisión" no se leía, se
        // adivinaba por la forma. Ahora 11 px y semibold, con algo más de aire.
        <span className="absolute inset-y-0 right-2 flex items-center gap-1 rounded-r-lg bg-inherit pl-4">
        {/* Pausa: siempre visible mientras se ficha. */}
        {/* Fichar es el único camino para empezar: arranca el reloj y saca la
            OF de "sin empezar" (ver `arrancarFichaje` en Board).
            SIEMPRE visible solo PAUSAR, y solo mientras corre el reloj: es lo
            que más se pulsa y esconderlo hasta pasar el ratón obligaba a
            buscarlo. Los demás se revelan al pasar por encima, como el resto de
            acciones de la fila: en reposo la fila es para leerla. */}
        {fichando ? (
          <button
            onClick={() => onDesfichar(fichando.id)}
            title="Para el reloj y deja el pedido como está: sigue siendo tuyo y en curso"
            className="rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-700"
          >
            ⏸ Pausar
          </button>
        ) : (
          fichables.length > 0 && (
            <button
              onClick={() => onFichar(fichables.map((o) => o.id), "plantear")}
              title={
                minutos > 0
                  ? "Vuelve a poner el reloj en marcha en este pedido"
                  : fichables.length === 1
                    ? "Empieza el planteo y pone el reloj en marcha"
                    : `Empieza el planteo de las ${fichables.length} OF y pone el reloj en marcha`
              }
              className="rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white opacity-0 transition-opacity hover:bg-emerald-700 focus-visible:opacity-100 group-hover:opacity-100"
            >
              {/* Reanudar no es empezar, y las mismas palabras en todas partes. */}
              {minutos > 0 ? "▶ Reanudar" : "⏱ Fichar"}
              {fichables.length > 1 && ` ${fichables.length}`}
            </button>
          )
        )}

        {/* Igual que el del reloj: se revela al pasar por encima. Estaba fijo
            por ser "la acción esperada de la fase", pero eso hacía que la fila
            en reposo se leyera distinta según la columna en la que cayera. */}
        {fase === "listoParaPasar" && listoParaPasar && (
          <button
            onClick={() => completarPedido(pedido.id)}
            title="Pasar el pedido a Producción"
            className="rounded-md bg-cyan-600 px-2 py-0.5 text-[11px] font-semibold text-white opacity-0 transition-opacity hover:bg-cyan-700 focus-visible:opacity-100 group-hover:opacity-100"
          >
            Pasar
          </button>
        )}
        </span>
      )}
    </div>
  );
}
