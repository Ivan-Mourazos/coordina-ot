"use client";

import { useState, type CSSProperties } from "react";
import type { Operario, OF, Rol } from "@/lib/types";
import type { Seccion } from "@/lib/secciones";
import { accionesDisponibles } from "@/lib/acciones";
import { accionOcultaSinRevision } from "@/lib/impreso";
import { tintaSobre } from "@/lib/tinta";
import { PedirRevisor } from "./PedirRevisor";
import { AL_PASAR, BOTON_CIERRE, BOTON_FILA, BOTON_NEUTRO, BOTON_PASAR_REVISION } from "@/lib/botones";
import type { Facet } from "./PedidoCard";
import {
  autoresQueFaltan,
  avisaDeOFNueva,
  motivoBloqueo,
  ofDeTaller,
  pedidoListoParaPasar,
  type Fase,
} from "@/lib/fases-tablero";
import { ofsFichablesDe } from "@/lib/accion-pedido";
import { motivoNoFichable } from "@/lib/fichaje";
import { ROL, bordePrioridad, fmtMin } from "@/lib/estado";
import { IconoCandado, IconoPausa } from "./Iconos";
import { fmtDiaMes } from "@/lib/fechas";
import { ChipComprometida } from "./ChipComprometida";
import { FamiliaTag } from "./FamiliaTag";
import { hoyISO } from "@/lib/types";
import { useSoloLectura } from "./SoloLectura";

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
 *  "Pasar a revisión" estuvo aquí, se fue a la ficha y VUELVE (26/11/2026):
 *  es de lo que más se hace, y con los compañeros como botones —pulsar un
 *  nombre manda— ya no hay que pensar nada más que en la ficha.
 *
 *  LOS BOTONES VAN EN SU HUECO, no encima (comité del 26/11/2026): antes se
 *  superponían al final de la fila y escondían la fecha y la cuenta de OF;
 *  ahora, al aparecer, lo que se acorta es el cliente. Todos de 22 px
 *  (`BOTON_FILA`), los mismos colores que la barra de la ficha.
 *
 *  El borde izquierdo lleva el color de la PRIORIDAD (ver `bordePrioridad`):
 *  la fase ya la dicen la columna y su fondo, y la prioridad solo se veía en
 *  las urgentes (Iván, 11/11/2026). */
/** El ámbar de "parado por Producción" (el mismo del aviso de la zona
 *  personal). Va como variable porque lo pide un `style` en línea. */
const AMBAR_PARADO = "var(--color-amber-600)";

