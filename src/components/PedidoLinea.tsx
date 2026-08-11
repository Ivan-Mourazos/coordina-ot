"use client";

import { useState } from "react";
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
import { accionPrimariaDePedido, ofsFichablesDe, ofsPara } from "@/lib/accion-pedido";
import { fmtMin } from "@/lib/estado";
import type { AccionOF } from "@/lib/acciones";
import { PedirRevisor } from "./PedirRevisor";

/** Una línea por pedido: código, cliente, descripción y nº de OF. El detalle
 *  largo sale al abrir el pedido; aquí manda que quepan muchos sin crecer.
 *
 *  Las acciones se revelan al pasar el ratón para no gastar sitio en reposo.
 *  Dos excepciones quedan siempre visibles: la pausa del pedido que se está
 *  fichando (es la que más se pulsa, esconderla obligaría a buscarla) y el
 *  botón «Pasar» en "listo para pasar" (es la acción esperada de esa fase).
 *
 *  El borde izquierdo lleva el color de la fase, salvo en urgentes, que lo
 *  pintan en rojo: la prioridad tiene que verse sin leer. */
export function PedidoLinea({
  facet,
  fase,
  onOpen,
  onAccion,
  onFichar,
  onDesfichar,
  completarPedido,
  operarios,
  setRevisor,
  ofIdsFichandoYo,
  soloConsulta = false,
}: {
  facet: Facet;
  fase: Fase;
  onOpen: (f: Facet) => void;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  completarPedido: (pedidoId: string) => void;
  /** Para nombrar revisor al pulsar "Pasar a revisión" (ver PedirRevisor).
   *  No hace falta en modo consulta: ahí no hay ninguna acción que lo pida. */
  operarios?: Operario[];
  setRevisor?: (ofId: string, revisorId: string | null) => void;
  /** OFs de MI intervalo abierto. Sin esto no se puede distinguir mi fichaje
   *  del de otra persona sobre la misma OF. */
  ofIdsFichandoYo?: ReadonlySet<string>;
  /** Panel de un compañero: sobre su trabajo no se ficha ni se cambia estado. */
  soloConsulta?: boolean;
}) {
  const [pidiendoRevisor, setPidiendoRevisor] = useState(false);
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
  // hueco que la descripción (como pidiendoRevisor) en vez de superponerse,
  // que era lo que tapaba código/cliente/descripción con pedidos repartidos.
  const mostrandoFalta = !soloConsulta && fase === "listoParaPasar" && !listoParaPasar;

  // Solo las que son trabajo de OT. Una capota detenida en el taller no tiene
  // por qué marcar TU pedido como detenido: no lo está para ti, y no está en tu
  // mano resolverlo. `ofDeTaller` ignora a propósito el rescate por autor —el
  // autor puede venir deducido de RPS—, ver su comentario.
  const deOT = ofs.filter((o) => !ofDeTaller(o));
  const detenidas = deOT.filter((o) => o.detenida).length;

  const accion = accionPrimariaDePedido(facet);
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
        className={`flex min-w-0 items-center gap-2 text-left ${pidiendoRevisor || mostrandoFalta ? "shrink-0" : "flex-1"}`}
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
        {!pidiendoRevisor && !mostrandoFalta && (
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
      ) : pidiendoRevisor ? (
        // "Pasar a revisión" pide el revisor aquí mismo (flujo unificado con
        // el Drawer, ver AccionesOF en Drawer.tsx): terminar_planteo no
        // exige revisor, pero empezar_revision sí — sin nombrarlo aquí, la
        // OF quedaría "por revisar" sin nadie que pueda tomarla. Se fija el
        // revisor ANTES de ejecutar la acción.
        <span className="min-w-0 flex-1">
          <PedirRevisor
            operarios={operarios ?? []}
            excluirIds={[facet.locationId, ...ofs.map((o) => o.autorId)]}
            valorInicial={ofs.find((o) => o.revisorId)?.revisorId ?? null}
            onConfirmar={(rev) => {
              const ids = ofsPara(facet, "terminar_planteo").map((o) => o.id);
              ids.forEach((id) => setRevisor?.(id, rev));
              onAccion(ids, "terminar_planteo");
              setPidiendoRevisor(false);
            }}
            onCancelar={() => setPidiendoRevisor(false)}
          />
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
                fichables.length === 1
                  ? "Empezar a fichar en este pedido"
                  : `Empezar a fichar en las ${fichables.length} OF de este pedido`
              }
              className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-text-muted opacity-0 transition-opacity hover:bg-[var(--glass-highlight)] hover:text-text focus-visible:opacity-100 group-hover:opacity-100"
            >
              ⏱ Fichar{fichables.length > 1 && ` ${fichables.length}`}
            </button>
          )
        )}

        {accion && (
          <button
            onClick={() =>
              accion.id === "terminar_planteo"
                ? setPidiendoRevisor(true)
                : onAccion(ofsPara(facet, accion.id).map((o) => o.id), accion.id)
            }
            title={accion.label}
            className="rounded-md bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white opacity-0 transition-opacity hover:bg-brand-600 focus-visible:opacity-100 group-hover:opacity-100"
          >
            {accion.label}
          </button>
        )}

        {fase === "listoParaPasar" && listoParaPasar && (
          <button
            onClick={() => completarPedido(pedido.id)}
            title="Pasar el pedido a Producción"
            className="rounded-md bg-cyan-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-cyan-700"
          >
            Pasar
          </button>
        )}
        </span>
      )}
    </div>
  );
}
