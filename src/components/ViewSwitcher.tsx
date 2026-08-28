"use client";

export type Vista =
  | "asignar"
  | "lista"
  | "revision"
  | "visitas"
  | "historial"
  | "metricas";

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
  { id: "historial", label: "Historial" },
  // Mirar hacia atrás, no trabajo que tengas delante: por eso va la última y
  // no dentro de Historial, donde quedaría escondida.
  { id: "metricas", label: "Métricas" },
];

/** Las vistas que existen, en el orden de las pestañas.
 *
 *  Se exporta para que la URL (`?v=…`) no tenga que repetir la lista: la
 *  tenía copiada en Board y añadir una pestaña sin acordarse de la otra
 *  copia dejaba `?v=metricas` aterrizando en el Panel, reescribiendo la URL
 *  y sin decir por qué. Una lista, un sitio.
 */
export const VISTAS: Vista[] = OPCIONES.map((o) => o.id);

export function ViewSwitcher({
  vista,
  onChange,
  badge,
}: {
  vista: Vista;
  onChange: (v: Vista) => void;
  badge?: Partial<Record<Vista, number>>;
}) {
  // p-[3px] y no p-1: el contenedor mide borde (2) + padding×2 + botón (28),
  // así que con 4 px de padding salían 38 y el resto de la cabecera va a 36.
  // Con 3 da 36 justos y las tres zonas quedan a la misma altura.
  return (
    <div className="glass-chip inline-flex rounded-xl p-[3px]">
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
