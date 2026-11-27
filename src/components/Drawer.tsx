"use client";

import { useEffect, useRef, useState } from "react";
import { usePopover } from "@/lib/usePopover";
import { BOTON_BLOQUE, BOTON_CIERRE, BOTON_NEUTRO, BOTON_PASAR_REVISION, TAMANO_BLOQUE } from "@/lib/botones";
import type { Operario, OF, OFFuera, Pedido, Rol } from "@/lib/types";
import type { Seccion } from "@/lib/secciones";
import { hoyISO, piezasTotal } from "@/lib/types";
import { ESTADO, ROL, etiquetaCantidad } from "@/lib/estado";
import { CopiarCodigo } from "./CopiarCodigo";
import { FamiliaIcon } from "./FamiliaTag";
import { LiveDot } from "./LiveBadge";
import { PedidoScan } from "./PedidoScan";
import { ParteEscaneado } from "./ParteEscaneado";
import { DetalleVenta } from "./DetalleVenta";
import { DevolverInline } from "./DevolverInline";
import { GuiaRevision } from "./GuiaRevision";
import { bloqueosDeLaGuia, fallosDeLaGuia, guiaDeFamilias, type FalloGuia } from "@/lib/guia-revision";
import { correccionDe, leerDevolucion } from "@/lib/devolucion";
import { useMarcasRevision } from "@/lib/marcas-cliente";
import { leerCausas, leerPasos, type CausaDevolucion, type PasoRevision } from "@/lib/causas-cliente";
import { AnularInline } from "./AnularInline";
import { CerrarEnRpsInline } from "./CerrarEnRpsInline";
import { ReintentarGemelaInline } from "./ReintentarGemelaInline";
import { NotaDevolucion, puntosDeLaNota } from "./NotaDevolucion";
import { FasesSinFinalizar } from "./FasesSinFinalizar";
import { DocumentosPedido } from "./DocumentosPedido";
import { NoConformidadesPedido } from "./NoConformidadesPedido";
import { HojaAlmacenPedido } from "./HojaAlmacenPedido";
import { TareasDelPedido } from "./HistorialTareas";
import { PedirRevisor } from "./PedirRevisor";
import { ConfirmDialog, useConfirmacion } from "./ConfirmDialog";
import { CasillaFila } from "./CasillaFila";
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
import { ofDeTaller, ofsFueraVisibles, pedidoListoParaPasar, puedePasarAProduccion } from "@/lib/fases-tablero";
import { puedeDarPorTerminadas } from "@/lib/paso-parcial";
import { accionOcultaSinRevision, ofsParaImpreso } from "@/lib/impreso";
import { MaterialChip } from "./MaterialChip";
import { CabeceraFicha, ComentarioPedido, MarcoFicha, TITULO_BLOQUE } from "./MarcoFicha";
import { TiempoOF } from "./TiempoOF";
import { LineaTiempoPedido } from "./LineaTiempoPedido";
import { NotasPedido } from "./NotasPedido";
import { AcentoBloque } from "./AcentoBloque";
import { AvisoParteNuevo } from "./AvisoParteNuevo";
import { botonPlantear } from "@/lib/herramientas";
import { MenuAccionesOF } from "./MenuAccionesOF";
import { tintaSobre } from "@/lib/tinta";
import { IconoAviso, IconoCaja, IconoEtiqueta, IconoFabrica } from "./Iconos";
import { familiaMeta, subfamiliaAparte } from "@/lib/familia";
import { Pista } from "./Pista";
import { useSoloLectura } from "./SoloLectura";
import { DevolverAlHistorial } from "./DevolverAlHistorial";
import { AtajosPedido } from "./AtajosPedido";
import { PedirVisita } from "./PedirVisita";

/** Las acciones que suben al bloque del pedido cuando la sección trabaja así.
 *  `anular` NO está, y es la excepción que importa: ver `revisionPorPedido`.
 *
 *  Tampoco están `aprobar_sin_revision` ni `aprobar_corregida`, y esta vez SÍ
 *  es a propósito y no un olvido: son salidas EXCEPCIONALES (trabajo sin
 *  revisión, o la segunda vuelta de una corrección) y se quedan en la fila de
 *  su OF, dentro del cajón de "⋯". Meterlas en este conjunto las QUITARÍA de
 *  la fila en las secciones que revisan por pedido.
 *
 *  `aprobar_corregida` tiene además un botón de pedido ("Dar por corregidas
 *  las N") desde dos OF, pero se AÑADE al de cada fila, no lo sustituye: por
 *  eso no está aquí. */


const ACCIONES_DEL_PEDIDO: ReadonlySet<AccionOF> = new Set([
  "terminar_planteo",
  "aprobar",
  "devolver",
]);

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

type GrupoOculto = "detenida" | "taller" | "anulada" | "cerrada";

/** Por qué NO se enseña de entrada, o null si es trabajo de OT.
 *
 *  El orden de los `if` es la precedencia, y va de lo más definitivo a lo más
 *  reversible: una OF anulada Y detenida se cuenta como anulada, porque lo que
 *  explica que no la vayas a plantear es que la anulasteis. Cada OF cae en un
 *  cajón y solo en uno: si no, los recuentos de los botones sumarían más OF de
 *  las que tiene el pedido.
 *
 *  Queda anulada > cerrada > taller > detenida. Una OF cerrada en RPS sigue
 *  "aprobada" y sin `ajenaOT`; si luego la detienen, lo que explica que no se
 *  trabaje es que se cerró, así que va antes que taller y detenida. */
function grupoOculto(of: OF): GrupoOculto | null {
  if (of.estado === "anulada") return "anulada";
  if (of.cerradaRps) return "cerrada";
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
  {
    id: "cerrada",
    nombre: (n) => (n === 1 ? "cerrada en RPS" : "cerradas en RPS"),
    ayuda: "Dadas por terminadas en RPS antes de pasar el pedido. Producción ya las ve terminadas.",
  },
];

/** Las OF del pedido sin tarea de esta sección, plegadas como las de taller:
 *  un botón «Ver 1 sin tarea de OT» y, al abrirlo, cada una con su ruta. Solo
 *  para consultar: no se fichan ni cuentan en nada (ver `OFFuera`). Se ven por
 *  las tareas-nota que llevan dentro, que si no se perdían: en AR.26.04890 la
 *  de las solapas pedía una visita con OT (Iván, 16/10/2026). */
function OFsFueraDeLaSeccion({ ofs, seccion }: { ofs: OFFuera[]; seccion: Seccion }) {
  const [abierto, setAbierto] = useState(false);
  if (ofs.length === 0) return null;
  // Dos motivos distintos, y el rótulo no puede mentir: la mayoría SÍ tienen
  // tarea de la sección, ya hecha. Con los dos mezclados, «más del pedido».
  const sinTarea = ofs.filter((f) => f.motivo === "sinTarea").length;
  const que =
    sinTarea === ofs.length
      ? `sin tarea de ${seccion.nombreCorto}`
      : sinTarea === 0
        ? ofs.length === 1
          ? "ya hecha"
          : "ya hechas"
        : "más del pedido";
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        title={`Están en el pedido pero no se trabajan aquí ahora: o no llevan ninguna tarea de ${seccion.nombre}, o la suya ya está hecha. Si les ponen una tarea nueva en RPS, pasan solas a ser OF normales.`}
        className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
          abierto ? "glass-chip-activo text-text" : "glass-chip text-text-muted hover:text-text"
        }`}
      >
        {abierto ? "Ocultar" : "Ver"} {ofs.length} {que}
      </button>
      {abierto && (
        <ul className="mt-2 space-y-1.5">
          {ofs.map((f) => (
            <li key={f.codigo} className="recuadro rounded-lg px-3 py-2 text-[11px]">
              <p className="flex items-baseline gap-2">
                <span className="font-mono font-semibold text-text">{f.codigo}</span>
                <span className="min-w-0 flex-1 truncate text-text" title={f.descripcion}>
                  {f.descripcion}
                </span>
                <span className="shrink-0 rounded bg-text-muted/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-text-muted">
                  {f.motivo === "hecha" ? `${seccion.nombreCorto} ya hecha` : `Sin tarea de ${seccion.nombreCorto}`}
                </span>
                <span className="shrink-0 text-text-muted">{f.piezas} pz</span>
              </p>
              {f.tareas.length > 0 && (
                <p className="mt-1 leading-snug text-text-muted">{f.tareas.join(" · ")}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "0230697 — La hace el taller". Para leer de un vistazo por qué se anuló cada
 *  una sin tener que abrir el cajón. Las anuladas de antes de que esto existiera
 *  no tienen motivo, y lo dicen. */
function motivoDeAnulada(of: OF): string {
  const a = leerAnulacion(of.observacion);
  return `${of.codigo} — ${a ? textoAnulacion(a) : "sin motivo apuntado"}`;
}

/** "15/09/26 11:42", para el globo del distintivo y el resumen del cajón. */
function fmtCierre(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const f = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const h = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${f} ${h}`;
}

/** "0232086 — Iván Sánchez, 15/09/26 11:42": para leer quién cerró cada OF y
 *  cuándo sin desplegar el cajón, como `motivoDeAnulada`. */
