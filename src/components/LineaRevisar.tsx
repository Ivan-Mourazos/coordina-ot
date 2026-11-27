"use client";

import type { CSSProperties } from "react";
import type { Operario, Pedido, Rol } from "@/lib/types";
import type { FacetRevision } from "@/lib/revision";
import { accionesDisponibles } from "@/lib/acciones";
import { ofsFichablesDe } from "@/lib/accion-pedido";
import { ROL, bordePrioridad } from "@/lib/estado";
import { tintaSobre } from "@/lib/tinta";
import { ChipComprometida } from "./ChipComprometida";
import { AL_PASAR, BOTON_FILA } from "@/lib/botones";
import { DatoResumen, DatosResumen, ResumenFila, useResumenFila } from "./ResumenFila";
import { FamiliaIcon } from "./FamiliaTag";
import { familiaMeta } from "@/lib/familia";
import { comprometidaVencida } from "@/lib/comprometida";
import { fmtDiaMes } from "@/lib/fechas";
import { hoyISO } from "@/lib/types";
import { useSoloLectura } from "./SoloLectura";

/** Una línea por pedido que me toca REVISAR, en la zona personal del Panel.
 *
 *  Es la hermana de `PedidoLinea`, y va aparte a propósito: aquella es MI
 *  trabajo como autor (fichar el planteo, pasar a Producción) y esta es el de
 *  un compañero en mis manos. Meterla allí habría sido una fase más con todas
 *  sus reglas al revés.
 *
 *  Como allí, UN botón al final y revelado al pasar el ratón: empezar la
 *  revisión o reanudarla. Fija solo la pausa de lo que estoy fichando. Aprobar
 *  y devolver NO están aquí: piden repasar la guía punto por punto, y eso se
 *  hace en la pestaña Revisiones o dentro del pedido.
 *
 *  Lleva el avatar del AUTOR: es lo que la distingue de "Esperando revisión",
 *  que es del mismo violeta pero al revés — lo mío en manos de otro. */
