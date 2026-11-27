"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { usePopover } from "@/lib/usePopover";

export type Vista =
  | "asignar"
  | "lista"
  | "revision"
  | "visitas"
  | "rectificados"
  | "solicitudes"
  | "historial"
  | "metricas"
  | "calendario"
  | "casa";

// Los `id` NO se tocan: viajan en la URL (`?v=asignar`) y hay enlaces
// guardados por ahí. Lo que cambia es cómo se llaman las pestañas, que es lo
// que se lee.
const OPCIONES: { id: Vista; label: string }[] = [
  // "Asignar" contaba solo una de las cosas que se hacen aquí: es TU panel de
  // trabajo, con tu zona, la del equipo y la bandeja.
  { id: "asignar", label: "Panel" },
  // "Lista" no decía lista de qué. Esto es todo lo que está por hacer.
  { id: "lista", label: "Pendientes" },
  { id: "revision", label: "Revisiones" },
  { id: "visitas", label: "Visitas" },
  // Solo donde hay planteamiento o archivo que corregir (ver `conRectificados`).
  { id: "rectificados", label: "Rectificados" },
  // Las peticiones de los comerciales por workflow, también solo OT y Diseño.
  { id: "solicitudes", label: "Solicitudes" },
  { id: "historial", label: "Historial" },
  // Mirar hacia atrás, no trabajo que tengas delante: por eso va la última y
  // no dentro de Historial, donde quedaría escondida.
  { id: "metricas", label: "Métricas" },
  // Quién está y quién no, de Bizneo. Solo si está conectado (`conCalendario`).
  { id: "calendario", label: "Calendario" },
  // Solo Dirección (ver `conCasa`): los pedidos de toda la fábrica.
  { id: "casa", label: "Toda la casa" },
];

/** Las vistas que existen, en el orden de las pestañas.
 *
 *  Se exporta para que la URL (`?v=…`) no tenga que repetir la lista: la
 *  tenía copiada en Board y añadir una pestaña sin acordarse de la otra
 *  copia dejaba `?v=metricas` aterrizando en el Panel, reescribiendo la URL
 *  y sin decir por qué. Una lista, un sitio.
 */
export const VISTAS: Vista[] = OPCIONES.map((o) => o.id);

export function cuantasPestanasCaben(
  disponible: number,
  anchos: readonly number[],
  anchosDeMas: readonly number[],
  fijas: number,
): number {
  let ancho = anchos.reduce((total, n) => total + n, 0);
  if (ancho <= disponible) return anchos.length;
  for (let visibles = anchos.length - 1; visibles >= fijas; visibles--) {
    ancho -= anchos[visibles];
    if (ancho + anchosDeMas[visibles] <= disponible) return visibles;
  }
  return fijas;
}

// Se aprieta el padding en portátil: una pestaña sin nombre no se puede usar.
const PESTANA = "flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-semibold transition-colors xl:px-3.5";
const INACTIVA = "text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text";

function Contador({ n, activo }: { n?: number; activo: boolean }) {
  if (!n) return null;
  return (
    <span className={`rounded-full px-1.5 text-[10px] font-bold ${activo ? "bg-brand-400/40" : "bg-amber-700 text-white"}`}>
      {n}
    </span>
  );
}

