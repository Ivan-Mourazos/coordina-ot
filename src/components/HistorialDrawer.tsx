"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  HistorialOF,
  HistorialPedidoDetalle,
  MaterialOF,
} from "@/lib/historial";
import type { Operario } from "@/lib/types";
import { esCodigoPedido } from "@/lib/types";
import { personasConRol, personasDeOF, personasDeOFs, repartirMateriales, repartoDe } from "@/lib/historial";
import { fmtMin, ROL } from "@/lib/estado";
import {
  BloqueFicha,
  CabeceraFicha,
  DatosEnLinea,
  MarcoFicha,
} from "./MarcoFicha";
import { NotasPedido } from "./NotasPedido";
import { useScrollBloqueado } from "@/lib/useScrollBloqueado";
import { FasesSinFinalizar } from "./FasesSinFinalizar";
import { DocumentosPedido } from "./DocumentosPedido";
import { HistorialTareas } from "./HistorialTareas";
import { useFocoModal } from "@/lib/useFocoModal";
import { useCapaEscape } from "@/lib/useCapaEscape";
import { agruparCentros, centrosConDesglose } from "@/lib/historial-centros";
import { SECCION_POR_DEFECTO, SECCIONES, type SeccionId } from "@/lib/secciones";
import {
  BOTON_DETALLE,
  CabeceraVentana,
  LINEA,
  LISTA,
  VentanaAnclada,
  useVentanaAnclada,
} from "./VentanaAnclada";

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
  seccion = SECCION_POR_DEFECTO,
}: {
  pedido: string | null;
  onClose: () => void;
  /** Solo para el hilo de notas: sin ellos cada nota saldría con el id crudo
   *  ("jaime") en vez del nombre de la persona y su color. */
  operarios?: readonly Operario[];
  /** Quién soy: finalizar una fase en RPS se firma con mi código de operario. */
  miId?: string | null;
  seccion?: SeccionId;
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
      const r = await fetch(`/api/historial/${cod}?seccion=${seccion}`, { cache: "no-store" });
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
  }, [seccion]);

  useEffect(() => {
    if (!pedido) return;
    // `cargar` llama a setState de forma síncrona (setCargando/setError/setDetalle);
    // se difiere con setTimeout(0) para que el propio efecto no dispare setState
    // sincrónicamente (react-hooks/set-state-in-effect), sin recurrir a un disable.
    const id = setTimeout(() => cargar(pedido), 0);
    return () => clearTimeout(id);
  }, [pedido, cargar]);

  // Con el drawer abierto, la rueda seguía moviendo la lista del historial que
  // hay detrás: al cerrarlo aparecías en otro sitio. El mismo bloqueo que la
  // ficha de Pendientes, con su contador: dos cosas abiertas a la vez no se
  // pisan el estilo del body al cerrarse.
  useScrollBloqueado(pedido !== null);

  // Dos capas: la ficha y, encima, el parte ampliado. Escape cierra la de
  // arriba; los popovers nativos («Tareas y tiempos») se cierran solos y la
  // pila les deja esa pulsación (ver capas-escape.ts).
  useCapaEscape(pedido !== null, onClose);
  useCapaEscape(ampliado, () => setAmpliado(false));

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
    <MarcoFicha
      refModal={modalRef}
      etiqueta={`Historial del pedido ${pedido}`}
      onCerrar={onClose}
      visorConMargen
      cabecera={
        <CabeceraFicha
          codigo={pedido}
          prioridad={detalle?.prioridad}
          cliente={detalle?.cliente}
          negocio={detalle?.negocio}
        />
      }
      // Ampliado: PDF a pantalla casi completa, por encima de la ficha.
      encima={
        ampliado && pdfSoportado && (
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
        )
      }
      // PDF mediano a la izquierda.
      visor={
          pdfSoportado ? (
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
                : "Este formato de pedido antiguo no admite el visor del parte. Consulta los documentos del pedido."}
            </div>
          )
      }
    >
          {/* Panel derecho: datos + OFs */}
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
              {/* En una línea y no en rejilla: son cuatro valores cortos que se
                  leen de corrido ("24/09/26 → 11/09/26 · 2 piezas · VIGO"), y
                  la rejilla gastaba seis líneas en lo alto de la ficha. */}
              <DatosEnLinea
                datos={[
                  // Las dos fechas son UN dato ("del … al …"): separadas por un
                  // punto quedaba "24/09/2026 · → 11/09/2026", con el punto y la
                  // flecha peleándose por decir lo mismo.
                  detalle.estadoActual
                    ? { k: "Solicitud", v: fmtFecha(detalle.fechaSolicitud) }
                    : {
                        k: "De la solicitud a la finalización",
                        v: `${fmtFecha(detalle.fechaSolicitud)} → ${fmtFecha(detalle.fechaFinalizacion)}`,
                      },
                  ...(detalle.estadoActual ? [{ k: "Estado actual", v: detalle.estadoActual }] : []),
                  { k: "Piezas", v: `${detalle.piezas} ${detalle.piezas === 1 ? "pieza" : "piezas"}` },
                  ...(detalle.ciudadEntrega ? [{ k: "Entrega en", v: detalle.ciudadEntrega }] : []),
                ]}
                familias={detalle.familias}
              />

              {/* AQUÍ ESTABAN "Lo vendido" y "Montaje y envío", y se han ido.
                  Los dos dicen lo mismo que el parte escaneado que se está
                  viendo a la izquierda a tamaño completo —la descripción de lo
                  vendido y el "FECHA SOLICITADA / PERSONAL / TIEMPO"—, y lo
                  decían en bloques largos que empujaban hacia abajo lo que solo
                  está aquí: las notas, los documentos y las OF con sus tiempos.
                  Repetir lo que ya se ve al lado no es informar, es alargar.

                  El comentario del pedido SÍ se queda: ese no está en el parte,
                  lo escribe quien vende y suele traer el aviso que no cabía en
                  ninguna otra parte ("NO INCLUYE INSTALACIÓN ELÉCTRICA"). */}
              {detalle.comentarioVenta && (
                <BloqueFicha titulo="Comentario del pedido">
                  <p className="whitespace-pre-line text-[11px] leading-snug text-text">
                    {detalle.comentarioVenta}
                  </p>
                </BloqueFicha>
              )}

              {/* Lo único que se puede HACER desde el Historial: cerrar una
                  fase de OT que se quedó a medias. Va lo primero porque es una
                  tarea pendiente, no información; el resto de la ficha se lee.
                  Se calla solo cuando está todo finalizado, que es lo normal. */}
              {!detalle.estadoActual && <FasesSinFinalizar ofs={[...new Set(detalle.ofs.map((o) => o.codigo))]} miId={miId} seccion={SECCIONES[seccion]} />}

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
              <DocumentosPedido key={`docs:${pedido}`} pedido={pedido} documentos={detalle.documentos} />

              <HistorialCentros key={`${pedido}:${seccion}`} ofs={detalle.ofs} seccion={seccion} accion={<HistorialTareas pedido={pedido} ofs={detalle.ofs} seccion={seccion} className="" />} />
            </>
          )}
    </MarcoFicha>
  );
}