export function LineaRevisar({
  facet,
  miId,
  operarios,
  onOpen,
  onEmpezar,
  onFichar,
  onDesficharVarias,
  ofIdsFichandoYo,
}: {
  facet: FacetRevision;
  miId: string;
  operarios: Operario[];
  onOpen: (p: Pedido) => void;
  /** Pasa las OF a "en revisión" y arranca mi reloj de revisor. */
  onEmpezar: (ofIds: string[]) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesficharVarias: (ofIds: string[]) => void;
  /** OFs de MI intervalo abierto; ver el comentario en Board. */
  ofIdsFichandoYo?: ReadonlySet<string>;
}) {
  const soloLectura = useSoloLectura();
  const { pedido, ofs } = facet;
  const fichandoYo = ofs.filter((o) => ofIdsFichandoYo?.has(o.id));
  // Es la máquina de estados la que dice si puedo empezar (ver `soloEl` en
  // lib/acciones.ts), no esta fila.
  const porEmpezar = ofs.filter((o) =>
    accionesDisponibles(o, miId).some((a) => a.id === "empezar_revision"),
  );
  // Las que ya estoy revisando y tienen el reloj parado.
  const reanudables = ofsFichablesDe(facet, "revisar").filter((o) => o.estado === "en_revision");
  const familias = [...new Set(ofs.map((o) => o.familia))];
  const autores = [...new Set(ofs.map((o) => o.autorId))]
    .map((id) => operarios.find((o) => o.id === id))
    .filter((o): o is Operario => o !== undefined);

  // En estrecho, si hay botón fijo («Pausar») o al aparecer el botón al pasar
  // el ratón / foco, todo lo de la derecha del código se esconde para dejarle
  // sitio en la misma línea sin cambiar la altura de la fila.
  const hayBotonFijo = !soloLectura && fichandoYo.length > 0;
  const hayAccionAlPasar = !soloLectura && !hayBotonFijo && (porEmpezar.length > 0 || reanudables.length > 0);
  const cederPorBotones = hayBotonFijo
    ? "@max-[30rem]:hidden"
    : hayAccionAlPasar
      ? "@max-[30rem]:group-hover:hidden @max-[30rem]:group-has-[:focus-visible]:hidden"
      : "";
  // Lo pequeño (iconos de familia y avisos, el nº de OF) se QUEDA al pasar el
  // ratón, como en la ficha de la OF; solo cede lo que estorba a los botones
  // (Iván, 27/11/2026). El nº de OF aguanta hasta 20rem; por debajo ya no cabe.
  const cederSiFalta = cederPorBotones.replaceAll("@max-[30rem]:", "@max-[20rem]:");
  const botonCompacto = "@max-[18rem]:min-w-0 @max-[18rem]:px-1.5";
  const resumen = useResumenFila();

  return (
    <div
      onClick={() => onOpen(pedido)}
      {...resumen.handlers}
      // La prioridad, como en las demás filas de los paneles (11/11/2026).
      style={{ borderLeftColor: bordePrioridad(pedido.prioridad), "--borde-prioridad": bordePrioridad(pedido.prioridad) } as CSSProperties}
      // `@container` va en la caja exterior y la disposición en el hijo directo:
      // una container query nunca se aplica al propio elemento que declara
      // `container-type`, solo a sus descendientes.
      className={`@container group relative cursor-pointer rounded-lg border border-l-[3px] border-[var(--fila-filo)] fila-sombra con-prioridad px-2 py-1.5 text-[11px] transition-colors hover:border-brand-400 ${
        fichandoYo.length > 0 ? "fila-fichando-revisar" : "bg-[var(--fila)]"
      }`}
    >
      {/* SIEMPRE UNA SOLA LÍNEA (`h-5` fija el alto interior a 20 px para que
          no varíe 1 px entre reposo y hover). En ancho (> 30rem), rejilla
          alineada con cliente cediendo al botón. En estrecho (≤ 30rem), flex
          en una línea donde las piezas ceden por orden hasta quedar solo el
          código:
          1) cliente (≤ 30rem);
          2) texto de familia → solo icono (≤ 18rem);
          3) fecha comprometida (≤ 15.5rem);
          4) avatar del autor y cuenta de OF (≤ 11.5rem);
          5) icono de familia (≤ 9.5rem).
          El texto «Revisando / Por empezar» ya no sale en esta fila: la columna
          dice que te toca a ti y el botón («Revisar» vs «Reanudar») indica el
          estado (Iván, 27/11/2026). */}
      <div className="grid h-5 items-center gap-x-1.5 grid-cols-[minmax(5.75rem,max-content)_4.5rem_minmax(0,26rem)_auto_minmax(max-content,1fr)] @max-[34rem]:grid-cols-[minmax(5.75rem,max-content)_4.5rem_minmax(0,26rem)_auto_minmax(max-content,1fr)] @max-[30rem]:flex @max-[30rem]:items-center @max-[30rem]:gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(pedido);
          }}
          // `rounded-none!`: evita que el estilo HeroUI vuelva píldora este
          // botón. Sin `truncate`: el número de pedido nunca se corta ni se esconde.
          className="col-start-1 row-start-1 flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-none! text-left"
        >
          {fichandoYo.length > 0 && (
            <span
              title="Lo estás revisando tú"
              className="size-1.5 shrink-0 rounded-full bg-violet-500 ring-2 ring-violet-500/30"
            />
          )}
          <b className="font-semibold tabular-nums text-text">{pedido.codigo}</b>
        </button>

        <span className={`col-start-2 row-start-1 flex min-w-0 items-center gap-1 overflow-hidden @max-[30rem]:flex-1 @max-[30rem]:min-w-max @max-[9.5rem]:hidden`}>
          {/* SOLO ICONOS, todas las familias (Iván, 27/11/2026): con el nombre solo
              cabía la primera y un «+N»; así se ven todas de un vistazo. El nombre,
              al pasar el ratón por cada icono y en la tarjeta de la fila. */}
          {familias.map((fam) => (
            <span key={fam} title={familiaMeta(fam).label} className="inline-flex shrink-0">
              <FamiliaIcon familia={fam} className="size-3.5" />
            </span>
          ))}
        </span>

        {/* Fecha y cliente; en estrecho desaparece entera (la fecha corta va a
            la derecha con el resto de metadatos). Los avatares ya no viven aquí:
            esta celda es la que cede, y se los comía (Iván, 26 y 27/11/2026). */}
        <span className="col-start-3 row-start-1 flex min-w-0 items-center gap-1.5 overflow-hidden @max-[30rem]:hidden">
          <ChipComprometida pedido={pedido} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-text-muted">{pedido.cliente}</span>
        </span>

        {/* Los botones van en su hueco, no encima (comité del 26/11/2026). En
            estrecho, fecha corta + autor + cuenta ceden progresivamente y se
            esconden al pasar el ratón para dejar sitio al botón en la misma línea. */}
        <span className={`col-start-4 row-start-1 flex shrink-0 items-center justify-end gap-1.5 whitespace-nowrap text-[10px] @max-[11.5rem]:hidden ${cederSiFalta}`}>
          <ChipComprometida pedido={pedido} soloFecha className="hidden shrink-0 tabular-nums @max-[30rem]:inline @max-[15.5rem]:hidden" />
          {autores.length > 0 && (
            <span className="flex shrink-0 -space-x-1">
              {autores.slice(0, 2).map((op) => (
                <span
                  key={op.id}
                  title={`Lo plantea ${op.nombre}`}
                  className="grid size-4 place-items-center rounded-full text-[8px] font-bold text-white ring-1 ring-[var(--fila)]"
                  style={{ background: op.color, color: tintaSobre(op.color) }}
                >
                  {op.iniciales}
                </span>
              ))}
            </span>
          )}
          <span className="shrink-0 text-text-muted">
            {ofs.length} OF
          </span>
        </span>

        {/* `-my-0.5`: que el botón (22 px) no haga crecer la fila (ver PedidoLinea). */}
        <span
          onClick={(e) => e.stopPropagation()}
          className="col-start-5 row-start-1 -my-0.5 flex shrink-0 items-center justify-end gap-1 justify-self-end empty:hidden @max-[30rem]:ml-auto"
        >
          {soloLectura ? null : fichandoYo.length > 0 ? (
            <button
              type="button"
              onClick={() => onDesficharVarias(fichandoYo.map((o) => o.id))}
              title="Para el reloj y deja la revisión como está: sigue siendo tuya"
              className={`${BOTON_FILA} ${botonCompacto} inline-flex ${ROL.revisar.solido}`}
            >
              Pausar{fichandoYo.length > 1 && ` ${fichandoYo.length}`}
            </button>
          ) : porEmpezar.length > 0 ? (
            <button
              type="button"
              onClick={() => onEmpezar(porEmpezar.map((o) => o.id))}
              title="Pasa a En revisión y arranca tu fichaje de revisor"
              className={`${BOTON_FILA} ${botonCompacto} ${AL_PASAR} ${ROL.revisar.solido}`}
            >
              {/* «Revisar», como en la ficha, y por la MISMA confirmación que
                  fichar (Board: `ficharOFsConAviso`); antes se la saltaba. */}
              Revisar{porEmpezar.length > 1 && ` ${porEmpezar.length}`}
            </button>
          ) : (
            reanudables.length > 0 && (
              <button
                type="button"
                onClick={() => onFichar(reanudables.map((o) => o.id), "revisar")}
                title="Vuelve a poner el reloj en marcha en esta revisión"
                className={`${BOTON_FILA} ${botonCompacto} ${AL_PASAR} ${ROL.revisar.solido}`}
              >
                Reanudar
              </button>
            )
          )}
        </span>
      </div>

      {/* En estrecho (≤ 30rem), al dejar el ratón o foco 400 ms, muestra lo que
          se recortó de la fila: cliente, todas las familias, comprometida,
          autor completo y nº de OF. En ancho no se abre. */}
      <ResumenFila ancla={resumen.ancla} onCerrado={resumen.cerrar}>
        <DatosResumen titulo={pedido.cliente}>
          {familias.length > 0 && (
            <DatoResumen etiqueta={familias.length > 1 ? "Familias" : "Familia"}>
              {familias.map((fam) => (
                <span key={fam} className="inline-flex items-center gap-1">
                  <FamiliaIcon familia={fam} className="size-3.5" />
                  {familiaMeta(fam).label}
                </span>
              ))}
            </DatoResumen>
          )}
          {pedido.fechaComprometida && (
            <DatoResumen etiqueta="Comprometida">
              <span className={comprometidaVencida(pedido, hoyISO()) ? "font-semibold text-error" : ""}>
                {fmtDiaMes(pedido.fechaComprometida)}
              </span>
            </DatoResumen>
          )}
          <DatoResumen etiqueta="Trabajo">{ofs.length} OF</DatoResumen>
          {autores.length > 0 && (
            <DatoResumen etiqueta="Lo plantea">
              {autores.map((op) => (
                <span key={op.id} className="inline-flex items-center gap-1">
                  <span
                    className="grid size-4 shrink-0 place-items-center rounded-full text-[8px] font-bold leading-none"
                    style={{ background: op.color, color: tintaSobre(op.color) }}
                  >
                    {op.iniciales}
                  </span>
                  {op.nombre}
                </span>
              ))}
            </DatoResumen>
          )}
        </DatosResumen>
      </ResumenFila>
    </div>
  );
}

