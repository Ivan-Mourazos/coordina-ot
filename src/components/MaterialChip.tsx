"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CompraOF, MaterialAsignado } from "@/lib/types";
import { sitioDeMenu, ventanaActual } from "@/lib/menu-flotante";

// ─── El recorrido del material de la OF ──────────────────────────────────────
// Tres manos, y en la oficina se llamaba "reservar" a la primera:
//
//   1. ASIGNAR   Oficina Técnica, al plantear: qué material lleva la OF.
//   2. RESERVAR  Almacén: mira lo asignado y lo aparta del stock.
//   3. COMPRAR   Compras: si no hay, lo pide. Ahí salen las fechas.
//
// Esto enseña los tres. Antes solo enseñaba el paso 2, así que una OF con
// material asignado y sin reservar parecía no llevar nada: pasó con
// AR.26.03981, con 20 m de lona y el panel en blanco.
//
// Y van en DOS listas, no en una cadena por línea, porque en RPS no encadenan:
// de las 44 compras de las OF del tablero (11/08/2026) solo UNA correspondía a
// un material asignado. Lo que Compras pide para una OF suele ser otra cosa
// —tubo, herrajes— o trabajo de fuera (lacado, vinilo, portes). Pintar flechas
// entre las dos sería inventarse un dato que no existe.

const ANCHO = 288; // w-72
const ALTO = 240;

/** dd/mm de una fecha ISO, sin pasar por `new Date` (que se lleva el día por
 *  el huso horario). */
