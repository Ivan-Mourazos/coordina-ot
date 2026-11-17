"use client";

import { usePopover } from "@/lib/usePopover";
import { ULTIMA } from "@/lib/novedades";
import { ThemeToggle } from "../ThemeToggle";
import { CaraPersona, colorDePersona } from "./CaraPersona";
import { ElegirColor } from "../ElegirColor";
import { useColoresPersona } from "@/lib/useColoresPersona";

// ─── El menú de la cuenta en la vista de Producción ──────────────────────────
// El mismo botón que en OT —tu cara, y el menú detrás— (Iván, 17/11/2026),
// pero con lo de Producción: quién eres y salir, el tema y las novedades. No
// es el de OT (Herramientas.tsx) porque casi todo lo de allí es de OT: qué
// lista de trabajo se mira, la guía de revisión, las otras páginas de la
// oficina. Lo que haga falta en Producción se añade aquí.

/** "17 nov": lo que se quiere saber es si es de esta semana o de hace meses. */
function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

export function MenuProduccion({
  miId,
  nombre,
  novedadesSinLeer,
  fechaUltimaNovedad,
  onVerNovedades,
  onSalir,
}: {
  /** Tu cuenta: para guardar el color que elijas. */
  miId?: string | null;
  nombre: string;
  /** Las que le tocan y no ha leído: van en el botón, para que se vean sin abrir. */
  novedadesSinLeer: number;
  fechaUltimaNovedad?: string;
  onVerNovedades: () => void;
  onSalir: () => void;
}) {
  const { open, setOpen, ref, panelRef, idPanel } = usePopover<HTMLDivElement>();
  const quien = nombre || "Producción";
  const colores = useColoresPersona();
  // Por la cuenta y no por el nombre: hay dos Belén.
  const miColor = (miId ? colores.porId[miId] : undefined) ?? colorDePersona(quien, colores);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        popoverTarget={idPanel}
        aria-label={`Menú de ${quien}${novedadesSinLeer ? `: ${novedadesSinLeer} ${novedadesSinLeer === 1 ? "novedad" : "novedades"} sin leer` : ""}`}
        aria-expanded={open}
        title="Quién eres, el tema y las novedades"
        className="glass-chip relative flex h-9 items-center gap-1.5 rounded-lg pl-1 pr-2 text-text-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <CaraPersona nombre={quien} color={miColor} />
        <span className="max-w-[10rem] truncate text-xs font-semibold text-text">{quien}</span>
        <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {novedadesSinLeer > 0 && (
          <span aria-hidden className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold leading-4 text-white">
            {novedadesSinLeer}
          </span>
        )}
      </button>

      <div ref={panelRef} id={idPanel} popover="auto" className="glass-pop scroll-thin max-h-[80vh] w-72 overflow-y-auto rounded-xl p-2 text-text">
        {open && (
          <>
            <div className="mb-2 flex items-center gap-2 rounded-lg px-2 py-1.5">
              <CaraPersona nombre={quien} color={miColor} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-text">{quien}</span>
                <span className="block text-[10px] leading-tight text-text-muted">Producción</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSalir();
                }}
                className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-text-muted hover:bg-surface-2 hover:text-text"
              >
                Salir
              </button>
            </div>

            {/* El color tampoco cierra el menú: se ve el cambio en la cara de arriba. */}
            {miId && <ElegirColor miId={miId} actual={miColor} />}

            {/* El tema no cierra el menú: se elige mirando. */}
            <div className="mt-2 flex items-center justify-between border-t border-border px-2 pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Claro u oscuro</span>
              <ThemeToggle />
            </div>

            {ULTIMA && (
              <div className="mt-2 border-t border-border pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onVerNovedades();
                  }}
                  title="Qué ha cambiado en la web."
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-text hover:bg-surface-2"
                >
                  Novedades de la web
                  {novedadesSinLeer > 0 && (
                    <span className="rounded-full bg-brand-500 px-1.5 text-[10px] font-bold leading-4 text-white">{novedadesSinLeer}</span>
                  )}
                  {fechaUltimaNovedad && (
                    <span className="ml-auto shrink-0 text-[10px] font-medium text-text-muted">{fechaCorta(fechaUltimaNovedad)}</span>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
