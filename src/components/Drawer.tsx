"use client";

import { useEffect, useRef, useState } from "react";
import type { Operario, OF, Pedido, Rol } from "@/lib/types";
import { hoyISO, piezasTotal } from "@/lib/types";
import { ESTADO, PRIORIDAD, ROL } from "@/lib/estado";
import { FamiliaTag } from "./FamiliaTag";
import { LiveBadge, LiveDot } from "./LiveBadge";
import { PedidoScan } from "./PedidoScan";
import { DevolverInline } from "./DevolverInline";
import { GuiaRevision } from "./GuiaRevision";
import { causasDeLoQueFalla, guiaDeFamilias, type EstadoPunto } from "@/lib/guia-revision";
import { leerCausas, type CausaDevolucion } from "@/lib/causas-cliente";
import { AnularInline } from "./AnularInline";
import { NotaDevolucion } from "./NotaDevolucion";
import { FasesSinFinalizar } from "./FasesSinFinalizar";
import { DocumentosPedido } from "./DocumentosPedido";
import { PedirRevisor } from "./PedirRevisor";
import { useConfirmacion } from "./ConfirmDialog";
import { Select, OpDot, type SelectOption } from "./Select";
import {
  ACCIONES,
  A_LA_VISTA,
  accionesDisponibles,
  aprobadaSinRevision,
  etiquetaAccion,
  type AccionOF,
} from "@/lib/acciones";
import { esFichable, motivoNoFichable, rolFichajeDe } from "@/lib/fichaje";
import { leerAnulacion, textoAnulacion } from "@/lib/anulacion";
import { puedeTraspasarAutor } from "@/lib/traspaso";
import { ofDeTaller, pedidoListoParaPasar } from "@/lib/fases-tablero";
import { MaterialChip } from "./MaterialChip";
import { TiempoOF } from "./TiempoOF";
import { LineaTiempoPedido } from "./LineaTiempoPedido";
import { NotasPedido } from "./NotasPedido";
import { AvisoParteNuevo } from "./AvisoParteNuevo";
import { MenuAccionesOF } from "./MenuAccionesOF";
import { useFocoModal } from "@/lib/useFocoModal";
import { useScrollBloqueado } from "@/lib/useScrollBloqueado";

