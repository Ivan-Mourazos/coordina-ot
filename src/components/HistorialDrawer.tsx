"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HistorialPedidoDetalle, MaterialGastadoOF } from "@/lib/historial";
import type { Operario } from "@/lib/types";
import { esCodigoPedido } from "@/lib/types";
import {
  CabeceraFicha,
  ComentarioPedido,
  DatosEnLinea,
  MarcoFicha,
  TITULO_BLOQUE,
} from "./MarcoFicha";
import { NotasPedido } from "./NotasPedido";
import { useScrollBloqueado } from "@/lib/useScrollBloqueado";
import { FasesSinFinalizar } from "./FasesSinFinalizar";
import { RecuperarPedido } from "./RecuperarPedido";
import { DocumentosPedido } from "./DocumentosPedido";
import { ParteEscaneado } from "./ParteEscaneado";
import { useFocoModal } from "@/lib/useFocoModal";
import { useCapaEscape } from "@/lib/useCapaEscape";
import { HistorialCentros } from "./HistorialCentros";
import { HistorialOFsCompactas } from "./HistorialOFsCompactas";
import { SECCION_POR_DEFECTO, SECCIONES, type SeccionId } from "@/lib/secciones";

function fmtFecha(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  // Año en dos cifras, como en las listas (dd/mm/aa): con cuatro, las dos
  // fechas con su nombre no cabían en la línea y la partían.
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
}

