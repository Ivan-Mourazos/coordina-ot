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

/** Etiqueta: la rotulación de la OF. */
export function IconoEtiqueta({ className = "size-3.5" }: Props) {
  return (
    <svg {...base} className={`shrink-0 ${className}`}>
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9Z" />
      <circle cx="7.5" cy="7.5" r="1.2" />
    </svg>
  );
}

/** Caja: material pedido a compras. */
export function IconoCaja({ className = "size-3.5" }: Props) {
  return (
    <svg {...base} className={`shrink-0 ${className}`}>
      <path d="M3 7l9-4 9 4v10l-9 4-9-4Z" />
      <path d="M3 7l9 4 9-4M12 11v10" />
    </svg>
  );
}

/** Chincheta: un aviso que Producción dejó en la OF. */
export function IconoAviso({ className = "size-3.5" }: Props) {
  return (
    <svg {...base} className={`shrink-0 ${className}`}>
      <path d="M9 3h6l-1 6 3 3H7l3-3Z" />
      <path d="M12 12v9" />
    </svg>
  );
}

/** Candado: por qué una OF no se puede fichar ahora. */
export function IconoCandado({ className = "size-3" }: Props) {
  return (
    <svg {...base} className={`shrink-0 ${className}`}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** Bandeja de entrada: lo que ha llegado y nadie ha cogido. */
export function IconoBandeja({ className = "size-4" }: Props) {
  return (
    <svg {...base} className={`shrink-0 ${className}`}>
      <path d="M3 13h5l1.5 3h5L16 13h5" />
      <path d="M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6Z" />
    </svg>
  );
}
