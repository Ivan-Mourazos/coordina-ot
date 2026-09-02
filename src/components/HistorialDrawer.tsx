"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  HistorialOF,
  HistorialPedidoDetalle,
  MaterialOF,
} from "@/lib/historial";
import type { Operario, Rol } from "@/lib/types";
import { esCodigoPedido } from "@/lib/types";
import { repartirMateriales } from "@/lib/historial";
import { PRIORIDAD, ROL, fmtMin } from "@/lib/estado";
import { FamiliaTag } from "./FamiliaTag";
import { NotasPedido } from "./NotasPedido";
import { FasesSinFinalizar } from "./FasesSinFinalizar";
import { DocumentosRps, contarAbribles } from "./DocumentosRps";
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
  operarios = [],
  miId = null,
}: {
  pedido: string | null;
  onClose: () => void;
  /** Solo para el hilo de notas: sin ellos cada nota saldría con el id crudo
   *  ("jaime") en vez del nombre de la persona y su color. */
  operarios?: readonly Operario[];
  /** Quién soy: finalizar una fase en RPS se firma con mi código de operario. */
  miId?: string | null;
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

  // ¿Está el parte escaneado? `null` = todavía sin comprobar, y ahí se pinta el
  // marco: lo normal es que exista, y esperar a la comprobación para enseñarlo
  // metería un parpadeo en todos los pedidos por culpa de los pocos que fallan.
  // Solo un 404 explícito lo da por ausente; cualquier otra cosa (sin red, el
  // share caído) se trata como "existe" y que el visor diga lo que quiera —
  // esconder el parte porque falló una comprobación sería peor.
  const [scanExiste, setScanExiste] = useState<boolean | null>(null);
  useEffect(() => {
    if (!pedido) return;
    let vivo = true;
    // Diferido con setTimeout(0), igual que la carga del detalle de aquí al
    // lado: el efecto no puede llamar a setState de forma síncrona
    // (react-hooks/set-state-in-effect) y así se evita sin desactivar la regla.
    const id = setTimeout(() => {
      setScanExiste(null);
      fetch(`/api/pedidos/${pedido}.pdf`, { method: "HEAD" })
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
  }, [pedido]);

  // Mismo trato que el drawer del tablero: con telón delante, el foco no puede
  // quedarse recorriendo la lista del historial que hay detrás.
  const modalRef = useFocoModal<HTMLDivElement>(pedido !== null);

  if (!pedido) return null;
  const scanUrl = detalle?.scanUrl ?? `/api/pedidos/${pedido}.pdf`;
  // La ruta de PDFs resuelve las tres delegaciones (AR, SA y BE); para lo que
  // no sea un pedido de venta —trabajo interno, OF sueltas— no hay parte que
  // pedir.
  const esPedidoDeVenta = esCodigoPedido(pedido);
  // Y aunque el código valga, el fichero puede no estar: no todos los partes se
  // escanean, y en Santiago y Bergondo pasa más. Se comprueba antes de pintar
  // el marco; si no, el visor del navegador enseñaba su propia página de error
  // dentro del panel y parecía que la web se había roto (SA.26.00790).
  const pdfSoportado = esPedidoDeVenta && scanExiste !== false;

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
            <div className="grid h-full w-full place-items-center rounded-xl bg-surface-2 px-8 text-center text-sm text-text-muted">
              {/* Dos motivos distintos y no se pueden confundir: o el código no
                  es de un pedido de venta (trabajo interno, OF suelta), o lo es
                  pero nadie escaneó el parte. Antes los dos caían en "PDF no
                  disponible para esta serie", que sonaba a que la web no sabía
                  abrirlo — y con los SA y BE, que se escanean menos, tocaba
                  explicar cada vez que no era un fallo del programa. */}
              {esPedidoDeVenta
                ? `${pedido} no tiene el parte escaneado en RPS. No es un fallo: nadie lo subió al archivo.`
                : "Esto no es un pedido de venta, así que no tiene parte escaneado."}
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

              {/* Lo único que se puede HACER desde el Historial: cerrar una
                  fase de OT que se quedó a medias. Va lo primero porque es una
                  tarea pendiente, no información; el resto de la ficha se lee.
                  Se calla solo cuando está todo finalizado, que es lo normal. */}
              <FasesSinFinalizar ofs={detalle.ofs.map((o) => o.codigo)} miId={miId} />

              {/* Solo lectura: el pedido ya está cerrado para OT y una nota que
                  no cambia nada sería ruido. El momento de dejar el recado es
                  antes de pasarlo, y eso lo cubre el Drawer del tablero.
                  `pedido` aquí ya es el CÓDIGO (es lo que recibe este drawer),
                  que es justo la clave con la que se guardó la nota. La prop es
                  `string | null`, pero el `if (!pedido) return null` de arriba
                  ya la estrechó para todo lo que va debajo. */}
              {/* `key` con el código: al saltar de pedido sin cerrar el drawer
                  (Ctrl+K abre el buscador aunque esté delante) React desmonta y
                  vuelve a montar, así no queda ni un frame con el hilo del
                  anterior. NO sustituye a los guards de dentro del componente:
                  esos cubren las carreras DENTRO de un mismo pedido. */}
              <NotasPedido
                key={pedido}
                pedido={pedido}
                miId={null}
                operarios={operarios}
                soloLectura
              />

              {/* Se cuentan los que se pueden ABRIR y no los que RPS trae: los
                  que no tienen fichero no salen en la lista, así que meterlos
                  en el número dejaría un rótulo que no cuadra con nada. */}
              <Bloque titulo={`Documentos (${contarAbribles(detalle.documentos)})`}>
                <DocumentosRps documentos={detalle.documentos} />
              </Bloque>

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
  // Lo registrado trae los minutos de cada uno; lo deducido, solo nombres. Se
  // normalizan a la misma forma para que `FilaRol` no tenga que saber de dónde
  // viene: si no hay minutos, pinta los nombres y ya.
  const planteo =
    of.rol?.planteo ?? (of.rolDeducido?.quienPlanteo ?? []).map((nombre) => ({ nombre }));
  const revision =
    of.rol?.revision ?? (of.rolDeducido?.quienReviso ?? []).map((nombre) => ({ nombre }));

  // Quien imputó tiempo en RPS pero no aparece en ningún rol: pasa cuando la OF
  // se fichó aquí y alguien más le metió horas por RPS. Se enseña sin rol antes
  // que dejarlo fuera.
  const conRol = new Set([...planteo, ...revision].map((p) => p.nombre));
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
  /** Quién, y cuánto puso cada uno cuando se sabe (ver `RepartoRol`). */
  quien: { nombre: string; min?: number }[];
  min?: number;
  deducido: boolean;
}) {
  const etiqueta = rol === "plantear" ? "Planteo" : "Revisión";
  // Con una sola persona, su reparto ES el total del rol: repetirlo al lado del
  // nombre sería el mismo número dos veces en la misma línea.
  const reparto = quien.length > 1 && quien.every((p) => p.min !== undefined);
  return (
    <div
      className="flex items-start gap-1.5 text-[11px]"
      title={
        deducido
          ? `${etiqueta} deducido del reparto de tiempo de RPS: quien más horas lleva planteó y quien lleva pocas revisó. Es una suposición, no un dato registrado.`
          : reparto
            ? `${etiqueta} fichado en CoordinaOT, con lo que puso cada uno.`
            : `${etiqueta} fichado en CoordinaOT.`
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
        {quien.length === 0
          ? "—"
          : reparto
            ? // De más tiempo a menos, que es el orden en que se lee "quién
              // llevó el peso". Sin reparto manda el alfabético, que es el que
              // se venía usando y no sugiere una jerarquía que no hay.
              quien.map((p, i) => (
                <span key={p.nombre}>
                  {i > 0 && <span className="text-text-muted"> · </span>}
                  {p.nombre}{" "}
                  <span className="text-text-muted">{fmtMin(p.min ?? 0)}</span>
                </span>
              ))
            : [...quien]
                .map((p) => p.nombre)
                .sort(porNombre)
                .join(", ")}
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
