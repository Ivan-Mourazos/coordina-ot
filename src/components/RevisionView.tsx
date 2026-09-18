"use client";

import { useEffect, useState } from "react";
import type { EstadoOF, Operario, Pedido } from "@/lib/types";
import { hoyISO } from "@/lib/types";
import { ESTADO, ROL, etiquetaCantidad, fmtMin } from "@/lib/estado";
import { FASES, pedidoListoParaPasar, ofsQueCuentan } from "@/lib/fases-tablero";
import { ACCIONES, accionesDisponibles, type AccionOF } from "@/lib/acciones";
import { facetsRevisorEnEstado, type FacetRevision as RFacet } from "@/lib/revision";
import { causasDeLoQueFalla, guiaDeFamilias, sinMirar } from "@/lib/guia-revision";
import { leerCausas, type CausaDevolucion } from "@/lib/causas-cliente";
import { useMarcasRevision } from "@/lib/marcas-cliente";
import { DevolverInline } from "./DevolverInline";
import { GuiaRevision } from "./GuiaRevision";
import { AprobarInline } from "./AprobarInline";
import { NotaDevolucion } from "./NotaDevolucion";
import { Select, OpDot } from "./Select";
import { BloqueLista } from "./BloqueLista";
import { FilaDesplegable } from "./FilaDesplegable";
import { PedidoCodigo } from "./PedidoCodigo";
import { FilaOF } from "./FilaOF";
import { tintaSobre } from "@/lib/tinta";

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
// Si alguna llegara sin revisor, ya no puede pasar de aquí: /api/estado
// rechaza guardar una OF en `por_revisar` sin uno (Task 14), y la migración de
// esa misma tarea devolvió al panel de su autor las que se habían colado antes
// de esa guarda. Por eso ya no hay aviso de "sin revisor" en esta columna. El
// selector se queda de todas formas: cambiar de revisor sigue siendo cosa de
// todos los días, con su nombre y avisando al interesado.

/** Las columnas de una línea de revisión. Literal entera (Tailwind).
 *  chevron · pedido · cliente · nº OF · tiempo · autor→revisor · (sobrante)
 *
 *  El cliente lleva TOPE y el sobrante va a una columna vacía al final. Con el
 *  cliente a `1fr`, en un monitor ancho las cifras se iban a 1.300 px del
 *  nombre y había que seguir la fila con el dedo para saber de quién eran. */
const COLUMNAS_REVISION =
  "grid grid-cols-[28px_136px_minmax(0,36rem)_56px_64px_84px_1fr] items-center gap-x-3";

const COLUMNAS: { estado: EstadoOF; titulo: string; mio: string }[] = [
  { estado: "por_revisar", titulo: "Por revisar", mio: "Por empezar" },
  { estado: "en_revision", titulo: "En revisión", mio: "Revisando" },
  { estado: "aprobada", titulo: "Aprobadas", mio: "Aprobadas por mí" },
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
  // El único que monta esta vista es Board.tsx, después de su
  // `if (!miId) return <IdentityGate .../>`: aquí siempre hay alguien
  // identificado. Que dijera `| null` obligaba a `useMarcasRevision` (dentro
  // de FilaRevision, más abajo) a aceptar un caso que en realidad no se da.
  miId: string;
  onOpen: (p: Pedido) => void;
  onCambiarRevisor: (ofId: string, revisorId: string) => void;
  onAccion: (ofId: string, accion: AccionOF, obs?: string) => void;
}) {
  // Para el aviso de "material pendiente" de `FilaOF`, la misma que usa
  // Pendientes: una sola vez aquí arriba y no una por fila.
  const hoy = hoyISO();
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
  // cada fila (su cara en positivo) y las píldoras del cuadro de devolver.
  // Pedirlas por fila serían decenas de consultas para la misma lista.
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
            contesta "¿me queda mucho?" sin sumar las cuatro secciones. */}
        <span className="text-[11px] text-text-muted">
          {total} OF{total === 1 ? "" : "s"} en las cuatro secciones
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
                    style={{ background: op.color, color: tintaSobre(op.color) }}
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

      {/* LOS CUATRO ESTADOS, UNO DEBAJO DE OTRO. Estaban en cuatro columnas y
          cada tarjeta vivía en ~260 px: ahí no caben el selector de revisor,
          la guía de ocho puntos y dos botones sin apretarlo todo. A lo ancho
          cabe, y el recorrido se sigue leyendo igual porque el orden de los
          cuatro no cambia — solo va de arriba abajo en vez de izquierda a
          derecha. */}
      <div className="flex flex-col gap-4">
        {columnas.map((col) => (
          <SeccionRevision
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
            hoy={hoy}
            onOpen={onOpen}
            onCambiarRevisor={onCambiarRevisor}
            onAccion={onAccion}
          />
        ))}
      </div>
    </>
  );
}