/** Ficha del historial: parte escaneado + datos del pedido y sus OF con
 *  tiempos. Sin acciones sobre el trabajo —el pedido ya está cerrado para OT—,
 *  salvo las NOTAS, que sí se escriben: una nota no es trabajo, es lo que hay
 *  que saber la próxima vez, y ese momento llega mirando el Historial. */
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
  // undefined = todavía cargando; null = RPS no contestó; objeto = cargado
  // (puede llevar OF sin ninguna línea: eso no es lo mismo que "error").
  const [gastado, setGastado] = useState<Record<string, MaterialGastadoOF[]> | null | undefined>(undefined);
  const reqSeq = useRef(0);

  const [prevPedido, setPrevPedido] = useState<string | null>(null);
  // Reset al cambiar de pedido DURANTE el render (no en un efecto): así nunca
  // hay un frame con la cabecera del pedido nuevo y los datos/PDF del anterior.
  if (pedido !== prevPedido) {
    setPrevPedido(pedido);
    setDetalle(null);
    setError(false);
    setGastado(undefined);
  }

  // Dos peticiones INDEPENDIENTES bajo la misma marca de secuencia: si RPS no
  // contesta a "gastado" el resto de la ficha no se entera (spec §1, "Cómo se
  // ve"). Con un solo try/catch para las dos, un fallo de la más nueva de las
  // dos tumbaba también el detalle, que es justo lo que no puede pasar.
  const cargarDetalle = useCallback(async (cod: string, seq: number) => {
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

  const cargarGastado = useCallback(async (cod: string, seq: number) => {
    try {
      const r = await fetch(`/api/historial/${cod}/gastado`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { gastado: Record<string, MaterialGastadoOF[]> };
      if (seq === reqSeq.current) setGastado(d.gastado);
    } catch {
      if (seq === reqSeq.current) setGastado(null);
    }
  }, []);

  const cargar = useCallback((cod: string) => {
    const seq = ++reqSeq.current;
    setGastado(undefined);
    void cargarDetalle(cod, seq);
    void cargarGastado(cod, seq);
  }, [cargarDetalle, cargarGastado]);

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

  // Escape cierra la ficha. Los popovers nativos (los desplegables de un
  // `Select`) se cierran solos y la pila les deja esa pulsación (ver
  // capas-escape.ts).
  useCapaEscape(pedido !== null, onClose);

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
      cabecera={
        <CabeceraFicha
          codigo={pedido}
          prioridad={detalle?.prioridad}
          cliente={detalle?.cliente}
          negocio={detalle?.negocio}
        />
      }
      // PDF mediano a la izquierda.
      visor={
          pdfSoportado ? (
            <ParteEscaneado codigo={pedido} scanUrl={scanUrl} />
          ) : (
            /* `bloque-3d`, el mismo relieve que los bloques de la ficha. Era un
               gris plano y, al lado de la ficha en relieve, parecía un hueco
               sin terminar en vez de un aviso. */
            <div className="bloque-3d my-4 grid h-[calc(100%-2rem)] w-full place-items-center rounded-xl px-8 text-center text-sm text-text-muted">
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
          {/* Mientras llega el detalle, la forma de lo que va a salir y no un
              "Cargando…" suelto: el ojo ya sabe dónde mirar y la ficha no da un
              salto cuando aparece todo de golpe. */}
          {cargando && (
            <div aria-busy="true" aria-label="Cargando el pedido" className="space-y-3">
              <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--glass-highlight)]" />
              <div className="h-16 animate-pulse rounded-xl bg-[var(--glass-highlight)]" />
              <div className="h-24 animate-pulse rounded-xl bg-[var(--glass-highlight)]" />
              <div className="h-10 animate-pulse rounded-xl bg-[var(--glass-highlight)]" />
            </div>
          )}
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
                  // CON su nombre delante. "24/09/2026 → 18/09/2026" no decía qué
                  // era cada fecha, y la segunda —cuándo se terminó— suele ser
                  // ANTERIOR a la primera, que es la que pidió el cliente: la
                  // flecha hacía pensar en un orden que no es.
                  { k: "Fecha solicitada", v: `Solicitada ${fmtFecha(detalle.fechaSolicitud)}` },
                  ...(detalle.estadoActual
                    ? []
                    : [{ k: "Fecha de finalización", v: `Terminada ${fmtFecha(detalle.fechaFinalizacion)}` }]),
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

              {/* Lo único que se puede HACER desde el Historial: cerrar una
                  fase de OT que se quedó a medias. Va lo primero porque es una
                  tarea pendiente, no información; el resto de la ficha se lee.
                  Se calla solo cuando está todo finalizado, que es lo normal. */}
              {!detalle.estadoActual && (
                <>
                  <FasesSinFinalizar ofs={[...new Set(detalle.ofs.map((o) => o.codigo))]} miId={miId} seccion={SECCIONES[seccion]} />
                </>
              )}

              {/* EL MISMO ORDEN QUE LA FICHA DE PENDIENTES: notas, documentos y
                  tareas, las OF y el comentario. Cada ficha
                  llevaba el suyo y el mismo pedido se leía distinto según desde
                  dónde se abriera. */}
              {/* Las notas antes que las OF, como en la ficha de Pendientes. */}
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
              {/* SE ESCRIBE, no solo se lee. El pedido está cerrado para
                  Producción, pero la nota no es trabajo: es lo que hay que
                  saber la próxima vez que ese cliente pida algo parecido, y ese
                  momento llega justo cuando lo estás mirando en el Historial.
                  La nota va por CÓDIGO de pedido, así que la escrita aquí es la
                  misma que se ve en el tablero. */}

              <NotasPedido key={pedido} pedido={pedido} miId={miId} operarios={operarios} />

              {/* Se cuentan los que se pueden ABRIR y no los que RPS trae: los
                  que no tienen fichero no salen en la lista, así que meterlos
                  en el número dejaría un rótulo que no cuadra con nada. */}

              <DocumentosPedido key={`docs:${pedido}`} pedido={pedido} documentos={detalle.documentos} />



              {/* Reintentar pide SOLO el material gastado. Con `cargar` se
                  pedía otra vez el detalle, que ya había llegado bien, y la
                  ficha entera se sustituía por «Cargando…»: se cerraba la
                  propia ventana desde la que se había pulsado. */}
              <HistorialCentros
                key={`${pedido}:${seccion}`}
                ofs={detalle.ofs}
                seccion={seccion}
                gastado={gastado}
                onReintentarGastado={() => {
                  setGastado(undefined);
                  void cargarGastado(pedido, reqSeq.current);
                }}
              />

              {/* LAS OF, A LA VISTA. Estaban solo dentro de «Tareas y
                  tiempos», y al plegar ese bloque se fueron con él: se abría
                  la ficha de un pedido y no se veía de cuántas OF constaba ni
                  qué era cada una sin desplegar nada. Son la identidad del
                  pedido, como el cliente; el desglose por tarea y persona es
                  otra cosa y sigue plegado ahí abajo. */}
              <section className="mb-4" aria-label="Órdenes de fabricación">
                <h3 className={`mb-1.5 ${TITULO_BLOQUE}`}>
                  Órdenes de fabricación ({new Set(detalle.ofs.map((o) => o.codigo)).size})
                </h3>
                <HistorialOFsCompactas ofs={detalle.ofs} seccion={seccion} />
              </section>

              {detalle.comentarioVenta && <ComentarioPedido texto={detalle.comentarioVenta} />}

              {/* "Volver a plantear el pedido": sección 3 de la spec del
                  15/09/2026. AL FINAL: es una acción rara y arriba del todo se
                  leía como lo principal de la ficha. Solo sale si el pedido no
                  está ya en el panel. */}
              {!detalle.estadoActual && (
                <div className="mt-4">
                <RecuperarPedido pedido={pedido} seccion={seccion} miId={miId} operarios={operarios} onRecuperado={onClose} />
                </div>
              )}
            </>
          )}
    </MarcoFicha>
  );
}


// Reexportado: los tests y quien ya lo importaba de aquí siguen funcionando.
export { HistorialCentros };
