"use client";

import type { Operario, Rol } from "@/lib/types";
import type { Facet } from "./PedidoCard";
import {
  FASES,
  autoresQueFaltan,
  avisaDeOFNueva,
  motivoBloqueo,
  ofDeTaller,
  pedidoListoParaPasar,
  type Fase,
} from "@/lib/fases-tablero";
import { ofsFichablesDe } from "@/lib/accion-pedido";
import { motivoNoFichable } from "@/lib/fichaje";
import { fmtMin } from "@/lib/estado";
import { IconoCandado, IconoPausa } from "./Iconos";
import { fmtDiaMes } from "@/lib/fechas";
import { FamiliaTag } from "./FamiliaTag";
import { hoyISO } from "@/lib/types";

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
/** El ámbar de "parado por Producción" (el mismo del aviso de la zona
 *  personal). Va como hex porque lo pide un `style` en línea. */
const AMBAR_PARADO = "#d97706";

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
}: {
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
  const { pedido, ofs } = facet;
  const urgente = pedido.prioridad === 3;
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
  const color = urgente ? "#dc2626" : FASES.find((f) => f.id === fase)?.color;
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
  const motivoDetenido = "Detenido por Producción: no admite fichaje hasta que lo liberen";

  // El motor de fichaje solo admite un rol corriendo a la vez (ver el
  // comentario de ofsFichablesDe): esta fila solo ficha planteo. En
  // "esperandoRevision" el pedido es MI trabajo en manos de otro — lo que se
  // ficha ahí es la revisión, que le toca al revisor, no a mí — así que no
  // se ofrece fichar en absoluto en esa fase.
  const fichables = fase === "esperandoRevision" ? [] : ofsFichablesDe(facet, "plantear");

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
  const avisos = (
    <>
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
      // Ámbar y NO rojo: el rojo es de "urgente" en toda la app, y un pedido
      // parado no es urgente —es justo lo contrario—. Es el mismo ámbar del
      // aviso "N parados por Producción" de la zona personal.
      style={{ borderLeftColor: detenidoDelTodo ? AMBAR_PARADO : color }}
      title={detenidoDelTodo ? motivoDetenido : undefined}
      className={`group relative flex items-center gap-2 rounded-lg border border-l-[3px] border-[var(--glass-border)] px-2 py-1.5 text-[11px] transition-colors hover:border-brand-400 ${
        fichandoAlguien ? "bg-emerald-500/10" : detenidoDelTodo ? "bg-surface-2/30" : "bg-surface-2/60"
      }`}
    >
      <button
        onClick={() => onOpen(facet)}
        title={`${pedido.codigo} · ${pedido.cliente} · ${descripcion}${
          detenidoDelTodo ? `

${motivoDetenido}` : ""
        }`}
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
        // Pidiendo revisor o avisando de quién falta, la fila se queda en el
        // código y el resto del ancho es para ese aviso: ahí no hay columnas
        // que alinear.
        className={`min-w-0 cursor-pointer items-center gap-2 overflow-hidden text-left ${
          mostrandoFalta
            ? "flex shrink-0"
            : "grid flex-1 grid-cols-[5.75rem_6.5rem_minmax(0,1fr)_auto] @max-[18rem]:grid-cols-[5.75rem_6.5rem_minmax(0,1fr)]"
        }`}
      >
        {/* Columna 1: el punto de "lo están fichando" y el código. */}
        <span className="flex min-w-0 items-center gap-1.5">
          {fichandoAlguien && (
            <span
              title={fichandoYo.length > 0 ? "Lo estás fichando tú" : "Alguien lo está fichando ahora"}
              className="size-1.5 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30"
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
        {/* En una columna estrecha (el panel de un compañero, con cuatro fases
            repartiéndose el ancho) el cliente no llega a decir nada: se queda
            en «TARRIO ALV…» y encima empuja la cuenta de OF fuera. Por debajo
            de 15rem desaparece y la fila se queda con el código, que es lo que
            identifica el pedido; el nombre completo sigue en el `title`.

            Es `@max-`, no `@min-`: donde no hay contenedor que medir —la zona
            personal, el desplegable— la consulta no casa y el cliente se ve,
            que es lo de siempre. */}
        {!mostrandoFalta && (
          <>
            {/* Columna 2: la familia, en su propia columna y DELANTE del cliente:
                detrás quedaba a una distancia distinta en cada fila, según lo
                largo que fuera el nombre. Con varias, la primera y "+N": son
                pocas y lo que hace falta aquí es saber de qué va el pedido. */}
            <span className="flex min-w-0 items-center gap-1">
              {familias[0] && <FamiliaTag familia={familias[0]} />}
              {familias.length > 1 && (
                <span className="shrink-0 text-[10px] text-text-muted" title={familias.join(" · ")}>
                  +{familias.length - 1}
                </span>
              )}
            </span>
            {/* Columna 3: los avisos del pedido y el cliente. */}
            <span className="flex min-w-0 items-center gap-2">
              {avisos}
              <span className="min-w-0 flex-1 truncate text-text-muted @max-[22rem]:hidden">
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
            <span
              className={`flex shrink-0 items-center justify-end gap-2 text-[10px] @max-[18rem]:hidden ${
                fichandoYo.length > 0 ? "invisible" : "group-hover:invisible"
              }`}
            >
            {pedido.fechaPlanificacion && (
              <span
                className={`w-[2.6rem] shrink-0 text-right tabular-nums ${
                  // En un pedido PARADO la fecha vencida no se marca: el
                  // retraso no es de quien lo lleva, y en rojo pedía una
                  // reacción que nadie de OT puede tener.
                  pedido.fechaPlanificacion < hoyISO() && !fichandoYo.length && !detenidoDelTodo
                    ? "font-semibold text-red-700 dark:text-red-400"
                    : "text-text-muted"
                }`}
                title={`Planificada para el ${fmtDiaMes(pedido.fechaPlanificacion)}`}
              >
                {fmtDiaMes(pedido.fechaPlanificacion)}
              </span>
            )}
            <span className="w-[4.75rem] shrink-0 text-right text-text-muted">
              {/* Redondeado a minutos: `fmtMin` sabe enseñar segundos y aquí
                  salía "14m 7s" al lado de "36m" y "42m". En una lista que se
                  recorre con la vista, los segundos son ruido; el detalle fino
                  está en «Tareas y tiempos». */}
              {ofs.length} OF{minutos > 0 && ` · ${fmtMin(Math.round(minutos))}`}
            </span>
            </span>
          </>
        )}
      </button>

      {/* Trabajo de otro: ni se ficha ni se cambia de estado, el panel es
          solo consulta. El candado dice por qué no está disponible, para
          que no haga falta adivinarlo. */}
      {soloConsulta ? (
        // En columna estrecha se queda el candado y se va su explicación: el
        // texto («no disponible», «empezado») no cabía y acababa montado sobre
        // la cuenta de OF. El motivo sigue al pasar el ratón.
        // COGER, y no un candado. El candado decía "esto no se puede tocar" y no
        // era verdad: el autor se cambia desde la ficha, esté el trabajo
        // empezado o no. Lo que hacía falta era el gesto directo, que pregunta
        // antes (lo lleva el Board): quitarle trabajo a alguien no se hace sin
        // querer. Sin `onCoger` —la consulta sin login— se queda el candado.
        // SUPERPUESTO al final de la fila, como "Fichar" y "Pausar" (misma
        // franja `bg-inherit`): así la cuenta de OF queda a la derecha del todo
        // en reposo, que es cuando se lee, y el botón solo aparece al pasar el
        // ratón — sobre el hueco que deja la fecha, que se esconde sola.
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center rounded-r-lg bg-inherit pl-4 [&>*]:pointer-events-auto">
          {onCoger ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCoger(facet);
              }}
              title={`Pasa este pedido a tu panel (ahora está ${motivoBloqueo(facet)})`}
              className="chip-3d shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold text-text opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            >
              Coger
            </button>
          ) : (
            <span
              className="shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100"
              title={`Trabajo de otra persona: ${motivoBloqueo(facet)}`}
              aria-label={`Trabajo de otra persona: ${motivoBloqueo(facet)}`}
            >
              <IconoCandado />
            </span>
          )}
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
        // `pointer-events-none` en la CAJA y `pointer-events-auto` en lo que
        // lleve dentro: esta franja tapa el final de la fila aunque esté vacía,
        // y ahí el clic no llegaba al botón que abre el pedido. Con los botones
        // dentro no se nota —son ellos los que reciben—, pero en una fila sin
        // acción disponible quedaba una tira muerta al borde derecho.
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1 rounded-r-lg bg-inherit pl-4 [&>*]:pointer-events-auto">
        {/* Pausa: siempre visible mientras se ficha. */}
        {/* Fichar es el único camino para empezar: arranca el reloj y saca la
            OF de "sin empezar" (ver `arrancarFichaje` en Board).
            SIEMPRE visible solo PAUSAR, y solo mientras corre el reloj: es lo
            que más se pulsa y esconderlo hasta pasar el ratón obligaba a
            buscarlo. Los demás se revelan al pasar por encima, como el resto de
            acciones de la fila: en reposo la fila es para leerla. */}
        {fichandoYo.length > 0 ? (
          <button
            onClick={() => onDesficharVarias(fichandoYo.map((o) => o.id))}
            title={
              fichandoYo.length === 1
                ? "Para el reloj y deja el pedido como está: sigue siendo tuyo y en curso"
                : `Para el reloj en las ${fichandoYo.length} OF que estás fichando de este pedido. Siguen como están: no se cierra nada.`
            }
            className="rounded-md bg-emerald-700 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-800"
          >
            ⏸ Pausar{fichandoYo.length > 1 && ` ${fichandoYo.length}`}
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
              className="rounded-md bg-emerald-700 px-2 py-0.5 text-[11px] font-semibold text-white opacity-0 transition-opacity hover:bg-emerald-800 focus-visible:opacity-100 group-hover:opacity-100"
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
            className="rounded-md bg-cyan-700 px-2 py-0.5 text-[11px] font-semibold text-white opacity-0 transition-opacity hover:bg-cyan-800 focus-visible:opacity-100 group-hover:opacity-100"
          >
            Pasar
          </button>
        )}

        {/* POR QUÉ NO HAY BOTÓN. Cuando no se puede fichar, la fila no ofrecía
            nada al pasar el ratón: ni botón ni explicación. Y las reglas son
            correctas —una OF detenida por Producción no admite fichaje, y en
            "esperando revisión" lo que se ficha es la revisión, que le toca al
            revisor—, pero desde la fila eso no se ve: parece que la web se ha
            roto. Pasó de verdad, y la respuesta fue "que no salen".
            Se revela al pasar el ratón, en el mismo sitio donde habría estado
            el botón: es justo cuando se hace la pregunta. */}
        {sinBotonDeFichar && motivoSinFichar && (
          <span
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-text-muted opacity-0 transition-opacity group-hover:opacity-100"
            title={motivoSinFichar.largo}
          >
            {/* EN ESTRECHO SOLO EL CANDADO. Esta franja se SUPERPONE al final
                de la fila, así que lo que lleve dentro tiene que ser corto: con
                el motivo entero, en pantallas pequeñas se metía encima del
                cliente. Es la misma regla que ya seguía el candado del panel de
                un compañero, aquí abajo — y el mismo corte de ancho.
                El motivo no se pierde: va entero en el `title`, y esto es
                solo PC. */}
            <IconoCandado /><span className="@max-[26rem]:hidden">{motivoSinFichar.corto}</span>
          </span>
        )}
        </span>
      )}
    </div>
  );
}