const dm = (iso?: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");

/** En qué punto está una compra, dicho como se pregunta: ¿ha llegado ya? */
function estadoCompra(c: CompraOF, hoy: string): { texto: string; clase: string } {
  if (c.recibida >= c.pedida && c.pedida > 0) {
    return { texto: "recibido", clase: "text-emerald-700 dark:text-emerald-300" };
  }
  const parcial = c.recibida > 0 ? ` (${c.recibida} de ${c.pedida})` : "";
  if (!c.estimada) return { texto: `pedido${parcial}`, clase: "text-amber-700 dark:text-amber-300" };
  // Tarde es tarde: si la fecha prevista ya pasó y no ha llegado, eso es lo
  // primero que hay que ver.
  const tarde = c.estimada < hoy;
  return {
    texto: `${tarde ? "debía llegar" : "llega"} ${dm(c.estimada)}${parcial}`,
    clase: tarde
      ? "text-red-700 dark:text-red-300"
      : "text-amber-700 dark:text-amber-300",
  };
}

function MaterialPopover({
  materiales,
  compras,
  hoy,
  anchor,
  disparador,
  onClose,
}: {
  materiales: readonly MaterialAsignado[];
  compras: readonly CompraOF[];
  hoy: string;
  anchor: DOMRect;
  /** El botón que lo abrió. Va aquí porque el popover se pinta en un PORTAL,
   *  así que el botón no está dentro de `ref` y el cierre por "clic fuera" lo
   *  contaba como fuera: al pulsarlo por segunda vez, el `mousedown` cerraba y
   *  el `click` que venía detrás lo volvía a abrir. Resultado, un panel que no
   *  se podía cerrar con su propio botón. */
  disparador: HTMLElement | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const destino = e.target as Node;
      // El disparador NO es "fuera": de cerrarlo ya se encarga su propio
      // onClick, que es quien sabe si toca abrir o cerrar.
      if (disparador?.contains(destino)) return;
      if (ref.current && !ref.current.contains(destino)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, disparador]);

  const ventana = ventanaActual();
  if (typeof document === "undefined" || !ventana) return null;
  const sitio = sitioDeMenu(anchor, { ventana, alto: ALTO, ancho: ANCHO });

  const reservadas = materiales.filter((m) => m.reservada > 0).length;

  return createPortal(
    <div
      ref={ref}
      // Ver Select.tsx: marca de portal para que los paneles flotantes no lo
      // tomen por un clic fuera y se cierren solos.
      data-en-portal=""
      className="glass-pop scroll-thin fixed z-[70] overflow-y-auto rounded-xl p-2.5"
      style={{ ...sitio, maxHeight: ALTO, background: "var(--surface)" }}
    >
      {materiales.length > 0 && (
        <>
          <p className="mb-1.5 flex items-center gap-1.5 border-b border-[var(--glass-border)] pb-1.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">
            Asignado por Oficina Técnica ({materiales.length})
            <span className="ml-auto font-semibold normal-case tracking-normal text-teal-700 dark:text-teal-300">
              {reservadas > 0
                ? `${reservadas} reservado${reservadas === 1 ? "" : "s"} por Almacén`
                : "Almacén aún no ha reservado"}
            </span>
          </p>
          <ul className="space-y-1">
            {materiales.map((m, i) => (
              <li
                key={`${m.descripcion}-${i}`}
                className="flex items-start justify-between gap-2 text-[11px]"
              >
                <span className="min-w-0 text-text">
                  {m.descripcion}
                  {/* La reserva, debajo y solo si la hay: lo que se busca aquí
                      es precisamente lo que NO está reservado todavía. */}
                  {m.reservada > 0 && (
                    <span className="block text-[10px] text-teal-700 dark:text-teal-300">
                      reservado {m.reservada}
                    </span>
                  )}
                </span>
                <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono font-semibold text-text ring-1 ring-border">
                  {m.cantidad}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {compras.length > 0 && (
        <>
          {/* Aparte del material asignado y no debajo de cada línea: en RPS no
              van encadenados (ver la cabecera del fichero). Aquí se pide lo que
              falta, y también trabajo de fuera: lacado, vinilo, portes. */}
          <p
            className={`mb-1.5 flex items-center gap-1.5 border-b border-[var(--glass-border)] pb-1.5 text-[10px] font-bold uppercase tracking-wide text-text-muted ${
              materiales.length > 0 ? "mt-3" : ""
            }`}
          >
            Pedido por Compras ({compras.length})
          </p>
          <ul className="space-y-1">
            {compras.map((c, i) => {
              const estado = estadoCompra(c, hoy);
              return (
                <li
                  key={`${c.articulo}-${i}`}
                  className="flex items-start justify-between gap-2 text-[11px]"
                >
                  <span className="min-w-0 text-text">
                    {c.articulo}
                    <span className={`block text-[10px] ${estado.clase}`}>
                      {estado.texto}
                      {c.fechaPedido && (
                        <span className="text-text-muted"> · se pidió {dm(c.fechaPedido)}</span>
                      )}
                      {c.proveedor && <span className="text-text-muted"> · {c.proveedor}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono font-semibold text-text ring-1 ring-border">
                    {c.pedida}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>,
    document.body,
  );
}

/** Botón que resume el recorrido del material de la OF y abre el detalle.
 *
 *  El resumen son dos números y, si hay algo comprado sin llegar, un aviso: es
 *  lo que se pregunta de un pedido antes de ponerse con él. */
export function MaterialChip({
  materiales,
  compras = [],
  hoy,
}: {
  materiales?: readonly MaterialAsignado[];
  compras?: readonly CompraOF[];
  /** Hoy en ISO, para saber si una entrega llega tarde. Se pasa de fuera para
   *  no leer el reloj en el render (y para poder probarlo). */
  hoy: string;
}) {
  // El sitio donde se pinta Y el botón que lo abrió, juntos: los dos se
  // averiguan en el mismo clic, y el botón hace falta luego para que el cierre
  // por "clic fuera" no lo cuente como fuera. Leer `btnRef.current` al pintar
  // no vale —React lo prohíbe y además no dispara repintado—, así que se
  // guarda aquí en el momento en que se pulsa.
  const [abierto, setAbierto] = useState<{ rect: DOMRect; el: HTMLElement } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const lista = materiales ?? [];
  if (lista.length === 0 && compras.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-text-muted/70">
        🧵 Sin material asignado
      </span>
    );
  }

  const reservadas = lista.filter((m) => m.reservada > 0).length;
  const todoReservado = lista.length > 0 && reservadas === lista.length;
  // Lo que se ha comprado y no ha llegado: es lo único de aquí que puede parar
  // el trabajo, así que sale en el propio botón sin tener que abrirlo.
  const porLlegar = compras.filter((c) => c.recibida < c.pedida);
  const tarde = porLlegar.filter((c) => c.estimada && c.estimada < hoy).length;

  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation();
          const el = btnRef.current;
          setAbierto((v) => (v || !el ? null : { rect: el.getBoundingClientRect(), el }));
        }}
        aria-expanded={abierto !== null}
        title={
          lista.length === 0
            ? "Sin material asignado, pero con compras para esta OF"
            : todoReservado
              ? "Almacén ha reservado todo el material"
              : `${lista.length - reservadas} de ${lista.length} sin reservar por Almacén`
        }
        className={`chip-3d inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
          todoReservado ? "text-teal-700 dark:text-teal-300" : "text-text-muted"
        }`}
      >
        🧵 Material
        {/* Dos números porque son dos pasos: lo que asignó OT y lo que Almacén
            ha apartado. Con uno solo no se sabe si falta reservar. */}
        {lista.length > 0 && (
          <span
            className={`rounded-full px-1.5 text-[10px] font-bold text-white ${
              todoReservado ? "bg-teal-600" : "bg-gray-500"
            }`}
          >
            {reservadas}/{lista.length}
          </span>
        )}
        {porLlegar.length > 0 && (
          <span
            className={`rounded-full px-1.5 text-[10px] font-bold text-white ${
              tarde > 0 ? "bg-red-600" : "bg-amber-500"
            }`}
            title={
              tarde > 0
                ? `${tarde} compra${tarde === 1 ? "" : "s"} con la fecha de entrega pasada`
                : `${porLlegar.length} compra${porLlegar.length === 1 ? "" : "s"} por llegar`
            }
          >
            📦 {porLlegar.length}
          </span>
        )}
      </button>

      {abierto && (
        <MaterialPopover
          materiales={lista}
          compras={compras}
          hoy={hoy}
          anchor={abierto.rect}
          disparador={abierto.el}
          onClose={() => setAbierto(null)}
        />
      )}
    </>
  );
}
