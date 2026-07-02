"use client";

export type Vista = "asignar" | "lista" | "revision" | "historial";

const OPCIONES: { id: Vista; label: string }[] = [
  { id: "asignar", label: "Asignar" },
  { id: "lista", label: "Lista" },
  { id: "revision", label: "Revisión" },
  { id: "historial", label: "Historial" },
];

export function ViewSwitcher({
  vista,
  onChange,
  badge,
}: {
  vista: Vista;
  onChange: (v: Vista) => void;
  badge?: Partial<Record<Vista, number>>;
}) {
  return (
    <div className="glass-chip inline-flex rounded-xl p-1">
      {OPCIONES.map((o) => {
        const activo = o.id === vista;
        const n = badge?.[o.id];
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              activo
                ? "bg-brand-400 text-[#231903] shadow-sm"
                : "text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
            }`}
          >
            {o.label}
            {n ? (
              <span
                className={`rounded-full px-1.5 text-[10px] font-bold ${
                  activo ? "bg-black/15" : "bg-amber-500 text-white"
                }`}
              >
                {n}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