// Un estado de la revisión: su rótulo con punto de color y contador, y debajo
// una línea por pedido. La comparten los dos alcances — "Todo el equipo"
// colorea por ESTADO, "Solo mías" con el violeta único de la revisión.
function SeccionRevision({
  titulo,
  estado,
  dotClassName,
  dotColor,
  facets,
  operarios,
  miId,
  causas,
  hoy,
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
  miId: string;
  causas: CausaDevolucion[];
  hoy: string;
  onOpen: (p: Pedido) => void;
  onCambiarRevisor: (ofId: string, revisorId: string) => void;
  onAccion: (ofId: string, accion: AccionOF, obs?: string) => void;
}) {
  const nOF = facets.reduce((n, f) => n + f.ofs.length, 0);
  return (
    <section aria-label={titulo}>
      <BloqueLista
        columnas={COLUMNAS_REVISION}
        sinCaja
        rotulo={{
          texto: titulo,
          claseDot: dotClassName,
          color: dotColor,
          // Vacía, la sección se queda en su rótulo: cuatro "Aquí no tienes
          // nada ahora mismo" seguidos ocupaban media pantalla para decir que
          // no había nada, y empujaban hacia abajo la sección que sí tenía.
          sufijo: nOF === 0 ? "· nada ahora mismo" : `· ${nOF} OF`,
        }}
        // Antes de unificar las cuatro vistas esto era un <h2> (no hay ningún
        // <h1> POR ENCIMA de estos rótulos salvo el de la propia pantalla) —
        // ver `git show main:src/components/RevisionView.tsx`. `BloqueLista`
        // pinta `h3` por defecto para el Historial, que sí cuelga de un <h2>
        // intermedio; aquí saltaría de un <h1> a un <h3> sin nada en medio.
        nivelRotulo="h2"
      >
        {facets.length === 0 ? null : (
          facets.map((f) => (
            <FilaRevision
              key={f.pedido.id}
              facet={f}
              estado={estado}
              operarios={operarios}
              miId={miId}
              causas={causas}
              hoy={hoy}
              onOpen={() => onOpen(f.pedido)}
              onCambiarRevisor={onCambiarRevisor}
              onAccion={onAccion}
            />
          ))
        )}
      </BloqueLista>
    </section>
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
              ? "bg-brand-400 text-[#231903] shadow-sm"
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
      style={{ background: op.color, color: tintaSobre(op.color) }}
      title={`${title}: ${op.nombre}`}
    >
      {op.iniciales}
    </span>
  );
}

