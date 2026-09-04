"use client";

import { useEffect, useState } from "react";
import type { EstadoOF, Operario, Pedido } from "@/lib/types";
import { ESTADO, ROL, fmtMin } from "@/lib/estado";
import { FASES } from "@/lib/fases-tablero";
import { ACCIONES, accionesDisponibles, type AccionOF } from "@/lib/acciones";
import { facetsRevisorEnEstado, type FacetRevision as RFacet } from "@/lib/revision";
import { causasDeLoQueFalla, guiaDeFamilias, type EstadoPunto } from "@/lib/guia-revision";
import { leerCausas, type CausaDevolucion } from "@/lib/causas-cliente";
import { FamiliaIcon } from "./FamiliaTag";
import { LiveDot } from "./LiveBadge";
import { DevolverInline } from "./DevolverInline";
import { GuiaRevision } from "./GuiaRevision";
import { NotaDevolucion } from "./NotaDevolucion";
import { useConfirmacion } from "./ConfirmDialog";
import { Select, OpDot } from "./Select";

// ─── Vista Revisiones ────────────────────────────────────────────────────────
// Las cuatro paradas de una OF desde que su autor la suelta hasta que sale a
// Producción. Dos alcances: lo mío como revisor (por defecto) y lo del equipo.
//
// AQUÍ HABÍA una cola de "sin coger": OF en `por_revisar` sin revisor puesto,
// con un botón "Coger y empezar" que te nombraba revisor a ti. Se ha ido, y no
// por sitio: es que esa cola ya no puede existir. El revisor se nombra al pasar
// la OF a revisión —es obligatorio, lo pide `PedirRevisor` y sin él no se
// pasa—, así que toda OF por revisar llega con nombre. Lo que quedaba era una
// puerta para quitarle el trabajo a un compañero sin avisarle, escondida detrás
// de una etiqueta que decía "Sin coger".
//
// Si alguna llegara sin revisor (un pedido de antes de la web), no se esconde:
// sale con el desplegable de revisor abierto para ponerle nombre, que es lo que
// hay que hacer con ella. Cambiar de revisor sigue estando donde estaba, con su
// nombre y avisando al interesado.

const COLUMNAS: { estado: EstadoOF; titulo: string; mio: string }[] = [
  { estado: "por_revisar", titulo: "Por revisar", mio: "Por empezar" },
  { estado: "en_revision", titulo: "En revisión", mio: "Revisando" },
  // "Listas para pasar", no "Aprobadas": es el mismo sitio al que el tablero
  // llama "Listo para pasar", y tener dos nombres para el final del recorrido
  // obliga a traducir mentalmente al cambiar de pestaña.
  { estado: "aprobada", titulo: "Listas para pasar", mio: "Aprobadas por mí" },
  { estado: "devuelta", titulo: "Devueltas", mio: "Devueltas por mí" },
];

// La fase de revisión es violeta (#7c3aed) en toda la app: se reutiliza el
// color de FASES en vez de definir uno propio para estas columnas.
const FASE_REVISION = FASES.find((f) => f.id === "esperandoRevision")!;

const ALCANCE_KEY = "coordina-revision-alcance";
type Alcance = "mias" | "equipo";

function leerAlcanceGuardado(): Alcance {
  if (typeof window === "undefined") return "mias";
  try {
    return localStorage.getItem(ALCANCE_KEY) === "equipo" ? "equipo" : "mias";
  } catch {
    return "mias";
  }
}