export function PedidoLinea({
  facet,
  fase,
  onOpen,
  onFichar,
  onDesficharVarias,
  completarPedido,
  operarios,
  ofIdsFichandoYo,
  soloConsulta = false,
  onCoger,
  seccion,
  miId,
  onPasarRevision,
}: {
  /** Para saber si aquí se revisa (Impresión no) y ofrecer «Pasar a revisión». */
  seccion?: Pick<Seccion, "sinRevision" | "finalizar">;
  miId?: string | null;
  /** Manda las OF a revisar con ese revisor. Sin él, la fila no lo ofrece. */
  onPasarRevision?: (ofIds: string[], revisorId: string) => Promise<boolean>;
  facet: Facet;
  fase: Fase;
  onOpen: (f: Facet) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  /** Para el reloj en varias OF de una vez. Aquí siempre son varias en
   *  potencia: la fila es un PEDIDO, y se ficha entero. */
  onDesficharVarias: (ofIds: string[]) => void;
  completarPedido: (pedidoId: string) => void;
  /** Solo para poner nombre a quien falta en "listo para pasar". */
  operarios?: Operario[];
  /** OFs de MI intervalo abierto. Sin esto no se puede distinguir mi fichaje
   *  del de otra persona sobre la misma OF. */
  ofIdsFichandoYo?: ReadonlySet<string>;
  /** Panel de un compañero: sobre su trabajo no se ficha ni se cambia estado. */
  soloConsulta?: boolean;
  /** Quedarse con el pedido de un compañero (solo en su panel). Lo pregunta
   *  antes: se lo quita de las manos a alguien. */
  onCoger?: (f: Facet) => void;
}) {
  const soloLectura = useSoloLectura();
  const { pedido, ofs } = facet;
  // Pidiendo revisor desde la fila: las OF que se mandarán, fijadas al pulsar.
  const [pidiendoRevisor, setPidiendoRevisor] = useState<OF[] | null>(null);
  // OJO: `fichandoRol` significa "alguien está fichando esta OF", no "la estoy
  // fichando yo": puede ser el revisor, o cualquiera desde el mini-olanet. Solo
  // se ofrece «Pausar» si la OF está en MI intervalo abierto; si no, pausar
  // cortaría mi propio fichaje, que es otro.
  const fichandoAlguien = ofs.find((o) => o.fichandoRol);
  // TODAS las mías que corren, no la primera. El botón paraba solo una, así que
  // en un pedido de cuatro OF fichado entero había que pulsar "Pausar" cuatro
  // veces y el reloj seguía andando entre pulsación y pulsación.
  const fichandoYo = ofs.filter((o) => ofIdsFichandoYo?.has(o.id));
  const minutos = ofs.reduce((n, o) => n + o.tiempoPlanteoMin + o.tiempoRevisionMin, 0);
  const color = bordePrioridad(pedido.prioridad);
  const descripcion = ofs[0]?.descripcion ?? "";
  // Las familias del pedido, que es lo que dice DE QUÉ es sin leer: la
  // descripción de la primera OF ("LONA (TECHO, LATERAL,,,) PARA ESTRUCTURA
  // CLIENTE") se comía media fila y casi siempre acababa cortada.
  const familias = [...new Set(ofs.map((o) => o.familia))];

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
  const ofNuevasSinCoger = pedido.ofs.filter(
    (o) => (pedido.reabiertoPor ?? []).includes(o.id) && o.autorId === null,
  ).length;
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
  // TODAS detenidas: el pedido no se puede tocar hasta que Producción lo
  // libere. La fila se apaga entera —borde rojo, icono de pausa y el código en
  // gris— en vez de llevar el chip "DETENIDO", que empujaba al cliente y
  // rompía la columna. Se sigue pudiendo abrir: apagado no es escondido.
  //
  // El gris y NO la opacidad: bajarle la opacidad a la fila deja el texto por
  // debajo del contraste mínimo, y esto hay que poder leerlo. Y el icono y no
  // solo el color: quien no distinga el rojo se quedaría sin el aviso.
  const detenidoDelTodo = deOT.length > 0 && detenidas === deOT.length;

  // El motor de fichaje solo admite un rol corriendo a la vez (ver el
  // comentario de ofsFichablesDe): esta fila solo ficha planteo. En
  // "esperandoRevision" el pedido es MI trabajo en manos de otro — lo que se
  // ficha ahí es la revisión, que le toca al revisor, no a mí — así que no
  // se ofrece fichar en absoluto en esa fase.
  // Sin las APROBADAS (Iván, 26/11/2026, igual que «Fichar» en la ficha): en
  // bloque solo trabajo pendiente. Una aprobada se ficha una a una, desde su
  // fila en la ficha, para el retoque de última hora.
  const fichables =
    fase === "esperandoRevision"
      ? []
      : ofsFichablesDe(facet, "plantear").filter((o) => o.estado !== "aprobada");
  // «Reanudar» si ESAS ya tienen tiempo, no el pedido entero (una aprobada con
  // horas hacía decir «Reanudar» a un pedido cuyas OF pendientes no tenían nada).
  const minutosFichables = fichables.reduce((n, o) => n + o.tiempoPlanteoMin, 0);

  // Lo que se puede mandar a revisar desde la fila: lo mismo que el bloque de
  // la ficha. Un único autor (el revisor no puede ser el autor y se elige uno
  // para todas) y solo donde se revisa.
  const paraRevisar =
    !soloConsulta && onPasarRevision && miId && seccion && !seccion.sinRevision
      ? ofs.filter((o) =>
          accionesDisponibles(o, miId).some(
            (a) => a.id === "terminar_planteo" && !accionOcultaSinRevision(seccion, a.id),
          ),
        )
      : [];
  const puedePasarRevision = paraRevisar.length > 0 && new Set(paraRevisar.map((o) => o.autorId)).size === 1;
  // Esperando revisión: quién la tiene, para enseñarlo en vez del candado.
  const revisorId = deOTRevisor(ofs);
  const revisor = operarios?.find((o) => o.id === revisorId) ?? null;

  // Y si no hay ninguna fichable, POR QUÉ. Lo pinta la fila al pasar el ratón
  // (ver más abajo): sin esto, una fila sin botón no se distingue de una fila
  // rota.
  //
  // En "esperando revisión" el motivo no es de la OF sino de la fase, así que
  // se dice aparte: las OF de ahí sí son fichables, solo que no por su autor.
  //
  // Con varias OF se dice el motivo COMÚN, y si no lo hay, cuántas hay de cada
  // cosa sobraría — basta con que no se puede y que el detalle está dentro.
  // Va en DOS versiones. La corta es la que se pinta —esta franja se superpone
  // al final de la fila, así que un texto largo se mete encima del cliente— y
  // la larga vive en el `title`, que es donde sí cabe explicarse.
  const sinBotonDeFichar = fichandoYo.length === 0 && fichables.length === 0;
  const motivosOF = [...new Set(deOT.map(motivoNoFichable).filter((m): m is string => m !== null))];
  const motivoSinFichar: { corto: string; largo: string } | null =
    fase === "esperandoRevision"
      ? {
          corto: "Lo tiene el revisor",
          largo: "Tu parte está hecha: lo que se ficha aquí es la revisión, y le toca al revisor",
        }
      : motivosOF.length === 1
        ? { corto: motivosOF[0], largo: motivosOF[0] }
        : motivosOF.length > 1
          ? {
              corto: "Sin fichaje",
              largo: `Ninguna de sus OF admite fichaje ahora: ${motivosOF.join(" · ")}`,
            }
          : null;

  // Los avisos del pedido, que van al principio de la columna del cliente:
  // un parte reescaneado, trabajo nuevo aparecido después de pasarlo y las OF
  // detenidas por Producción.
  const hayAvisos =
    pedido.scanCambiado || avisaDeOFNueva(pedido) || (detenidas > 0 && !detenidoDelTodo);
  const avisos = (
    <>
      {/* En estrecho va junto a la planificada, solo la fecha: aquí bajaría a
          una segunda línea y desplazaría las filas de debajo. */}
      <ChipComprometida pedido={pedido} className="shrink-0 @max-[26rem]:hidden" />
      {/* Han vuelto a escanear el parte y nadie lo ha dado por visto. Va en
          la FILA y no solo dentro del pedido: la gracia es no ponerse a
          trabajar con la versión vieja, y para eso hay que verlo ANTES de
          abrirlo. Se apaga desde dentro, con el botón del aviso. */}
      {pedido.scanCambiado && (
        <span
          className="shrink-0 rounded bg-amber-500/20 px-1 py-0.5 text-[10px] font-bold uppercase text-amber-800 dark:text-amber-300"
          title="Han vuelto a escanear el parte de este pedido. Ábrelo para verlo y darlo por visto."
        >
          Parte nuevo
        </span>
      )}
      {/* Trabajo aparecido DESPUÉS de pasar el pedido a Producción: RPS ha
          habilitado una OF que antes no había que hacer. Va en la fila
          porque, sin ella, el pedido reaparece en el tablero semanas después
          de darlo por cerrado y nadie entiende qué hace ahí.

          Mismo ámbar que "parte nuevo", y suelen salir juntos: cuando añaden
          trabajo a un pedido, vuelven a escanear el parte. */}
      {avisaDeOFNueva(pedido) && (
        <span
          className="shrink-0 rounded bg-amber-500/20 px-1 py-0.5 text-[10px] font-bold uppercase text-amber-800 dark:text-amber-300"
          /* Se cuentan las que siguen SIN DUEÑO, no todas las nuevas: el
             aviso ya solo sale por esas (ver `avisaDeOFNueva`), y decir "3
             OF nuevas" cuando dos ya las cogió alguien manda a buscar
             trabajo que no está. */
          title={
            ofNuevasSinCoger === 1
              ? "Este pedido ya se había pasado a Producción y ha aparecido una OF nueva sin hacer."
              : `Este pedido ya se había pasado a Producción y han aparecido ${ofNuevasSinCoger} OF nuevas sin hacer.`
          }
        >
          OF nueva
        </span>
      )}
      {/* Detenidas por Producción: no se pueden fichar y no está en mano de
          OT resolverlo. Se avisa en la fila para no coger un pedido que no
          se puede tocar y descubrirlo al intentar fichar. */}
      {detenidas > 0 && !detenidoDelTodo && (
        <span
          className="shrink-0 rounded bg-red-600/12 px-1 py-0.5 text-[10px] font-bold uppercase text-red-700 dark:text-red-300"
          title={
            `${detenidas} de ${deOT.length} OF detenidas por Producción`
          }
        >
          {`${detenidas} detenida${detenidas === 1 ? "" : "s"}`}
        </span>
      )}
    </>
  );

  return (
    <div
      // Lo busca lib/paseAnimado.ts para hacer volar la fila al pasarla.
      data-pedido={pedido.id}
      // Ámbar y NO rojo: el rojo es de "urgente" en toda la app, y un pedido
      // parado no es urgente —es justo lo contrario—. Es el mismo ámbar del
      // aviso "N parados por Producción" de la zona personal.
      // `--borde-prioridad`: el mismo color para el estilo HeroUI, que quita los
      // bordes de las filas y lo pinta como sombra interior (ver hero.css).
      style={{ borderLeftColor: detenidoDelTodo ? AMBAR_PARADO : color, "--borde-prioridad": detenidoDelTodo ? AMBAR_PARADO : color } as CSSProperties}
      // `@container`: la fila mide SU ancho y las reglas `@max-[26rem]` de
      // dentro se aplican según él. Sin contenedor no casaban nunca, y en las
      // columnas estrechas de la zona personal (cinco fases repartiéndose el
      // ancho) «Parte nuevo» se montaba sobre la fecha y la cuenta de OF
      // salía cortada ("2 O").
      className={`@container group relative flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-l-[3px] border-[var(--fila-filo)] fila-sombra con-prioridad px-2 py-1.5 text-[11px] transition-colors hover:border-brand-400 ${
        // Del color del ROL, no siempre verde: revisando salía igual que
        // planteando (Iván, 16/10/2026). Ver `.fila-fichando-*` en globals.css.
        fichandoAlguien ? `fila-fichando-${fichandoAlguien.fichandoRol}` : detenidoDelTodo ? "bg-[color-mix(in_srgb,var(--surface-2)_50%,var(--fila))]" : "bg-[var(--fila)]"
      }`}
    >
      <button
        onClick={() => onOpen(facet)}
        // Sin `title`: la fila se recorre con el ratón y la pista salía a cada
        // paso, tapando la de abajo. Lo que decía ya está en la fila o al abrirla.
        // `cursor-pointer` EXPLÍCITO. La regla de globals.css que pone la mano
        // en todo `button` vive en `@layer base`, y ahí la gana cualquier
        // utilidad de una capa posterior: en esta fila la mano solo salía sobre
        // los botones de acción, y el resto —que abre el pedido, que es la
        // acción más usada de la fila— se quedaba con la flecha de siempre.
        // Puesta como utilidad, manda pase lo que pase.
        // EN COLUMNAS, no en fila corrida: el código, la fecha y la cuenta de
        // OF caen siempre en el mismo sitio, así que se recorren de arriba
        // abajo con la vista. Con `flex`, cada fila colocaba sus datos donde
        // le tocaba según lo largos que fueran los de la izquierda, y cinco
        // datos sin alinear se leen como un amasijo.
        //
        // El cliente tiene TOPE (26rem). Estirado hasta el final, en la zona
        // propia —que ocupa todo el ancho— dejaba 600 px vacíos entre el nombre
        // y su fecha, y había que cruzar la pantalla para leer una fila. Con
        // tope, la fecha va detrás del cliente y lo que sobra queda al final
        // (`justify-start`: una columna `auto` se estira si no); las columnas
        // siguen alineadas porque el tope es el mismo en todas. Y el resto de
        // columnas y huecos, ajustados: en los paneles estrechos lo que no
        // ocupan ellas es lo que le queda al nombre del cliente.
        //
        // Pidiendo revisor o avisando de quién falta, la fila se queda en el
        // código y el resto del ancho es para ese aviso: ahí no hay columnas
        // que alinear.
        //
        // `rounded-none!`: el estilo HeroUI hace píldora todo botón, y con el
        // `overflow-hidden` una fila de dos líneas («1 detenida», «Parte
        // nuevo») se comía el código por la izquierda y la cuenta de OF por la
        // derecha ("2 O"). La forma la da la fila, no este botón.
        className={`min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-none! text-left ${
          mostrandoFalta
            ? "flex shrink-0"
            : "grid flex-1 justify-start grid-cols-[5.75rem_6.5rem_minmax(0,26rem)_auto] @max-[26rem]:grid-cols-[5.75rem_minmax(0,1fr)_auto] @max-[26rem]:gap-y-1"
        }`}
      >
        {/* Columna 1: el punto de "lo están fichando" y el código. */}
        <span className="flex min-w-0 items-center gap-1.5">
          {fichandoAlguien && (
            <span
              title={fichandoYo.length > 0 ? "Lo estás fichando tú" : "Alguien lo está fichando ahora"}
              className={`size-1.5 shrink-0 rounded-full ring-2 ${
                fichandoAlguien.fichandoRol === "revisar"
                  ? "bg-violet-500 ring-violet-500/30"
                  : "bg-emerald-500 ring-emerald-500/30"
              }`}
            />
          )}
          {detenidoDelTodo && (
            <IconoPausa className="size-3 shrink-0 text-amber-800 dark:text-amber-300" />
          )}
          <b
            className={`truncate font-semibold tabular-nums ${
              detenidoDelTodo ? "text-text-muted" : "text-text"
            }`}
          >
            {pedido.codigo}
          </b>
        </span>
        {/* Al pedir revisor, o al avisar de que falta gente, se recorta a
            solo el código: el hueco que suelta la descripción es el que
            necesita el selector o el aviso para no quedar apretados en
            filas estrechas (zona personal). */}
        {/* EN ESTRECHO (fila de menos de 26rem: la zona personal con varias
            fases repartiéndose el ancho) no caben las cuatro columnas. Se va
            el cliente, que ahí se quedaba en «TARRIO ALV…»; la cuenta de OF
            pierde los minutos, y los avisos bajan a una SEGUNDA línea en vez
            de montarse sobre la fecha. Solo la fila que tiene avisos crece. */}
        {!mostrandoFalta && (
          <>
            {/* Columna 2: la familia, en su propia columna y DELANTE del cliente:
                detrás quedaba a una distancia distinta en cada fila, según lo
                largo que fuera el nombre. Con varias, la primera y "+N": son
                pocas y lo que hace falta aquí es saber de qué va el pedido. */}
            <span className="flex min-w-0 items-center gap-1 overflow-hidden">
              {familias[0] && <FamiliaTag familia={familias[0]} />}
              {familias.length > 1 && (
                <span className="shrink-0 text-[10px] text-text-muted" title={familias.join(" · ")}>
                  +{familias.length - 1}
                </span>
              )}
            </span>
            {/* Columna 3: los avisos del pedido y el cliente. */}
            {/* `overflow-hidden`: en ancho, si los avisos no caben se recortan
                dentro de su columna, nunca encima de la fecha. */}
            <span
              className={`flex min-w-0 items-center gap-2 overflow-hidden ${
                hayAvisos ? "@max-[26rem]:col-span-full @max-[26rem]:row-start-2" : "@max-[26rem]:hidden"
              }`}
            >
              {avisos}
              <span className="min-w-0 flex-1 truncate text-text-muted @max-[26rem]:hidden">
                {pedido.cliente}
              </span>
            </span>
            {/* SE ESCONDE CUANDO APARECE UN BOTÓN ENCIMA. Los botones se
                superponen al final de la fila (ver su rama más abajo) y se
                tapaban con `bg-inherit`, pero el fondo de la fila es
                SEMITRANSPARENTE —`bg-surface-2/60`, `bg-emerald-500/10`—: un
                fondo translúcido sobre un texto no lo tapa, lo vela. Se veía
                "1 OF" a través de "Fichar".
                No se arregla dándole un fondo opaco, porque tendría que
                acertar con el tinte de la fila en cada estado y en los dos
                temas. Se arregla quitando de debajo lo que sobra: al pasar el
                ratón, la cuenta de OF deja sitio al botón.
                Y con el reloj MÍO en marcha se esconde siempre, porque ahí el
                botón de pausar está visible sin necesidad de pasar por encima. */}
            {/* La fecha PLANIFICADA, que es por la que van ordenadas las
                filas del panel (ver `agruparPorFase`): sin ella, el orden no
                se explica solo. En rojo cuando ya pasó. */}
            <span className="flex shrink-0 items-center justify-end gap-2 text-[10px]">
            <ChipComprometida pedido={pedido} soloFecha className="hidden shrink-0 tabular-nums @max-[26rem]:inline" />
            {pedido.fechaPlanificacion && (
              <span
                className={`w-[2.6rem] shrink-0 text-right tabular-nums ${
                  // En un pedido PARADO la fecha vencida no se marca: el
                  // retraso no es de quien lo lleva, y en rojo pedía una
                  // reacción que nadie de OT puede tener.
                  pedido.fechaPlanificacion < hoyISO() && !fichandoYo.length && !detenidoDelTodo
                    ? "font-semibold text-error"
                    : "text-text-muted"
                }`}
              >
                {fmtDiaMes(pedido.fechaPlanificacion)}
              </span>
            )}
            <span className="w-[4.75rem] shrink-0 text-right text-text-muted @max-[26rem]:w-auto">
              {/* Redondeado a minutos: `fmtMin` sabe enseñar segundos y aquí
                  salía "14m 7s" al lado de "36m" y "42m". En una lista que se
                  recorre con la vista, los segundos son ruido; el detalle fino
                  está en «Tareas y tiempos». */}
              {ofs.length} OF
              {minutos > 0 && (
                <span className="@max-[26rem]:hidden">{` · ${fmtMin(Math.round(minutos))}`}</span>
              )}
            </span>
            </span>
          </>
        )}
      </button>

      {/* LOS BOTONES, en su hueco a la derecha (no superpuestos). Al pasar el
          ratón aparecen los que solo salen entonces y se acorta el cliente;
          la fecha y la cuenta de OF no se tapan nunca. Pausar y «Pasar a
          Producción», siempre a la vista. */}
      {mostrandoFalta ? (
        // Lo tuyo está hecho pero el pedido va entero a Producción: se dice a
        // quién se espera, en el hueco de la descripción.
        <span
          className="min-w-0 flex-1 truncate text-[10px] text-text-muted"
          title={`El pedido se pasa a Producción cuando están aprobadas todas sus OF — falta ${faltanTexto}`}
        >
          falta {faltanResumen}
        </span>
      ) : (
        // `-my-0.5`: el botón mide 22 px y el texto de la fila 18,6; sin esto,
        // al aparecer con el ratón la fila crecía 3 px y el panel entero
        // daba un respingo (Iván, 26/11/2026). Así sobresale sin empujar.
        <span className="-my-0.5 flex shrink-0 items-center gap-1 empty:hidden">
          {soloConsulta ? (
            // Trabajo de otro: COGER (pregunta antes, lo lleva el Board). Sin
            // `onCoger` —la consulta sin login— un candado con el motivo.
            onCoger && !soloLectura ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCoger(facet);
                }}
                title={`Pasa este pedido a tu panel (ahora está ${motivoBloqueo(facet)})`}
                className={`${BOTON_FILA} ${AL_PASAR} ${BOTON_NEUTRO}`}
              >
                Coger
              </button>
            ) : (
              <span
                className={`${AL_PASAR} text-text-muted`}
                title={`Trabajo de otra persona: ${motivoBloqueo(facet)}`}
                aria-label={`Trabajo de otra persona: ${motivoBloqueo(facet)}`}
              >
                <IconoCandado />
              </span>
            )
          ) : soloLectura ? null : (
            <>
              {fichandoYo.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onDesficharVarias(fichandoYo.map((o) => o.id))}
                  title={
                    fichandoYo.length === 1
                      ? "Para el reloj y deja el pedido como está: sigue siendo tuyo y en curso"
                      : `Para el reloj en las ${fichandoYo.length} OF que estás fichando de este pedido. Siguen como están: no se cierra nada.`
                  }
                  className={`${BOTON_FILA} inline-flex ${
                    fichandoYo.some((o) => o.fichandoRol === "revisar") ? ROL.revisar.solido : ROL.plantear.solido
                  }`}
                >
                  Pausar{fichandoYo.length > 1 && ` ${fichandoYo.length}`}
                </button>
              ) : (
                fichables.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onFichar(fichables.map((o) => o.id), "plantear")}
                    title={
                      minutosFichables > 0
                        ? "Vuelve a poner el reloj en marcha en este pedido"
                        : fichables.length === 1
                          ? "Empieza el planteo y pone el reloj en marcha"
                          : `Empieza el planteo de las ${fichables.length} OF y pone el reloj en marcha`
                    }
                    className={`${BOTON_FILA} ${AL_PASAR} ${ROL.plantear.solido}`}
                  >
                    {/* Reanudar no es empezar, y las mismas palabras en todas partes. */}
                    {minutosFichables > 0 ? "Reanudar" : "Fichar"}
                    {fichables.length > 1 && ` ${fichables.length}`}
                  </button>
                )
              )}

              {/* PASAR A REVISIÓN, morado con borde como en la ficha. Con el
                  reloj en marcha también: pausa y pide revisor. */}
              {puedePasarRevision && (
                <button
                  type="button"
                  onClick={() => {
                    if (pidiendoRevisor) {
                      setPidiendoRevisor(null);
                      return;
                    }
                    const enMiReloj = fichandoYo.filter((o) => paraRevisar.some((r) => r.id === o.id));
                    if (enMiReloj.length > 0) onDesficharVarias(enMiReloj.map((o) => o.id));
                    setPidiendoRevisor(paraRevisar);
                  }}
                  aria-expanded={!!pidiendoRevisor}
                  title={
                    paraRevisar.length === 1
                      ? "Da por terminado el planteo y lo manda a revisar"
                      : `Da por terminado el planteo de las ${paraRevisar.length} OF y las manda a revisar, todas al mismo revisor`
                  }
                  className={`${BOTON_FILA} ${pidiendoRevisor ? `inline-flex ${ROL.revisar.solido}` : `${AL_PASAR} ${BOTON_PASAR_REVISION}`}`}
                >
                  Pasar a revisión
                </button>
              )}

              {/* Pasar a Producción: el final del camino, siempre a la vista. */}
              {fase === "listoParaPasar" && listoParaPasar && (
                <button
                  type="button"
                  onClick={() => completarPedido(pedido.id)}
                  title="Pasa el pedido a Producción"
                  className={`${BOTON_FILA} inline-flex ${BOTON_CIERRE}`}
                >
                  Pasar a Producción
                </button>
              )}

              {/* Esperando revisión: QUIÉN la tiene, en vez del candado con
                  «Lo tiene el revisor». */}
              {fase === "esperandoRevision" && revisor ? (
                <span
                  title={`Lo revisa ${revisor.nombre}: lo que se ficha ahora es la revisión, y le toca a él`}
                  className="grid size-[18px] shrink-0 place-items-center rounded-full text-[8px] font-bold"
                  style={{ background: revisor.color, color: tintaSobre(revisor.color) }}
                >
                  {revisor.iniciales}
                </span>
              ) : (
                // POR QUÉ NO HAY BOTÓN, al pasar el ratón. En estrecho solo el
                // candado; el motivo entero va en el `title`.
                sinBotonDeFichar &&
                motivoSinFichar &&
                !puedePasarRevision && (
                  <span
                    className={`${AL_PASAR} items-center gap-1 px-1 text-[11px] font-medium text-text-muted`}
                    title={motivoSinFichar.largo}
                  >
                    <IconoCandado />
                    <span className="@max-[26rem]:hidden">{motivoSinFichar.corto}</span>
                  </span>
                )
              )}
            </>
          )}
        </span>
      )}

      {/* Los compañeros, debajo de la fila (`basis-full`), como en la ficha:
          pulsar un nombre manda. */}
      {pidiendoRevisor && onPasarRevision && (
        <div className="basis-full" onClick={(e) => e.stopPropagation()}>
          <PedirRevisor
            operarios={operarios ?? []}
            excluirIds={pidiendoRevisor.map((o) => o.autorId)}
            onConfirmar={async (rev) => {
              if (await onPasarRevision(pidiendoRevisor.map((o) => o.id), rev)) setPidiendoRevisor(null);
            }}
            onCancelar={() => setPidiendoRevisor(null)}
          />
        </div>
      )}
    </div>
  );
}


/** El revisor de las OF que esperan revisión (el primero que haya). */
function deOTRevisor(ofs: OF[]): string | null {
  return ofs.find((o) => (o.estado === "por_revisar" || o.estado === "en_revision") && o.revisorId)?.revisorId ?? null;
}
