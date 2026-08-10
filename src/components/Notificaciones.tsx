"use client";

import type { Vista } from "./ViewSwitcher";
import { usePopover } from "@/lib/usePopover";
import type { NotifItem, NotifTipo } from "@/lib/notificaciones";

export type { NotifItem, NotifTipo };

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

/** La segunda línea del aviso: de qué parte del pedido habla. */
function detalleDe(item: NotifItem): string {
  if (item.ofs.length === 0) return "Todas sus OF aprobadas";
  if (item.pedidoEntero)
    return item.totalOFs === 1
      ? `${item.ofs[0].codigo} — ${item.ofs[0].descripcion}`
      : `Todo el pedido · ${item.totalOFs} OF`;
  if (item.ofs.length === 1)
    return `${item.ofs[0].codigo} — ${item.ofs[0].descripcion}`;
  return `${item.ofs.length} de ${item.totalOFs} OF · ${item.ofs.map((o) => o.codigo).join(", ")}`;
}

/** Campana con avisos personales. Dos clases distintas conviven aquí:
 *
 *  · Los que se DEDUCEN mirando la OF: qué tengo por revisar, qué me han
 *    devuelto, qué tengo asignado sin tocar, y qué pedido mío ya está
 *    completo. Se recalculan solos y desaparecen cuando deja de ser cierto.
 *  · Los de MOVIMIENTO (te han pasado trabajo, ya no lo tienes tú, te toca
 *    revisar, ya no lo revisas): un cambio de manos no deja marca en la OF,
 *    así que se leen del registro de acciones y hay que apagarlos uno a uno
 *    —de eso va el campo `clave`— cuando se abre el pedido.
 *
 *  Abrir un aviso lo apaga, sea de la clase que sea. Por eso el manejador
 *  recibe el ITEM entero y no solo el id del pedido: lo que se apaga es el
 *  aviso que se ha abierto, no todos los del pedido —te tocan dos cosas
 *  distintas del mismo parte y solo has atendido una. */
export function Notificaciones({
  items,
  onNavigate,
}: {
  items: NotifItem[];
  onNavigate: (vista: Vista, item: NotifItem) => void;
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
                  <li key={`${item.pedido.id}-${item.tipo}-${i}`}>
                    <button
                      onClick={() => {
                        onNavigate(meta.vista, item);
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
                        {/* Qué parte del pedido es. Un pedido de cuatro OF
                            mandado entero a revisar encendía cuatro avisos
                            iguales; ahora es uno y lo dice. Cuando solo te
                            tocan algunas SÍ hay que nombrarlas: son OF sueltas
                            de un pedido que lleva alguien más. */}
                        <span className="block truncate text-[11px] text-text-muted">
                          {detalleDe(item)}
                        </span>
                        {item.quien && (
                          <span className="block truncate text-[11px] text-text-muted">
                            {item.quien}
                            {/* Sin repetir el nombre: lo normal es soltar tu
                                propio trabajo, y ahí quien lo mueve y quien lo
                                tenía son la misma persona ("Iván · antes Iván"). */}
                            {item.otro && item.otro !== item.quien ? ` · antes ${item.otro}` : ""}
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