function motivoDeCerrada(of: OF, nombreDe: (id: string) => string | undefined): string {
  const c = of.cerradaRps;
  if (!c) return of.codigo;
  return `${of.codigo} — ${nombreDe(c.por) ?? c.por}, ${fmtCierre(c.at)}`;
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
  seccion,
  onClose,
  onAssignPedido,
  onCompletar,
  onDarPorTerminadas,
  onImpreso,
  onAbrirPedidoPorCodigo,
  onPasarRevision,
  avisoRevision,
  onSinRevisor,
  onTraspasarAutor,
  onCoger,
  onAccion,
  onFichar,
  onDesfichar,
  onDesficharVarias,
  onCerradoEnRps,
  onGemelaReintentada,
  ofIdsFichandoYo,
  miFichaje,
}: {
  pedido: Pedido | null;
  operarios: Operario[];
  // El único que llama a este Drawer es Board.tsx, y solo después de su
  // `if (!miId) return <IdentityGate .../>`: para cuando el Drawer se monta,
  // ya hay alguien identificado. Que aquí dijera `| null` era una mentira que
  // arrastraba `useMarcasRevision` (ver marcas-cliente.ts) hasta forzarlo a
  // aceptar un caso que en realidad no puede darse.
  miId: string;
  /** De qué sección es este pedido. De ella sale si las acciones de estado van
   *  por OF o por pedido (ver `revisionPorPedido` en lib/secciones.ts). */
  seccion: Seccion;
  onClose: () => void;
  onAssignPedido: (autorId: string | null) => void;
  onCompletar: (pedidoId: string) => void;
  /** «Dar por terminadas…» del "⋯" del pedido: el diálogo de pasar con la
   *  lista de OF para desmarcar. Sin él (Diseño, Impresión) no sale. */
  onDarPorTerminadas?: (pedidoId: string) => void;
  /** «Impreso»: aprueba lo que queda y pasa el pedido (ver lib/impreso.ts).
   *  Solo lo da el Board en las secciones sin revisión; sin él, el botón no
   *  existe y el bloque sigue como siempre. */
  onImpreso?: (pedidoId: string) => void;
  /** Abre OTRO pedido por su código: el de una no conformidad (el original o
   *  el rectificativo). Lo resuelve el Board: en el tablero o en el Historial. */
  onAbrirPedidoPorCodigo?: (codigo: string) => void;
  onPasarRevision: (ofIds: string[], revisorId: string) => Promise<boolean>;
  /** Dentro del modal para que su botón de cierre también se alcance con Tab. */
  avisoRevision?: React.ReactNode;
  /** Se pulsó "Pasar a revisión" y se dejó sin elegir revisor (ver PedirRevisor). */
  onSinRevisor?: (ofCodigos: string[]) => void;
  onTraspasarAutor: (ofId: string, autorId: string) => void;
  /** Quedarse con OF de otra persona. Lo pregunta el Board. */
  onCoger?: (ofIds: string[]) => void;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  onDesficharVarias: (ofIds: string[]) => void;
  /** «Dar por terminada en RPS» ya contestó bien en el servidor: el Board
   *  refleja la marca. No pasa por `onAccion` (ver CerrarEnRpsInline). */
  onCerradoEnRps: (ofId: string, cerradaRps: NonNullable<OF["cerradaRps"]>, avisos?: string[]) => void;
  /** «Reintentar la N» (Confirmado con Iván, punto 4) ya escribió bien la
   *  gemela: el Board refleja la marca sin `gemelaSinEscribir`. Igual que
   *  `onCerradoEnRps`, no pasa por `onAccion`. */
  onGemelaReintentada: (ofId: string, cerradaRps: NonNullable<OF["cerradaRps"]>, aviso?: string) => void;
  /** Las OF que estoy fichando YO ahora mismo (mi intervalo abierto).
   *
   *  NO vale `of.fichandoRol` para esto: ese dice que la ficha ALGUIEN —el
   *  revisor, o cualquiera desde el mini-olanet— y con él salía "Pausar" sobre
   *  el reloj de otro, que este botón no puede parar. Mismo criterio que usa
   *  PedidoLinea. */
  ofIdsFichandoYo?: ReadonlySet<string>;
  /** Mi reloj en marcha, en una franja al pie de la ficha (ver `franja` en
   *  MiFichaje). La pinta el Board, que es quien tiene el fichaje; sin reloj
   *  devuelve `null`. */
  miFichaje?: (pedidoId: string) => React.ReactNode;
}) {
  const soloLectura = useSoloLectura();
  // Escape, foco y scroll de detrás: los lleva el <dialog> de MarcoFicha.

  // Qué grupos de OF ajenas al trabajo de OT se han desplegado a mano.
  const [mostrar, setMostrar] = useState<ReadonlySet<GrupoOculto>>(new Set());
  // Eligiendo el revisor del pedido entero (ver `paraRevisar` más abajo).
  const [pidiendoRevisorPedido, setPidiendoRevisorPedido] = useState<OF[] | null>(null);
  // Las OF que se marcan al pasar el ratón por un botón del bloque: las que
  // entrarían y las que se quedan fuera. Sin líneas de texto debajo de la
  // barra (Iván, 26/11/2026): a qué afecta se ve en las propias OF.
  const [resalte, setResalte] = useState<{ entran: Set<string>; fuera: Set<string>; rol: Rol } | null>(null);
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
  const [eligiendoFichar, setEligiendoFichar] = useState(false);
  const [marcadasFichar, setMarcadasFichar] = useState<ReadonlySet<string>>(new Set());
  // La de «Impreso» (Impresión Digital), aparte: no es una acción de OF que
  // pase por `onAccion`, sino aprobar y pasar el pedido entero. El pedido se
  // congela al pulsar, por lo mismo que `idsAConfirmar`.
  const pedidoAImprimir = useRef<string | null>(null);
  const confirmacionImpreso = useConfirmacion(() => {
    if (pedidoAImprimir.current) onImpreso?.(pedidoAImprimir.current);
  });
  const [ultimoPedido, setUltimoPedido] = useState<string | null>(null);
  // Qué OF se han abierto o plegado a mano, al revés de como salen de entrada
  // (ver `PLEGAR_DESDE`).
  const [ofsCambiadas, setOfsCambiadas] = useState<ReadonlySet<string>>(new Set());

  // La guía de revisión, la misma que en el panel de Revisiones. Pasos y causas
  // se piden una vez por ficha: de los pasos sale lo que hay que repasar y de
  // las causas las píldoras del cuadro de devolver.
  //
  // Aquí arriba con el resto de hooks y no junto a lo que las usa: abajo hay un
  // `if (!pedido) return null` de por medio, y un hook detrás de un return se
  // salta en unos renders y en otros no.
  const [causasRevision, setCausasRevision] = useState<CausaDevolucion[]>([]);
  const [pasosRevision, setPasosRevision] = useState<PasoRevision[]>([]);
  useEffect(() => {
    let vivo = true;
    leerCausas().then((cs) => vivo && setCausasRevision(cs));
    leerPasos().then((ps) => vivo && setPasosRevision(ps));
    return () => {
      vivo = false;
    };
  }, []);
  // Lo que hay que contar tras dar una OF por terminada en RPS aunque haya ido
  // bien (ya estaba cerrada, o una gemela 2/02 no entró). Vive AQUÍ y no en
  // CerrarEnRpsInline: ese se desmonta en cuanto la OF se marca y pasa al
  // cajón, y el aviso se iba con él. Atado al pedido: al abrir otro no sale.
  const [avisosCierreRps, setAvisosCierreRps] = useState<{ pedido: string; textos: string[] } | null>(null);
  // LAS OF DE ESTE PEDIDO QUE ME TOCA REVISAR. Se calcula aquí arriba, sobre
  // el pedido crudo, porque de ello dependen las marcas —y las marcas son un
  // hook, que no puede ir detrás del `if (!pedido) return null` de más abajo.
  const idsParaRevisar = (pedido?.ofs ?? [])
    .filter(
      (o) => o.revisorId === miId && (o.estado === "por_revisar" || o.estado === "en_revision"),
    )
    .map((o) => o.id);
  // Lo comprobado se guarda en el servidor: de ello depende poder aprobar, y
  // perderlo al refrescar obligaría a repasar los puntos otra vez.
  const { marcas: marcasGuia, comentarios: comentariosGuia, marcar: marcarGuia } = useMarcasRevision(idsParaRevisar, miId);
  const [guiaAbierta, setGuiaAbierta] = useState(true);
  // Sube al pedir una visita: recarga el hilo de notas para enseñar la nota nueva.
  const [visitasPedidas, setVisitasPedidas] = useState(0);

  // ¿Está escaneado el parte? `null` = todavía sin comprobar, y ahí se pinta el
  // marco: lo normal es que exista, y esperar a la comprobación metería un
  // parpadeo en todos los pedidos por culpa de los pocos que faltan. Solo un
  // 404 explícito lo da por ausente; sin red o con el share caído se sigue
  // intentando enseñar, que esconder el parte por un fallo de camino sería
  // peor. Copiado del drawer del Historial, que ya lo resolvió así.
  const [scanExiste, setScanExiste] = useState<boolean | null>(null);
  const scanUrl = pedido?.scanUrl ?? null;
  useEffect(() => {
    if (!scanUrl) return;
    let vivo = true;
    const id = setTimeout(() => {
      setScanExiste(null);
      fetch(scanUrl, { method: "HEAD" })
        .then((r) => {
          if (vivo) setScanExiste(r.status !== 404);
        })
        .catch(() => {
          if (vivo) setScanExiste(true);
        });
    }, 0);
    return () => {
      vivo = false;
      clearTimeout(id);
    };
  }, [scanUrl]);

  // Cambiar de pedido cierra lo que se hubiera desplegado: haber mirado las
  // detenidas de uno no es motivo para abrir el siguiente ya destripado.
  if (pedido && pedido.id !== ultimoPedido) {
    setUltimoPedido(pedido.id);
    if (mostrar.size > 0) setMostrar(new Set());
    if (ofsCambiadas.size > 0) setOfsCambiadas(new Set());
    if (pidiendoRevisorPedido) setPidiendoRevisorPedido(null);
  }

  if (!pedido) return null;
  const opById = (id: string | null) => operarios.find((o) => o.id === id) ?? null;
  const esPdf = pedido.scanUrl?.toLowerCase().endsWith(".pdf") ?? false;
  // Estar aprobado no basta: quien pasa el pedido debe ser uno de sus autores.
  // La regla compartida con el servidor también excluye pedidos ya pasados.
  const listoParaCompletar = puedePasarAProduccion(pedido, miId);
  // Lo que de verdad hay que plantear, y lo que no, cada cosa en su cajón.
  const todasLasOF = pedido.ofs;
  const ofsDeOT = todasLasOF.filter((o) => grupoOculto(o) === null);
  // Las del pedido sin tarea de esta sección (ver `OFFuera`). Si una ya está
  // entre las OF de verdad —le pusieron tarea y el servidor aún no se ha
  // dado cuenta—, manda la de verdad: no puede salir en los dos sitios.
  const ofsFuera = ofsFueraVisibles(pedido);
  const ocultas = GRUPOS.map((g) => ({
    grupo: g,
    ofs: todasLasOF.filter((o) => grupoOculto(o) === g.id),
  })).filter((c) => c.ofs.length > 0);
  // Primero lo tuyo; debajo, en su orden, solo los cajones abiertos.
  const ofsVisibles = [
    ...ofsDeOT,
    ...ocultas.filter((c) => mostrar.has(c.grupo.id)).flatMap((c) => c.ofs),
  ];
  // Con muchas OF, cada una se pliega a su cabecera y se abre al pulsarla. Una
  // tarjeta abierta mide unos 290 px: con cinco, las notas, los documentos y
  // hasta la segunda OF quedaban muy por debajo del pliegue. La que alguien
  // está fichando sigue abierta, que es la que se está trabajando.
  //
  // Con DOS ya se pueden plegar a mano, pero salen abiertas: abiertas caben
  // (Iván, 27/11/2026, al compactar la tarjeta).
  const plegables = ofsVisibles.length >= 2;
  const plegadasDeEntrada = ofsVisibles.length >= PLEGAR_DESDE;
  // LA DEVUELTA SALE ABIERTA aunque el pedido tenga muchas OF (27/11/2026,
  // comité de la vista del autor): plegada, su «Qué corregir» quedaba a dos
  // clics de quien venía de la campana a corregirla.
  const abiertaDeEntrada = (of: OF) => !plegadasDeEntrada || correccionDe(of) === "a_corregir";
  const ofAbierta = (of: OF) =>
    !plegables || !!of.fichandoRol || abiertaDeEntrada(of) !== ofsCambiadas.has(of.id);
  const todasAbiertas = ofsVisibles.every(ofAbierta);
  const ponerTodas = (abiertas: boolean) =>
    setOfsCambiadas(new Set(ofsVisibles.filter((o) => abiertaDeEntrada(o) !== abiertas).map((o) => o.id)));
  // Cuántas vuelven a corregir, para el aviso de encima de la lista.
  const aCorregir = ofsVisibles.filter((o) => correccionDe(o) === "a_corregir");
  const puntosACorregir = aCorregir.reduce((n, o) => n + puntosDeLaNota(o.observacion), 0);
  const alternarOF = (id: string) =>
    setOfsCambiadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // Lo que se puede fichar de una tacada: solo lo que es trabajo de OT y admite
  // reloj. Las detenidas y las de taller no entran ni aunque estén desplegadas.
  //
  // Y solo PLANTEO: un fichaje corriendo tiene un único rol (ver el comentario
  // de `ofsFichablesDe`), así que meter aquí una OF que está en revisión le
  // ficharía la revisión como si fuera planteo, a nombre de quien pulse.
  const fichablesDeOT = ofsDeOT.filter((o) => esFichable(o) && rolFichajeDe(o) === "plantear");
  // Y EN BLOQUE, solo trabajo MÍO pendiente (Iván, 26/11/2026): ni las ya
  // aprobadas ni las de otra persona. «Fichar las 13» en un pedido de Alberto
  // fichaba sus 13 OF a nombre de quien pulsaba, y en uno mezclado se llevaba
  // también la aprobada. Las aprobadas se siguen pudiendo fichar UNA A UNA
  // desde su fila (el retoque de última hora, ver `esFichable`), y las de otro
  // van a «⋯ → Fichar para ayudar», que dice lo que hace.
  const esMiaOLibre = (o: OF) => o.autorId === null || o.autorId === miId;
  const fichablesMias = fichablesDeOT.filter((o) => o.estado !== "aprobada" && esMiaOLibre(o));
  const fichablesAjenas = fichablesDeOT.filter((o) => o.estado !== "aprobada" && !esMiaOLibre(o));
  // Las de ESTE pedido que corren en MI reloj. `esFichable` no mira si la OF ya
  // se está fichando, así que sin esto el botón de arriba seguía diciendo
  // "Fichar las N" con el reloj ya en marcha: no cambiaba nunca a "Pausar".
  const fichandoYo = ofsDeOT.filter((o) => ofIdsFichandoYo?.has(o.id));
  // Lo que puedo hacer con cada OF EN ESTA SECCIÓN: donde nadie revisa, sin
  // nada de revisión (ver `accionOcultaSinRevision`). Los botones del bloque
  // salen todos de aquí, igual que los de la fila.
  const accionesDe = (o: OF) =>
    accionesDisponibles(o, miId).filter((a) => !accionOcultaSinRevision(seccion, a.id));

  // ── Las OF del pedido que YO puedo mandar a revisar ahora mismo ──────────
  // El planteo se termina pedido a pedido, no OF a OF: quien plantea un parte
  // de cuatro OF las acaba a la vez y las manda juntas. Había que abrir cada
  // una, pulsar su "Pasar a revisión" y elegir revisor CUATRO veces, siempre el
  // mismo. La máquina de estados sigue siendo por OF —una puede quedarse atrás
  // y se manda sola desde su fila—; lo que cambia es que hay un camino para el
  // caso normal.
  const paraRevisar = ofsDeOT.filter((o) =>
    accionesDe(o).some((a) => a.id === "terminar_planteo"),
  );

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
    (o) => !seccion.sinRevision && esFichable(o) && rolFichajeDe(o) === "revisar" && o.revisorId === miId,
  );
  const paraAprobar = ofsDeOT.filter((o) =>
    accionesDe(o).some((a) => a.id === "aprobar"),
  );
  const paraDevolver = ofsDeOT.filter((o) =>
    accionesDe(o).some((a) => a.id === "devolver"),
  );
  // Aprobar de golpe pide confirmación, como la de una sola: es el final del
  // camino y multiplicado por ocho, más.
  const defAprobar = ACCIONES.find((a) => a.id === "aprobar")!;
  // Las devueltas que YO ya he corregido y puedo dar por buenas sin otra
  // vuelta de revisión. Con varias en el mismo pedido había que ir OF por OF,
  // abriendo el "⋯" de cada una; ahora sale también de una tacada, con su
  // confirmación en plural.
  const paraCorregir = ofsDeOT.filter((o) =>
    accionesDe(o).some((a) => a.id === "aprobar_corregida"),
  );
  // Las que mandé a revisar y quiero volver a tocar. Mandar el pedido entero a
  // revisión es UN gesto, y deshacerlo eran tantos como OF: abrir el "⋯" de
  // cada una y confirmar. Mismo criterio que "Dar por corregidas las N".
  // OF de OTRA persona que todavía se pueden traspasar: las que se ofrecen a
  // coger, una a una y de golpe. Mismo gesto que "Coger" en el panel de un
  // compañero, y con la misma confirmación (la lleva el Board).
  const paraCoger = ofsDeOT.filter(
    (o) => !!onCoger && !!miId && o.autorId !== null && o.autorId !== miId && puedeTraspasarAutor(o),
  );
  const paraRecuperar = ofsDeOT.filter((o) =>
    accionesDe(o).some((a) => a.id === "recuperar_planteo"),
  );
  // «Dar por terminada en RPS» no se ofrece en la ÚLTIMA OF que queda: si al
  // aprobar esta el pedido quedara listo para pasar, lo que toca es «Pasar a
  // Producción», que además lo saca del panel. La máquina de estados no puede
  // mirarlo porque no conoce el pedido (ver `cerrar_en_rps` en acciones.ts); la
  // ruta lo vuelve a comprobar con el mismo cálculo.
  const esLaUltimaQueQueda = (o: OF) =>
    pedidoListoParaPasar({
      ...pedido,
      ofs: pedido.ofs.map((x) => (x.id === o.id ? { ...x, estado: "aprobada" as const } : x)),
    });
  const defRecuperar = {
    ...ACCIONES.find((a) => a.id === "recuperar_planteo")!,
    confirmar: `Las ${paraRecuperar.length} OF vuelven a tu planteo y desaparecen de la lista de quien las iba a revisar. El tiempo ya fichado se conserva.`,
  };
  const defCorregidas = {
    ...ACCIONES.find((a) => a.id === "aprobar_corregida")!,
    confirmar: `Las ${paraCorregir.length} OF quedan aprobadas sin pasar otra vez por revisión.`,
  };
  // «Dar por buenas las N sin revisión» ya no está en el "⋯" del pedido
  // (Iván, 27/11/2026): en su sitio, «Fichar en varias…». Una a una sigue en
  // el "⋯" de cada OF.

  // «Fichar en varias…»: elegir en qué OF de planteo se pone el reloj, sin ir
  // una por una. De serie, las mías sin aprobar (lo mismo que «Fichar las N»);
  // las aprobadas (un retoque) y las de otra persona (echar una mano) salen
  // sin marcar. Las que ya corren en mi reloj, apagadas.
  const paraFicharLista = fichablesDeOT;
  const libresParaFichar = paraFicharLista.filter((o) => !ofIdsFichandoYo?.has(o.id));
  // Impresión Digital: un solo gesto, «Impreso», que aprueba y pasa (ver
  // lib/impreso.ts). Solo existe donde el Board lo ofrece. Con él, los botones
  // de bloque de "Pasar a revisión" y "Dar por buenas sin revisión" no salen:
  // serían otro camino al mismo sitio, y el primero a una revisión que aquí
  // no hace nadie.
  const paraImpreso = onImpreso ? ofsParaImpreso(pedido, miId) : [];
  // `useConfirmacion` habla en `AccionDef`; de la acción solo se usan el
  // título, el tono y el texto, así que se parte de la más parecida —aprobar
  // sin revisión, que es lo que hace la primera mitad— y se cambia lo que se lee.
  //
  // El nombre y el aviso, de la sección: «Impreso» en Impresión, «Finalizar
  // todo» en Diseño. Y en Diseño va al pie, no al bloque (ver `finalizarAbajo`).
  const defImpreso = {
    ...ACCIONES.find((a) => a.id === "aprobar_sin_revision")!,
    label: seccion.finalizar?.pedido ?? "Impreso",
    tono: "primaria" as const,
    confirmar:
      seccion.finalizar?.confirmar ??
      "El pedido queda impreso y pasa a Producción: sale del tablero y sus fases se cierran en OLANET. Si falta algo por imprimir, no lo pulses.",
  };
  const finalizarAbajo = !!seccion.finalizar?.of;

  // Con la revisión por pedido, el bloque del pedido es el ÚNICO sitio donde
  // están estas acciones, así que tiene que salir también con una sola OF.
  const porPedido = seccion.revisionPorPedido ?? false;
  const minimoDelBloque = porPedido ? 1 : 2;

  // Las candidatas que de verdad se mandarían si se pulsa el botón del bloque.
  //
  // En Oficina Técnica esta lista es `paraRevisar` tal cual: el guardián de
  // más abajo sigue siendo "no hay nada fichándose en el pedido" —igual que
  // siempre—, así que aquí no hace falta quitar nada. Tocar esto cambiaría la
  // conducta de OT, que es justo lo que no puede pasar.
  //
  // En Diseño, en cambio, el bloque es el ÚNICO camino para pasar una OF a
  // revisión: la fila lo quita a propósito en las secciones `porPedido` (ver
  // `ACCIONES_DEL_PEDIDO`). Con el guardián de OT tal cual, fichar UNA sola OF
  // del pedido —lo más normal del día— bloqueaba TODAS las demás aunque
  // estuvieran listas, sin ninguna puerta alternativa donde mandarlas. Aquí se
  // saca del envío la que estoy fichando yo mismo —no puede irse a revisión
  // con el reloj corriendo encima, que es la razón de ser de la guarda
  // original, y sigue en pie para ESA OF— pero ya no arrastra a las demás del
  // mismo pedido.
  const paraRevisarBloque = porPedido
    ? paraRevisar.filter((o) => !fichandoYo.some((f) => f.id === o.id))
    : paraRevisar;
  // Aviso de "para el reloj primero". En OT tal cual estaba: cualquier ficha en
  // marcha en el pedido lo dispara, porque allí el bloque es todo o nada. En
  // Diseño solo tiene sentido si YA no queda nada que mandar sin pausar —si
  // aún hay otras OF sueltas, es el propio botón el que las ofrece, y este
  // aviso al lado suyo solo confundiría—.
  const avisoPausarPrimero = porPedido
    ? fichandoYo.length > 0 && paraRevisarBloque.length === 0 && paraRevisar.length > 0
    : fichandoYo.length > 0 && paraRevisar.length > 0;
  // Las que salen en el botón del bloque. Con el reloj frenándolo, las que se
  // mandarían al pausar: el botón se queda en su sitio, desactivado, en vez de
  // desaparecer y mover la ficha.
  const pasarBloque = avisoPausarPrimero ? paraRevisar : paraRevisarBloque;
  // Un solo revisor para todas: solo se puede si el autor es el MISMO en todas,
  // porque el revisor no puede ser el autor y con dos autores no hay un único
  // "todos menos tú" que valga para el grupo. Con autores distintos cada OF se
  // manda desde su fila, que es donde se ve de quién es cada una.
  const autoresDe = (ofs: OF[]) => new Set(ofs.map((o) => o.autorId)).size;
  // Las de planteo del pedido que NO entran en «Fichar» en bloque, con su
  // porqué: lo dice el `title` del botón y se apagan al pasar el ratón. Solo
  // cuando el botón existe —con todo fuera, no hay botón que explicar—.
  const fueraDeFichar: { of: OF; motivo: string }[] =
    fichablesMias.length > 1
      ? ofsDeOT
          .filter((o) => rolFichajeDe(o) === "plantear" && !fichablesMias.includes(o))
          .map((o) => ({
            of: o,
            motivo:
              o.estado === "aprobada"
                ? "ya aprobada"
                : !esMiaOLibre(o)
                  ? `es de ${opById(o.autorId)?.nombre.split(" ")[0] ?? "otra persona"}`
                  : (motivoNoFichable(o)?.toLowerCase() ?? "no se puede fichar"),
          }))
      : [];
  /** Lo que marca un botón del bloque al pasar el ratón. */
  const resaltar = (entran: OF[], fuera: { of: OF }[] | OF[], rol: Rol) => ({
    onMouseEnter: () =>
      setResalte({
        entran: new Set(entran.map((o) => o.id)),
        fuera: new Set(fuera.map((f) => ("of" in f ? f.of.id : f.id))),
        rol,
      }),
    onMouseLeave: () => setResalte(null),
    onFocus: () =>
      setResalte({
        entran: new Set(entran.map((o) => o.id)),
        fuera: new Set(fuera.map((f) => ("of" in f ? f.of.id : f.id))),
        rol,
      }),
    onBlur: () => setResalte(null),
  });

  // LO QUE YO TENGO QUE REVISAR en este pedido, haya empezado ya o no.
  //
  // Es lo que decide si sale la guía, y no `paraDevolver` como estaba: devolver
  // exige que la OF esté YA en revisión y que la haya cogido yo, así que al
  // revisor que abre la ficha nada más asignársela —o antes de fichar— no le
  // salía ningún punto. Justo cuando más sirven: son los que va a mirar ahora.
  const miasParaRevisar = ofsDeOT.filter(
    (o) => !seccion.sinRevision && o.revisorId === miId && (o.estado === "por_revisar" || o.estado === "en_revision"),
  );

  const familiasDelPedido = [
    ...new Set(ofsDeOT.map((o) => o.familia).filter(Boolean) as string[]),
  ];
  const puntosGuia = guiaDeFamilias(pasosRevision, causasRevision, familiasDelPedido);
  // Lo que falla, con su causa y lo que se escribió: llega relleno al devolver.
  const fallosGuia = fallosDeLaGuia(puntosGuia, marcasGuia, comentariosGuia);
  // Segunda vuelta: los pasos que fallaron en la devolución anterior de las OF
  // que se están revisando (la nota se queda en la OF hasta la siguiente).
  const fallaronAntes = new Set(
    ofsDeOT
      .filter((o) => idsParaRevisar.includes(o.id))
      .flatMap((o) => leerDevolucion(o.observacion).pasos ?? []),
  );
  // Se marca solo lo que falla (Iván, 27/11/2026): no se aprueba con una ✗
  // puesta, ni se devuelve una ✗ sin decir qué falla. Ver `bloqueosDeLaGuia`.
  const { aprobar: impedidoPorGuia, devolver: impedidoDevolver } = bloqueosDeLaGuia(
    puntosGuia,
    marcasGuia,
    comentariosGuia,
  );

  // En solo lectura no: abre la herramienta donde se TRABAJA el planteo, y
  // Dirección no plantea (aunque no escriba en CoordinaOT, es un botón de
  // hacer, no de mirar).
  // El rótulo dice lo que toca —Plantear, Corregir, Revisar o Abrir— y, salvo
  // para plantear, abre el pedido en Pedidos de aquella web (ver
  // `botonPlantear`). Con `miId`, «Corregir» solo le sale al autor.
  const plantear = soloLectura ? null : botonPlantear(pedido.codigo, pedido.ofs, miId, pedido.cliente);
  const reloj = miFichaje?.(pedido.id);

  return (
    <MarcoFicha
      etiqueta={`Pedido ${pedido.codigo}`}
      onCerrar={onClose}
      cabecera={
        <CabeceraFicha
          codigo={pedido.codigo}
          prioridad={pedido.prioridad}
          cliente={pedido.cliente}
          negocio={pedido.negocio}
          datos={[
            `${piezasTotal(pedido)} ${piezasTotal(pedido) === 1 ? "pieza" : "piezas"}`,
            ...(pedido.ciudadEntrega ? [pedido.ciudadEntrega] : []),
          ]}
          familias={[...new Set(pedido.ofs.map((o) => o.familia))]}
          extra={
            <div className="flex items-center gap-2 text-xs">
              {/* En solo lectura se ve QUIÉN lleva el pedido, sin poder
                  cambiarlo: es lo primero que busca Dirección en la ficha. */}
              {soloLectura ? (
                <>
                  <span className="font-semibold text-text-muted">Autor</span>
                  <span className="text-text">
                    {pedido.ofs.every((of) => of.autorId === pedido.ofs[0].autorId)
                      ? pedido.ofs[0].autorId
                        ? (operarios.find((o) => o.id === pedido.ofs[0].autorId)?.nombre ?? pedido.ofs[0].autorId)
                        : "Sin asignar"
                      : "Varios"}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-semibold text-text-muted">Autor</span>
                  {/* Pegado al rótulo, sin `ml-auto`: al otro lado del panel dejaba
                      un hueco de 250 px entre "Autor" y el nombre. */}
                  <div>
                    <Select
                      value={
                        pedido.ofs.every((of) => of.autorId === pedido.ofs[0].autorId)
                          ? pedido.ofs[0].autorId
                          : null
                      }
                      onChange={(v) => onAssignPedido(v)}
                      placeholder="Sin asignar"
                      // Repartido entre varios (o a medias): "Varios", y así
                      // "Quitar autor" se puede elegir y suelta el pedido entero.
                      textoMixto={pedido.ofs.some((of) => of.autorId) ? "Varios" : undefined}
                      // La opción de vaciar dice lo que HACE, no el estado en que
                      // deja las cosas: "Sin asignar" a secas se leía como el rótulo
                      // del selector vacío y nadie caía en que ahí estaba la forma de
                      // devolver un pedido a la bandeja.
                      etiquetaVaciar="Quitar autor · vuelve a Sin asignar"
                      options={opcionesOperario(operarios, miId)}
                      plano
                      // El selector va a la derecha del panel (08/11/2026):
                      // anclado por la izquierda, el menú se salía por el borde.
                      alignRight
                    />
                  </div>
                </>
              )}
            </div>
          }
          // Abre Planteamientos TGM con ESTE pedido ya buscado, en otra
          // pestaña, y su CAD. En la fila del código, junto a la ✕, igual que
          // en el Historial (Iván, 08/11/2026). De color sólido, a propósito:
          // escondido entre las acciones de cada OF no lo encontraba nadie.
          acciones={
            <div className="flex items-center gap-2">
              {!soloLectura && (
                <PedirVisita pedido={pedido} operarios={operarios} miId={miId} onPedida={() => setVisitasPedidas((n) => n + 1)} />
              )}
              <AtajosPedido codigo={pedido.codigo} plantear={plantear} />
            </div>
          }
        />
      }
      // Solo cuando hay algo que hacer. La regla de los roles, que iba aquí
      // en todas las fichas, pasó al ⓘ junto al autor, en la cabecera.
      //
      // Mi reloj en marcha va aquí, al pie, debajo de los botones (Iván,
      // 27/11/2026): junto al código no cabía con «Pedir visita» y los
      // atajos, y con línea propia arriba empujaba la ficha al empezar.
      pie={
        reloj || listoParaCompletar || (pedido.recuperado && !soloLectura) ||
        (finalizarAbajo && paraImpreso.length > 0 && !soloLectura) ? (
        <>
          {/* «Finalizar todo» (Diseño): donde y como «Pasar a Producción»,
              porque hace eso mismo y además da por hechas las OF que quedan.
              Cuando ya están todas finalizadas no sale (`paraImpreso` vacío) y
              queda solo el de pasar. */}
          {!soloLectura && finalizarAbajo && paraImpreso.length > 0 && (
            <button
              onClick={() => {
                pedidoAImprimir.current = pedido.id;
                confirmacionImpreso.pedirConfirmacion(defImpreso);
              }}
              title="Da por terminadas las OF que quedan y pasa el pedido a Producción"
              className="boton-3d mb-2 w-full rounded-lg bg-cyan-700 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-800"
            >
              ✔ {defImpreso.label}
            </button>
          )}
          {/* La confirmación la pone el Board, que es quien ejecuta: este mismo
              botón está también en la fila del tablero y no puede preguntar
              cada uno lo suyo (ver `pasarAProduccionPendiente`). */}
          {!soloLectura && listoParaCompletar && (
            <button
              onClick={() => onCompletar(pedido.id)}
              className="boton-3d mb-2 w-full rounded-lg bg-cyan-700 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-800"
            >
              📦 Pasar a Producción
            </button>
          )}
          {/* Sobre todo para el recuperado que luego paran: así no se puede
              pasar, y sin esto se quedaba en el panel (21/10/2026). */}
          {!soloLectura && pedido.recuperado && (
            <DevolverAlHistorial pedido={pedido.codigo} seccion={seccion.id} miId={miId} onDevuelto={onClose} />
          )}
          {reloj}
        </>
        ) : undefined
      }
      // La confirmación de "Aprobar las N". Cuelga del marco y no de la fila
      // de botones porque el cuadro se pinta en un portal y lo único que
      // necesita es estar montado mientras la ficha lo esté.
      encima={
        <>
          {confirmacionPedido.dialogo}
          <ConfirmDialog
            abierto={eligiendoFichar}
            titulo={`Fichar en OF de ${pedido.codigo}`}
            ancho
            textoConfirmar={marcadasFichar.size > 1 ? `Fichar las ${marcadasFichar.size}` : "Fichar"}
            confirmarDesactivado={marcadasFichar.size === 0}
            mensaje={
              <>
                <p className="text-sm text-text">
                  Marca las OF en las que vas a trabajar: tu reloj se pone en marcha en todas a la vez.
                </p>
                <section className="mt-4 rounded-2xl bg-[var(--recuadro)] p-3">
                  <h4 className="mb-1 text-[11px] font-semibold text-text-muted">En qué OF fichas</h4>
                  <div className="mb-2 flex items-center gap-3 text-[11px]">
                    <span className="text-text-muted">{marcadasFichar.size} de {libresParaFichar.length} marcadas</span>
                    <span className="ml-auto flex gap-1">
                      <button type="button" className="chip-3d rounded-full px-2.5 py-0.5 font-semibold text-text disabled:opacity-40" disabled={marcadasFichar.size === libresParaFichar.length} onClick={() => setMarcadasFichar(new Set(libresParaFichar.map((o) => o.id)))}>
                        Marcar todas
                      </button>
                      <button type="button" className="chip-3d rounded-full px-2.5 py-0.5 font-semibold text-text disabled:opacity-40" disabled={marcadasFichar.size === 0} onClick={() => setMarcadasFichar(new Set())}>
                        Ninguna
                      </button>
                    </span>
                  </div>
                  <div className="-mx-1 flex max-h-[55vh] flex-col gap-2 overflow-y-auto p-1">
                    {paraFicharLista.map((o) => {
                      const yaLaFicho = !!ofIdsFichandoYo?.has(o.id);
                      const autor = !esMiaOLibre(o) ? (operarios.find((x) => x.id === o.autorId)?.nombre ?? "otra persona") : null;
                      return (
                        <CasillaFila
                          key={o.id}
                          marcada={yaLaFicho || marcadasFichar.has(o.id)}
                          desactivada={yaLaFicho}
                          onCambiar={(marcar) =>
                            setMarcadasFichar((prev) => {
                              const m = new Set(prev);
                              if (marcar) m.add(o.id);
                              else m.delete(o.id);
                              return m;
                            })
                          }
                        >
                          <span className="flex min-w-0 items-baseline gap-1.5">
                            <b className="shrink-0 font-semibold">{o.codigo}</b>
                            {o.descripcion && <span className="truncate text-text-muted">{o.descripcion}</span>}
                          </span>
                          {yaLaFicho && <span className="mt-0.5 block">Ya la estás fichando</span>}
                          {!yaLaFicho && autor && <span className="mt-0.5 block">De {autor}: le echas una mano, sigue siendo suya</span>}
                          {!yaLaFicho && o.estado === "aprobada" && <span className="mt-0.5 block">Aprobada: para un retoque</span>}
                        </CasillaFila>
                      );
                    })}
                  </div>
                </section>
              </>
            }
            onConfirmar={() => {
              const ids = [...marcadasFichar];
              setEligiendoFichar(false);
              if (ids.length > 0) onFichar(ids, "plantear");
            }}
            onCancelar={() => setEligiendoFichar(false)}
          />
          {confirmacionImpreso.dialogo}
        </>
      }
      // PDF del pedido en grande, ocupando todo el hueco a la izquierda.
      visor={
        <>
          {/* SE COMPRUEBA QUE EL PDF ESTÁ ANTES DE PONERLO EN EL MARCO. Un
              pedido de hoy suele llegar antes de que alguien escanee su parte
              (AR.26.04359 llegó el 04/09 y en el share los escaneos de ese día
              iban tres pedidos por detrás), y el visor del navegador enseñaba
              su propia página de error —"PDF no encontrado", en crudo, sobre
              fondo blanco—, que se lee como que la web está rota. Mismo
              criterio que el drawer del Historial. */}
          {esPdf && scanExiste !== false ? (
            // El mismo parte que la ficha del Historial: sin la barra gris de
            // Chrome y con los botones de descargar, imprimir y ampliar en el
            // idioma de la casa. Estaba solo allí y aquí se quedó el visor
            // crudo (ver ParteEscaneado).
            <ParteEscaneado codigo={pedido.codigo} scanUrl={pedido.scanUrl!} />
          ) : (
            <div
              onClick={(e) => e.stopPropagation()}
              className="my-4 h-[calc(100%-2rem)] w-full p-4"
            >
              <PedidoScan pedido={pedido} conAviso />
            </div>
          )}
        </>
      }
    >
          {avisoRevision}
          <LineaTiempoPedido pedido={pedido} />

          {avisosCierreRps?.pedido === pedido.codigo && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2"
            >
              <div className="min-w-0 flex-1 space-y-1">
                {avisosCierreRps.textos.map((t) => (
                  <p key={t} className="text-[11px] leading-snug text-text">{t}</p>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setAvisosCierreRps(null)}
                className="chip-3d shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-text-muted hover:text-text"
              >
                Vale
              </button>
            </div>
          )}

          {/* EL ORDEN: recorrido, aviso de parte nuevo, notas, documentos y
              tareas (plegados, una línea cada uno), las OF (con Fichar, Revisar,
              Anular) y el comentario del pedido. Las OF estaban lo último, debajo de ocho
              líneas de comentario legal, cuatro bloques y el selector de autor:
              para fichar había que bajar siempre. El autor subió a la cabecera. */}
          {/* Encima del hilo, y lo primero que se ve tras el parte: si han
              vuelto a escanearlo, eso condiciona todo lo que se lea debajo. */}
          {pedido.scanCambiado && (
            <AvisoParteNuevo key={`aviso:${pedido.codigo}`} pedido={pedido.codigo} />
          )}

          {/* El hilo de notas de OT, ANTES de las OF: es el recado que alguien
              dejó sobre este pedido ("el cliente cambió la medida") y hay que
              leerlo antes de ponerse. Debajo de las OF, en un pedido de cinco,
              quedaba fuera de la vista y se trabajaba sin haberlo visto.
              Panel, Pendientes y Revisiones abren ESTE mismo Drawer, así que el
              revisor ve el hilo al abrir el pedido sin nada más que hacer.
              El `key` con el código: al saltar de pedido sin cerrar el drawer
              (Ctrl+K abre el buscador aunque esté delante) React desmonta y
              vuelve a montar, así no queda ni un frame con el hilo del anterior.
              NO sustituye a los guards de dentro del componente: esos cubren
              las carreras DENTRO de un mismo pedido. */}
          {/* Si Calidad abrió una NC por este pedido, o este pedido es la
              rectificación de otro. Solo sale si hay algo (ver el componente). */}
          <NoConformidadesPedido key={`nc:${pedido.codigo}`} pedido={pedido.codigo} onAbrirPedido={onAbrirPedidoPorCodigo} />
          <NotasPedido
            key={`notas:${pedido.codigo}:${visitasPedidas}`}
            pedido={pedido.codigo}
            miId={miId}
            operarios={operarios}
          />

          {/* Lo que RPS tiene colgado: la rotulación, el planteamiento y las
              fotos. Va ANTES del hilo de notas y después del parte porque es
              del mismo orden de lectura: primero lo que hay que mirar para
              hacer el trabajo, después lo que se ha dicho sobre él.

              Plegado, y se pide solo al desplegarlo: son dos tablas grandes de
              RPS por pedido y la mayoría de las veces la ficha se abre para
              fichar, no para mirar documentos. El `key` con el código, por lo
              mismo que el hilo de notas de abajo. */}
          <DocumentosPedido key={`docs:${pedido.codigo}`} pedido={pedido.codigo} />

          {/* Qué tareas lleva el pedido en RPS y cuánto se ha echado en cada
              una. Es el mismo bloque del Historial, pero aquí sirve para un
              pedido A MEDIAS: enseña lo imputado hasta ahora. Se pide al
              pulsar, no al abrir la ficha (ver TareasDelPedido). */}
          <TareasDelPedido
            key={`tareas:${pedido.codigo}`}
            pedido={pedido.codigo}
            seccion={seccion.id}
          />

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
              <FasesSinFinalizar ofs={ofsDeOT.map((o) => o.codigo)} miId={miId} seccion={seccion} />
            </div>
          )}

          {/* OFs: el trabajo de OT arriba, lo demás en cajones (ver GRUPOS).

              LA FILA SE PARTE (`flex-wrap`). En un pedido que tenga a la vez
              trabajo por fichar, devueltas corregidas y OF listas para revisar
              salen TRES botones a la vez —"Fichar las 3", "Dar por corregidas
              las 2", "Pasar las 2 a revisión"— y en un panel de 32rem no caben
              en la línea del rótulo: el último se salía por el borde derecho y
              no se podía ni leer ni pulsar.
              Ahora van SIEMPRE en su propia fila, debajo del rótulo: con el
              salto automático bailaban, en la línea del texto o debajo según
              cuántos salieran en cada momento. */}
          <div data-bloque="ofs" className="cabecera-bloque mb-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <AcentoBloque tipo="ofs" />
            <h3 className={TITULO_BLOQUE}>
              Órdenes de fabricación ({ofsDeOT.length})
              {/* También las que no tienen tarea de esta sección: están en el
                  pedido aunque no se trabajen aquí. */}
              {ofsDeOT.length !== pedido.ofs.length + ofsFuera.length && (
                <span className="ml-1.5 font-normal normal-case tracking-normal">
                  · {pedido.ofs.length - ofsDeOT.length + ofsFuera.length} más en el pedido
                </span>
              )}
            </h3>
            {plegables && (
              <button
                type="button"
                onClick={() => ponerTodas(!todasAbiertas)}
                className="text-[11px] font-semibold text-brand-800 hover:underline dark:text-brand-300"
              >
                {todasAbiertas ? "Plegar todas" : "Abrir todas"}
              </button>
            )}
          </div>
            {/* Fichar el pedido entero sin ir OF por OF. Solo con más de una:
                con una sola, este botón y el de su fila harían lo mismo y
                sobraría uno. Cada OF conserva el suyo debajo, que es lo que se
                usa cuando de verdad solo tocas una. */}
            {/* Fila propia, pegada a la derecha; `flex-wrap` para que, si no
                caben, se partan entre sí en vez de desbordar. `empty:hidden`:
                sin botones no deja hueco. */}
            {/* LA BARRA DEL BLOQUE (rediseño del 26/11/2026, comité + Iván).
                A la IZQUIERDA, bajo el título, en el mismo lado que los botones
                de cada OF (antes iba a la derecha y la de cada OF a la
                izquierda). Todos los botones del mismo tamaño (`BOTON_BLOQUE`).
                Sin texto debajo: al pasar el ratón por un botón se marcan las
                OF a las que afecta, y si alguna se queda fuera su `title` dice
                cuál y por qué. Lo poco frecuente, en «⋯».
                `flex-wrap` para que, si no caben, se partan entre sí en vez de
                desbordar; `empty:hidden`: sin botones no deja hueco. */}
            {!soloLectura && (
              <div className="mb-2 flex flex-wrap items-center gap-1 empty:hidden">
                {pidiendoRevisorPedido ? (
                  // Mientras se elige revisor, los nombres ocupan el sitio de
                  // los botones: la ficha no crece (Iván, 26/11/2026).
                  <PedirRevisor
                    operarios={operarios}
                    excluirIds={pidiendoRevisorPedido.map((o) => o.autorId)}
                    onAbandonado={() => onSinRevisor?.(pidiendoRevisorPedido.map((o) => o.codigo))}
                    // Se cierra AL ELEGIR, sin esperar al servidor: el pase ya se
                    // pinta al momento (ver `pasarRevision` en Board) y, si falla,
                    // las OF vuelven y el error sale en la ficha.
                    onConfirmar={(rev) => {
                      const ids = pidiendoRevisorPedido.map((o) => o.id);
                      setPidiendoRevisorPedido(null);
                      void onPasarRevision(ids, rev);
                    }}
                    onCancelar={() => setPidiendoRevisorPedido(null)}
                  />
                ) : (
                  <>
                {/* Con el reloj MÍO en marcha aquí, este botón para; si no, ficha.
                    Con UNA sola OF fichándose, la pausa está en su fila (Iván,
                    16/10/2026), igual que «Fichar», que solo sale con más de una. */}
                {fichandoYo.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => onDesficharVarias(fichandoYo.map((o) => o.id))}
                    {...resaltar(fichandoYo, [], fichandoYo.some((o) => o.fichandoRol === "revisar") ? "revisar" : "plantear")}
                    title={`Para el reloj en las ${fichandoYo.length} OF que estás fichando de este pedido. Siguen como están: no se cierra nada.`}
                    // Del color del rol que corre: revisando salía verde,
                    // como si se estuviera planteando (Iván, 16/10/2026).
                    className={`${BOTON_BLOQUE} ${
                      fichandoYo.some((o) => o.fichandoRol === "revisar") ? ROL.revisar.solido : ROL.plantear.solido
                    }`}
                  >
                    Pausar las {fichandoYo.length}
                  </button>
                ) : (
                  fichablesMias.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onFichar(fichablesMias.map((o) => o.id), "plantear")}
                      {...resaltar(fichablesMias, fueraDeFichar, "plantear")}
                      title={
                        fueraDeFichar.length > 0
                          ? `Fuera: ${fueraDeFichar.map((f) => `${f.of.codigo} ${f.motivo}`).join(" · ")}`
                          : `Pone el reloj en marcha en las ${fichablesMias.length} OF de planteo de este pedido`
                      }
                      className={`${BOTON_BLOQUE} ${ROL.plantear.solido}`}
                    >
                      {/* Reanudar no es empezar: las mismas palabras que la fila
                          del tablero. Y «3 de 5» cuando alguna se queda fuera. */}
                      {fichablesMias.some((o) => o.tiempoPlanteoMin > 0) ? "Reanudar" : "Fichar"}{" "}
                      {fueraDeFichar.length > 0
                        ? `${fichablesMias.length} de ${fichablesMias.length + fueraDeFichar.length}`
                        : `las ${fichablesMias.length}`}
                    </button>
                  )
                )}
                {/* Empezar la revisión de todas: es el reloj quien las pasa a
                    "En revisión". */}
                {fichandoYo.length === 0 && paraEmpezarRevision.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onFichar(paraEmpezarRevision.map((o) => o.id), "revisar")}
                    {...resaltar(paraEmpezarRevision, [], "revisar")}
                    title={`Pasa a "En revisión" las ${paraEmpezarRevision.length} OF que te tocan de este pedido y pone tu reloj en marcha`}
                    className={`${BOTON_BLOQUE} ${ROL.revisar.solido}`}
                  >
                    Revisar las {paraEmpezarRevision.length}
                  </button>
                )}
                {/* Darlas por buenas todas juntas, que es como se acaba un parte
                    que estaba bien. */}
                {paraAprobar.length >= minimoDelBloque && (
                  <button
                    type="button"
                    onClick={() => {
                      idsAConfirmar.current = paraAprobar.map((o) => o.id);
                      confirmacionPedido.pedirConfirmacion(defAprobar);
                    }}
                    {...resaltar(paraAprobar, [], "revisar")}
                    disabled={!!impedidoPorGuia}
                    title={impedidoPorGuia ?? `Aprueba las ${paraAprobar.length} OF de este pedido que estás revisando`}
                    className={`${BOTON_BLOQUE} ${BOTON_CIERRE}`}
                  >
                    {/* Con una sola OF (lo normal en Diseño) el número sobra. */}
                    {etiquetaCantidad("Aprobar", paraAprobar.length)}
                  </button>
                )}
                {/* «Impreso» va antes que «Pasar a revisión», en el sitio del
                    botón principal; donde existe, aquel no sale. */}
                {paraImpreso.length > 0 && !finalizarAbajo && (
                  <button
                    type="button"
                    onClick={() => {
                      pedidoAImprimir.current = pedido.id;
                      confirmacionImpreso.pedirConfirmacion(defImpreso);
                    }}
                    title="Da el pedido por impreso y lo pasa a Producción"
                    className={`${BOTON_BLOQUE} ${BOTON_CIERRE}`}
                  >
                    {defImpreso.label}
                  </button>
                )}
                {/* PASAR A REVISIÓN, en morado con borde: el color de la
                    revisión, y secundario al lado del verde de fichar (Iván:
                    «el color de fichar y pasar a revisión son muy parecidos»).
                    Con el reloj en marcha YA NO SALE APAGADO: al pulsarlo se
                    pausa y se piden los compañeros (antes había que pausar y
                    volver). Mientras se elige revisor, relleno. */}
                {!onImpreso &&
                  pasarBloque.length >= minimoDelBloque &&
                  (autoresDe(pasarBloque) === 1 || porPedido) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (pidiendoRevisorPedido) {
                        setPidiendoRevisorPedido(null);
                        return;
                      }
                      // Las OF elegidas no cambian si llega un sondeo mientras
                      // se busca al compañero. El servidor vuelve a validarlas.
                      if (avisoPausarPrimero) {
                        onDesficharVarias(fichandoYo.map((o) => o.id));
                        setPidiendoRevisorPedido(paraRevisar);
                      } else {
                        setPidiendoRevisorPedido(paraRevisarBloque);
                      }
                    }}
                    {...resaltar(pasarBloque, [], "revisar")}
                    aria-expanded={!!pidiendoRevisorPedido}
                    title={
                      avisoPausarPrimero
                        ? `Pausa el reloj y manda a revisar las ${pasarBloque.length} OF, todas al mismo revisor`
                        : `Da por terminado el planteo de las ${pasarBloque.length} OF y las manda a revisar, todas al mismo revisor`
                    }
                    className={`${BOTON_BLOQUE} ${
                      pidiendoRevisorPedido ? ROL.revisar.solido : BOTON_PASAR_REVISION
                    }`}
                  >
                    Pasar a revisión
                  </button>
                )}
                {/* Coger las de otra persona. En un pedido ajeno es LO PRINCIPAL
                    (antes destacaba «Fichar las 13», en verde): fichar en sus OF
                    va a «⋯ → Fichar para ayudar». Desde dos: con una, su fila. */}
                {paraCoger.length >= 2 && onCoger && (
                  <button
                    type="button"
                    onClick={() => onCoger(paraCoger.map((o) => o.id))}
                    {...resaltar(paraCoger, [], "plantear")}
                    title={`Pasa a tu panel las ${paraCoger.length} OF de este pedido que lleva otra persona`}
                    className={`${BOTON_BLOQUE} ${BOTON_NEUTRO}`}
                  >
                    {etiquetaCantidad("Coger", paraCoger.length)}
                  </button>
                )}
                <MenuMasBloque
                  opciones={[
                    ...(onDarPorTerminadas && !soloLectura && puedeDarPorTerminadas(pedido, miId)
                      ? [
                          {
                            id: "dar-por-terminadas",
                            label: "Dar por terminadas…",
                            title: "Eliges qué OF del pedido se dan por terminadas; las demás se quedan en el panel",
                            onClick: () => onDarPorTerminadas(pedido.id),
                          },
                        ]
                      : []),
                    ...(!soloLectura && libresParaFichar.length >= 2
                      ? [
                          {
                            id: "fichar-varias",
                            label: "Fichar en varias…",
                            title: "Eliges en qué OF del pedido se pone tu reloj",
                            onClick: () => {
                              setMarcadasFichar(new Set(
                                libresParaFichar.filter((o) => o.estado !== "aprobada" && esMiaOLibre(o)).map((o) => o.id),
                              ));
                              setEligiendoFichar(true);
                            },
                          },
                        ]
                      : []),
                    ...(fichandoYo.length <= 1 && fichablesMias.length <= 1 && fichablesAjenas.length > 1
                      ? [
                          {
                            id: "ayudar",
                            label: `Fichar para ayudar (${fichablesAjenas.length})`,
                            title: "Tu tiempo en sus OF; siguen siendo de quien las lleva",
                            onClick: () => onFichar(fichablesAjenas.map((o) => o.id), "plantear"),
                          },
                        ]
                      : []),
                    ...(paraCorregir.length >= 2
                      ? [
                          {
                            id: "corregidas",
                            label: etiquetaCantidad("Dar por corregidas", paraCorregir.length),
                            title: "Las devueltas que ya arreglaste, sin otra vuelta de revisión",
                            onClick: () => {
                              idsAConfirmar.current = paraCorregir.map((o) => o.id);
                              confirmacionPedido.pedirConfirmacion(defCorregidas);
                            },
                          },
                        ]
                      : []),
                    ...(paraRecuperar.length >= 2
                      ? [
                          {
                            id: "recuperar",
                            label: etiquetaCantidad("Recuperar", paraRecuperar.length),
                            title: "Vuelven a tu planteo las que mandaste a revisar",
                            onClick: () => {
                              idsAConfirmar.current = paraRecuperar.map((o) => o.id);
                              confirmacionPedido.pedirConfirmacion(defRecuperar);
                            },
                          },
                        ]
                      : []),
                  ]}
                />
                  </>
                )}
              </div>
            )}

          {/* LA GUÍA TAMBIÉN AQUÍ. Estaba solo en el panel de Revisiones, y
              revisar desde la ficha —que es donde se está cuando ya tienes el
              pedido abierto— dejaba fuera los ocho puntos y las causas
              marcadas. O se llevaba la guía aquí, o había que prohibir revisar
              desde la ficha; prohibirlo obligaba a cambiar de pestaña para algo
              de un clic, en el sitio donde el equipo está todo el día.
              Se marca lo que falla y llega puesto al cuadro de devolver, igual
              que allí. */}
          {!soloLectura && miasParaRevisar.length > 0 && (
            <div className="mb-2">
              <GuiaRevision
                puntos={puntosGuia}
                marcas={marcasGuia}
                onMarcar={marcarGuia}
                comentarios={comentariosGuia}
                fallaronAntes={fallaronAntes}
                abierta={guiaAbierta}
                onAbrir={setGuiaAbierta}
              />
            </div>
          )}

          {/* Devolver el parte entero. Va en su propia fila y no arriba con los
              demás porque al abrirse despliega el campo del motivo a lo ancho,
              y en la fila de botones no cabe. Mismo criterio que el selector de
              revisor de aquí debajo. */}
          {!soloLectura && paraDevolver.length >= minimoDelBloque && (
            <div className="mb-2 flex justify-start">
              <DevolverInline
                label={
                  fallosGuia.length > 0
                    ? `Devolver con ${fallosGuia.length} ${fallosGuia.length === 1 ? "fallo" : "fallos"}`
                    : // La rama de causas ya concuerda bien; esta es la que faltaba:
                      // con una sola OF (lo normal en Diseño) el número sobra.
                      etiquetaCantidad("Devolver", paraDevolver.length)
                }
                fallos={fallosGuia}
                familias={familiasDelPedido}
                // Faltaba: el de cada fila sí lo llevaba y este no.
                impedido={impedidoDevolver}
                claseBoton={`${BOTON_BLOQUE} ${BOTON_NEUTRO}`}
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

          {/* El revisor se elige una vez y vale para todas. Los compañeros van
              debajo del rótulo y pueden saltar de línea en paneles estrechos. */}

          {ofsDeOT.length === 0 && (
            <p className="mb-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-text-muted">
              Ninguna OF de este pedido es trabajo de {seccion.nombre} ahora mismo.
            </p>
          )}

          {/* EL AVISO DEL PEDIDO, solo con 2 o más devueltas: cuenta y señala
              para que no se pase ninguna; lo que hay que hacer está en cada OF.
              Con una sola sobra: su tarjeta ya sale abierta con la nota arriba. */}
          {aCorregir.length >= 2 && (
            <p
              role="status"
              className="mb-2 flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-error"
            >
              <span aria-hidden="true">↩</span>
              {aCorregir.length} OF vuelven con correcciones
              {puntosACorregir > 0 && ` · ${puntosACorregir} ${puntosACorregir === 1 ? "punto" : "puntos"}`}
            </p>
          )}

          {/* `mb-4`, el mismo aire que llevan todos los bloques de la ficha: sin
              él, el comentario del pedido quedaba pegado a la última OF. */}
          <ul className="mb-4 space-y-2.5">
            {ofsVisibles.map((of) => (
              <OFRow
                key={of.id}
                of={of}
                resalte={
                  resalte?.entran.has(of.id) ? resalte.rol : resalte?.fuera.has(of.id) ? "fuera" : undefined
                }
                pedidoCodigo={pedido.codigo}
                operarios={operarios}
                miId={miId}
                pedidoDeUnaOF={pedido.ofs.length === 1}
                revisionPorPedido={porPedido}
                seccion={seccion}
                esLaUltima={esLaUltimaQueQueda(of)}
                onCerradoEnRps={(id, cerradaRps, avisos) => {
                  if (avisos && avisos.length > 0) setAvisosCierreRps({ pedido: pedido.codigo, textos: avisos });
                  onCerradoEnRps(id, cerradaRps);
                }}
                opById={opById}
                onPasarRevision={onPasarRevision}
                onSinRevisor={onSinRevisor}
                onTraspasarAutor={onTraspasarAutor}
                onAccion={onAccion}
                onFichar={onFichar}
                impedidoRevision={impedidoPorGuia}
                impedidoDevolver={impedidoDevolver}
                fallosGuia={fallosGuia}
                onDesfichar={onDesfichar}
                fichandoYoEsta={ofIdsFichandoYo?.has(of.id) ?? false}
                otrasEnMiReloj={ofIdsFichandoYo?.has(of.id) ? ofIdsFichandoYo.size - 1 : 0}
                onCoger={paraCoger.some((o) => o.id === of.id) ? () => onCoger?.([of.id]) : undefined}
                plegable={plegables}
                abierta={ofAbierta(of)}
                onAlternar={() => alternarOF(of.id)}
              />
            ))}
          </ul>

          {ocultas.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {ocultas.map(({ grupo, ofs }) => {
                const abierto = mostrar.has(grupo.id);
                return (
                  <div key={grupo.id} className={grupo.id === "cerrada" ? "w-full" : undefined}>
                    <button
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
                    {/* Las cerradas, una línea por OF con quién y cuándo, sin
                        abrir el cajón: cerrar en RPS escribe en la fábrica y
                        tiene que verse de un vistazo quién lo hizo. */}
                    {grupo.id === "cerrada" && (
                      <div className="mt-1 space-y-1">
                        {ofs.map((o) => (
                          <div key={o.id} className="flex flex-wrap items-center gap-1.5">
                            <p className="text-[11px] text-text-muted">
                              {motivoDeCerrada(o, (id) => opById(id)?.nombre)}
                            </p>
                            {/* Solo el autor, y solo si la trampa 2/02 dejó una
                                gemela sin escribir (Confirmado con Iván, punto
                                4). Escribe SOLO esa operación. */}
                            {!soloLectura && o.cerradaRps?.gemelaSinEscribir && miId === o.autorId && (
                              <ReintentarGemelaInline
                                of={o}
                                seccion={seccion}
                                miId={miId}
                                onReintentado={(id, cerradaRps, aviso) => {
                                  if (aviso) setAvisosCierreRps({ pedido: pedido.codigo, textos: [aviso] });
                                  onGemelaReintentada(id, cerradaRps);
                                }}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <OFsFueraDeLaSeccion key={pedido.id} ofs={ofsFuera} seccion={seccion} />

          {/* Lo que sirve Almacén sin OF, debajo de las OF. Solo OT. */}
          {seccion.id === "ot" && <HojaAlmacenPedido key={`almacen:${pedido.codigo}`} pedido={pedido.codigo} />}

          {/* Comentario del pedido de venta (condiciones, avisos del comercial).
              DEBAJO de las OF y de las notas, y plegado: casi siempre es el
              mismo texto legal de TGM y, arriba del todo, empujaba las OF —que
              es donde se trabaja— por debajo del pliegue. */}
          {pedido.comentarioVenta && <ComentarioPedido texto={pedido.comentarioVenta} />}

    </MarcoFicha>
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
  nombreRol,
}: {
  rol: Rol;
  /** El rótulo sin abreviar, para la pista, si `rotulo` va corto («Rev.»). Con
   *  él, sin persona se pinta «—» en vez de «Sin asignar». */
  nombreRol?: string;
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
      className="flex min-w-0 items-center gap-1.5"
      title={`${nombreRol ?? rotulo}: ${op ? op.nombre : "sin asignar"}. Es de quién es el encargo; el tiempo que ha echado cada uno, en el reloj de la cabecera.`}
    >
      {/* El rótulo, en texto discreto del color del rol y no en un bloque en
          mayúsculas: ocupaba más que el propio nombre (Iván, 27/11/2026). */}
      <span className={`shrink-0 text-[11px] font-medium ${ROL[rol].texto}`}>{rotulo}</span>
      {control ?? (
        op ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className="grid size-4 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white"
              style={{ background: op.color, color: tintaSobre(op.color) }}
            >
              {op.iniciales}
            </span>
            <span className="truncate text-[11px] text-text">{op.nombre}</span>
          </span>
        ) : (
          <span className="text-[11px] italic text-text-muted">{nombreRol ? "—" : "Sin asignar"}</span>
        )
      )}
      {/* El punto pulsante no repite el rol (el badge de la cabecera de la OF
          ya lo dice): solo señala CUÁL de las dos líneas está corriendo. */}
      {live && <LiveDot rol={rol} className="size-1.5" />}
    </div>
  );
}

/** «TOLDO NUEVO» → «Toldo nuevo»: RPS la escribe en mayúsculas y, junto al
 *  nombre de la familia en la pista del icono, gritaba. Las siglas cortas
 *  («TF» de «ACCESORIOS TF») se quedan en mayúsculas; «de», «la»… no. */
const PALABRAS_MENORES = new Set(["a", "al", "de", "del", "el", "en", "la", "las", "los", "y", "con", "sin", "para"]);
function subfamiliaLegible(sub: string | null): string | null {
  if (!sub) return null;
  return sub
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) =>
      p.length <= 3 && !PALABRAS_MENORES.has(p) ? p.toUpperCase() : i === 0 ? p[0].toUpperCase() + p.slice(1) : p,
    )
    .join(" ");
}

/** Desde cuántas OF salen plegadas las tarjetas de la ficha. Con dos, abiertas
 *  caben en pantalla (y se pueden plegar a mano); con tres ya empujan las
 *  notas y los documentos fuera. */
const PLEGAR_DESDE = 3;

/** «⋯» de la barra: lo poco frecuente. Solo sale si tiene algo dentro. */
function MenuMasBloque({
  opciones,
}: {
  opciones: { id: string; label: string; title?: string; onClick: () => void }[];
}) {
  // Alineado al borde IZQUIERDO del botón: la barra va a la izquierda de la
  // ficha y, alineado a la derecha, el menú se salía por encima del parte.
  const { open, setOpen, ref, panelRef, idPanel } = usePopover<HTMLButtonElement>({
    colocar: (caja, panel) => {
      panel.style.left = `${Math.max(8, Math.min(caja.left, window.innerWidth - panel.offsetWidth - 8))}px`;
      panel.style.top = `${caja.bottom + 4}px`;
    },
  });
  if (opciones.length === 0) return null;
  return (
    <>
      <button
        ref={ref}
        type="button"
        popoverTarget={idPanel}
        aria-expanded={open}
        aria-label="Más acciones del pedido"
        title="Más acciones"
        className="chip-3d inline-flex size-6 items-center justify-center rounded-[7px] text-xs font-bold text-text-muted hover:text-text"
      >
        ⋯
      </button>
      <div ref={panelRef} id={idPanel} popover="auto" className="glass-pop m-0 w-60 rounded-lg p-1 text-text">
        {/* Siempre en el DOM: el popover lo oculta el navegador hasta que se
            abre, y así cada opción existe para el lector de pantalla y los
            tests aunque el menú esté cerrado. */}
        {opciones.map((o) => (
            <button
              key={o.id}
              type="button"
              title={o.title}
              onClick={() => {
                setOpen(false);
                o.onClick();
              }}
              className="block w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold hover:bg-surface-2"
            >
              {o.label}
            </button>
          ))}
      </div>
    </>
  );
}

function OFRow({
  of,
  pedidoCodigo,
  operarios,
  miId,
  pedidoDeUnaOF,
  revisionPorPedido,
  seccion,
  esLaUltima,
  onCerradoEnRps,
  opById,
  onPasarRevision,
  onSinRevisor,
  onTraspasarAutor,
  onAccion,
  onFichar,
  onDesfichar,
  fichandoYoEsta,
  otrasEnMiReloj,
  impedidoRevision,
  impedidoDevolver,
  fallosGuia,
  plegable = false,
  abierta = true,
  onAlternar,
  onCoger,
  resalte,
}: {
  /** Se está señalando un botón del bloque: esta OF entra (con el color del
   *  rol) o se queda fuera (apagada). */
  resalte?: Rol | "fuera";
  /** Esta OF es de otra persona y se puede coger. */
  onCoger?: () => void;
  /** Se pliega a su cabecera (el pedido tiene muchas OF, ver `PLEGAR_DESDE`). */
  plegable?: boolean;
  abierta?: boolean;
  onAlternar?: () => void;
  of: OF;
  /** Para imprimir y mandar el planteamiento al dar la OF por terminada. */
  pedidoCodigo?: string;
  operarios: Operario[];
  miId: string | null;
  /** Por qué no se puede aprobar ni devolver esta OF todavía (quedan puntos de
   *  la guía sin mirar), o null si se puede. */
  impedidoRevision?: string | null;
  /** Por qué no se puede devolver todavía: alguna ✗ sin decir qué falla. */
  impedidoDevolver?: string | null;
  fallosGuia?: readonly FalloGuia[];
  /** El pedido tiene una sola OF: el selector de autor de arriba ya la cubre. */
  pedidoDeUnaOF: boolean;
  /** Con la revisión por pedido, esta fila no ofrece pasar a revisión,
   *  aprobar ni devolver: esas suben al bloque del pedido. */
  revisionPorPedido: boolean;
  seccion: Seccion;
  /** Es la última OF que queda del pedido: no se ofrece cerrarla en RPS. */
  esLaUltima: boolean;
  onCerradoEnRps: (ofId: string, cerradaRps: NonNullable<OF["cerradaRps"]>, avisos?: string[]) => void;
  opById: (id: string | null) => Operario | null;
  onPasarRevision: (ofIds: string[], revisorId: string) => Promise<boolean>;
  /** Se pulsó "Pasar a revisión" y se dejó sin elegir revisor (ver PedirRevisor). */
  onSinRevisor?: (ofCodigos: string[]) => void;
  onTraspasarAutor: (ofId: string, autorId: string) => void;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  /** ¿La estoy fichando YO? Ver el mismo campo en las props del Drawer. */
  fichandoYoEsta: boolean;
  /** Cuántas OF más corren en mi reloj junto a esta. Con alguna, su «Pausar»
   *  dice «solo esta»: Adrián (19/10/2026) fichó tres lonas juntas, pausó la
   *  primera creyendo parar el pedido y las otras dos siguieron contando. */
  otrasEnMiReloj: number;
}) {
  const soloLectura = useSoloLectura();
  const meta = ESTADO[of.estado];
  // Solo en las anuladas: en una devuelta ese mismo campo lleva la nota del
  // revisor (los dos usos lo comparten, ver lib/anulacion.ts).
  const anulacion = of.estado === "anulada" ? leerAnulacion(of.observacion) : null;
  const correccion = correccionDe(of);
  const autor = opById(of.autorId);
  const revisor = opById(of.revisorId);
  // Cuándo empieza Producción a fabricarla: el planteo tiene que estar antes.
  // Corta en la línea de datos («Fabrica 03/12/26»); la frase entera, al pasar
  // el ratón. Hoy en ámbar y vencida en rojo, con la palabra además del color.
  const fechaFab = (() => {
    const f = of.fechaLimitePlanteo;
    if (!f) return null;
    const hoy = hoyISO();
    const cuando = f < hoy ? ("vencida" as const) : f === hoy ? ("hoy" as const) : ("futura" as const);
    return {
      cuando,
      texto: cuando === "hoy" ? "Fabrica hoy" : `Fabrica ${fmt(f)}${cuando === "vencida" ? " · vencida" : ""}`,
      clase:
        cuando === "vencida"
          ? "font-semibold text-error"
          : cuando === "hoy"
            ? "font-semibold text-amber-700 dark:text-amber-300"
            : "text-text-muted",
      title: `Producción empieza a fabricar el ${fmt(f)}: el planteo debe estar listo antes${
        cuando === "vencida" ? " (ya vencida)" : ""
      }`,
    };
  })();
  // El tiempo NO se calcula aquí: todo el reparto —quién, cuánto y en qué
  // herramienta— vive en TiempoOF, que es el único sitio de la tarjeta donde
  // sale un minuto.

  // La cabecera: código, familia, estado y descripción. Con la OF plegable es
  // el botón que la abre y la cierra; dentro no hay nada pulsable, así que
  // puede serlo entera.
  const cabecera = (
    <>
      <div className="flex items-center gap-2">
        {plegable && (
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`size-3.5 shrink-0 text-text-muted transition-transform motion-reduce:transition-none ${abierta ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {/* El número de la OF, lo primero que se lee de la tarjeta: era más
            pequeño que la descripción de debajo y costaba encontrarlo
            (Iván y compañeros, 16/10/2026; elegido entre tres en captura). */}
        {/* La familia, SOLO EL ICONO delante del número (Iván, 27/11/2026):
            el chip con el nombre repetía lo que ya dice la cabecera del pedido
            y ensuciaba la línea. El nombre, al pasar el ratón.
            La SUBFAMILIA de RPS («TOLDO NUEVO», «ACCESORIOS TF») va también ahí,
            detrás de la familia: suelta en la línea, en mayúsculas grises junto
            al icono, quedaba fatal (Iván, 27/11/2026). Solo si dice algo que la
            familia no diga ya. */}
        <span
          title={[familiaMeta(of.familia).label, subfamiliaLegible(subfamiliaAparte(of.familia, of.subfamilia))]
            .filter(Boolean)
            .join(" · ")}
          className="inline-flex shrink-0"
        >
          <FamiliaIcon familia={of.familia} className="size-4" />
        </span>
        <span className="shrink-0 font-mono text-[15px] font-bold tracking-[0.02em] text-text">{of.codigo}</span>
        <CopiarCodigo texto={of.codigo} dentroDeBoton={plegable} className="-ml-1.5" />
        {/* El estado, y en las anuladas también POR QUÉ: "ANULADA · TALLER".
            Va en el propio distintivo y no en una línea aparte porque es lo
            que se busca al repasarlas, y así se lee sin abrir nada. */}
        <span
          // ESTILO HEROUI (Iván, 27/11/2026): píldora neutra con el punto del
          // color del estado, en vez del bloque macizo en mayúsculas, que
          // gritaba más que el número de la OF. El color sigue diciendo el
          // estado; el texto, en minúscula, se lee de un vistazo.
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text"
          title={
            of.fichandoRol
              ? of.fichandoRol === "revisar"
                ? "Alguien la está revisando ahora: su reloj, en el tiempo de la cabecera"
                : "Alguien la está planteando ahora: su reloj, en el tiempo de la cabecera"
              : of.cerradaRps
              ? `Cerrada en RPS por ${opById(of.cerradaRps.por)?.nombre ?? of.cerradaRps.por}, ${fmtCierre(of.cerradaRps.at)}${
                  of.cerradaRps.modo !== "activo" ? ` (modo ${of.cerradaRps.modo}: no se llegó a escribir en RPS)` : ""
                }`
              : anulacion?.nota
          }
        >
          {/* "Aprobada" a secas se lee como "alguien la repasó y le dio el
              visto bueno". En las que van por "Dar por bueno sin revisión" eso
              no pasó, y el histórico no puede decir que sí. Con la marca, lo
              que hay que leer es que ya está cerrada en RPS — y si fue en
              sombra/ensayo, que NO se llegó a escribir de verdad. */}
          {/* Fichándose AHORA: el punto que late, dentro del propio estado.
              Al lado iba otro distintivo, «● REVISANDO» junto a «EN REVISIÓN»,
              que decía lo mismo dos veces (Iván, 16/10/2026). Quién y cuánto
              lleva están en la caja de tiempo. */}
          {/* El punto del estado; fichándose AHORA, el mismo punto late. */}
          <span className="relative inline-flex size-1.5 shrink-0" aria-hidden>
            {of.fichandoRol && (
              <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-70 motion-reduce:animate-none ${of.cerradaRps ? "bg-cyan-600" : meta.dot}`} />
            )}
            <span className={`relative inline-flex size-full rounded-full ${of.cerradaRps ? "bg-cyan-600" : meta.dot}`} />
          </span>
          {of.cerradaRps
            ? of.cerradaRps.modo === "activo"
              ? "Cerrada en RPS"
              : "Cerrada · sin escribir en RPS"
            : aprobadaSinRevision(of)
              // Donde no se revisa, «sin revisión» no dice nada: es lo normal.
              ? seccion.sinRevision ? "Finalizada" : "Aprobada sin revisión"
              : meta.label}
          {anulacion && ` · ${textoAnulacion(anulacion)}`}
        </span>
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
        {/* Plegada, la fecha de Producción solo si aprieta: abierta va en la
            línea de datos, y plegada una fecha lejana no pide nada. */}
        {plegable && !abierta && fechaFab && fechaFab.cuando !== "futura" && (
          <span className={`shrink-0 whitespace-nowrap text-[11px] ${fechaFab.clase}`} title={fechaFab.title}>
            {fechaFab.cuando === "hoy" ? "Fabrica hoy" : "Fabricación vencida"}
          </span>
        )}
        {/* Plegada, lo justo para saber de quién es sin abrirla. */}
        {plegable && !abierta && autor && (
          <span
            className="ml-auto grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-bold"
            style={{ background: autor.color, color: tintaSobre(autor.color) }}
            title={`Autor: ${autor.nombre}`}
          >
            {autor.iniciales}
          </span>
        )}
        <span className={`${plegable && !abierta && autor ? "" : "ml-auto "}shrink-0 whitespace-nowrap text-[11px] text-text-muted`}>{of.piezas} pz</span>
        {/* El tiempo en la cabecera, y el detalle al pasar el ratón (ver
            TiempoOF.tsx): la caja de abajo ocupaba media tarjeta. */}
        <TiempoOF of={of} opById={opById} sinRevision={seccion.sinRevision === true} />
      </div>

      <p className={`mt-1 text-sm text-text ${plegable && !abierta ? "truncate" : ""}`}>{of.descripcion}</p>
    </>
  );

  // QUIÉN tiene el encargo: autor y luego revisor, en ese orden fijo (el del
  // flujo: primero se plantea, después se repasa). Van en la fila de los
  // botones, a la derecha: en su propia línea gastaban un renglón entero para
  // dos nombres (Iván, 27/11/2026, al compactar la tarjeta). Si no caben al
  // lado de los botones, bajan solos (flex-wrap).
  const personas = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <LineaRol
        rol="plantear"
        rotulo="Autor"
        op={autor}
        live={of.fichandoRol === "plantear"}
        control={
          // Con UNA sola OF el selector sobra: el de arriba, "Asignar autor
          // (pedido entero)", ya cambia exactamente esta OF. En cuanto hay dos
          // OF vuelve, que ahí sí sirve: es como se reparte un pedido.
          !soloLectura && puedeTraspasarAutor(of) && !pedidoDeUnaOF ? (
            <Select
              value={of.autorId}
              onChange={(v) => v && onTraspasarAutor(of.id, v)}
              placeholder={null}
              alignRight
              // `plano`: el nombre como texto con la flecha discreta, igual que
              // el autor de la cabecera del pedido. Con caja gris destacaba más
              // que Fichar (Iván, 27/11/2026).
              plano
              className="min-w-0"
              options={opcionesOperario(operarios, miId)}
            />
          ) : null
        }
      />
      {/* Donde no se revisa, el revisor solo sale si la OF trae uno de antes
          (Diseño revisaba hasta el 26/10/2026). */}
      {(!seccion.sinRevision || revisor) && (
        // «Rev.» y «—»: en la fila de los botones, «Revisor Sin asignar» hacía
        // bajar a las dos personas a otra línea. El nombre entero, en la pista.
        <LineaRol rol="revisar" rotulo="Rev." nombreRol="Revisor" op={revisor} live={of.fichandoRol === "revisar"} />
      )}
    </div>
  );

  return (
    // `bloque-3d`: el mismo relieve que el recorrido, las notas y los bloques
    // plegados de la ficha. Con `glass-chip` —el de los botones— las tarjetas
    // de OF tenían un canto distinto del resto.
    <li
      className={`bloque-3d rounded-xl px-3 py-2.5 transition-[opacity,box-shadow] motion-reduce:transition-none ${
        resalte === "fuera"
          ? "opacity-45"
          : // `outline` y no `ring`: el relieve de `bloque-3d` es un
            // box-shadow y se comía el anillo, que es otro box-shadow.
            resalte === "revisar"
            ? "outline-2 outline-offset-[-2px] outline-violet-600 dark:outline-violet-400"
            : resalte === "plantear"
              ? "outline-2 outline-offset-[-2px] outline-emerald-600 dark:outline-emerald-400"
              : ""
      }`}
    >
      {plegable ? (
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={abierta}
          aria-label={`${abierta ? "Plegar" : "Abrir"} la OF ${of.codigo}`}
          /* `rounded-xl!`: el estilo HeroUI hace píldora todo botón, y en una
             cabecera de dos líneas la curva se comía las letras de los extremos. */
          className="-mx-2.5 -my-1.5 block w-[calc(100%+1.25rem)] cursor-pointer rounded-xl! px-2.5 py-1.5 text-left hover:bg-[var(--glass-highlight)]"
        >
          {cabecera}
        </button>
      ) : (
        cabecera
      )}
      {abierta && (
        <>
          {/* «QUÉ CORREGIR», LO PRIMERO DE LA TARJETA (27/11/2026, comité de la
              vista del autor): iba debajo de cinco bloques de datos. Se calla en
              una aprobada —en rojo diría que aún falla algo— y en una anulada,
              cuyo campo lleva el motivo (ver `correccionDe`). Ya reenviada, se
              pliega en gris. El dato no se borra: la segunda vuelta lo usa para
              poner delante lo que falló. */}
          {correccion && (
            <NotaDevolucion
              observacion={of.observacion!}
              enviada={correccion === "enviada"}
              // Al REVISOR se le abre: vuelve a revisión y quiere delante lo
              // que pidió para comprobar que se corrigió.
              abrirEnviada={!!miId && of.revisorId === miId}
              devolucion={of.devolucion}
              devueltaPor={opById(of.devolucion?.por ?? null)?.nombre.split(" ")[0]}
              operarioId={miId ?? undefined}
              // Las casillas, solo para el AUTOR: es quien corrige. A los demás
              // la lista se les queda para leer.
              marcarComo={miId && of.autorId === miId ? of.id : undefined}
              className="mt-1.5"
            />
          )}

          {/* QUÉ SE VENDIÓ, con medidas y acabados. La línea de arriba es el nombre
              de catálogo ("TOLDO VERTICAL ELECTRA") y no dice de qué tamaño es ni
              cómo va rematado; esto sí, y es lo que hay que leer para plantearlo.
              PLEGADO, y no truncado con puntos suspensivos: son 160 caracteres de
              media y hasta 400, así que a la vista convertiría cada OF en un
              párrafo y la ficha de un pedido de cinco en un muro. Cerrado ocupa una
              línea; abierto, el texto entero sin recortar.
              LOS DATOS DE LA OF EN UNA SOLA LÍNEA (Iván, 27/11/2026): descripción,
              material, fecha de Producción y rotulación iban cada uno en su fila
              de ancho entero, y la tarjeta medía 250-330 px para cuatro datos
              cortos. Abierta, la descripción baja debajo de la línea. */}
          {(of.detalleVenta || of.reservasMaterial !== undefined || fechaFab || of.rotulacion) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {of.detalleVenta && <DetalleVenta texto={of.detalleVenta} enFila />}
              {/* `reservasMaterial` sigue siendo la señal de "hay dato de RPS": el
                  mock no lo rellena, y ahí no se enseña nada en vez de mentir con
                  un "sin material". */}
              {of.reservasMaterial !== undefined && (
                <MaterialChip materiales={of.materiales} compras={of.compras} hoy={hoyISO()} enFila />
              )}
              {fechaFab && (
                <span className={`inline-flex items-center gap-1 text-[11px] ${fechaFab.clase}`} title={fechaFab.title}>
                  <IconoFabrica className="size-3.5" />
                  {fechaFab.texto}
                </span>
              )}
              {/* Gris y sin caja, como el resto de la línea: el fondo de color
                  queda para lo que avisa (Iván, 16/10/2026). */}
              {of.rotulacion && (
                <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                  <IconoEtiqueta className="size-3.5" />
                  Rotulación <b className="font-semibold text-text">{of.rotulacion}</b>
                </span>
              )}
            </div>
          )}

          {of.avisos && of.avisos.length > 0 && (
            <div className="mt-1.5 space-y-1 recuadro rounded-md px-2.5 py-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                Avisos de Producción
              </p>
              {of.avisos.map((a) => (
                <p key={a} className="flex items-start gap-1.5 text-[11px] leading-snug text-indigo-800 dark:text-indigo-200">
                  <IconoAviso className="mt-px size-3.5" />
                  <span>{a}</span>
                </p>
              ))}
            </div>
          )}

          {/* Solo cuando el chip de material NO puede contarlo. Los dos salían del
              mismo hecho —hay una compra pendiente— y quedaban uno encima del otro
              diciendo lo mismo; el chip además dice QUÉ se pidió, a quién y si
              llega tarde. Esta línea se queda para las OF donde la vista de RPS da
              la fecha pero no tenemos el detalle de la compra. */}
          {of.materialPendienteHasta && !of.compras?.length && (
            <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-800 dark:text-amber-400">
              <IconoCaja className="mt-px size-3.5" />
              <span>Material de compras pedido, llega el {fmt(of.materialPendienteHasta)}.</span>
            </p>
          )}


          {/* Autor y revisor van en la fila de los botones, a la derecha (ver
              `personas` arriba). En solo lectura no hay botones: van solos. */}
          {soloLectura && <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">{personas}</div>}

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
          {!soloLectura && (
            <AccionesOF
              of={of}
              pedidoCodigo={pedidoCodigo}
              operarios={operarios}
              miId={miId}
              revisionPorPedido={revisionPorPedido}
              seccion={seccion}
              esLaUltima={esLaUltima}
              onCerradoEnRps={onCerradoEnRps}
              onAccion={onAccion}
              onPasarRevision={onPasarRevision}
                  onSinRevisor={onSinRevisor}
              onFichar={onFichar}
              onDesfichar={onDesfichar}
              fichandoYoEsta={fichandoYoEsta}
              otrasEnMiReloj={otrasEnMiReloj}
              impedidoRevision={impedidoRevision}
              impedidoDevolver={impedidoDevolver}
              fallosGuia={fallosGuia}
              onCoger={onCoger}
              personas={personas}
            />
          )}
        </>
      )}
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
  pedidoCodigo,
  operarios,
  miId,
  revisionPorPedido,
  seccion,
  esLaUltima,
  onCerradoEnRps,
  onAccion,
  onPasarRevision,
  onSinRevisor,
  onFichar,
  onDesfichar,
  fichandoYoEsta,
  otrasEnMiReloj,
  impedidoRevision,
  impedidoDevolver,
  fallosGuia,
  onCoger,
  personas,
}: {
  onCoger?: () => void;
  /** Autor y revisor: van al final de la fila, a la derecha de los botones. */
  personas?: React.ReactNode;
  of: OF;
  pedidoCodigo?: string;
  operarios: Operario[];
  miId: string | null;
  /** Por qué no se puede aprobar ni devolver todavía. Ver la guía de revisión:
   *  dar por buena una OF sin haberla repasado entera es lo que se evita. */
  impedidoRevision?: string | null;
  /** Por qué no se puede devolver todavía: alguna ✗ sin decir qué falla. */
  impedidoDevolver?: string | null;
  /** Las causas de lo que la guía marcó como fallo: llegan ya puestas al
   *  devolver. Faltaban aquí, en el botón de cada OF —el que se usa casi
   *  siempre—, y había que volver a elegirlas (Iván, 16/10/2026). */
  fallosGuia?: readonly FalloGuia[];
  /** Con la revisión por pedido, esta fila no ofrece pasar a revisión,
   *  aprobar ni devolver: esas suben al bloque del pedido. */
  revisionPorPedido: boolean;
  seccion: Seccion;
  /** Ver `esLaUltimaQueQueda` en el Drawer. */
  esLaUltima: boolean;
  onCerradoEnRps: (ofId: string, cerradaRps: NonNullable<OF["cerradaRps"]>, avisos?: string[]) => void;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onPasarRevision: (ofIds: string[], revisorId: string) => Promise<boolean>;
  /** Se pulsó "Pasar a revisión" y se dejó sin elegir revisor (ver PedirRevisor). */
  onSinRevisor?: (ofCodigos: string[]) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  /** ¿La estoy fichando YO? Ver el mismo campo en las props del Drawer. */
  fichandoYoEsta: boolean;
  /** Cuántas OF más corren en mi reloj junto a esta. Con alguna, su «Pausar»
   *  dice «solo esta»: Adrián (19/10/2026) fichó tres lonas juntas, pausó la
   *  primera creyendo parar el pedido y las otras dos siguieron contando. */
  otrasEnMiReloj: number;
}) {
  const { pedirConfirmacion, dialogo } = useConfirmacion((a) => onAccion([of.id], a.id));
  const [pidiendoRevisor, setPidiendoRevisor] = useState(false);
  // Anular se abre desde el cajón de "⋯" (ver MenuAccionesOF).
  const [anulando, setAnulando] = useState(false);
  // "Dar por terminada en RPS" se abre desde el cajón de "⋯", como anular
  // (ver MenuAccionesOF).
  const [cerrandoEnRps, setCerrandoEnRps] = useState(false);
  // De qué reloj habla el botón: el del planteo o el de la revisión.
  const rolReloj = rolFichajeDe(of);
  // "Reanudar" y no "Fichar" cuando ya hay tiempo echado: es la vuelta de una
  // pausa, y llamarlo igual que empezar de cero borraba esa diferencia.
  //
  // Se mide el tiempo DE ESE ROL, no el total de la OF. Con el total, una OF
  // recién mandada a revisar decía "Reanudar" por los minutos del planteo —
  // pero el reloj del que hablaba era el de la revisión, que no había corrido
  // ni un segundo.
  //
  // Y el tiempo MÍO, no el de cualquiera. Con el de la OF entera, quien abría
  // la OF de un compañero para echarle una mano veía "▶ Reanudar" sin haber
  // fichado nunca en ella: se reanudaba el trabajo de otro. Lo mío es lo que
  // he fichado aquí en ese rol y, para el planteo, lo que tenga imputado en
  // RPS (en RPS no hay tarea de revisión: ver `aplicarTiemposFichaje`).
  const mioWeb = of.fichadoWeb?.find((w) => w.operarioId === miId);
  const yaEmpezada =
    rolReloj === "revisar"
      ? (mioWeb?.revisionMin ?? 0) > 0
      : (mioWeb?.planteoMin ?? 0) > 0 ||
        (of.imputaciones ?? []).some((i) => i.operarioId === miId && i.minutos > 0);
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
  // En Diseño, "Dar por bueno sin revisión" ES «Finalizar»: el final de cada
  // OF, a la vista y en el color de lo principal (ver `Seccion.finalizar`).
  // Y su vuelta atrás, «Recuperar para corregir», se queda en «Recuperar»: sin
  // revisión no hay nada que corregir, solo una OF que se cerró antes de tiempo.
  const finalizarOF = seccion.finalizar?.of;
  const acciones = accionesDisponibles(of, miId).map((a) =>
    finalizarOF && a.id === "aprobar_sin_revision"
      ? {
          ...a,
          label: finalizarOF,
          tono: "primaria" as const,
          confirmar: "La OF queda terminada y deja de contar tiempo. Cuando lo estén todas, el pedido podrá pasar a Producción.",
        }
      : finalizarOF && a.id === "recuperar_aprobada"
        ? {
            ...a,
            label: "Recuperar",
            confirmar: "La OF deja de estar finalizada y vuelve a Planteando. El tiempo fichado se conserva.",
          }
        : a,
  ).filter(
    (a) =>
      a.id !== "empezar_planteo" &&
      a.id !== "retomar" &&
      !(relojALaVista && a.id === "empezar_revision") &&
      // La última OF que queda no se cierra suelta: eso es pasar el pedido.
      !(esLaUltima && a.id === "cerrar_en_rps") &&
      // En Diseño, nunca: cerrar en RPS lo hace «Finalizar todo» al pasar el
      // pedido, y una OF suelta cerrada allí no la pedía nadie (Iván,
      // 26/10/2026: fuera lo que no se usa del "⋯").
      !(finalizarOF && a.id === "cerrar_en_rps") &&
      // Las de estado suben al pedido en las secciones que trabajan así. Se
      // quedan fichar —que no pasa por aquí, tiene su propio botón— y anular,
      // que es la única que de verdad es de una OF suelta.
      !(revisionPorPedido && ACCIONES_DEL_PEDIDO.has(a.id)) &&
      // Donde no revisa nadie no hay "Pasar a revisión", y en Impresión
      // tampoco "Dar por bueno sin revisión": su único final es «Impreso»,
      // en el bloque del pedido (ver lib/impreso.ts). En Diseño esa acción
      // se queda, renombrada «Finalizar» (arriba).
      !accionOcultaSinRevision(seccion, a.id),
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
  const esDeLaVista = (a: AccionOF) => A_LA_VISTA.has(a) || (!!finalizarOF && a === "aprobar_sin_revision");
  const aLaVista = acciones.filter((a) => esDeLaVista(a.id));
  const enCajon = acciones.filter((a) => !esDeLaVista(a.id));
  // Un cajón para UNA sola opción es peor que la opción: un clic de más para
  // esconder algo que cabía. Con una, se saca fuera.
  //
  // Salvo en Diseño: allí la fila es fichar y «Finalizar», y lo demás
  // —«Recuperar» una finalizada, anular— va en "⋯" aunque sea solo (Iván,
  // 26/10/2026). Suelto, «Recuperar» parecía lo siguiente que tocaba hacer.
  //
  // Y ANULAR, SIEMPRE EN EL CAJÓN (Iván, 27/11/2026, comité de la tarjeta):
  // cuando era la única opción de más salía suelta, «Anular OF» en la misma
  // fila que Fichar. Es rara y destructiva: un clic de más es lo que toca.
  const cajonSiempre = (!!finalizarOF && enCajon.length > 0) || enCajon.some((a) => a.id === "anular");
  const menu = enCajon.length > 1 || cajonSiempre ? enCajon : [];
  const sueltas = enCajon.length > 1 || cajonSiempre ? aLaVista : acciones;
  const tono = { primaria: "teal", peligro: "rojo", neutra: "ghost" } as const;

  // La OF es de otra persona: los dos botones que se le ofrecen ("Coger" y
  // fichar) se explican al pasar el ratón, porque juntos no se entiende en
  // qué se diferencian.
  const autorAjeno = of.autorId !== null && of.autorId !== miId
    ? (operarios.find((o) => o.id === of.autorId)?.nombre ?? "otra persona")
    : null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {pidiendoRevisor ? (
        // Los nombres EN LUGAR de los botones de la OF: la tarjeta no crece.
        <PedirRevisor
          operarios={operarios}
          excluirIds={[of.autorId]}
          valorInicial={of.revisorId}
          onAbandonado={() => onSinRevisor?.([of.codigo])}
          // Se cierra al elegir: el pase se pinta al momento (ver Board).
          onConfirmar={(rev) => {
            setPidiendoRevisor(false);
            void onPasarRevision([of.id], rev);
          }}
          onCancelar={() => setPidiendoRevisor(false)}
        />
      ) : (
        <>
      {/* Coger, delante: sobre la OF de otra persona es lo primero que se
          plantea. Fichar sigue al lado para quien solo quiere echar una mano. */}
      {onCoger && (
        <Pista
          lado="abajo"
          texto="Coger: te la quedas"
          detalle={`Pasa a tu panel y sale del de ${autorAjeno ?? "su autor"}. El tiempo que ya echó sigue siendo suyo. Pregunta antes.`}
        >
          <span className="inline-flex">
            <Btn tone="ghost" onClick={onCoger}>
              Coger
            </Btn>
          </span>
        </Pista>
      )}
      {/* "La ficho YO", no "la ficha alguien": con `of.fichandoRol` salía
          "Pausar" también sobre el reloj de otra persona (el revisor, o
          cualquiera desde el mini-olanet), y este botón no puede parar ese
          reloj —solo saca la OF del MÍO, donde no estaba—. Mismo criterio que
          PedidoLinea y que el botón de arriba. */}
      {fichandoYoEsta ? (
        <Btn
          tone={of.fichandoRol === "revisar" ? "revisar" : "reloj"}
          title={
            otrasEnMiReloj > 0
              ? `Para el reloj SOLO en esta OF. ${otrasEnMiReloj === 1 ? "La otra que fichas sigue" : `Las otras ${otrasEnMiReloj} que fichas siguen`} contando.`
              : "Para el reloj y deja la OF como está: sigue siendo tuya y en curso"
          }
          onClick={() => onDesfichar(of.id)}
        >
          {otrasEnMiReloj > 0 ? "Pausar solo esta" : "Pausar"}
        </Btn>
      ) : finalizarOF && of.estado === "aprobada" ? (
        // Finalizada en Diseño: nada de «Reanudar». Volver a ella es
        // «Recuperar», en "⋯", y no un clic de reloj por despiste.
        <span className={`${TAMANO_BLOQUE} border border-border text-text-muted`}>
          Finalizada
        </span>
      ) : esFichable(of) && relojEsMio ? (
        autorAjeno && rolReloj !== "revisar" ? (
          // En la OF de otra persona, fichar es ECHARLE UNA MANO: tu reloj en
          // su OF, sin quedártela. Al lado de "Coger" no se distinguía.
          <Pista
            lado="abajo"
            texto="Fichar: le echas una mano"
            detalle={`Tu tiempo cuenta a tu nombre en esta OF, pero sigue siendo de ${autorAjeno}. Si te la quieres quedar, «Coger».`}
          >
            <span className="inline-flex">
              <Btn tone="reloj" onClick={() => onFichar([of.id], rolReloj)}>
                {yaEmpezada ? "Reanudar" : "Fichar"}
              </Btn>
            </span>
          </Pista>
        ) : (
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
                ? "Reanudar revisión"
                : "Fichar revisión"
              : yaEmpezada
                ? "Reanudar"
                : "Fichar"}
          </Btn>
        )
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
            ? "No fichable"
            : quien === null
              ? "Esperando revisor"
              // `en_revision` es que ya la cogió; `por_revisar`, que la tiene
              // pendiente. No es lo mismo y el rótulo lo dice.
              : of.estado === "en_revision"
                ? `La revisa ${quien}`
                : `Pendiente de ${quien}`;
          return (
            <span
              title={motivo ?? undefined}
              // El motivo también por `aria-label`: el `title` no lo anuncia un
              // lector de pantalla, y aquí es la única explicación que hay.
              aria-label={motivo ? `${rotulo}. ${motivo}` : undefined}
              className={`${TAMANO_BLOQUE} cursor-help border border-border text-text-muted`}
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
              label={
                fallosGuia?.length
                  ? `Devolver con ${fallosGuia.length} ${fallosGuia.length === 1 ? "fallo" : "fallos"}`
                  : a.label
              }
              fallos={fallosGuia}
              impedido={impedidoDevolver}
              familias={of.familia ? [of.familia] : undefined}
              claseBoton={`${BOTON_BLOQUE} ${BOTON_NEUTRO}`}
              onDevolver={(obs) => onAccion([of.id], a.id, obs)}
            />
          );
        // Anular pregunta POR QUÉ, y esa es la confirmación (ver AnularInline).
        if (a.conMotivo)
          return <AnularInline key={a.id} onAnular={(obs) => onAccion([of.id], a.id, obs)} />;
        // "Pasar a revisión" pide el revisor aquí mismo (flujo unificado con
        // el chip del tablero): sin revisor no se pasa.
        // Con MI reloj corriendo en ella no se puede mandar (el planteo no
        // está acabado si sigue contando), pero el botón se queda en su sitio
        // y dice por qué: escondiéndolo, la fila cambiaba al fichar y pausar
        // (Iván, 16/10/2026).
        // Morado con borde, como en la barra. Y con MI reloj en ella ya no
        // sale apagado: pausa esta OF y pide revisor en un gesto (Iván,
        // 26/11/2026), igual que el de la barra del pedido.
        if (a.id === "terminar_planteo")
          return (
            !pidiendoRevisor && (
              <Btn
                key={a.id}
                tone="pasarRevision"
                title={fichandoYoEsta ? "Pausa el reloj de esta OF y la manda a revisar" : "Da por terminado el planteo y la manda a revisar"}
                onClick={() => {
                  if (fichandoYoEsta) onDesfichar(of.id);
                  setPidiendoRevisor(true);
                }}
              >
                {a.label}
              </Btn>
            )
          );
        // Cerrar en RPS NO pasa por `pedirConfirmacion`/`onAccion`: eso lo
        // guardaría por /api/estado sin cortar el reloj ni escribir en RPS.
        // Va con su propio componente, que llama a /api/fases/cerrar-of.
        // (`miId!`: `soloEl: "autor"` ya exige que haya alguien, y un null
        // aquí ni siquiera llegaría a ofrecerla.)
        if (a.id === "cerrar_en_rps")
          return miId ? (
            <CerrarEnRpsInline
              key={a.id}
              of={of}
              pedidoCodigo={pedidoCodigo}
              seccion={seccion}
              miId={miId}
              onCerrado={onCerradoEnRps}
            />
          ) : null;
        if (a.id === "volver_a_plantear")
          return (
            <BotonVolverAPlantear
              key={a.id}
              label={a.label}
              onPulsar={() => pedirConfirmacion(a)}
            />
          );
        const frenada = a.id === "aprobar" ? impedidoRevision : null;
        return (
          <Btn
            key={a.id}
            // «Finalizar», del color de «Finalizar todo» y de «Pasar a
            // Producción»: con el verde del reloj se confundía con «Reanudar».
            tone={finalizarOF && a.id === "aprobar_sin_revision" ? "finalizar" : tono[a.tono]}
            // Lo peligroso, al otro extremo de la fila: no se pulsa por
            // inercia después de la acción que sí se usa a diario.
            className={a.tono === "peligro" ? "ml-auto" : ""}
            disabled={!!frenada}
            title={frenada ?? undefined}
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
      {/* Igual que anular: montado en modo controlado, lo abre el menú. */}
      {menu.some((a) => a.id === "cerrar_en_rps") && miId && (
        <CerrarEnRpsInline
          of={of}
          pedidoCodigo={pedidoCodigo}
          seccion={seccion}
          miId={miId}
          onCerrado={onCerradoEnRps}
          abierto={cerrandoEnRps}
          onAbrirCambio={setCerrandoEnRps}
        />
      )}
      <MenuAccionesOF
        acciones={menu}
        etiqueta={(a) => etiquetaAccion(a, of, (id) => operarios.find((o) => o.id === id)?.nombre)}
        onElegir={(a) => {
          if (a.id === "anular") setAnulando(true);
          else if (a.id === "terminar_planteo") setPidiendoRevisor(true);
          // NUNCA por `pedirConfirmacion`: ver la rama de `sueltas` de arriba.
          else if (a.id === "cerrar_en_rps") setCerrandoEnRps(true);
          else pedirConfirmacion(a);
        }}
      />
        </>
      )}
      {/* Autor y revisor, al otro extremo. Con el selector de revisor abierto
          también se quedan: es la misma fila. */}
      {personas && <div className="ml-auto min-w-0 pl-2">{personas}</div>}
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
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone: "amber" | "teal" | "finalizar" | "reloj" | "revisar" | "pasarRevision" | "ghost" | "rojo";
  className?: string;
  title?: string;
  /** Apagado y sin poder pulsarse. El motivo va en `title`: un botón apagado
   *  sin explicación se lee como que la web falla. */
  disabled?: boolean;
}) {
  const cls = {
    amber: "bg-amber-700 text-white hover:bg-amber-800",
    teal: "bg-teal-700 text-white hover:bg-teal-800",
    // El de «Pasar a Producción»: dar algo por terminado (Diseño). Verde
    // azulado desde el 26/11/2026, como «Pasar a Producción» en todas partes.
    finalizar: "bg-teal-700 text-white hover:bg-teal-800",
    pasarRevision: BOTON_PASAR_REVISION,
    // El reloj lleva el color de SU rol, el mismo de todo el tablero: verde
    // planteo, violeta revision. Fichar se reconoce por el color sin leer el
    // boton, y sobre una OF en revision el verde decia el rol equivocado.
    reloj: ROL.plantear.solido,
    revisar: ROL.revisar.solido,
    ghost: "chip-3d text-text-muted hover:text-text",
    // Peligro (anular) en rojo pero SIN relleno: era lo que más gritaba de la
    // tarjeta, por encima de la acción que se hace a diario, y en una OF
    // pendiente parecía que anular fuese lo que tocaba hacer. El rojo sólido
    // se queda para el "Confirmar" del ConfirmDialog, que es donde la acción
    // se materializa de verdad.
    rojo: "chip-3d text-error",
  }[tone];
  // Relieve: los de color macizo con `boton-3d`; los neutros ya lo traen de
  // `chip-3d` en su clase.
  const relieve = tone === "ghost" || tone === "rojo" ? "" : "boton-3d";
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      // El mismo tamaño que la barra del pedido (`TAMANO_BLOQUE`, 24 px):
      // dentro de la OF los botones eran más grandes que los de arriba.
      className={`${TAMANO_BLOQUE} disabled:cursor-not-allowed disabled:opacity-40 ${relieve} ${cls} ${className}`}
    >
      {children}
    </button>
  );
}

/** «Volver a plantear», el botón.
 *
 *  Es la ÚNICA acción que admite una OF cerrada en RPS: `noSi` apaga todas las
 *  demás. Un botón que es la única salida no puede parecer el último de una
 *  fila de iguales, y con el tono neutro —`ghost`, que es borde gris y
 *  `text-text-muted`— en tema oscuro quedaba gris sobre gris.
 *
 *  Con nombre propio y exportado porque esa OF vive dentro de un cajón que se
 *  abre con estado de React: renderizando el `Drawer` no se llega hasta aquí
 *  (ver la cabecera de `drawer-volver-a-plantear.test.ts`). */
export function BotonVolverAPlantear({
  label,
  onPulsar,
}: {
  label: string;
  onPulsar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPulsar}
      title="La OF vuelve a planteando. En RPS sigue terminada hasta que alguien fiche en ella: el primer fichaje la reabre. El apunte del cierre se queda en el histórico de RPS."
      className="chip-3d order-first w-full rounded-lg px-3 py-1.5 text-xs font-semibold text-text"
    >
      ↩ {label}
    </button>
  );
}

