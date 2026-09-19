// Iconos de línea para los datos de la ficha. Sustituyen a los emoji 🏭 y 🧵:
// junto a los iconos de trazo del resto de la web, un emoji a todo color se
// leía como de otro sitio, y cada sistema lo dibuja a su manera. Mismo trazo
// que las flechas y el resto de SVG de la casa (2 px, redondeado), y toman el
// color del texto que acompañan.

type Props = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** Fábrica: cuándo empieza Producción. */
export function IconoFabrica({ className = "size-3.5" }: Props) {
  return (
    <svg {...base} className={`shrink-0 ${className}`}>
      <path d="M3 21V10l5 3V10l5 3V10l5 3V4h3v17Z" />
      <path d="M7 17h2M12 17h2M17 17h2" />
    </svg>
  );
}

/** Rollo de material: lo asignado a la OF. */
export function IconoMaterial({ className = "size-3.5" }: Props) {
  return (
    <svg {...base} className={`shrink-0 ${className}`}>
      <ellipse cx="7" cy="12" rx="3" ry="7" />
      <path d="M7 5h11a3 7 0 0 1 0 14H7" />
      <circle cx="7" cy="12" r="1" />
    </svg>
  );
}