function fmt(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y.slice(2)}`;
}

// ─── Qué OF del pedido son trabajo de OT y cuáles no ─────────────────────────
// El detalle es la ficha del pedido ENTERO, así que tiene todas sus OF; pero
// enseñarlas todas de golpe engaña. En AR.26.03626, de cinco OF solo el toldo
// era nuestro: tres estaban detenidas por Producción y la capota entra por una
// tarea de taller. Se leía como si tocara plantear cinco.
//
// Así que se abre con lo tuyo y lo demás queda en cajones, uno por MOTIVO de no
// estar: cada botón dice qué esconde y cuántas son, y se abre si hace falta
// mirarlo. El motivo importa —"detenida" es tuya pero bloqueada, "para taller"
// no es tuya, "anulada" la quitasteis vosotros—, y por eso no valía un único
// "ver el resto".

type GrupoOculto = "detenida" | "taller" | "anulada";

/** Por qué NO se enseña de entrada, o null si es trabajo de OT.
 *
 *  El orden de los `if` es la precedencia, y va de lo más definitivo a lo más
 *  reversible: una OF anulada Y detenida se cuenta como anulada, porque lo que
 *  explica que no la vayas a plantear es que la anulasteis. Cada OF cae en un
 *  cajón y solo en uno: si no, los recuentos de los botones sumarían más OF de
 *  las que tiene el pedido. */
function grupoOculto(of: OF): GrupoOculto | null {
  if (of.estado === "anulada") return "anulada";
  // `ofDeTaller` y no `ofOcultaDeOT`: aquí no vale la excepción del rescate,
  // porque el autor de una OF de taller puede venir deducido de RPS sin que
  // nadie de OT la haya tocado (ver el comentario en fases-tablero.ts). Lo que
  // se pidió es ver SOLO las de OT, y eso es por dónde entra la tarea.
  if (ofDeTaller(of)) return "taller";
  if (of.detenida) return "detenida";
  return null;
}

const GRUPOS: readonly {
  id: GrupoOculto;
  /** Con nº delante: "3 detenidas". Sin artículos, que van en el botón. */
  nombre: (n: number) => string;
  ayuda: string;
}[] = [
  {
    id: "detenida",
    nombre: (n) => (n === 1 ? "detenida" : "detenidas"),
    ayuda: "Detenidas por Producción: no admiten fichaje hasta que las liberen.",
  },
  {
    id: "taller",
    nombre: () => "para taller",
    ayuda:
      "Entran por una tarea de taller: no son trabajo de Oficina Técnica. Asignarles autor las rescata.",
  },
  {
    id: "anulada",
    nombre: (n) => (n === 1 ? "anulada" : "anuladas"),
    ayuda: "Anuladas en Oficina Técnica: no se plantean.",
  },
];

/** "0230697 — La hace el taller". Para leer de un vistazo por qué se anuló cada
 *  una sin tener que abrir el cajón. Las anuladas de antes de que esto existiera
 *  no tienen motivo, y lo dicen. */
function motivoDeAnulada(of: OF): string {
  const a = leerAnulacion(of.observacion);
  return `${of.codigo} — ${a ? textoAnulacion(a) : "sin motivo apuntado"}`;
}

function opcionesOperario(
  operarios: Operario[],
  miId: string | null,
  excluir?: string | null,
): SelectOption[] {
  return operarios
    .filter((o) => o.id !== excluir)
    .map((o) => ({
      value: o.id,
      label: o.id === miId ? `${o.nombre} (tú)` : o.nombre,
      icon: <OpDot color={o.color} iniciales={o.iniciales} />,
    }));
}

export function Drawer({
  pedido,
  operarios,
  miId,
  dobleFichaje = false,
  onClose,
  onAssignPedido,
  onCompletar,
  onSetRevisor,
  onTraspasarAutor,
  onAccion,
  onFichar,
  onDesfichar,
  onDesficharVarias,
  ofIdsFichandoYo,
}: {
  pedido: Pedido | null;
  operarios: Operario[];
  miId: string | null;
  /** OT ficha también en la herramienta vieja: las dos cuentas de tiempo
   *  hablan del mismo trabajo y hay que decirlo (ver aplicarTiemposFichaje). */
  dobleFichaje?: boolean;
  onClose: () => void;
  onAssignPedido: (autorId: string | null) => void;
  onCompletar: (pedidoId: string) => void;
  onSetRevisor: (ofId: string, revisorId: string | null) => void;
  onTraspasarAutor: (ofId: string, autorId: string) => void;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  onDesficharVarias: (ofIds: string[]) => void;
  /** Las OF que estoy fichando YO ahora mismo (mi intervalo abierto).
   *
   *  NO vale `of.fichandoRol` para esto: ese dice que la ficha ALGUIEN —el
   *  revisor, o cualquiera desde el mini-olanet— y con él salía "Pausar" sobre
   *  el reloj de otro, que este botón no puede parar. Mismo criterio que usa
   *  PedidoLinea. */
  ofIdsFichandoYo?: ReadonlySet<string>;
}) {
  useEffect(() => {
    if (!pedido) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pedido, onClose]);

  // Qué grupos de OF ajenas al trabajo de OT se han desplegado a mano.
  const [mostrar, setMostrar] = useState<ReadonlySet<GrupoOculto>>(new Set());
  // Eligiendo el revisor del pedido entero (ver `paraRevisar` más abajo).
  const [pidiendoRevisorPedido, setPidiendoRevisorPedido] = useState(false);
  // Confirmación de las acciones de PEDIDO ENTERO ("Aprobar las N"); las de
  // cada OF tienen la suya dentro de `AccionesOF`.
  //
  // Las OF se congelan al PULSAR, no al confirmar. Es lo correcto y no un
  // atajo: entre que sale el cuadro y se dice que sí, el tablero se refresca
  // solo cada 30 s, y sin esto se aprobaría un conjunto distinto del que decía
  // el botón que acabas de leer. Y de paso, el hook queda aquí arriba, que es
  // donde tienen que estar todos —debajo hay un `return` temprano—.
  const idsAConfirmar = useRef<string[]>([]);
  const confirmacionPedido = useConfirmacion((a) => onAccion(idsAConfirmar.current, a.id));
  const [ultimoPedido, setUltimoPedido] = useState<string | null>(null);

  // La guía de revisión, la misma que en el panel de Revisiones. Las causas se
  // piden una vez por ficha: de ellas salen los puntos que hay que repasar (su
  // cara en positivo) y las píldoras del cuadro de devolver.
  //
  // Aquí arriba con el resto de hooks y no junto a lo que las usa: abajo hay un
  // `if (!pedido) return null` de por medio, y un hook detrás de un return se
  // salta en unos renders y en otros no.
  const [causasRevision, setCausasRevision] = useState<CausaDevolucion[]>([]);
  useEffect(() => {
    let vivo = true;
    leerCausas().then((cs) => vivo && setCausasRevision(cs));
    return () => {
      vivo = false;
    };
  }, []);
  const [marcasGuia, setMarcasGuia] = useState<Record<number, EstadoPunto>>({});
  const [guiaAbierta, setGuiaAbierta] = useState(true);
  // Es un modal de verdad (telón opaco, el tablero no se puede tocar): el foco
  // tiene que entrar aquí y no seguir paseando por lo que hay detrás.
  const modalRef = useFocoModal<HTMLDivElement>(pedido !== null);
  // El Drawer tapa la pantalla entera pero dejaba el `body` suelto: la rueda
  // sobre él movía la Lista de detrás, y al cerrar aparecías en otro sitio sin
  // haber tocado nada. Mismo bloqueo que usan los paneles del tablero.
  useScrollBloqueado(pedido !== null);

  // Cambiar de pedido cierra lo que se hubiera desplegado: haber mirado las
  // detenidas de uno no es motivo para abrir el siguiente ya destripado.
  if (pedido && pedido.id !== ultimoPedido) {
    setUltimoPedido(pedido.id);
    if (mostrar.size > 0) setMostrar(new Set());
    if (pidiendoRevisorPedido) setPidiendoRevisorPedido(false);
  }

  if (!pedido) return null;
  const opById = (id: string | null) => operarios.find((o) => o.id === id) ?? null;
  const esPdf = pedido.scanUrl?.toLowerCase().endsWith(".pdf") ?? false;
  // La regla de "¿están todas las OF aprobadas?" vive en pedidoListoParaPasar
  // (fases-tablero.ts): es la definición única, ver su comentario de cabecera.
  // Aquí se mantiene una condición extra que el helper no cubre: con el filtro
  // de situación en "todos", la Lista puede reabrir un pedido ya completado, y
  // sus OF siguen en "aprobada" porque pasarlo solo cambia la situación del
  // pedido. Sin este check, el botón "Pasar a Producción" reaparecería para un
  // pedido que ya pasó.
  const listoParaCompletar = pedido.situacion !== "completado" && pedidoListoParaPasar(pedido);
  // Lo que de verdad hay que plantear, y lo que no, cada cosa en su cajón.
  const todasLasOF = pedido.ofs;
  const ofsDeOT = todasLasOF.filter((o) => grupoOculto(o) === null);
  const ocultas = GRUPOS.map((g) => ({
    grupo: g,
    ofs: todasLasOF.filter((o) => grupoOculto(o) === g.id),
  })).filter((c) => c.ofs.length > 0);
  // Primero lo tuyo; debajo, en su orden, solo los cajones abiertos.
  const ofsVisibles = [
    ...ofsDeOT,
    ...ocultas.filter((c) => mostrar.has(c.grupo.id)).flatMap((c) => c.ofs),
  ];
  // Lo que se puede fichar de una tacada: solo lo que es trabajo de OT y admite
  // reloj. Las detenidas y las de taller no entran ni aunque estén desplegadas.
  //
  // Y solo PLANTEO: un fichaje corriendo tiene un único rol (ver el comentario
  // de `ofsFichablesDe`), así que meter aquí una OF que está en revisión le
  // ficharía la revisión como si fuera planteo, a nombre de quien pulse.
  const fichablesDeOT = ofsDeOT.filter((o) => esFichable(o) && rolFichajeDe(o) === "plantear");
  // Las de ESTE pedido que corren en MI reloj. `esFichable` no mira si la OF ya
  // se está fichando, así que sin esto el botón de arriba seguía diciendo
  // "Fichar las N" con el reloj ya en marcha: no cambiaba nunca a "Pausar".
  const fichandoYo = ofsDeOT.filter((o) => ofIdsFichandoYo?.has(o.id));

  // ── Las OF del pedido que YO puedo mandar a revisar ahora mismo ──────────
  // El planteo se termina pedido a pedido, no OF a OF: quien plantea un parte
  // de cuatro OF las acaba a la vez y las manda juntas. Había que abrir cada
  // una, pulsar su "Pasar a revisión" y elegir revisor CUATRO veces, siempre el
  // mismo. La máquina de estados sigue siendo por OF —una puede quedarse atrás
  // y se manda sola desde su fila—; lo que cambia es que hay un camino para el
  // caso normal.
  const paraRevisar = ofsDeOT.filter((o) =>
    accionesDisponibles(o, miId).some((a) => a.id === "terminar_planteo"),
  );
  // Un solo revisor para todas: solo se puede si el autor es el MISMO en todas,
  // porque el revisor no puede ser el autor y con dos autores no hay un único
  // "todos menos tú" que valga para el grupo. Con autores distintos cada OF se
  // manda desde su fila, que es donde se ve de quién es cada una.
  const autoresParaRevisar = [...new Set(paraRevisar.map((o) => o.autorId))];

  // ── Y lo mismo por el otro lado: lo que YO, de revisor, puedo hacer de una
  // tacada ────────────────────────────────────────────────────────────────
  // Un parte de ocho OF llega a revisión entero, y se repasa entero: había que
  // abrir las ocho y pulsar en cada una. La vista de Revisión ya lo hacía por
  // grupos; el Drawer, que es donde se mira el pedido, no.
  //
  // Mismo criterio que arriba: la máquina de estados sigue siendo por OF —una
  // puede quedarse atrás y se resuelve desde su fila—, esto solo abre camino al
  // caso normal.
  //
  // Empezar la revisión va por el RELOJ y no por la acción, igual que "Fichar
  // las N" del planteo: fichar una OF "por revisar" siendo su revisor ya la
  // pasa a `en_revision` (ver el ligado en Board.ficharOFs). Un botón, no dos.
  const paraEmpezarRevision = ofsDeOT.filter(
    (o) => esFichable(o) && rolFichajeDe(o) === "revisar" && o.revisorId === miId,
  );
  const paraAprobar = ofsDeOT.filter((o) =>
    accionesDisponibles(o, miId).some((a) => a.id === "aprobar"),
  );
  const paraDevolver = ofsDeOT.filter((o) =>
    accionesDisponibles(o, miId).some((a) => a.id === "devolver"),
  );
  // Aprobar de golpe pide confirmación, como la de una sola: es el final del
  // camino y multiplicado por ocho, más.
  const defAprobar = ACCIONES.find((a) => a.id === "aprobar")!;

  const familiasDelPedido = [
    ...new Set(ofsDeOT.map((o) => o.familia).filter(Boolean) as string[]),
  ];
  const puntosGuia = guiaDeFamilias(causasRevision, familiasDelPedido);
  const fallosGuia = causasDeLoQueFalla(puntosGuia, marcasGuia);

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Pedido ${pedido.codigo}`}
      className="fixed inset-0 z-50"
    >
      <div className="overlay-in absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

      {/* PDF del pedido en grande, ocupando todo el hueco a la izquierda */}
      <div
        className="overlay-in absolute inset-y-0 left-0 right-[32rem] flex flex-col"
        onClick={onClose}
      >
        <div className="min-h-0 flex-1">
          {esPdf ? (
            <iframe
              src={`${pedido.scanUrl}#page=1&view=Fit`}
              title={`Pedido ${pedido.codigo}`}
              onClick={(e) => e.stopPropagation()}
              className="h-full w-full border-none bg-white"
            />
          ) : (
            <div
              onClick={(e) => e.stopPropagation()}
              className="h-full w-full bg-[#525659] p-4"
            >
              <PedidoScan pedido={pedido} />
            </div>
          )}
        </div>
      </div>

      <aside className="glass-panel-strong drawer-in absolute right-0 top-0 flex h-full w-full max-w-lg flex-col rounded-l-2xl">
        {/* cabecera */}
        <header
          className="flex items-start gap-3 p-4"
          style={{ boxShadow: "inset 0 -1px 0 0 var(--glass-border)" }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-lg font-bold text-text">{pedido.codigo}</h2>
              <span
                className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white"
                style={{ background: PRIORIDAD[pedido.prioridad].color }}
                title={`Prioridad ${PRIORIDAD[pedido.prioridad].label}`}
              >
                P{pedido.prioridad} {PRIORIDAD[pedido.prioridad].label}
              </span>
            </div>
            <p className="truncate text-sm text-text-muted">
              {pedido.cliente}
              {pedido.negocio && (
                <>
                  {" · "}
                  <span className="font-semibold text-text">{pedido.negocio}</span>
                </>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            data-foco-inicial
            className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>

        <div className="scroll-thin flex-1 overflow-y-auto p-4">
          {/* meta: sin fechas — las cuatro del pedido están en la línea de
              tiempo de abajo, a escala y con hoy encima. Repetirlas aquí
              sueltas ("Solicitud 04/09, Planificación 12/08") era el dato peor
              contado dos veces. */}
          <div className="mb-4">
            <dl className="grid grid-cols-2 content-start gap-x-4 gap-y-2.5 text-xs">
              <Meta k="Piezas" v={String(piezasTotal(pedido))} />
              {pedido.ciudadEntrega && (
                <Meta k="Entrega en" v={pedido.ciudadEntrega} />
              )}
              <div className="col-span-2">
                <dt className="mb-1 text-text-muted">Familias</dt>
                <dd className="flex flex-wrap gap-1">
                  {[...new Set(pedido.ofs.map((o) => o.familia))].map((f) => (
                    <FamiliaTag key={f} familia={f} />
                  ))}
                </dd>
              </div>
            </dl>
          </div>

          <LineaTiempoPedido pedido={pedido} />

          {/* comentario del pedido de venta (condiciones, avisos del comercial) */}
          {pedido.comentarioVenta && (
            <div className="mb-4 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)] p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                Comentario del pedido
              </p>
              <p className="whitespace-pre-line text-[11px] leading-snug text-text">
                {pedido.comentarioVenta}
              </p>
            </div>
          )}

          {/* Encima del hilo, y lo primero que se ve tras el parte: si han
              vuelto a escanearlo, eso condiciona todo lo que se lea debajo. */}
          {pedido.scanCambiado && (
            <AvisoParteNuevo key={`aviso:${pedido.codigo}`} pedido={pedido.codigo} />
          )}

          {/* Lo que RPS tiene colgado: la rotulación, el planteamiento y las
              fotos. Va ANTES del hilo de notas y después del parte porque es
              del mismo orden de lectura: primero lo que hay que mirar para
              hacer el trabajo, después lo que se ha dicho sobre él.

              Plegado, y se pide solo al desplegarlo: son dos tablas grandes de
              RPS por pedido y la mayoría de las veces la ficha se abre para
              fichar, no para mirar documentos. El `key` con el código, por lo
              mismo que el hilo de notas de abajo. */}
          <DocumentosPedido key={`docs:${pedido.codigo}`} pedido={pedido.codigo} />

          {/* El hilo de notas de OT. Va aquí, entre lo que dijo el comercial y
              lo que se decide, porque es contexto: primero se lee de qué va
              esto y después se actúa.
              Panel, Pendientes y Revisiones abren ESTE mismo Drawer, así que el
              revisor ve el hilo al abrir el pedido sin nada más que hacer.
              El `key` con el código: al saltar de pedido sin cerrar el drawer
              (Ctrl+K abre el buscador aunque esté delante) React desmonta y
              vuelve a montar, así no queda ni un frame con el hilo del anterior.
              NO sustituye a los guards de dentro del componente: esos cubren
              las carreras DENTRO de un mismo pedido. */}
          <NotasPedido
            key={`notas:${pedido.codigo}`}
            pedido={pedido.codigo}
            miId={miId}
            operarios={operarios}
          />

          {/* asignar autor del pedido entero */}
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)] p-3">
            <span className="text-xs font-semibold text-text">Asignar autor (pedido entero)</span>
            <div className="ml-auto">
              <Select
                value={
                  pedido.ofs.every((of) => of.autorId === pedido.ofs[0].autorId)
                    ? pedido.ofs[0].autorId
                    : null
                }
                onChange={(v) => onAssignPedido(v)}
                placeholder="Sin asignar"
                // La opción de vaciar dice lo que HACE, no el estado en que
                // deja las cosas: "Sin asignar" a secas se leía como el rótulo
                // del selector vacío y nadie caía en que ahí estaba la forma de
                // devolver un pedido a la bandeja.
                etiquetaVaciar="Quitar autor · vuelve a Sin asignar"
                alignRight
                options={opcionesOperario(operarios, miId)}
              />
            </div>
          </div>

          {/* Cerrar una fase de OT que se quedó a medias, en el pedido YA PASADO
              a Producción. Es justo el caso para el que se hizo este bloque
              —lo dice su propia cabecera—, y era el único sitio donde no
              estaba: la lista de "Pasados a Producción" del Historial abre
              ESTA ficha, no la del historial, así que quien necesitaba cerrar
              la fase no tenía botón y acababa en la herramienta vieja.

              Solo en los pasados, y no en todos los pedidos: pregunta las
              fases a RPS por cada OF, y hacerlo cada vez que se abre una ficha
              del tablero serían decenas de consultas al día para un caso que
              casi nunca se da. Un pedido que sigue en marcha tampoco tiene
              nada que cerrar todavía.

              Se calla solo cuando no hay nada pendiente, así que en el caso
              normal no se ve. */}
          {pedido.situacion === "completado" && (
            <div className="mb-3">
              <FasesSinFinalizar ofs={ofsDeOT.map((o) => o.codigo)} miId={miId} />
            </div>
          )}

          {/* OFs: el trabajo de OT arriba, lo demás en cajones (ver GRUPOS). */}
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Órdenes de fabricación ({ofsDeOT.length})
              {ofsDeOT.length !== pedido.ofs.length && (
                <span className="ml-1.5 font-normal normal-case tracking-normal">
                  · {pedido.ofs.length - ofsDeOT.length} más en el pedido
                </span>
              )}
            </h3>
            {/* Fichar el pedido entero sin ir OF por OF. Solo con más de una:
                con una sola, este botón y el de su fila harían lo mismo y
                sobraría uno. Cada OF conserva el suyo debajo, que es lo que se
                usa cuando de verdad solo tocas una. */}
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {/* Con el reloj MÍO en marcha aquí, este botón para; si no, ficha.
                  Mismo par que la fila del tablero (PedidoLinea): antes solo
                  sabía fichar, así que tras fichar seguía ofreciendo fichar
                  otra vez lo que ya estaba corriendo. */}
              {fichandoYo.length > 0 ? (
                <button
                  onClick={() => onDesficharVarias(fichandoYo.map((o) => o.id))}
                  title={
                    fichandoYo.length === 1
                      ? "Para el reloj y deja la OF como está: sigue siendo tuya y en curso"
                      : `Para el reloj en las ${fichandoYo.length} OF que estás fichando de este pedido. Siguen como están: no se cierra nada.`
                  }
                  className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  ⏸ Pausar{fichandoYo.length > 1 && ` las ${fichandoYo.length}`}
                </button>
              ) : (
                fichablesDeOT.length > 1 && (
                  <button
                    onClick={() => onFichar(fichablesDeOT.map((o) => o.id), "plantear")}
                    title={`Pone el reloj en marcha en las ${fichablesDeOT.length} OF de planteo de este pedido`}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${ROL.plantear.solido}`}
                  >
                    ⏱ Fichar las {fichablesDeOT.length}
                  </button>
                )
              )}
              {/* Con el reloj corriendo no se manda nada a revisar: primero se
                  para. Mandar a revisión da por terminado el planteo, y hacerlo
                  con el reloj en marcha deja tiempo contando sobre un trabajo
                  que ya dijiste que estaba acabado.
                  Se dice POR QUÉ en vez de esconder el botón a secas: si no,
                  parece que la web se ha roto. */}
              {fichandoYo.length > 0 && paraRevisar.length > 0 && (
                <span className="text-[11px] text-text-muted">
                  Pausa el reloj para poder pasar a revisión
                </span>
              )}
              {/* Empezar la revisión de todas. Como el "Fichar las N" del
                  planteo: es el reloj quien las pasa a "En revisión". */}
              {fichandoYo.length === 0 && paraEmpezarRevision.length > 1 && (
                <button
                  onClick={() => onFichar(paraEmpezarRevision.map((o) => o.id), "revisar")}
                  title={`Pasa a "En revisión" las ${paraEmpezarRevision.length} OF que te tocan de este pedido y pone tu reloj en marcha`}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${ROL.revisar.solido}`}
                >
                  ⏱ Revisar las {paraEmpezarRevision.length}
                </button>
              )}
              {/* Y darlas por buenas todas juntas, que es como se acaba un
                  parte que estaba bien. */}
              {paraAprobar.length > 1 && (
                <button
                  onClick={() => {
                    idsAConfirmar.current = paraAprobar.map((o) => o.id);
                    confirmacionPedido.pedirConfirmacion(defAprobar);
                  }}
                  title={`Aprueba las ${paraAprobar.length} OF de este pedido que estás revisando`}
                  className="rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-700"
                >
                  Aprobar las {paraAprobar.length}
                </button>
              )}
              {/* Mandar el pedido entero a revisión, con UN revisor. Solo con
                  más de una: con una sola, este botón y el de su fila harían lo
                  mismo. */}
              {fichandoYo.length === 0 && paraRevisar.length > 1 && autoresParaRevisar.length === 1 && !pidiendoRevisorPedido && (
                <button
                  onClick={() => setPidiendoRevisorPedido(true)}
                  title={`Da por terminado el planteo de las ${paraRevisar.length} OF y las manda a revisar, todas al mismo revisor`}
                  className="rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-700"
                >
                  Pasar las {paraRevisar.length} a revisión
                </button>
              )}
            </span>
          </div>

          {/* LA GUÍA TAMBIÉN AQUÍ. Estaba solo en el panel de Revisiones, y
              revisar desde la ficha —que es donde se está cuando ya tienes el
              pedido abierto— dejaba fuera los ocho puntos y las causas
              marcadas. O se llevaba la guía aquí, o había que prohibir revisar
              desde la ficha; prohibirlo obligaba a cambiar de pestaña para algo
              de un clic, en el sitio donde el equipo está todo el día.
              Se marca lo que falla y llega puesto al cuadro de devolver, igual
              que allí. */}
          {paraDevolver.length > 0 && (
            <div className="mb-2">
              <GuiaRevision
                puntos={puntosGuia}
                marcas={marcasGuia}
                onMarcar={(id, e) => setMarcasGuia((p) => ({ ...p, [id]: e }))}
                abierta={guiaAbierta}
                onAbrir={setGuiaAbierta}
              />
            </div>
          )}

          {/* Devolver el parte entero. Va en su propia fila y no arriba con los
              demás porque al abrirse despliega el campo del motivo a lo ancho,
              y en la fila de botones no cabe. Mismo criterio que el selector de
              revisor de aquí debajo. */}
          {paraDevolver.length > 1 && (
            <div className="mb-2 flex justify-end">
              <DevolverInline
                label={
                  fallosGuia.length > 0
                    ? `Devolver con ${fallosGuia.length} ${fallosGuia.length === 1 ? "causa" : "causas"}`
                    : `Devolver las ${paraDevolver.length}`
                }
                miId={miId}
                causasSugeridas={fallosGuia}
                familias={familiasDelPedido}
                // Aquí también se pueden descartar las que están bien, aunque
                // cada fila siga teniendo su propio botón: quien abre este ya
                // tiene el cuadro delante y no debería cerrarlo para ir a la
                // fila de al lado.
                ofs={paraDevolver.map((o) => ({ id: o.id, codigo: o.codigo }))}
                onDevolver={(obs, ids) =>
                  onAccion(ids ?? paraDevolver.map((o) => o.id), "devolver", obs)
                }
              />
            </div>
          )}

          {/* El revisor se elige UNA vez y vale para todas. Va debajo del
              rótulo y a lo ancho: metido en la misma fila que los botones se
              quedaba sin sitio para el desplegable. */}
          {pidiendoRevisorPedido && (
            <div className="mb-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-highlight)] p-2">
              <p className="mb-1.5 text-[11px] text-text-muted">
                Se mandan a revisar las {paraRevisar.length} OF de{" "}
                {opById(autoresParaRevisar[0])?.nombre ?? "este pedido"}, con el mismo revisor.
              </p>
              <PedirRevisor
                operarios={operarios}
                excluirIds={autoresParaRevisar}
                etiquetaConfirmar={`Pasar las ${paraRevisar.length}`}
                onConfirmar={(rev) => {
                  for (const o of paraRevisar) onSetRevisor(o.id, rev);
                  onAccion(paraRevisar.map((o) => o.id), "terminar_planteo");
                  setPidiendoRevisorPedido(false);
                }}
                onCancelar={() => setPidiendoRevisorPedido(false)}
              />
            </div>
          )}

          {ofsDeOT.length === 0 && (
            <p className="mb-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-text-muted">
              Ninguna OF de este pedido es trabajo de Oficina Técnica ahora mismo.
            </p>
          )}

          <ul className="space-y-2.5">
            {ofsVisibles.map((of) => (
              <OFRow
                key={of.id}
                of={of}
                operarios={operarios}
                miId={miId}
                dobleFichaje={dobleFichaje}
                pedidoDeUnaOF={pedido.ofs.length === 1}
                opById={opById}
                onSetRevisor={onSetRevisor}
                onTraspasarAutor={onTraspasarAutor}
                onAccion={onAccion}
                onFichar={onFichar}
                onDesfichar={onDesfichar}
                fichandoYoEsta={ofIdsFichandoYo?.has(of.id) ?? false}
              />
            ))}
          </ul>

          {ocultas.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ocultas.map(({ grupo, ofs }) => {
                const abierto = mostrar.has(grupo.id);
                return (
                  <button
                    key={grupo.id}
                    onClick={() =>
                      setMostrar((prev) => {
                        const s = new Set(prev);
                        if (!s.delete(grupo.id)) s.add(grupo.id);
                        return s;
                      })
                    }
                    aria-expanded={abierto}
                    // En las anuladas, el porqué de cada una sin desplegarlas:
                    // es lo que se busca al repasar por qué falta trabajo.
                    title={
                      grupo.id === "anulada"
                        ? `${grupo.ayuda}\n${ofs.map((o) => motivoDeAnulada(o)).join("\n")}`
                        : grupo.ayuda
                    }
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                      abierto
                        ? "glass-chip-activo text-text"
                        : "glass-chip text-text-muted hover:text-text"
                    }`}
                  >
                    {abierto ? "Ocultar" : "Ver"} {ofs.length} {grupo.nombre(ofs.length)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <footer
          className="p-3 text-[11px] leading-snug text-text-muted"
          style={{ boxShadow: "inset 0 1px 0 0 var(--glass-border)" }}
        >
          {/* La confirmación la pone el Board, que es quien ejecuta: este mismo
              botón está también en la fila del tablero y no puede preguntar
              cada uno lo suyo (ver `pasarAProduccionPendiente`). */}
          {listoParaCompletar && (
            <button
              onClick={() => onCompletar(pedido.id)}
              className="mb-2 w-full rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-700"
            >
              📦 Pasar a Producción
            </button>
          )}
          {/* Ya no hace falta explicar que "planteo = autor" y "revisión =
              revisor": cada OF lo enseña en su línea. Aquí se queda solo lo que
              la tarjeta NO puede enseñar: que el tiempo de un rol puede venir de
              varias personas y que revisor y autor nunca coinciden. */}
          El tiempo de cada rol lo suma quien lo ficha, aunque la OF sea de otro. El
          revisor nunca puede ser el autor.
        </footer>
      </aside>

      {/* La confirmación de "Aprobar las N". Va aquí, colgando del Drawer y no
          de la fila de botones, porque el cuadro se pinta en un portal y lo
          único que necesita es estar montado mientras el Drawer lo esté. */}
      {confirmacionPedido.dialogo}
    </div>
  );
}

/** Una línea del bloque de roles de la OF: QUIÉN tiene el encargo.
 *
 *  Solo el nombre, sin minutos. Los llevaba, y era la primera de las cuatro
 *  copias del tiempo que tenía esta tarjeta (ver la cabecera de TiempoOF.tsx).
 *  Además decía otra cosa de la que parecía: el nombre es quien TIENE EL ROL
 *  asignado y el número era TODO el tiempo fichado en ese rol, que puede haber
 *  echado un compañero echando una mano, o el autor anterior si la OF se
 *  traspasó. Los dos datos juntos en una línea se leían como "esto es lo que ha
 *  echado esta persona", que no era verdad. Ahora el reparto real, persona a
 *  persona, está debajo en su tabla, y aquí queda el encargo: de quién es la
 *  OF y quién la repasa.
 *
 *  El color del chip sale de ROL (plantear = esmeralda, revisar = violeta),
 *  el mismo par que usan tarjetas, badges y el resto de la app. */
function LineaRol({
  rol,
  rotulo,
  op,
  live,
  control,
}: {
  rol: Rol;
  /** Cómo se llama quien tiene el rol: "Autor" / "Revisor". Son las palabras
   *  con las que se habla del trabajo en el resto del panel (traspasar autor,
   *  elegir revisor), no invento nuevo. */
  rotulo: string;
  op: Operario | null;
  live: boolean;
  /** Sustituye al nombre cuando la persona se puede cambiar desde aquí (el
   *  autor se traspasa mientras quede trabajo suyo). El revisor sigue siendo
   *  de solo lectura: se nombra al mandar a revisar. */
  control?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg bg-surface-2/70 px-2 py-1.5"
      title={`${rotulo}: ${op ? op.nombre : "sin asignar"}. Es de quién es el encargo; el tiempo que ha echado cada uno está justo debajo.`}
    >
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${ROL[rol].chip}`}
      >
        {rotulo}
      </span>
      {control ?? (
        op ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className="grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white"
              style={{ background: op.color }}
            >
              {op.iniciales}
            </span>
            <span className="truncate text-[11px] text-text">{op.nombre}</span>
          </span>
        ) : (
          <span className="text-[11px] italic text-text-muted">Sin asignar</span>
        )
      )}
      {/* El punto pulsante no repite el rol (el badge de la cabecera de la OF
          ya lo dice): solo señala CUÁL de las dos líneas está corriendo. */}
      {live && <LiveDot rol={rol} className="size-1.5" />}
    </div>
  );
}