function FilaRevision({
  facet,
  estado,
  operarios,
  miId,
  causas,
  hoy,
  onOpen,
  onCambiarRevisor,
  onAccion,
}: {
  facet: RFacet;
  estado: EstadoOF;
  operarios: Operario[];
  miId: string; // Viene de RevisionView, ya identificado — ver su comentario.
  /** Todas las que se ofrecen hoy. De aquí salen la guía de esta fila (su
   *  cara en positivo) y las píldoras del cuadro de devolver, unas y otras
   *  acotadas a las familias del pedido. */
  causas: CausaDevolucion[];
  /** Para el aviso de "material pendiente" de `FilaOF`. */
  hoy: string;
  onOpen: () => void;
  onCambiarRevisor: (ofId: string, revisorId: string) => void;
  onAccion: (ofId: string, accion: AccionOF, obs?: string) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const { pedido, ofs } = facet;
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

  // Lo que la guía lleva marcado en ESTE grupo. Vive aquí y no en la guía
  // porque de aquí sale lo que se le pasa a la devolución, que es el botón de
  // al lado. No se guarda en ninguna parte: es el dedo sobre el papel mientras
  // se repasa, y al cerrar la pantalla ya no hace falta.
  // Lo comprobado va al servidor: de ello depende poder aprobar, y perderlo al
  // refrescar obligaría a repasar los ocho puntos otra vez (ver
  // useMarcasRevision).
  const { marcas, marcar } = useMarcasRevision(ofIds, miId);
  const [guiaAbierta, setGuiaAbierta] = useState(true);
  // De qué es este trabajo: la guía y las causas se acotan a estas familias.
  // Un pedido puede traer varias (un toldo y su lona) y se repasan las de
  // todas, que es lo que hace el revisor.
  const familias = [...new Set(ofs.map((o) => o.familia).filter(Boolean) as string[])];
  const puntos = guiaDeFamilias(causas, familias);
  const fallos = causasDeLoQueFalla(puntos, marcas);
  // NO SE APRUEBA NI SE DEVUELVE CON PUNTOS SIN MIRAR. La guía deja de ser un
  // recordatorio y pasa a ser el paso previo: dar por buena una OF sin haberla
  // repasado entera es lo que esto viene a evitar, y devolverla a medias deja
  // al autor con media corrección —lo que no se miró aparece en la vuelta
  // siguiente—. Con la guía vacía (una familia sin puntos todavía) no se
  // bloquea nada: no habría forma de desbloquearlo.
  const faltan = sinMirar(puntos, marcas);
  const impedido = faltan > 0 ? `Faltan ${faltan} ${faltan === 1 ? "punto" : "puntos"} por mirar` : null;

  // Revisor y acción COMPARTEN LÍNEA. Esto era un `flex w-full` con el
  // desplegable en `ml-auto`: el `w-full` le daba un renglón para él solo y el
  // `ml-auto` mandaba el selector al otro extremo, así que entre la palabra
  // "Revisor:" y el nombre quedaba media pantalla en blanco, y el botón de
  // empezar caía en un tercer renglón. Suelto y compacto, los dos entran en la
  // misma fila de acciones y el hueco desaparece.
  const selectorRevisor = (
    <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
      Revisor:
      <Select
        value={revisorComun}
        onChange={(v) => v && ofIds.forEach((id) => onCambiarRevisor(id, v))}
        placeholder={sinRevisor.length > 0 ? "Sin nombrar" : null}
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

  const autoresDelGrupo = [...new Set(ofs.map((o) => o.autorId).filter(Boolean) as string[])];

  return (
    <FilaDesplegable
      columnas={COLUMNAS_REVISION}
      /* Cada pedido, su tarjeta con relieve, y hundida al abrirla: lo mismo
         que Pendientes y el Historial. El estado sigue teniendo su rótulo
         encima; lo que se va es la caja que envolvía a todas las filas
         (`sinCaja` arriba), que con las filas ya en tarjeta pintaba un fondo
         de más por detrás. */
      tarjeta
      abierta={abierta}
      onAlternar={() => setAbierta((a) => !a)}
      etiqueta={pedido.codigo}
      idDetalle={`revision-${estado}-${pedido.id}`}
      celdas={
        <>
          {/* El código abre la ficha; el resto de la línea despliega. Va con
              `PedidoCodigo` y no con un botón propio: ese componente lleva el
              `relative z-10` que lo sube por encima del botón de cubierta de
              `FilaDesplegable`, y sin él el clic no llega nunca aquí — se lo
              come la cubierta, que está posicionada y se pinta por encima. */}
          <span className="min-w-0">
            <PedidoCodigo codigo={pedido.codigo} onAbrir={onOpen} />
          </span>
          {/* El cliente y, pegado a él, en qué ha quedado el PEDIDO. Iba en
              una segunda línea a lo ancho y gastaba un renglón por fila para
              cuatro palabras; aquí al lado sobra sitio —el cliente rara vez
              llena su columna— y se lee de corrido: "Hotel Pazo Real · listo
              para Producción".
              El estado va `shrink-0`: si el ancho aprieta, lo que se recorta
              es el nombre del cliente, que se sigue leyendo entero al posar
              el ratón; el estado, no, que es a lo que se viene aquí. */}
          <span className="pointer-events-none flex min-w-0 items-baseline gap-2 text-[11px]">
            <span className="min-w-0 truncate text-text-muted" title={pedido.cliente}>
              {pedido.cliente}
            </span>
            {estado === "aprobada" && (
              <span className={`shrink-0 font-medium ${ESTADO.aprobada.texto}`}>
                {pedidoListoParaPasar(pedido)
                  ? "✓ Pedido listo para pasar a Producción"
                  : `✓ ${ofsQueCuentan(pedido).filter((o) => o.estado === "aprobada").length} de ${ofsQueCuentan(pedido).length} OF aprobadas · queda trabajo pendiente`}
              </span>
            )}
            {estado === "devuelta" && (
              <span className="shrink-0 text-text-muted">↩ Vuelve al autor</span>
            )}
          </span>
          <span className="pointer-events-none text-[11px] text-text-muted">
            {ofs.length} OF
          </span>
          <span
            className="pointer-events-none text-right font-mono text-[11px] tabular-nums text-text-muted"
            title="Tiempo ya fichado en estas OF"
          >
            {minutos > 0 ? fmtMin(minutos) : "—"}
          </span>
          {/* De quién viene y a quién le toca, que es lo que se pregunta al
              mirar una cola de revisión. */}
          <span className="pointer-events-none flex items-center justify-end gap-1">
            {autoresDelGrupo.slice(0, 2).map((id) => (
              <Avatar key={id} op={operarios.find((o) => o.id === id)} title="Autor" />
            ))}
            {revisorComun && (
              <>
                <span className="text-text-muted">→</span>
                <Avatar op={operarios.find((o) => o.id === revisorComun)} title="Revisor" />
              </>
            )}
          </span>
        </>
      }
      detalle={
        <div className="space-y-2">
          {/* Las OF del grupo, con la misma pinta que en Pendientes: mismo
              componente, mismo dato ("¿en qué anda esta OF?"), un solo sitio
              que mantener en vez de una `<ul>` propia con menos información. */}
          <ul className="space-y-1.5">
            {ofs.map((of) => (
              <FilaOF key={of.id} of={of} operarios={operarios} hoy={hoy} />
            ))}
          </ul>

          {estado === "devuelta" && ofs.find((o) => o.observacion) && (
            <NotaDevolucion
              observacion={ofs.find((o) => o.observacion)!.observacion!}
              className="rounded bg-red-500/10 px-2 py-1.5 text-[11px] text-red-600 dark:text-red-400"
            />
          )}

          {/* Acciones. Solo sale lo que me toca a MÍ: la máquina de estados ya
              filtra por rol, así que al autor esto se le queda en un resumen de
              lectura, que es lo que debe ser. */}
          <div className="flex flex-wrap items-center gap-2">
            {estado === "por_revisar" && (
              <>
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
                {selectorRevisor}
                {puedo("devolver") && (
                  <GuiaRevision
                    puntos={puntos}
                    marcas={marcas}
                    onMarcar={marcar}
                    abierta={guiaAbierta}
                    onAbrir={setGuiaAbierta}
                  />
                )}
                {puedo("aprobar") && (
                  <AprobarInline
                    ofs={ofs.map((o) => ({ id: o.id, codigo: o.codigo }))}
                    onAprobar={(ids) => ids.forEach((id) => onAccion(id, "aprobar", undefined))}
                    impedido={impedido}
                    label={etiquetaCantidad("Aprobar", ofs.length)}
                  />
                )}
                {puedo("devolver") && (
                  <DevolverInline
                    label={
                      fallos.length > 0
                        ? `Devolver con ${fallos.length} ${fallos.length === 1 ? "causa" : "causas"}`
                        : ACCIONES.find((a) => a.id === "devolver")?.label
                    }
                    miId={miId}
                    causasSugeridas={fallos}
                    familias={familias}
                    impedido={impedido}
                    ofs={ofs.map((o) => ({ id: o.id, codigo: o.codigo }))}
                    onDevolver={(obs, ids) => (ids ?? ofIds).forEach((id) => onAccion(id, "devolver", obs))}
                  />
                )}
              </>
            )}
          </div>
        </div>
      }
    />
  );
}