export function RevisionView({
  pedidos,
  operarios,
  miId,
  onOpen,
  onCambiarRevisor,
  onAccion,
}: {
  pedidos: Pedido[];
  operarios: Operario[];
  miId: string | null;
  onOpen: (p: Pedido) => void;
  onCambiarRevisor: (ofId: string, revisorId: string) => void;
  onAccion: (ofId: string, accion: AccionOF, obs?: string) => void;
}) {
  // Inicializador perezoso (no setState síncrono en efecto): mismo patrón
  // que Board.tsx usa para leer la identidad guardada.
  const [alcance, setAlcanceState] = useState<Alcance>(leerAlcanceGuardado);
  const setAlcance = (a: Alcance) => {
    setAlcanceState(a);
    try {
      localStorage.setItem(ALCANCE_KEY, a);
    } catch {}
  };
  const mias = alcance === "mias";

  // Las causas, una sola vez para toda la pantalla: de ellas salen la guía de
  // cada tarjeta (su cara en positivo) y las píldoras del cuadro de devolver.
  // Pedirlas por tarjeta serían decenas de consultas para la misma lista.
  const [causas, setCausas] = useState<CausaDevolucion[]>([]);
  useEffect(() => {
    let vivo = true;
    leerCausas().then((cs) => vivo && setCausas(cs));
    return () => {
      vivo = false;
    };
  }, []);

  const facetsDe = (estado: EstadoOF): RFacet[] =>
    mias
      ? facetsRevisorEnEstado(pedidos, estado, miId)
      : pedidos
          .map((p) => ({ pedido: p, ofs: p.ofs.filter((o) => o.estado === estado) }))
          .filter((f) => f.ofs.length > 0);

  const columnas = COLUMNAS.map((col) => ({ ...col, facets: facetsDe(col.estado) }));
  const total = columnas.reduce((n, c) => n + c.facets.reduce((m, f) => m + f.ofs.length, 0), 0);

  // Quién tiene revisiones abiertas ahora mismo. Solo en el alcance de equipo:
  // en "solo mías" la respuesta sería siempre yo, y ya la da la columna.
  const porRevisor = new Map<string, number>();
  for (const p of pedidos)
    for (const o of p.ofs)
      if (o.estado === "en_revision" && o.revisorId)
        porRevisor.set(o.revisorId, (porRevisor.get(o.revisorId) ?? 0) + 1);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-sm font-semibold text-text">
          {mias ? "Lo que tengo que revisar" : "Revisión del equipo"}
        </h1>
        {/* Cuántas OF hay en total en lo que se está mirando. Es el número que
            contesta "¿me queda mucho?" sin sumar las cuatro columnas. */}
        <span className="text-[11px] text-text-muted">
          {total} OF{total === 1 ? "" : "s"} en las cuatro columnas
        </span>
        {!mias && porRevisor.size > 0 && (
          <span className="ml-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-text-muted">Revisando ahora:</span>
            {[...porRevisor.entries()].map(([id, n]) => {
              const op = operarios.find((o) => o.id === id);
              if (!op) return null;
              return (
                <span
                  key={id}
                  className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text ring-1 ring-border"
                  title={`${op.nombre} tiene ${n} OF en revisión`}
                >
                  <span
                    className="grid size-4 place-items-center rounded-full text-[8px] font-bold text-white"
                    style={{ background: op.color }}
                  >
                    {op.iniciales}
                  </span>
                  {op.nombre}
                  <span className={`font-bold ${ROL.revisar.texto}`}>{n}</span>
                </span>
              );
            })}
          </span>
        )}
        <span className="ml-auto">
          <AlcanceToggle alcance={alcance} onChange={setAlcance} />
        </span>
      </div>

      {/* Las CUATRO columnas siempre, tengan algo o no, en los dos alcances.
          En "solo mías" faltaba la de aprobadas y, con todo vacío, se sustituía
          el tablero entero por una frase: se perdía de vista el recorrido y no
          se podía comparar con lo del equipo sin cambiar de sitio. Una columna
          vacía dice "aquí no tienes nada", que es información; que no esté la
          columna, no dice nada.
          items-start: cada columna mide lo que ocupa. Sin esto todas se
          estiraban a la altura de la más larga. */}
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columnas.map((col) => (
          <ColumnaRevision
            key={col.estado}
            titulo={mias ? col.mio : col.titulo}
            estado={col.estado}
            // En "solo mías" todas las columnas son la misma tarea —revisar— y
            // el color de estado sobraba; en la del equipo, cada columna ES un
            // estado y lleva el suyo, el de toda la app.
            dotClassName={mias ? undefined : ESTADO[col.estado].dot}
            dotColor={mias ? FASE_REVISION.color : undefined}
            facets={col.facets}
            operarios={operarios}
            miId={miId}
            causas={causas}
            onOpen={onOpen}
            onCambiarRevisor={onCambiarRevisor}
            onAccion={onAccion}
          />
        ))}
      </div>
    </>
  );
}