function OFRow({
  of,
  operarios,
  miId,
  dobleFichaje,
  pedidoDeUnaOF,
  opById,
  onSetRevisor,
  onTraspasarAutor,
  onAccion,
  onFichar,
  onDesfichar,
  fichandoYoEsta,
}: {
  of: OF;
  operarios: Operario[];
  miId: string | null;
  dobleFichaje: boolean;
  /** El pedido tiene una sola OF: el selector de autor de arriba ya la cubre. */
  pedidoDeUnaOF: boolean;
  opById: (id: string | null) => Operario | null;
  onSetRevisor: (ofId: string, revisorId: string | null) => void;
  onTraspasarAutor: (ofId: string, autorId: string) => void;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  /** ¿La estoy fichando YO? Ver el mismo campo en las props del Drawer. */
  fichandoYoEsta: boolean;
}) {
  const meta = ESTADO[of.estado];
  // Solo en las anuladas: en una devuelta ese mismo campo lleva la nota del
  // revisor (los dos usos lo comparten, ver lib/anulacion.ts).
  const anulacion = of.estado === "anulada" ? leerAnulacion(of.observacion) : null;
  const autor = opById(of.autorId);
  const revisor = opById(of.revisorId);
  // El tiempo NO se calcula aquí: todo el reparto —quién, cuánto y en qué
  // herramienta— vive en TiempoOF, que es el único sitio de la tarjeta donde
  // sale un minuto.

  return (
    <li className="glass-chip rounded-xl p-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs font-semibold text-text">{of.codigo}</span>
        <FamiliaTag familia={of.familia} />
        {/* Subfamilia de RPS ("TOLDO NUEVO", "REPARACIONES", "ACCESORIOS TF").
            Es el detalle que le falta a la familia, que en RPS es muy ancha, y
            se enseña tal cual en vez de inventarle un sitio en nuestro
            catálogo. Solo si dice algo que la familia no diga ya. */}
        {of.subfamilia && of.subfamilia.toUpperCase() !== of.familia.toUpperCase() && (
          <span
            className="truncate text-[10px] uppercase tracking-wide text-text-muted"
            title="Subfamilia en RPS"
          >
            {of.subfamilia}
          </span>
        )}
        {/* El estado, y en las anuladas también POR QUÉ: "ANULADA · TALLER".
            Va en el propio distintivo y no en una línea aparte porque es lo
            que se busca al repasarlas, y así se lee sin abrir nada. */}
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${meta.chip}`}
          title={anulacion?.nota}
        >
          {/* "Aprobada" a secas se lee como "alguien la repasó y le dio el
              visto bueno". En las que van por "Dar por bueno sin revisión" eso
              no pasó, y el histórico no puede decir que sí. */}
          {aprobadaSinRevision(of) ? "Aprobada sin revisión" : meta.label}
          {anulacion && ` · ${textoAnulacion(anulacion)}`}
        </span>
        {of.fichandoRol && <LiveBadge rol={of.fichandoRol} />}
        {/* Detenida por Producción: no se puede fichar y no depende de OT
            resolverlo. Tiene que verse aquí, que es donde se decide qué coger:
            hasta ahora solo se enteraba uno al intentar fichar. */}
        {of.detenida && (
          <span
            className="rounded bg-red-600/12 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700 dark:text-red-300"
            title="Detenida por Producción: no admite fichaje hasta que la liberen"
          >
            Detenida
          </span>
        )}
        {/* Entra por una tarea de TALLER (capotas, faldones): no es trabajo de
            OT salvo que alguien la rescate asignándose autor. En el tablero y
            en la Lista ni se enseña, pero el detalle sí las trae todas —es la
            ficha del pedido entero— y sin marcarlas parecía trabajo tuyo: en
            AR.26.03626, de cinco OF solo el toldo es de OT y la capota se leía
            igual que él. */}
        {ofDeTaller(of) && (
          <span
            className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-text-muted ring-1 ring-border"
            title="Entra por una tarea de taller: no es trabajo de Oficina Técnica. Asignarle autor la rescata."
          >
            Para taller
          </span>
        )}
        <span className="ml-auto text-[11px] text-text-muted">{of.piezas} pz</span>
      </div>

      <p className="mt-1 text-sm text-text">{of.descripcion}</p>

      {of.avisos && of.avisos.length > 0 && (
        <div className="mt-1.5 space-y-1 rounded-md bg-indigo-500/10 px-2 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
            Avisos de Producción
          </p>
          {of.avisos.map((a) => (
            <p key={a} className="text-[11px] leading-snug text-indigo-800 dark:text-indigo-200">
              📌 {a}
            </p>
          ))}
        </div>
      )}

      {of.fechaLimitePlanteo && (
        <p
          className={`mt-1.5 px-2 text-[11px] ${
            of.fechaLimitePlanteo < hoyISO()
              ? "font-semibold text-red-600 dark:text-red-400"
              : "text-text-muted"
          }`}
          title="Fecha en la que Producción tiene planificado empezar a fabricar esta OF: el planteo de Oficina Técnica debe estar terminado antes."
        >
          🏭 Producción empieza a fabricar el {fmt(of.fechaLimitePlanteo)} — el
          planteo debe estar listo antes
          {of.fechaLimitePlanteo < hoyISO() ? " (ya vencida)" : ""}
        </p>
      )}

      {of.rotulacion && (
        <p className="mt-1.5 rounded-md bg-sky-500/10 px-2 py-1 text-[11px] text-sky-700 dark:text-sky-300">
          🏷 Rotulación: <b>{of.rotulacion}</b>
        </p>
      )}

      {/* Solo cuando el chip de material NO puede contarlo. Los dos salían del
          mismo hecho —hay una compra pendiente— y quedaban uno encima del otro
          diciendo lo mismo; el chip además dice QUÉ se pidió, a quién y si
          llega tarde. Esta línea se queda para las OF donde la vista de RPS da
          la fecha pero no tenemos el detalle de la compra. */}
      {of.materialPendienteHasta && !of.compras?.length && (
        <p className="mt-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">
          📦 Material de compras pedido, llega el {fmt(of.materialPendienteHasta)}.
        </p>
      )}

      {/* `reservasMaterial` sigue siendo la señal de "hay dato de RPS": el mock
          no lo rellena, y ahí no se enseña nada en vez de mentir con un
          "sin material asignado". */}
      {of.reservasMaterial !== undefined && (
        <div className="mt-1.5">
          <MaterialChip materiales={of.materiales} compras={of.compras} hoy={hoyISO()} />
        </div>
      )}

      {/* La nota del revisor. En una OF anulada este campo lleva otra cosa —el
          motivo de la anulación, que ya sale en el distintivo— y repetirlo aquí
          en rojo la haría parecer devuelta. */}
      {of.observacion && !anulacion && (
        <NotaDevolucion
          observacion={of.observacion}
          className="mt-1.5 rounded-md bg-red-500/10 px-2 py-1 text-[11px] text-red-600 dark:text-red-400"
        />
      )}

      {/* Quién y cuánto, en un solo bloque: una línea por rol con la persona y
          su tiempo al lado (ver LineaRol para el porqué). Antes esto estaba
          partido en dos —los minutos aquí, los nombres cuatro líneas más
          abajo— y había que emparejarlos de cabeza.

          Orden fijo: autor y luego revisor, que es el del flujo de trabajo
          (primero se plantea, después se repasa). Es un orden que no se mueve
          nunca; ordenar por tiempo haría que la misma OF se recolocase sola
          según quién llevase más minutos ese día, y ver los mismos nombres en
          dos órdenes distintos es justo lo que despistaba en la queja. */}
      <div className="mt-2.5 space-y-1">
        <LineaRol
          rol="plantear"
          rotulo="Autor"
          op={autor}
          live={of.fichandoRol === "plantear"}
          control={
            // Con UNA sola OF el selector sobra: el de arriba, "Asignar autor
            // (pedido entero)", ya cambia exactamente esta OF. Eran dos
            // desplegables idénticos, uno encima del otro, y no había forma de
            // saber en qué se diferenciaban — porque no se diferenciaban en
            // nada. En cuanto hay dos OF vuelve, que ahí sí sirve: es como se
            // reparte un pedido entre dos personas.
            puedeTraspasarAutor(of) && !pedidoDeUnaOF ? (
              <Select
                value={of.autorId}
                onChange={(v) => v && onTraspasarAutor(of.id, v)}
                placeholder={null}
                alignRight
                className="min-w-0"
                options={opcionesOperario(operarios, miId)}
              />
            ) : null
          }
        />
        <LineaRol
          rol="revisar"
          rotulo="Revisor"
          op={revisor}
          live={of.fichandoRol === "revisar"}
        />
      </div>

      {/* Todo el tiempo de la OF, en UN sitio: quién, cuánto y dónde lo apuntó.
          Antes esto estaba repartido en cuatro sitios de esta misma tarjeta —los
          minutos en las líneas de rol, el desglose de RPS aparte, el total, y
          una línea que volvía a comparar los dos— diciendo los mismos números.
          Ver la cabecera de TiempoOF.tsx. */}
      <TiempoOF of={of} opById={opById} dobleFichaje={dobleFichaje} />

      {/* archivos subidos a RPS */}
      {of.archivosRps && of.archivosRps.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-text-muted">RPS:</span>
          {of.archivosRps.map((a) => (
            <span
              key={a}
              className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-text-muted"
            >
              {a}
            </span>
          ))}
        </div>
      )}

      {/* acciones según estado: generadas desde la máquina (lib/acciones.ts) */}
      <AccionesOF
        of={of}
        operarios={operarios}
        miId={miId}
        onAccion={onAccion}
        onSetRevisor={onSetRevisor}
        onFichar={onFichar}
        onDesfichar={onDesfichar}
        fichandoYoEsta={fichandoYoEsta}
      />
    </li>
  );
}

/** Todo lo que se puede HACER con esta OF, en una sola fila.
 *
 *  El reloj estaba arriba, suelto y en tono fantasma ("⏸ Dejar de fichar"), y
 *  las acciones de estado abajo. Con esa separación, quien quería parar y
 *  seguir por la tarde no encontraba la pausa y tiraba de "Volver a pendiente",
 *  que no es pausar: deshace el haber empezado. Ahora van juntas y en el orden
 *  del trabajo —el reloj primero, que es lo que más se pulsa—, y los textos
 *  dicen lo que hacen: "Pausar", "Reanudar", "Dejar sin empezar". */
function AccionesOF({
  of,
  operarios,
  miId,
  onAccion,
  onSetRevisor,
  onFichar,
  onDesfichar,
  fichandoYoEsta,
}: {
  of: OF;
  operarios: Operario[];
  miId: string | null;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onSetRevisor: (ofId: string, revisorId: string | null) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  /** ¿La estoy fichando YO? Ver el mismo campo en las props del Drawer. */
  fichandoYoEsta: boolean;
}) {
  const { pedirConfirmacion, dialogo } = useConfirmacion((a) => onAccion([of.id], a.id));
  const [pidiendoRevisor, setPidiendoRevisor] = useState(false);
  // Anular se abre desde el cajón de "⋯" (ver MenuAccionesOF).
  const [anulando, setAnulando] = useState(false);
  // De qué reloj habla el botón: el del planteo o el de la revisión.
  const rolReloj = rolFichajeDe(of);
  // "Reanudar" y no "Fichar" cuando ya hay tiempo echado: es la vuelta de una
  // pausa, y llamarlo igual que empezar de cero borraba esa diferencia.
  //
  // Se mide el tiempo DE ESE ROL, no el total de la OF. Con el total, una OF
  // recién mandada a revisar decía "Reanudar" por los minutos del planteo —
  // pero el reloj del que hablaba era el de la revisión, que no había corrido
  // ni un segundo.
  const yaEmpezada =
    rolReloj === "revisar" ? of.tiempoRevisionMin > 0 : of.tiempoPlanteoMin > 0;
  // El reloj de la REVISIÓN solo se le ofrece al revisor. Al autor le salía
  // "▶ Reanudar" en morado sobre una OF que acababa de mandar a revisar, y
  // pulsarlo no reanudaba su planteo: arrancaba el reloj de la revisión de
  // otro. La fila del tablero ya lo hacía bien (ver PedidoLinea: en
  // "esperando revisión" no ofrece fichar); el Drawer se lo había saltado.
  //
  // El de PLANTEO sí se deja abierto: echarle una mano a un compañero en su
  // planteo es un caso real y el tablero lo contempla, con su aviso.
  const relojEsMio = rolReloj !== "revisar" || of.revisorId === miId;
  // ¿Se está ofreciendo el botón del reloj? Lo usa el filtro de abajo para no
  // pintar dos botones que hacen lo mismo.
  const relojALaVista = esFichable(of) && relojEsMio;

  // Con `miId`: la revisión de otro no la empieza cualquiera, así que su botón
  // ni siquiera se ofrece (ver `soloEl` en lib/acciones.ts).
  //
  // Fuera "empezar planteo" y "retomar": las hace el botón del reloj, que las
  // dos cosas a la vez (ver `accionAlFichar` en lib/accion-pedido.ts). Dejarlas
  // aquí ponía dos botones para lo mismo, y en una OF ya empezada y pausada
  // salían juntos "▶ Reanudar" y "Empezar planteo", que encima suena a
  // empezar de cero.
  //
  // Y fuera "terminar planteo" mientras YO la estoy fichando: mandarla a
  // revisar da por terminado el planteo, así que hacerlo con el reloj en marcha
  // dejaba tiempo contando sobre un trabajo ya declarado acabado. Primero se
  // pausa —el botón de al lado— y entonces aparece.
  //
  // Y fuera "empezar revisión" cuando el botón del reloj ya está ahí: fichar
  // una OF "por revisar" como revisor la pasa a `en_revision` y arranca el
  // reloj (ver el ligado en Board.ficharOFs), que es EXACTAMENTE lo que hace
  // esta acción. Salían los dos, "⏱ Fichar revisión" y "Empezar revisión",
  // haciendo lo mismo sin que nada dijera en qué se diferencian.
  //
  // Se quita solo cuando el reloj se ofrece de verdad: en una OF detenida o
  // que RPS no deja imputar no hay botón de reloj, y ahí esta acción es la
  // única forma de empezar la revisión.
  const acciones = accionesDisponibles(of, miId).filter(
    (a) =>
      a.id !== "empezar_planteo" &&
      a.id !== "retomar" &&
      !(relojALaVista && a.id === "empezar_revision") &&
      !(fichandoYoEsta && a.id === "terminar_planteo"),
  );
  // Lo de todos los días queda a la vista; el resto, en el cajón de "⋯".
  //
  // La fila llegaba a cinco botones (revisor revisando: reloj, Aprobar,
  // Devolver, Dejar sin revisar, Anular), se partía en dos líneas y la altura
  // de cada OF bailaba según su estado. Y "Anular OF", con su `ml-auto`, se
  // quedaba flotando solo en la segunda como si fuera de otra cosa.
  //
  // `devolver` se queda FUERA aunque sea "peligro": para el revisor es tan
  // diario como aprobar, y esconderlo sería castigar el caso de que algo esté
  // mal. Lo que se va al cajón es lo de higos a brevas.
  const aLaVista = acciones.filter((a) => A_LA_VISTA.has(a.id));
  const enCajon = acciones.filter((a) => !A_LA_VISTA.has(a.id));
  // Un cajón para UNA sola opción es peor que la opción: un clic de más para
  // esconder algo que cabía. Con una, se saca fuera.
  const menu = enCajon.length > 1 ? enCajon : [];
  const sueltas = enCajon.length > 1 ? aLaVista : acciones;
  const tono = { primaria: "teal", peligro: "rojo", neutra: "ghost" } as const;

  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      {/* "La ficho YO", no "la ficha alguien": con `of.fichandoRol` salía
          "Pausar" también sobre el reloj de otra persona (el revisor, o
          cualquiera desde el mini-olanet), y este botón no puede parar ese
          reloj —solo saca la OF del MÍO, donde no estaba—. Mismo criterio que
          PedidoLinea y que el botón de arriba. */}
      {fichandoYoEsta ? (
        <Btn
          tone={of.fichandoRol === "revisar" ? "revisar" : "reloj"}
          title="Para el reloj y deja la OF como está: sigue siendo tuya y en curso"
          onClick={() => onDesfichar(of.id)}
        >
          ⏸ Pausar
        </Btn>
      ) : esFichable(of) && relojEsMio ? (
        <Btn
          tone={rolReloj === "revisar" ? "revisar" : "reloj"}
          // El texto dice de qué reloj se habla: sobre una OF en revisión el
          // botón hablaba de "empezar el planteo", que es otro trabajo y de
          // otra persona.
          title={`${yaEmpezada ? "Vuelve a poner el reloj en marcha" : "Pone el reloj en marcha"} en ${
            rolReloj === "revisar" ? "la revisión" : "el planteo"
          } de esta OF`}
          onClick={() => onFichar([of.id], rolReloj)}
        >
          {/* El rótulo dice DE QUÉ reloj se habla. "Reanudar" a secas sobre una
              OF en revisión se leía como volver a tu planteo. */}
          {rolReloj === "revisar"
            ? yaEmpezada
              ? "▶ Reanudar revisión"
              : "⏱ Fichar revisión"
            : yaEmpezada
              ? "▶ Reanudar"
              : "⏱ Fichar"}
        </Btn>
      ) : (
        of.estado !== "aprobada" &&
        of.estado !== "anulada" &&
        (() => {
          // Aquí se juntaban situaciones distintas bajo un mismo rótulo falso.
          // La OF que NO se puede fichar (detenida, o RPS no admite imputar) es
          // una; la que sí se puede pero cuyo reloj es de la revisión, y la
          // revisión no es tuya, es otra. Esta segunda salía como
          // "No fichable" —que es mentira— y encima con el globo vacío, porque
          // `motivoNoFichable` devuelve null en ese caso.
          //
          // Y dentro de esa segunda hay dos, que es lo que se ve al usarlo: una
          // OF esperando en la cola SIN revisor nombrado no la está revisando
          // nadie, así que decir "la revisa otra persona" es inventarse a una
          // persona. Lo que le pasa es que está entregada y sin dueño.
          const relojDeOtro = esFichable(of) && !relojEsMio;
          const quien = of.revisorId
            ? (operarios.find((o) => o.id === of.revisorId)?.nombre ?? "otra persona")
            : null;
          const motivo = !relojDeOtro
            ? motivoNoFichable(of)
            : quien === null
              ? "Entregada y esperando a que alguien la revise. Tu planteo ya está hecho"
              : `El reloj de la revisión es de ${quien}: tu planteo ya está entregado`;
          const rotulo = !relojDeOtro
            ? "⏱ No fichable"
            : quien === null
              ? "⏱ Esperando revisor"
              // `en_revision` es que ya la cogió; `por_revisar`, que la tiene
              // pendiente. No es lo mismo y el rótulo lo dice.
              : of.estado === "en_revision"
                ? `⏱ La revisa ${quien}`
                : `⏱ Pendiente de ${quien}`;
          return (
            <span
              title={motivo ?? undefined}
              // El motivo también por `aria-label`: el `title` no lo anuncia un
              // lector de pantalla, y aquí es la única explicación que hay.
              aria-label={motivo ? `${rotulo}. ${motivo}` : undefined}
              className="cursor-help rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-text-muted/60"
            >
              {rotulo}
            </span>
          );
        })()
      )}
      {sueltas.map((a) => {
        if (a.conNota)
          return (
            <DevolverInline
              key={a.id}
              label={a.label}
              miId={miId}
              onDevolver={(obs) => onAccion([of.id], a.id, obs)}
            />
          );
        // Anular pregunta POR QUÉ, y esa es la confirmación (ver AnularInline).
        if (a.conMotivo)
          return <AnularInline key={a.id} onAnular={(obs) => onAccion([of.id], a.id, obs)} />;
        // "Pasar a revisión" pide el revisor aquí mismo (flujo unificado con
        // el chip del tablero): sin revisor no se pasa.
        if (a.id === "terminar_planteo")
          return (
            !pidiendoRevisor && (
              <Btn key={a.id} tone={tono[a.tono]} onClick={() => setPidiendoRevisor(true)}>
                {a.label}
              </Btn>
            )
          );
        return (
          <Btn
            key={a.id}
            tone={tono[a.tono]}
            // Lo peligroso, al otro extremo de la fila: no se pulsa por
            // inercia después de la acción que sí se usa a diario.
            className={a.tono === "peligro" ? "ml-auto" : ""}
            onClick={() => pedirConfirmacion(a)}
          >
            {/* "Aprobar → Jaime": a quién le llega la OF aprobada. Ponía
                "→ Producción" y se leía como que aprobar ya la mandaba allí. */}
            {etiquetaAccion(a, of, (id) => operarios.find((o) => o.id === id)?.nombre)}
          </Btn>
        );
      })}
      {/* Anular vive en el cajón, así que aquí va en modo controlado: cerrado
          no pinta nada, y al elegirlo en el menú se abre su formulario. */}
      {menu.some((a) => a.id === "anular") && (
        <AnularInline
          abierto={anulando}
          onAbrirCambio={setAnulando}
          onAnular={(obs) => onAccion([of.id], "anular", obs)}
        />
      )}
      <MenuAccionesOF
        acciones={menu}
        etiqueta={(a) => etiquetaAccion(a, of, (id) => operarios.find((o) => o.id === id)?.nombre)}
        onElegir={(a) => {
          if (a.id === "anular") setAnulando(true);
          else if (a.id === "terminar_planteo") setPidiendoRevisor(true);
          else pedirConfirmacion(a);
        }}
      />
      {pidiendoRevisor && (
        <PedirRevisor
          operarios={operarios}
          excluirIds={[of.autorId]}
          valorInicial={of.revisorId}
          onConfirmar={(rev) => {
            onSetRevisor(of.id, rev);
            onAccion([of.id], "terminar_planteo");
            setPidiendoRevisor(false);
          }}
          onCancelar={() => setPidiendoRevisor(false)}
        />
      )}
      {dialogo}
    </div>
  );
}

function Btn({
  children,
  onClick,
  tone,
  className = "",
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone: "amber" | "teal" | "reloj" | "revisar" | "ghost" | "rojo";
  className?: string;
  title?: string;
}) {
  const cls = {
    amber: "bg-amber-500 text-white hover:bg-amber-600",
    teal: "bg-teal-600 text-white hover:bg-teal-700",
    // El reloj lleva el color de SU rol, el mismo de todo el tablero: verde
    // planteo, violeta revision. Fichar se reconoce por el color sin leer el
    // boton, y sobre una OF en revision el verde decia el rol equivocado.
    reloj: ROL.plantear.solido,
    revisar: ROL.revisar.solido,
    ghost: "border border-border text-text-muted hover:text-text hover:border-border-strong",
    // Peligro (anular) en rojo pero SIN relleno: era lo que más gritaba de la
    // tarjeta, por encima de la acción que se hace a diario, y en una OF
    // pendiente parecía que anular fuese lo que tocaba hacer. El rojo sólido
    // se queda para el "Confirmar" del ConfirmDialog, que es donde la acción
    // se materializa de verdad.
    rojo: "text-red-600 ring-1 ring-red-500/35 hover:bg-red-500/10 dark:text-red-400",
  }[tone];
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${cls} ${className}`}
    >
      {children}
    </button>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-text-muted">{k}</dt>
      <dd className="font-medium text-text">{v}</dd>
    </div>
  );
}
