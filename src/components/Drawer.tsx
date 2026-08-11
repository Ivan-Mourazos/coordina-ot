"use client";

import { useEffect, useState } from "react";
import type { Operario, OF, Pedido, Rol } from "@/lib/types";
import { hoyISO, piezasTotal, tiempoTotalOF } from "@/lib/types";
import { ESTADO, PRIORIDAD, ROL, fmtMin } from "@/lib/estado";
import { FamiliaTag } from "./FamiliaTag";
import { LiveBadge, LiveDot } from "./LiveBadge";
import { PedidoScan } from "./PedidoScan";
import { ScanViewer } from "./ScanViewer";
import { DevolverInline } from "./DevolverInline";
import { PedirRevisor } from "./PedirRevisor";
import { useConfirmacion } from "./ConfirmDialog";
import { Select, OpDot, type SelectOption } from "./Select";
import { accionesDisponibles, type AccionOF } from "@/lib/acciones";
import { esFichable, motivoNoFichable, rolFichajeDe } from "@/lib/fichaje";
import { puedeTraspasarAutor } from "@/lib/traspaso";
import { ofDeTaller, pedidoListoParaPasar } from "@/lib/fases-tablero";
import { MaterialChip } from "./MaterialChip";
import { LineaTiempoPedido } from "./LineaTiempoPedido";
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
  onClose,
  onAssignPedido,
  onCompletar,
  onSetRevisor,
  onTraspasarAutor,
  onAccion,
  onFichar,
  onDesfichar,
}: {
  pedido: Pedido | null;
  operarios: Operario[];
  miId: string | null;
  onClose: () => void;
  onAssignPedido: (autorId: string | null) => void;
  onCompletar: (pedidoId: string) => void;
  onSetRevisor: (ofId: string, revisorId: string | null) => void;
  onTraspasarAutor: (ofId: string, autorId: string) => void;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
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
  const [ultimoPedido, setUltimoPedido] = useState<string | null>(null);
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
  const fichablesDeOT = ofsDeOT.filter(esFichable);

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
            {fichablesDeOT.length > 1 && (
              <button
                onClick={() => onFichar(fichablesDeOT.map((o) => o.id), "plantear")}
                title={`Pone el reloj en marcha en las ${fichablesDeOT.length} OF de planteo de este pedido`}
                className="ml-auto shrink-0 rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-700"
              >
                ⏱ Fichar las {fichablesDeOT.length}
              </button>
            )}
          </div>

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
                opById={opById}
                onSetRevisor={onSetRevisor}
                onTraspasarAutor={onTraspasarAutor}
                onAccion={onAccion}
                onFichar={onFichar}
                onDesfichar={onDesfichar}
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
                    title={grupo.ayuda}
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
          {listoParaCompletar && (
            <button
              onClick={() => onCompletar(pedido.id)}
              className="mb-2 w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              📦 Pasar a Producción (Completar pedido)
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

    </div>
  );
}

/** Una línea del bloque de roles de la OF: QUIÉN · con qué rol · cuánto tiempo
 *  hay fichado en ese rol.
 *
 *  Nace de una queja concreta sobre la ficha de un pedido: los mismos técnicos
 *  salían dos veces y encima en distinto orden —arriba "Jaime, Adrián" y
 *  debajo "planteo Adrián, Jaime" (pedido 3798)—, así que había que leerlo dos
 *  veces para descubrir que decían lo mismo. Esta tarjeta tenía la misma
 *  enfermedad en versión suave: la fila de tiempos daba "Planteo 1h 20m ·
 *  Revisión 30m" SIN nombres y, cuatro líneas más abajo (con los archivos de
 *  RPS metidos en medio), los chips "Autor / Revisor" daban los nombres SIN
 *  tiempos. Emparejar planteo↔autor y revisión↔revisor quedaba de cuenta del
 *  que mira; tanto, que hubo que explicarlo por escrito en el pie del panel.
 *
 *  OJO, que no son exactamente el mismo dato y por eso no vale con juntarlos y
 *  ya: el nombre es QUIEN TIENE EL ROL asignado, y el tiempo es TODO el
 *  fichado en ese rol, que puede haber echado un compañero (se ficha en la OF
 *  ajena y el tiempo se imputa a quien lo echa) o el autor anterior si la OF se
 *  traspasó. Por eso el tiempo va rotulado con el trabajo —"planteo",
 *  "revisión"— y no con la persona, y el title lo deja escrito: así la
 *  diferencia se ve, en vez de tener que deducirla.
 *
 *  El color del chip sale de ROL (plantear = esmeralda, revisar = violeta),
 *  el mismo par que usan tarjetas, badges y el resto de la app. */
function LineaRol({
  rol,
  rotulo,
  trabajo,
  op,
  min,
  live,
  control,
}: {
  rol: Rol;
  /** Cómo se llama quien tiene el rol: "Autor" / "Revisor". Son las palabras
   *  con las que se habla del trabajo en el resto del panel (traspasar autor,
   *  elegir revisor), no invento nuevo. */
  rotulo: string;
  /** Cómo se llama el tiempo: "planteo" / "revisión". */
  trabajo: string;
  op: Operario | null;
  min: number;
  live: boolean;
  /** Sustituye al nombre cuando la persona se puede cambiar desde aquí (el
   *  autor se traspasa mientras quede trabajo suyo). El revisor sigue siendo
   *  de solo lectura: se nombra al mandar a revisar. */
  control?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg bg-surface-2/70 px-2 py-1.5"
      title={`${rotulo}: ${op ? op.nombre : "sin asignar"}. ${fmtMin(min)} de ${trabajo} fichados en esta OF, que pueden repartirse entre varias personas: el tiempo se imputa a quien lo echa, aunque la OF sea de otro.`}
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
      <span className="ml-auto shrink-0 whitespace-nowrap text-[11px] text-text-muted">
        {trabajo} <b className="font-semibold text-text">{fmtMin(min)}</b>
      </span>
    </div>
  );
}

function OFRow({
  of,
  operarios,
  miId,
  opById,
  onSetRevisor,
  onTraspasarAutor,
  onAccion,
  onFichar,
  onDesfichar,
}: {
  of: OF;
  operarios: Operario[];
  miId: string | null;
  opById: (id: string | null) => Operario | null;
  onSetRevisor: (ofId: string, revisorId: string | null) => void;
  onTraspasarAutor: (ofId: string, autorId: string) => void;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
}) {
  const meta = ESTADO[of.estado];
  const autor = opById(of.autorId);
  const revisor = opById(of.revisorId);

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
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${meta.chip}`}>
          {meta.label}
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
            Avisos de producción
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

      {of.materialPendienteHasta && (
        <p className="mt-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">
          📦 Material de compras pedido, llega el {fmt(of.materialPendienteHasta)}.
        </p>
      )}

      {/* `reservasMaterial` sigue siendo la señal de "hay dato de RPS": el mock
          no lo rellena, y ahí no se enseña nada en vez de mentir con un
          "sin material asignado". */}
      {of.reservasMaterial !== undefined && (
        <div className="mt-1.5">
          <MaterialChip materiales={of.materiales} />
        </div>
      )}

      {of.observacion && (
        <p className="mt-1.5 rounded-md bg-red-500/10 px-2 py-1 text-[11px] text-red-600 dark:text-red-400">
          ⚠ {of.observacion}
        </p>
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
          trabajo="planteo"
          op={autor}
          min={of.tiempoPlanteoMin}
          live={of.fichandoRol === "plantear"}
          control={
            puedeTraspasarAutor(of) ? (
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
          trabajo="revisión"
          op={revisor}
          min={of.tiempoRevisionMin}
          live={of.fichandoRol === "revisar"}
        />
      </div>

      {/* El total contra lo estimado. El reloj ya NO va aquí: bajó a la fila de
          acciones, ver el comentario de AccionesOF. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-semibold text-text ring-1 ring-border">
          Total {fmtMin(tiempoTotalOF(of))}
          <span className="ml-1 font-normal text-text-muted">/ est. {fmtMin(of.tiempoEstimadoMin)}</span>
        </span>
      </div>

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
}: {
  of: OF;
  operarios: Operario[];
  miId: string | null;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onSetRevisor: (ofId: string, revisorId: string | null) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
}) {
  const { pedirConfirmacion, dialogo } = useConfirmacion((a) => onAccion([of.id], a.id));
  const [pidiendoRevisor, setPidiendoRevisor] = useState(false);
  // Con `miId`: la revisión de otro no la empieza cualquiera, así que su botón
  // ni siquiera se ofrece (ver `soloEl` en lib/acciones.ts).
  const acciones = accionesDisponibles(of, miId);
  const tono = { primaria: "teal", peligro: "rojo", neutra: "ghost" } as const;
  // "Reanudar" y no "Fichar" cuando ya hay tiempo echado: es la vuelta de una
  // pausa, y llamarlo igual que empezar de cero borraba esa diferencia.
  const yaEmpezada = tiempoTotalOF(of) > 0;

  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      {of.fichandoRol ? (
        <Btn
          tone="verde"
          title="Para el reloj y deja la OF como está: sigue siendo tuya y en curso"
          onClick={() => onDesfichar(of.id)}
        >
          ⏸ Pausar
        </Btn>
      ) : esFichable(of) ? (
        <Btn
          tone="verde"
          title={
            yaEmpezada
              ? "Vuelve a poner el reloj en marcha"
              : "Empieza el planteo y pone el reloj en marcha"
          }
          onClick={() => onFichar([of.id], rolFichajeDe(of))}
        >
          {yaEmpezada ? "▶ Reanudar" : "⏱ Fichar"}
        </Btn>
      ) : (
        of.estado !== "aprobada" &&
        of.estado !== "anulada" && (
          <span
            title={motivoNoFichable(of) ?? undefined}
            className="cursor-help rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-text-muted/60"
          >
            ⏱ No fichable
          </span>
        )
      )}
      {acciones.map((a) => {
        if (a.conNota)
          return <DevolverInline key={a.id} onDevolver={(obs) => onAccion([of.id], a.id, obs)} />;
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
            {a.label}
          </Btn>
        );
      })}
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
  tone: "amber" | "teal" | "verde" | "ghost" | "rojo";
  className?: string;
  title?: string;
}) {
  const cls = {
    amber: "bg-amber-500 text-white hover:bg-amber-600",
    teal: "bg-teal-600 text-white hover:bg-teal-700",
    // Verde para el reloj, el mismo de "planteando" en todo el tablero: fichar
    // es empezar a trabajar, y se reconoce por el color sin leer el boton.
    verde: "bg-emerald-600 text-white hover:bg-emerald-700",
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
