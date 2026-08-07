"use client";

import type { OF, Pedido } from "@/lib/types";
import type { Vista } from "./ViewSwitcher";
import { usePopover } from "@/lib/usePopover";

export type NotifTipo =
  | "revisar"
  | "devuelta"
  | "sinEmpezar"
  | "recibida"
  | "cedida"
  | "revisarNueva"
  | "revisarQuitada"
  | "pedidoCompleto";

export interface NotifItem {
  tipo: NotifTipo;
  pedido: Pedido;
  /** Los avisos de pedido completo no son de una OF concreta. */
  of: OF | null;
  /** Quién movió el trabajo, ya resuelto a nombre. Solo en los de movimiento. */
  quien?: string;
  /** La otra parte (de quién venía / a quién ha ido), ya resuelta a nombre. */
  otro?: string;
  /** Clave del aviso (`logId:tipo:ofId`): es lo que se marca como visto. */
  clave?: string;
}

const META: Record<NotifTipo, { label: string; vista: Vista; dot: string }> = {
  revisar: { label: "Me toca revisar", vista: "revision", dot: "bg-violet-600" },
  devuelta: { label: "Devuelta, a corregir", vista: "asignar", dot: "bg-red-600" },
  sinEmpezar: { label: "Sin empezar", vista: "asignar", dot: "bg-gray-400" },
  recibida: { label: "Te han pasado trabajo", vista: "asignar", dot: "bg-emerald-600" },
  cedida: { label: "Ya no lo tienes tú", vista: "asignar", dot: "bg-gray-400" },
  revisarNueva: { label: "Te toca revisar", vista: "revision", dot: "bg-violet-600" },
  revisarQuitada: { label: "Ya no lo revisas tú", vista: "revision", dot: "bg-gray-400" },
  pedidoCompleto: { label: "Listo para pasar", vista: "asignar", dot: "bg-cyan-600" },
};

/** Campana con avisos personales: qué tengo por revisar, qué me han
 *  devuelto y qué tengo asignado pero sin tocar todavía. */
export function Notificaciones({
  items,
  onNavigate,
}: {
  items: NotifItem[];
  onNavigate: (vista: Vista, pedidoId: string) => void;
}) {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notificaciones"
        title="Tus avisos"
        className="glass-chip relative grid size-9 place-items-center rounded-lg text-text-muted hover:text-text"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {items.length > 0 && (
          <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-red-600 text-[9px] font-bold text-white">
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="glass-pop absolute right-0 top-full z-40 mt-1.5 w-80 rounded-xl p-1">
          {items.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-text-muted">Sin avisos pendientes</p>
          ) : (
            <ul className="scroll-thin max-h-96 overflow-y-auto">
              {items.map((item, i) => {
                const meta = META[item.tipo];
                return (
                  <li key={item.clave ?? `${item.of?.id}-${item.tipo}-${i}`}>
                    <button
                      onClick={() => {
                        onNavigate(meta.vista, item.pedido.id);
                        setOpen(false);
                      }}
                      className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--glass-highlight)]"
                    >
                      <span className={`mt-1 size-2 shrink-0 rounded-full ${meta.dot}`} />
                      <span className="min-w-0">
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                          {meta.label}
                        </span>
                        <span className="block truncate text-xs font-semibold text-text">
                          {item.pedido.codigo} · {item.pedido.cliente}
                        </span>
                        <span className="block truncate text-[11px] text-text-muted">
                          {item.of ? `${item.of.codigo} — ${item.of.descripcion}` : "Todas sus OF aprobadas"}
                        </span>
                        {item.quien && (
                          <span className="block truncate text-[11px] text-text-muted">
                            {item.quien}
                            {item.otro ? ` · antes ${item.otro}` : ""}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
