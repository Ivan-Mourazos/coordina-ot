"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DocumentoRps,
  HistorialOF,
  HistorialPedidoDetalle,
  MaterialOF,
} from "@/lib/historial";
import type { Rol } from "@/lib/types";
import { esCodigoPedido } from "@/lib/types";
import { repartirMateriales } from "@/lib/historial";
import { PRIORIDAD, ROL, fmtMin } from "@/lib/estado";
import { FamiliaTag } from "./FamiliaTag";
import { useFocoModal } from "@/lib/useFocoModal";

function fmtFecha(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Drawer read-only del historial: PDF (mediano, ampliable) + datos del pedido y
 *  sus OFs con tiempos. Sin acciones (el pedido está finalizado). */
export function HistorialDrawer({
  pedido,
  onClose,
}: {
  pedido: string | null;
  onClose: () => void;
}) {
  const [detalle, setDetalle] = useState<HistorialPedidoDetalle | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const [ampliado, setAmpliado] = useState(false);
  const reqSeq = useRef(0);

  const [prevPedido, setPrevPedido] = useState<string | null>(null);
  // Reset al cambiar de pedido DURANTE el render (no en un efecto): así nunca
  // hay un frame con la cabecera del pedido nuevo y los datos/PDF del anterior.
  if (pedido !== prevPedido) {
    setPrevPedido(pedido);
    setDetalle(null);
    setError(false);
    setAmpliado(false);
  }

  const cargar = useCallback(async (cod: string) => {
    const seq = ++reqSeq.current;
    setCargando(true);
    setError(false);
    try {
      const r = await fetch(`/api/historial/${cod}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as HistorialPedidoDetalle;
      if (seq !== reqSeq.current) return; // respuesta de un pedido anterior: la ignoramos
      setDetalle(d);
    } catch {
      if (seq !== reqSeq.current) return;
      setError(true);
    } finally {
      if (seq === reqSeq.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!pedido) return;
    // `cargar` llama a setState de forma síncrona (setCargando/setError/setDetalle);
    // se difiere con setTimeout(0) para que el propio efecto no dispare setState
    // sincrónicamente (react-hooks/set-state-in-effect), sin recurrir a un disable.
    const id = setTimeout(() => cargar(pedido), 0);
    return () => clearTimeout(id);
  }, [pedido, cargar]);

  // Con el drawer abierto, la rueda seguía moviendo la lista del historial que
  // hay detrás: al cerrarlo aparecías en otro sitio. Se congela el body y se
  // compensa el ancho de la barra para que el fondo no dé un salto lateral.
  useEffect(() => {
    if (!pedido) return;
    const { body } = document;
    const overflowPrevio = body.style.overflow;
    const paddingPrevio = body.style.paddingRight;
    const hueco = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (hueco > 0) body.style.paddingRight = `${hueco}px`;
    return () => {
      body.style.overflow = overflowPrevio;
      body.style.paddingRight = paddingPrevio;
    };
  }, [pedido]);

  useEffect(() => {
    if (!pedido) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (ampliado) setAmpliado(false);
        else onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pedido, ampliado, onClose]);

  // Mismo trato que el drawer del tablero: con telón delante, el foco no puede
  // quedarse recorriendo la lista del historial que hay detrás.
  const modalRef = useFocoModal<HTMLDivElement>(pedido !== null);

  if (!pedido) return null;
  const scanUrl = detalle?.scanUrl ?? `/api/pedidos/${pedido}.pdf`;
  // La ruta de PDFs resuelve las tres delegaciones (AR, SA y BE); para lo que
  // no sea un pedido de venta —trabajo interno, OF sueltas— se avisa en vez de
  // pedir un fichero que no existe.
  const pdfSoportado = esCodigoPedido(pedido);

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Historial del pedido ${pedido}`}
      className="fixed inset-0 z-50"
    >
      <div className="overlay-in absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

      {/* PDF mediano a la izquierda */}
      <div className="overlay-in absolute inset-y-0 left-0 right-[32rem] flex flex-col p-6" onClick={onClose}>
        <div className="min-h-0 flex-1" onClick={(e) => e.stopPropagation()}>
          {pdfSoportado ? (
            <div className="relative h-full w-full">
              <iframe
                src={`${scanUrl}#view=Fit`}
                title={`Pedido ${pedido}`}
                className="h-full w-full rounded-xl border-none bg-white"
              />
              <button
                onClick={() => setAmpliado(true)}
                className="absolute right-3 top-3 rounded-lg bg-black/60 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black/80"
              >
                Ampliar ⤢
              </button>
            </div>
          ) : (
            <div className="grid h-full w-full place-items-center rounded-xl bg-surface-2 text-sm text-text-muted">
              PDF no disponible para esta serie
            </div>
          )}
        </div>
      </div>

      {/* Panel derecho: datos + OFs */}
      <aside className="glass-panel-strong drawer-in absolute right-0 top-0 flex h-full w-full max-w-lg flex-col rounded-l-2xl">
        <header className="flex items-start gap-3 p-4" style={{ boxShadow: "inset 0 -1px 0 0 var(--glass-border)" }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-lg font-bold text-text">{pedido}</h2>
              {detalle && (
                <span
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white"
                  style={{ background: PRIORIDAD[detalle.prioridad].color }}
                  title={`Prioridad ${PRIORIDAD[detalle.prioridad].label}`}
                >
                  P{detalle.prioridad} {PRIORIDAD[detalle.prioridad].label}
                </span>
              )}
            </div>
            <p className="truncate text-sm text-text-muted">
              {detalle?.cliente ?? "—"}
              {detalle?.negocio && <span className="font-semibold text-text"> · {detalle.negocio}</span>}
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" data-foco-inicial
            className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text">
            ✕
          </button>
        </header>

        <div className="scroll-thin flex-1 overflow-y-auto p-4">
          {cargando && <p className="text-sm text-text-muted">Cargando…</p>}
          {error && (
            <div className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-text">
              No se pudo cargar el pedido.
              <button onClick={() => cargar(pedido)} className="rounded-lg bg-surface px-2 py-1 text-xs font-semibold ring-1 ring-border hover:bg-surface-2">
                Reintentar
              </button>
            </div>
          )}

          {detalle && !cargando && (
            <>
              <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                <Meta k="Solicitud" v={fmtFecha(detalle.fechaSolicitud)} />
                <Meta k="Finalización" v={fmtFecha(detalle.fechaFinalizacion)} />
                <Meta k="Piezas" v={String(detalle.piezas)} />
                {detalle.ciudadEntrega && <Meta k="Entrega en" v={detalle.ciudadEntrega} />}
                <div className="col-span-2">
                  <dt className="mb-1 text-text-muted">Familias</dt>
                  <dd className="flex flex-wrap gap-1">
                    {detalle.familias.map((f) => <FamiliaTag key={f} familia={f} />)}
                  </dd>
                </div>
              </dl>

              {/* Lo que el pedido de venta dice, de lo concreto a lo general:
                  primero qué se vendió, después cómo se monta, y al final el
                  comentario de cabecera, que es el que menos se rellena (473 de
                  3962 pedidos) y el que menos suele aportar. */}
              {detalle.comentariosLinea.length > 0 && (
                <Bloque titulo={`Lo vendido (${detalle.comentariosLinea.length})`}>
                  <ul className="space-y-1.5">
                    {detalle.comentariosLinea.map((c, i) => (
                      <li
                        key={i}
                        className="whitespace-pre-line border-l-2 border-[var(--glass-border)] pl-2 text-[11px] leading-snug text-text"
                      >
                        {c}
                      </li>
                    ))}
                  </ul>
                </Bloque>
              )}

              {detalle.comentarioEnvio && (
                <Bloque titulo="Montaje y envío">
                  <p className="whitespace-pre-line text-[11px] leading-snug text-text">
                    {detalle.comentarioEnvio}
                  </p>
                </Bloque>
              )}

              {detalle.comentarioVenta && (
                <Bloque titulo="Comentario del pedido">
                  <p className="whitespace-pre-line text-[11px] leading-snug text-text">
                    {detalle.comentarioVenta}
                  </p>
                </Bloque>
              )}

              <Documentos documentos={detalle.documentos} />

              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Órdenes de fabricación ({detalle.ofs.length})
              </h3>
              <ul className="space-y-2">
                {detalle.ofs.map((of) => (
                  <li key={of.codigo} className="glass-chip rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-text">{of.codigo}</span>
                      <span className="ml-auto rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-text ring-1 ring-border">
                        {fmtMin(of.tiempoImputadoMin)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-text">{of.descripcion}</p>
                    <Personas of={of} />
                    <Materiales of={of} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </aside>

      {/* Ampliado: PDF a pantalla casi completa */}
      {ampliado && pdfSoportado && (
        <div className="overlay-in fixed inset-0 z-[80] bg-black/70 backdrop-blur-md" onClick={() => setAmpliado(false)}>
          <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 p-4 text-white">
            <span className="font-mono text-sm font-bold">{pedido}</span>
            <a href={scanUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
              className="ml-auto rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20">
              Abrir original ↗
            </a>
            <button onClick={() => setAmpliado(false)} aria-label="Cerrar"
              className="grid size-9 place-items-center rounded-lg bg-white/10 text-lg hover:bg-white/20">✕</button>
          </div>
          <div className="grid h-full place-items-center p-10" onClick={() => setAmpliado(false)}>
            <iframe src={scanUrl} title={`Pedido ${pedido}`} onClick={(e) => e.stopPropagation()}
              className="h-full w-full max-w-5xl rounded-xl bg-white shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}

/** Orden estable de nombres dentro de un rol.
 *
 *  Alfabético a propósito, NO por minutos: ordenando por tiempo, la misma OF se
 *  recolocaba sola según quién hubiera echado más horas ese día, y era justo lo
 *  que hacía que dos listas de las mismas personas salieran en orden distinto
 *  (el pedido AR.26.03798 enseñaba "Jaime, Adrián" arriba y "Adrián, Jaime"
 *  debajo). Alfabético siempre da lo mismo y se explica solo. */
const porNombre = (a: string, b: string) => a.localeCompare(b, "es");

/** Quién trabajó en la OF, cada persona UNA vez y con su rol al lado.
 *
 *  Antes había aquí dos renglones: `of.quien` (quién imputó tiempo en RPS) y
 *  debajo el desglose por rol. Como son casi el mismo conjunto de gente dicho
 *  dos veces, y encima en orden distinto, había que leer las dos listas y
 *  compararlas mentalmente para descubrir que no aportaban nada nueva la una
 *  sobre la otra. Ahora se funden: manda el rol, y quien imputó tiempo pero no
 *  encaja en ningún rol se recoge aparte para no perderlo.
 *
 *  El orden es el del flujo de trabajo — primero quien planteó, después quien
 *  revisó — y no depende de los minutos (ver `porNombre`). */
function Personas({ of }: { of: HistorialOF }) {
  // `rol` es dato registrado (fichado en CoordinaOT) y `rolDeducido` es una
  // suposición sacada del reparto de minutos de RPS. Nunca vienen los dos, y la
  // diferencia tiene que seguir viéndose: el tipo `HistorialOF` es explícito en
  // que quien lo pinte debe poder decir que es una suposición.
  const deducido = !of.rol && !!of.rolDeducido;
  const planteo = of.rol?.quienPlanteo ?? of.rolDeducido?.quienPlanteo ?? [];
  const revision = of.rol?.quienReviso ?? of.rolDeducido?.quienReviso ?? [];

  // Quien imputó tiempo en RPS pero no aparece en ningún rol: pasa cuando la OF
  // se fichó aquí y alguien más le metió horas por RPS. Se enseña sin rol antes
  // que dejarlo fuera.
  const conRol = new Set([...planteo, ...revision]);
  const sueltos = of.quien.filter((n) => !conRol.has(n)).sort(porNombre);

  // Un rol se pinta si tiene gente o si tiene tiempo fichado: 0 minutos y nadie
  // es "no hubo revisión", y una fila vacía solo estorba.
  const hayPlanteo = planteo.length > 0 || (of.rol?.planteoMin ?? 0) > 0;
  const hayRevision = revision.length > 0 || (of.rol?.revisionMin ?? 0) > 0;

  if (!hayPlanteo && !hayRevision && sueltos.length === 0) {
    return <p className="mt-1 text-[11px] text-text-muted">—</p>;
  }

  return (
    <div className="mt-2 space-y-1">
      {hayPlanteo && (
        <FilaRol rol="plantear" quien={planteo} min={of.rol?.planteoMin} deducido={deducido} />
      )}
      {hayRevision && (
        <FilaRol rol="revisar" quien={revision} min={of.rol?.revisionMin} deducido={deducido} />
      )}
      {sueltos.length > 0 && (
        <div
          className="flex items-start gap-1.5 text-[11px]"
          title="Imputó tiempo a esta OF en RPS, pero sin rol registrado en CoordinaOT."
        >
          <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-text-muted ring-1 ring-border">
            Imputó
          </span>
          <span className="min-w-0 flex-1 text-text">{sueltos.join(", ")}</span>
        </div>
      )}
    </div>
  );
}

/** Una fila: rol + quién + cuánto. El color sale de ROL (plantear = esmeralda,
 *  revisar = violeta), el mismo par que usa el resto de la app.
 *
 *  El tiempo va rotulado con el ROL y no con la persona porque eso es lo que
 *  hay: RPS y el fichaje guardan minutos por rol, no por cabeza, así que con
 *  dos personas planteando el total es de las dos. Deducido no lleva tiempo
 *  ninguno — de esas OF solo se sabe el reparto, no el desglose. */
function FilaRol({
  rol,
  quien,
  min,
  deducido,
}: {
  rol: Rol;
  quien: string[];
  min?: number;
  deducido: boolean;
}) {
  const etiqueta = rol === "plantear" ? "Planteo" : "Revisión";
  return (
    <div
      className="flex items-start gap-1.5 text-[11px]"
      title={
        deducido
          ? `${etiqueta} deducido del reparto de tiempo de RPS: quien más horas lleva planteó y quien lleva pocas revisó. Es una suposición, no un dato registrado.`
          : `${etiqueta} fichado en CoordinaOT. El tiempo es el del rol y puede repartirse entre varias personas.`
      }
    >
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${ROL[rol].chip}`}
      >
        {/* El "≈" marca que el rol es deducido, no registrado. */}
        {deducido && "≈ "}
        {etiqueta}
      </span>
      <span className="min-w-0 flex-1 text-text">
        {quien.length > 0 ? [...quien].sort(porNombre).join(", ") : "—"}
      </span>
      {min !== undefined && (
        <span className="shrink-0 font-semibold text-text-muted">{fmtMin(min)}</span>
      )}
    </div>
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

/** Caja con rótulo del panel derecho. Existe porque ahora hay cuatro (lo
 *  vendido, montaje, comentario y documentos) y repetir el mismo borde y el
 *  mismo rótulo cuatro veces se desalineaba solo. */
function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)] p-3">
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

/** Orden en el que se enseñan las clases de documento.
 *
 *  No es alfabético a propósito: va del trabajo de Oficina Técnica hacia fuera
 *  —planteamiento y diseño primero, luego el papeleo de venta, y al final lo de
 *  taller—, que es el orden en el que se busca cuando se abre un pedido viejo.
 *  Lo que no esté aquí (clase "Documento" y lo que RPS se invente mañana) cae al
 *  final, sin perderse. */
const ORDEN_CLASES = [
  "Planteamiento",
  "Diseño",
  "Presupuesto",
  "Presupuesto escaneado",
  "Pedido escaneado",
  "Remates",
  "Rotulación",
  "Foto del trabajo",
  "Etiquetas",
  "Hoja de almacén",
  "Adjunto de la OF",
  "Mantenimiento (SAT)",
];

/** Todo lo que RPS tiene colgado del pedido, agrupado por clase.
 *
 *  Agrupado y no en una lista seguida porque la media (4,8 documentos) engaña:
 *  el adjunto de taller es uno POR OF, así que un pedido de 12 OFs trae 12
 *  "Adjunto OF …" seguidos y entre ellos se pierde el planteamiento, que es lo
 *  que se venía a buscar. Con los grupos, cada cosa está donde se espera.
 *
 *  Sin paginar: el pedido más cargado que se ha visto anda por los 60 y pico
 *  documentos y el panel ya tiene scroll. */
function Documentos({ documentos }: { documentos: DocumentoRps[] }) {
  if (documentos.length === 0) {
    return (
      <Bloque titulo="Documentos">
        <p className="text-[11px] text-text-muted">RPS no tiene nada colgado de este pedido.</p>
      </Bloque>
    );
  }

  // Se agrupa conservando el orden de llegada dentro de cada clase: ese orden
  // es el del id del enlace en RPS, o sea el de subida, y es el que hace que
  // "version 1" salga antes que "version 2".
  const porClase = new Map<string, DocumentoRps[]>();
  for (const d of documentos) {
    const suyos = porClase.get(d.clase) ?? [];
    suyos.push(d);
    porClase.set(d.clase, suyos);
  }
  const grupos = [...porClase.entries()].sort((a, b) => {
    const ia = ORDEN_CLASES.indexOf(a[0]);
    const ib = ORDEN_CLASES.indexOf(b[0]);
    return (ia < 0 ? ORDEN_CLASES.length : ia) - (ib < 0 ? ORDEN_CLASES.length : ib);
  });

  return (
    <Bloque titulo={`Documentos (${documentos.length})`}>
      <div className="space-y-2.5">
        {grupos.map(([clase, suyos]) => (
          <div key={clase}>
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold text-text-muted">
              {clase}
              {suyos.length > 1 && (
                <span className="rounded bg-surface-2 px-1 text-[9px] font-bold text-text-muted ring-1 ring-border">
                  {suyos.length}
                </span>
              )}
            </p>
            <ul className="space-y-0.5">
              {/* La clave lleva el índice porque ni el nombre ni la URL sirven
                  solos: dos documentos pueden llamarse igual, y los que no se
                  pueden abrir no tienen URL con la que distinguirse. */}
              {suyos.map((d, i) => (
                <li key={`${i}-${d.url ?? d.archivo}`} className="text-[11px] leading-snug">
                  <Documento doc={d} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Bloque>
  );
}

/** Un documento: enlace si hay fichero que abrir, texto apagado si no.
 *
 *  Se enseña la descripción de RPS ("Planteamiento del pedido AR.26.02932,
 *  version 1") y debajo el nombre del fichero, porque hay descripciones que se
 *  repiten clavadas entre versiones y el nombre es lo único que las distingue.
 *  Si la descripción viene vacía, el nombre hace de título y no se repite. */
function Documento({ doc }: { doc: DocumentoRps }) {
  const titulo = doc.descripcion || doc.archivo;
  const subtitulo = doc.descripcion && doc.archivo !== doc.descripcion ? doc.archivo : null;

  if (!doc.url) {
    return (
      <span
        className="block text-text-muted/70"
        title="RPS lo tiene guardado en su gestor documental, no como fichero del archivo: desde aquí no se puede abrir."
      >
        {titulo} <span className="text-[10px]">(no se puede abrir)</span>
      </span>
    );
  }

  return (
    <a
      href={doc.url}
      target="_blank"
      rel="noreferrer"
      className="block text-text underline decoration-dotted underline-offset-2 hover:text-brand-600 dark:hover:text-brand-300"
      title={`Abrir ${doc.archivo}`}
    >
      {titulo} ↗
      {subtitulo && (
        <span className="block font-mono text-[10px] text-text-muted">{subtitulo}</span>
      )}
    </a>
  );
}

/** Material que lleva la OF y lo que Producción apuntó en ella.
 *
 *  El material se enseña en DOS grupos rotulados, y separarlos es el punto:
 *   · Apartado — sigue habiendo reserva viva en RPS. Dice que ese material está
 *     separado en el almacén para este trabajo, ahora mismo.
 *   · Apuntado — solo lo que Oficina Técnica escribió en la OF. Dice lo que
 *     hacía falta, se haya apartado o no.
 *  Dicho con las mismas letras y el mismo color, las dos cosas se leerían como
 *  una sola y no lo son. Lo apartado va primero y lleva el 🧵 verde azulado del
 *  tablero, que es donde la gente ya asocia ese icono a "material reservado".
 *
 *  Casi siempre solo habrá apuntado: de las 36 918 OF de OT ya terminadas, 140
 *  conservan reserva y 14 419 conservan material apuntado. Lo apartado aparece
 *  en los pedidos recién cerrados, que es justo cuando alguien lo va a mirar. */
function Materiales({ of }: { of: HistorialOF }) {
  const { apartados, apuntados } = repartirMateriales(of.materiales);
  if (!apartados.length && !apuntados.length && !of.notasProduccion) return null;

  return (
    <div className="mt-2 space-y-1 border-t border-[var(--glass-border)] pt-2">
      {apartados.length > 0 && (
        <GrupoMaterial
          etiqueta="Apartado"
          materiales={apartados}
          claseEtiqueta="bg-teal-600/12 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300"
          icono="🧵"
          titulo="Material con reserva VIVA en RPS: sigue apartado en el almacén para esta OF. Cuando la cantidad reservada no cubre la apuntada se enseñan las dos (“1 de 6”)."
        />
      )}
      {apuntados.length > 0 && (
        <GrupoMaterial
          etiqueta="Apuntado"
          materiales={apuntados}
          claseEtiqueta="bg-surface-2 text-text-muted ring-1 ring-border"
          icono="📝"
          titulo="Material apuntado en la OF al plantear: lo que hacía falta. Ya no tiene reserva viva —se borra al consumir el material—, así que no dice que siga apartado."
        />
      )}
      {of.notasProduccion && (
        <p
          className="flex items-start gap-1.5 text-[11px] text-text"
          title="Nota que Producción dejó escrita en la OF."
        >
          <span className="shrink-0 text-[10px]" aria-hidden>
            📌
          </span>
          <span className="min-w-0 flex-1 whitespace-pre-line">{of.notasProduccion}</span>
        </p>
      )}
    </div>
  );
}

/** Un grupo de material con su rótulo: mismo esqueleto que `FilaRol` (chip a la
 *  izquierda, contenido a la derecha) para que el panel no se llene de formas
 *  distintas. El contador va en el chip cuando hay más de uno, igual que en
 *  `Documentos`. */
function GrupoMaterial({
  etiqueta,
  materiales,
  claseEtiqueta,
  icono,
  titulo,
}: {
  etiqueta: string;
  materiales: MaterialOF[];
  claseEtiqueta: string;
  icono: string;
  titulo: string;
}) {
  return (
    <div className="flex items-start gap-1.5 text-[11px]" title={titulo}>
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${claseEtiqueta}`}
      >
        <span aria-hidden>{icono} </span>
        {etiqueta}
        {materiales.length > 1 && ` ${materiales.length}`}
      </span>
      <ul className="min-w-0 flex-1 space-y-0.5 text-text">
        {/* La clave lleva el índice porque el texto puede repetirse: una misma
            OF puede apuntar dos veces la misma lona en cantidades distintas (la
            0230706 lleva la misma "LONA PLASTEL …" con 72,6 y con 2,4). */}
        {materiales.map((m, i) => (
          <li key={`${i}-${m.texto}`}>{m.texto}</li>
        ))}
      </ul>
    </div>
  );
}