/** El centro decide qué minutos se suman; la selección decide el desglose visible. */
export function HistorialCentros({ ofs, seccion, accion }: { ofs: HistorialOF[]; seccion: SeccionId; accion?: React.ReactNode }) {
  // Un desglose solo sale si dice algo que el nivel de arriba no dice: las
  // personas del centro, siempre en el que cuenta; las de cada OF, solo si el
  // centro tiene varias. Con una sola OF eran los mismos nombres dos veces.
  const conDesglose = centrosConDesglose(ofs, seccion);
  return (
    // Sin rótulo "Trabajo por centro": debajo va un bloque por centro y cada
    // uno se llama Oficina Técnica, Diseño Gráfico o Taller, que lo dice mejor.
    // El botón de las tareas ocupa el sitio del rótulo, no una línea suya.
    <section aria-label="Tiempos por centro de trabajo" className="space-y-3">
      {accion && <div className="flex">{accion}</div>}
      {agruparCentros(ofs).filter((centro) => centro.ofs.length > 0).map((centro) => {
        const seleccionado = centro.id === seccion;
        const desglose = conDesglose.has(centro.id);
        // Con el papel de cada uno, que es lo que se busca al abrir la ficha.
        // El reparto se junta de TODAS las OF del centro, igual que los
        // minutos, y manda el registrado (ver `repartoDe`).
        const reparto = repartoDe(centro.ofs);
        const personas = desglose
          ? personasConRol(personasDeOFs(centro.ofs), reparto.autores, reparto.revisores, reparto.consta)
          : [];
        const porOF = desglose && centro.ofs.length > 1;
        return (
          <details key={centro.id} open={seleccionado || desglose} className="bloque-3d rounded-xl">
            <summary className="cursor-pointer rounded-xl p-3 text-sm font-semibold text-text focus-visible:outline-2 focus-visible:outline-accent">
              {centro.nombre}
              <span className="float-right ml-2 font-mono text-xs tabular-nums" title="Tiempo imputado en RPS">{fmtMin(centro.totalMin)}</span>
            </summary>
            <div className="space-y-3 px-3 pb-3">
              {personas.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] text-text-muted">Tiempo por persona</p>
                  <ul className="space-y-1 text-xs text-text" aria-label={`Tiempos por persona de ${centro.nombre}`}>
                    {personas.map((persona) => (
                      <li key={persona.nombre} className="flex justify-between gap-3">
                        <span>
                          {persona.nombre}
                          {persona.rol && (
                            <span className={ROL[persona.rol].texto}>
                              {" "}
                              {persona.rol === "plantear" ? "planteó" : "revisó"}
                            </span>
                          )}
                        </span>
                        <span className="font-mono tabular-nums">{fmtMin(persona.min)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {centro.ofs.length === 0 ? (
                <p className="text-xs text-text-muted">Sin trabajo registrado en este centro.</p>
              ) : (
                <ul className="space-y-2" aria-label={`Órdenes de fabricación de ${centro.nombre}`}>
                  {centro.ofs.map((of) => (
                    <li key={of.codigo} className="glass-chip rounded-xl p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-text">{of.codigo}</span>
                        <span title="Tiempo imputado en RPS" className="ml-auto rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-text ring-1 ring-border">
                          {fmtMin(of.tiempoImputadoMin)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-text">{of.descripcion}</p>
                      {porOF && <PersonasOF of={of} />}
                      <Materiales of={of} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        );
      })}
    </section>
  );
}

/** Quién imputó tiempo a esta OF en RPS, con el suyo, de más a menos.
 *
 *  Sin rol, igual que la fila del pedido y «Tareas y tiempos». Aquí salían
 *  "Planteo / ≈ Revisión / Imputó", y el mismo pedido parecía tener un autor en
 *  la lista y más gente en la ficha. El orden es el de `porMinutos` en todos
 *  los sitios, así que las mismas personas salen siempre en el mismo orden. */
function PersonasOF({ of }: { of: HistorialOF }) {
  // El papel de cada uno EN PALABRAS, que es lo que se busca al abrir la ficha:
  // quién la planteó y quién la repasó. Manda el reparto registrado en
  // CoordinaOT; lo deducido de las horas no se nombra (ver `repartoDe`).
  const reparto = repartoDe([of]);
  const personas = personasConRol(personasDeOF(of), reparto.autores, reparto.revisores, reparto.consta);
  if (personas.length === 0) {
    return <p className="mt-1 text-[11px] text-text-muted">Sin tiempo registrado.</p>;
  }
  return (
    <p className="mt-2 text-[11px] text-text-muted" title="Tiempo por persona: el imputado en RPS o, si aún no hay, el fichado en CoordinaOT">
      {/* El papel DELANTE del tiempo: detrás se leía "Iván Sánchez 2m planteó",
          como si el minuto fuera lo planteado. */}
      {personas.map((p, i) => (
        <span key={p.nombre}>
          {i > 0 && " · "}
          <span className="text-text">{p.nombre}</span>
          {p.rol && (
            <span className={ROL[p.rol].texto}> {p.rol === "plantear" ? "planteó" : "revisó"}</span>
          )}{" "}
          {fmtMin(p.min)}
        </span>
      ))}
    </p>
  );
}

/** Material que lleva la OF y lo que Producción apuntó en ella, tras botones
 *  con cantidad. La ventana es la misma que la de Pendientes (VentanaAnclada).
 *
 *  Y las palabras también: «asignado en la OF» es el material que lleva;
 *  «reservado», que sigue habiendo reserva viva en RPS. Aquí se llamaban
 *  "Apuntado" y "Apartado", y el mismo material se nombraba de dos maneras
 *  según la pestaña.
 *
 *  Lo que aquí NO puede decirse es "sin reservar": la reserva se borra al
 *  consumir el material, así que en un pedido cerrado que no quede ninguna no
 *  demuestra que nunca la hubiera. Por eso la línea sin reserva no lleva marca
 *  y la cabecera habla de HOY.
 *
 *  Casi nunca quedará reserva: de las 36 918 OF de OT ya terminadas, 140
 *  conservan reserva y 14 419 conservan material asignado. La reserva viva
 *  sale en los pedidos recién cerrados, que es justo cuando alguien la mira. */
function Materiales({ of }: { of: HistorialOF }) {
  const { apartados, apuntados } = repartirMateriales(of.materiales);
  if (!apartados.length && !apuntados.length && !of.notasProduccion) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {apartados.length + apuntados.length > 0 && (
        <MaterialHistorico of={of.codigo} reservados={apartados} resto={apuntados} />
      )}
      {of.notasProduccion && <NotasProduccion of={of.codigo} texto={of.notasProduccion} />}
    </div>
  );
}

function MaterialHistorico({
  of,
  reservados,
  resto,
}: {
  of: string;
  reservados: MaterialOF[];
  resto: MaterialOF[];
}) {
  const { anclaje, alternar, cerrar } = useVentanaAnclada();
  const total = reservados.length + resto.length;
  const conReserva = reservados.length > 0;
  return (
    <>
      <button
        type="button"
        onClick={(e) => alternar(e.currentTarget)}
        aria-expanded={anclaje !== null}
        aria-haspopup="dialog"
        title="Material asignado en la OF. Se marca el que sigue reservado en RPS; la reserva se borra al consumir el material."
        className={`${BOTON_DETALLE} ${conReserva ? "text-teal-700 dark:text-teal-300" : "text-text-muted"}`}
      >
        <span aria-hidden>🧵</span>
        Material
        <span className="rounded-full bg-surface-2 px-1.5 text-[10px] font-bold text-text ring-1 ring-border">
          {total}
        </span>
      </button>
      {anclaje && (
        <VentanaAnclada anclaje={anclaje} onCerrar={cerrar} etiqueta={`Material de la OF ${of}`}>
          <CabeceraVentana
            titulo="Asignado en la OF"
            cuantos={total}
            nota={conReserva ? `${reservados.length} sigue${reservados.length === 1 ? "" : "n"} reservado${reservados.length === 1 ? "" : "s"}` : "Sin reserva viva hoy"}
            claseNota={conReserva ? "text-teal-700 dark:text-teal-300" : "text-text-muted"}
            tituloNota="La reserva se borra al consumir el material: que hoy no quede ninguna no quiere decir que no se reservara."
          />
          <ul className={LISTA}>
            {/* Lo reservado primero. La clave lleva el índice porque el texto
                puede repetirse: una misma OF puede apuntar dos veces la misma
                lona en cantidades distintas (la 0230706 lleva la misma "LONA
                PLASTEL …" con 72,6 y con 2,4). */}
            {[...reservados, ...resto].map((m, i) => (
              <li key={`${i}-${m.texto}`} className={`${LINEA} text-text`}>
                {m.texto}
                {m.apartado && (
                  <span className="block text-[10px] text-teal-700 dark:text-teal-300">
                    sigue reservado
                  </span>
                )}
              </li>
            ))}
          </ul>
        </VentanaAnclada>
      )}
    </>
  );
}

function NotasProduccion({ of, texto }: { of: string; texto: string }) {
  const { anclaje, alternar, cerrar } = useVentanaAnclada();
  return (
    <>
      <button
        type="button"
        onClick={(e) => alternar(e.currentTarget)}
        aria-expanded={anclaje !== null}
        aria-haspopup="dialog"
        title="Nota que Producción dejó escrita en la OF."
        className={`${BOTON_DETALLE} text-text-muted`}
      >
        <span aria-hidden>📌</span>
        Notas de Producción
      </button>
      {anclaje && (
        <VentanaAnclada
          anclaje={anclaje}
          onCerrar={cerrar}
          etiqueta={`Notas de Producción de la OF ${of}`}
        >
          <CabeceraVentana titulo="Notas de Producción" />
          <p className="whitespace-pre-line">{texto}</p>
        </VentanaAnclada>
      )}
    </>
  );
}