// Una columna del tablero de revisión: cabecera con punto de color + título +
// contador, y la lista de tarjetas (o el aviso de "Vacío"). La comparten los
// dos alcances —"Todo el equipo" colorea por ESTADO, "Solo mías" con el violeta
// único de la revisión— para no duplicar el layout en dos sitios.
function ColumnaRevision({
  titulo,
  estado,
  dotClassName,
  dotColor,
  facets,
  operarios,
  miId,
  causas,
  onOpen,
  onCambiarRevisor,
  onAccion,
}: {
  titulo: string;
  estado: EstadoOF;
  dotClassName?: string;
  dotColor?: string;
  facets: RFacet[];
  operarios: Operario[];
  miId: string | null;
  causas: CausaDevolucion[];
  onOpen: (p: Pedido) => void;
  onCambiarRevisor: (ofId: string, revisorId: string) => void;
  onAccion: (ofId: string, accion: AccionOF, obs?: string) => void;
}) {
  const nOF = facets.reduce((n, f) => n + f.ofs.length, 0);
  return (
    <div className="flex flex-col rounded-xl border border-border bg-zone p-3">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`size-2.5 rounded-full ${dotClassName ?? ""}`}
          style={dotColor ? { background: dotColor } : undefined}
        />
        <h2 className="text-sm font-semibold text-text">{titulo}</h2>
        <span className="ml-auto rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-text-muted ring-1 ring-border">
          {nOF} OF
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        {facets.length === 0 ? (
          <div className="grid min-h-20 place-items-center rounded-lg border border-dashed border-border text-xs text-text-muted">
            Vacío
          </div>
        ) : (
          facets.map((f) => (
            <ReviewCard
              key={f.pedido.id}
              facet={f}
              estado={estado}
              operarios={operarios}
              miId={miId}
              causas={causas}
              onOpen={() => onOpen(f.pedido)}
              onCambiarRevisor={onCambiarRevisor}
              onAccion={onAccion}
            />
          ))
        )}
      </div>
    </div>
  );
}