export function ViewSwitcher({
  vista,
  onChange,
  badge,
  conCasa = false,
  sinRevision = false,
  conRectificados = false,
  conCalendario = false,
  className = "",
}: {
  className?: string;
  /** Bizneo conectado: enseñar «Calendario». */
  conCalendario?: boolean;
  /** La sección no tiene revisión (Impresión Digital): sin «Revisiones»,
   *  que saldría siempre vacía. */
  sinRevision?: boolean;
  /** La sección revisa rectificados y recibe solicitudes (OT y Diseño). */
  conRectificados?: boolean;
  vista: Vista;
  onChange: (v: Vista) => void;
  badge?: Partial<Record<Vista, number>>;
  /** Enseñar «Toda la casa», que es solo de Dirección. */
  conCasa?: boolean;
}) {
  const opciones = OPCIONES.filter(({ id }) =>
    (id !== "casa" || conCasa) &&
    (id !== "calendario" || conCalendario) &&
    (id !== "revision" || !sinRevision) &&
    ((id !== "rectificados" && id !== "solicitudes") || conRectificados),
  );
  const fijas = sinRevision ? 2 : 3;
  const [reparto, setReparto] = useState<{ limite: number; anchoIdeal: number }>();
  const visibles = Math.max(fijas, Math.min(reparto?.limite ?? opciones.length, opciones.length));
  const ocultas = opciones.slice(visibles);
  const activaEnMas = ocultas.some((o) => o.id === vista);
  const medidas = useRef<HTMLDivElement>(null);
  const espacio = useRef<HTMLDivElement>(null);
  const { open, setOpen, ref, panelRef, idPanel } = usePopover<HTMLButtonElement>();

  // El botón «Más» puede ocupar más al elegir una vista o sumar contadores.
  // Se mide cada corte posible con la misma tipografía y el mismo padding.
  function contenidoDeMas(desde: number) {
    const resto = opciones.slice(desde);
    const elegida = resto.find((o) => o.id === vista);
    const total = resto.reduce((suma, o) => suma + (badge?.[o.id] ?? 0), 0);
    return (
      <>
        {elegida?.label ?? "Más"}
        <Contador n={total} activo={!!elegida} />
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </>
    );
  }

  const cantidad = opciones.length;
  useLayoutEffect(() => {
    const caja = espacio.current;
    const regla = medidas.current;
    if (!caja || !regla) return;
    const hijos = Array.from(regla.children);
    function medir() {
      if (!caja || !regla) return;
      const { paddingLeft, paddingRight, borderLeftWidth, borderRightWidth, columnGap } = getComputedStyle(regla);
      const marco = [paddingLeft, paddingRight, borderLeftWidth, borderRightWidth]
        .reduce((total, px) => total + parseFloat(px), 0);
      const hueco = parseFloat(columnGap) || 0;
      const anchos = hijos.map((el) => el.getBoundingClientRect().width + hueco);
      const limite = cuantasPestanasCaben(
        caja.getBoundingClientRect().width - marco + hueco,
        anchos.slice(0, cantidad),
        [...Array<number>(fijas).fill(0), ...anchos.slice(cantidad)],
        fijas,
      );
      // El flex sigue pidiendo sitio para todas. Si pidiera solo el ancho de
      // las visibles, al agrandar la ventana nunca volverían las ocultas.
      const anchoIdeal = Math.ceil(anchos.slice(0, cantidad)
        .reduce((total, ancho) => total + ancho, marco - hueco));
      setReparto((antes) => antes?.limite === limite && antes.anchoIdeal === anchoIdeal
        ? antes
        : { limite, anchoIdeal });
    }
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(caja);
    // El borde exterior incluye el padding, que también cambia en portátil.
    // Las fuentes y los contadores pueden cambiar con la ventana quieta.
    hijos.forEach((hijo) => observador.observe(hijo, { box: "border-box" }));
    return () => observador.disconnect();
  }, [cantidad, fijas, conCasa, conCalendario, conRectificados]);

  useLayoutEffect(() => {
    if (visibles === cantidad && open) setOpen(false);
  }, [visibles, cantidad, open, setOpen]);

  return (
    <div ref={espacio} className={`relative max-w-full ${className}`} style={{ width: reparto?.anchoIdeal }}>
      <div className="tira-3d glass-chip inline-flex rounded-lg p-[3px]">
        {opciones.slice(0, visibles).map((o) => (
          <button
            key={o.id}
            type="button"
            data-vista={o.id}
            aria-current={o.id === vista ? "page" : undefined}
            onClick={() => onChange(o.id)}
            className={`${PESTANA} ${o.id === vista ? "pestana-activa" : INACTIVA}`}
          >
            {o.label}
            <Contador n={badge?.[o.id]} activo={o.id === vista} />
          </button>
        ))}
        {ocultas.length > 0 && (
          // Hijo directo del carril para que la píldora pueda llegar hasta aquí.
          <button
            ref={ref}
            type="button"
            popoverTarget={idPanel}
            aria-expanded={open}
            aria-controls={idPanel}
            aria-current={activaEnMas ? "page" : undefined}
            data-sin-transicion
            className={`${PESTANA} ${activaEnMas ? "pestana-activa" : INACTIVA}`}
          >
            {contenidoDeMas(visibles)}
          </button>
        )}
      </div>

      <div
        ref={panelRef}
        id={idPanel}
        popover="auto"
        role="group"
        aria-label="Más vistas"
        onToggle={(e) => {
          if (e.currentTarget.matches(":popover-open")) {
            e.currentTarget.querySelector<HTMLButtonElement>("button")?.focus();
          }
        }}
        className="glass-pop m-0 w-max min-w-40 rounded-lg p-1 text-text"
      >
        {ocultas.map((o) => (
          <button
            key={o.id}
            type="button"
            data-vista={o.id}
            aria-current={o.id === vista ? "page" : undefined}
            onClick={() => {
              setOpen(false);
              onChange(o.id);
            }}
            className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold hover:bg-surface-2 ${o.id === vista ? "bg-surface-2" : ""}`}
          >
            {o.label}
            <Contador n={badge?.[o.id]} activo={o.id === vista} />
          </button>
        ))}
      </div>

      {/* Fuera del reparto del flex y recortada para que la regla no ensanche
          la página ni duplique las pestañas para el teclado o el lector. */}
      <div inert aria-hidden="true" className="invisible absolute inset-0 overflow-hidden">
        <div ref={medidas} className="tira-3d glass-chip inline-flex rounded-lg p-[3px]">
          {opciones.map((o) => (
            <span key={o.id} className={PESTANA}>
              {o.label}
              <Contador n={badge?.[o.id]} activo={false} />
            </span>
          ))}
          {opciones.slice(fijas).map((o, i) => (
            <span key={`mas-${o.id}`} className={PESTANA}>{contenidoDeMas(i + fijas)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