function AlcanceToggle({
  alcance,
  onChange,
}: {
  alcance: Alcance;
  onChange: (a: Alcance) => void;
}) {
  const OPCIONES: { id: Alcance; label: string }[] = [
    { id: "mias", label: "Solo mías" },
    { id: "equipo", label: "Todo el equipo" },
  ];
  return (
    <div className="glass-chip inline-flex rounded-lg p-1" role="group" aria-label="Alcance de la vista de revisión">
      {OPCIONES.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          aria-pressed={alcance === o.id}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
            alcance === o.id
              ? "bg-violet-600 text-white shadow-sm"
              : "text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Avatar({ op, title }: { op: Operario | undefined; title: string }) {
  if (!op) return null;
  return (
    <span
      className="grid size-5 place-items-center rounded-full text-[9px] font-bold text-white"
      style={{ background: op.color }}
      title={`${title}: ${op.nombre}`}
    >
      {op.iniciales}
    </span>
  );
}

function ReviewCard({
  facet,
  estado,
  operarios,
  miId,
  causas,
  onOpen,
  onCambiarRevisor,
  onAccion,
}: {
  facet: RFacet;
  estado: EstadoOF;
  operarios: Operario[];
  miId: string | null;
  /** Todas las que se ofrecen hoy. De aquí salen la guía de esta tarjeta (su
   *  cara en positivo) y las píldoras del cuadro de devolver, unas y otras
   *  acotadas a las familias del pedido. */
  causas: CausaDevolucion[];
  onOpen: () => void;
  onCambiarRevisor: (ofId: string, revisorId: string) => void;
  onAccion: (ofId: string, accion: AccionOF, obs?: string) => void;
}) {
  const { pedido, ofs } = facet;
  const meta = ESTADO[estado];
  const autores = new Set(ofs.map((o) => o.autorId).filter(Boolean) as string[]);
  const ofIds = ofs.map((o) => o.id);
  // Cuánto lleva encima el grupo. En una cola de revisión es lo que dice si
  // hay para diez minutos o para toda la tarde, y no salía por ningún lado.
  const minutos = ofs.reduce((n, o) => n + o.tiempoPlanteoMin + o.tiempoRevisionMin, 0);

  function accionTodas(accion: AccionOF, obs?: string) {
    ofIds.forEach((id) => onAccion(id, accion, obs));
  }

  // Revisor común del grupo (si todas las OFs comparten uno) para pintar el
  // Select con el valor real en vez de vacío.
  const revisorComun =
    ofs.length > 0 && ofs.every((o) => o.revisorId === ofs[0].revisorId)
      ? ofs[0].revisorId
      : null;
  const sinRevisor = ofs.filter((o) => !o.revisorId);

  // Qué puedo hacer YO con este grupo. Es la máquina de estados la que decide
  // (ver `soloEl` en lib/acciones.ts), no esta vista: al autor no se le ofrecen
  // las decisiones del revisor ni al revés, y aquí solo se pinta lo que salga.
  const puedo = (accion: AccionOF) =>
    ofs.length > 0 && ofs.every((o) => accionesDisponibles(o, miId).some((a) => a.id === accion));

  // Confirmación de "Aprobar" desde la máquina de estados: mismo texto y tono
  // que el botón equivalente del Drawer.
  const defAprobar = ACCIONES.find((a) => a.id === "aprobar")!;
  const { pedirConfirmacion, dialogo } = useConfirmacion(() => accionTodas("aprobar"));

  // Lo que la guía lleva marcado en ESTE grupo. Vive aquí y no en la guía
  // porque de aquí sale lo que se le pasa a la devolución, que es el botón de
  // al lado. No se guarda en ninguna parte: es el dedo sobre el papel mientras
  // se repasa, y al cerrar la pantalla ya no hace falta.
  const [marcas, setMarcas] = useState<Record<number, EstadoPunto>>({});
  const [guiaAbierta, setGuiaAbierta] = useState(true);
  // De qué es este trabajo: la guía y las causas se acotan a estas familias.
  // Un pedido puede traer varias (un toldo y su lona) y se repasan las de
  // todas, que es lo que hace el revisor.
  const familias = [...new Set(ofs.map((o) => o.familia).filter(Boolean) as string[])];
  const puntos = guiaDeFamilias(causas, familias);
  const fallos = causasDeLoQueFalla(puntos, marcas);

  const selectorRevisor = (
    <div className="flex w-full items-center gap-1.5 text-[11px] text-text-muted">
      Revisor:
      <Select
        value={revisorComun}
        onChange={(v) => v && ofIds.forEach((id) => onCambiarRevisor(id, v))}
        placeholder={sinRevisor.length > 0 ? "Sin nombrar" : null}
        alignRight
        className="ml-auto"
        options={operarios
          .filter((o) => !autores.has(o.id))
          .map((o) => ({
            value: o.id,
            label: o.id === miId ? `${o.nombre} (tú)` : o.nombre,
            icon: <OpDot color={o.color} iniciales={o.iniciales} />,
          }))}
      />
    </div>
  );

  return (
    <div className={`rounded-lg border border-l-4 border-border bg-surface p-2.5 ${meta.borderIzq}`}>
      <button onClick={onOpen} className="block w-full text-left">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-text">{pedido.codigo}</span>
          {minutos > 0 && (
            <span className="text-[10px] text-text-muted" title="Tiempo ya fichado en estas OF">
              {fmtMin(minutos)}
            </span>
          )}
          <span className="ml-auto text-[10px] text-text-muted">{ofs.length} OF</span>
        </div>
        <div className="truncate text-[11px] text-text-muted">{pedido.cliente}</div>
        <ul className="mt-1.5 space-y-1">
          {ofs.map((of) => (
            <li key={of.id} className="flex items-center gap-1.5 text-[11px]">
              <FamiliaIcon familia={of.familia} className="size-3" />
              <span className="font-mono text-text-muted">{of.codigo}</span>
              <span className="truncate text-text">{of.descripcion}</span>
              {of.fichandoRol && (
                <span title={of.fichandoRol === "revisar" ? "Revisando ahora" : "Planteando ahora"} className="inline-flex">
                  <LiveDot rol={of.fichandoRol} className="size-1.5" />
                </span>
              )}
              <span className="ml-auto flex items-center gap-1">
                <Avatar op={operarios.find((o) => o.id === of.autorId)} title="Autor" />
                {of.revisorId && (
                  <>
                    <span className="text-text-muted">→</span>
                    <Avatar op={operarios.find((o) => o.id === of.revisorId)} title="Revisor" />
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
        {estado === "devuelta" && ofs.find((o) => o.observacion) && (
          <NotaDevolucion
            observacion={ofs.find((o) => o.observacion)!.observacion!}
            className="mt-1.5 rounded bg-red-500/10 px-1.5 py-1 text-[10px] text-red-600 dark:text-red-400"
          />
        )}
      </button>

      {/* Acciones por columna. Solo sale lo que me toca a MÍ: la máquina de
          estados ya filtra por rol, así que al autor esta tarjeta se le queda
          en un resumen de lectura, que es lo que debe ser. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {estado === "por_revisar" && (
          <>
            {/* Sin revisor no debería llegar ninguna (se nombra al pasar a
                revisión). Si pasa, se dice y se ofrece ponerlo: es lo que
                desatasca la OF, y con nombre, no cogiéndosela en silencio. */}
            {sinRevisor.length > 0 && (
              <p className="w-full text-[11px] text-text-muted">
                {sinRevisor.length === ofs.length ? "Sin revisor" : `${sinRevisor.length} sin revisor`} —
                viene de antes de la web. Ponle uno para que pueda empezar.
              </p>
            )}
            {selectorRevisor}
            {puedo("empezar_revision") && (
              <button
                onClick={() => accionTodas("empezar_revision")}
                title="Pasa a En revisión y arranca tu fichaje de revisor"
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${ROL.revisar.solido}`}
              >
                Empezar revisión
              </button>
            )}
          </>
        )}
        {estado === "en_revision" && (
          <>
            {/* Cambio de última hora con la revisión en marcha: al elegir a
                otro, `cambiarRevisor` devuelve la OF a "por revisar" y el
                servidor cierra el fichaje del anterior — sus minutos se quedan
                a su nombre, pero dejan de correr. */}
            {selectorRevisor}
            {/* La guía solo aquí: en "Por revisar" todavía no se está mirando
                nada, y en las otras dos columnas ya se decidió. */}
            {puedo("devolver") && (
              <GuiaRevision
                puntos={puntos}
                marcas={marcas}
                onMarcar={(id, e) => setMarcas((p) => ({ ...p, [id]: e }))}
                abierta={guiaAbierta}
                onAbrir={setGuiaAbierta}
              />
            )}
            {puedo("aprobar") && (
              <button
                onClick={() => pedirConfirmacion(defAprobar)}
                className="rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-700"
              >
                {/* Con varias, el botón DICE cuántas aprueba. Devolver ya deja
                    elegir a cuáles va; aprobar sigue siendo del grupo entero, y
                    un botón que pone "Aprobar" a secas delante de tres OF no
                    avisa de que las está aprobando las tres. Si una no vale, se
                    devuelve primero —sale del grupo— y este botón se queda con
                    las que de verdad están bien. */}
                {ofs.length > 1 ? `Aprobar las ${ofs.length}` : "Aprobar"}
              </button>
            )}
            {puedo("devolver") && (
              <DevolverInline
                // El botón dice cuántas causas lleva puestas: es lo que
                // convierte lo marcado arriba en algo que se ve antes de
                // pulsar, en vez de una sorpresa al abrir el cuadro.
                label={
                  fallos.length > 0
                    ? `Devolver con ${fallos.length} ${fallos.length === 1 ? "causa" : "causas"}`
                    : ACCIONES.find((a) => a.id === "devolver")?.label
                }
                miId={miId}
                causasSugeridas={fallos}
                familias={familias}
                // Se puede devolver SOLO la OF que falla. La nota iba al grupo
                // entero: en un pedido de cinco, cuatro personas leían que
                // corrigieran algo que estaba bien. Por defecto siguen
                // marcadas todas, que es lo normal.
                ofs={ofs.map((o) => ({ id: o.id, codigo: o.codigo }))}
                onDevolver={(obs, ids) =>
                  (ids ?? ofIds).forEach((id) => onAccion(id, "devolver", obs))
                }
              />
            )}
            {dialogo}
          </>
        )}
        {estado === "aprobada" && (
          <span className="text-[11px] font-medium text-cyan-600 dark:text-cyan-400">
            ✓ Lista para pasar a Producción
          </span>
        )}
        {estado === "devuelta" && (
          <span className="text-[11px] text-text-muted">↩ Vuelve al autor</span>
        )}
      </div>
    </div>
  );
}
