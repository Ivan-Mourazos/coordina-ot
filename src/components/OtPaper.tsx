import type { Pedido } from "@/lib/types";

// Dibuja un "parte escaneado" simulado (formulario impreso + manuscrito + un
// círculo a mano). Es SVG con viewBox A4, así escala nítido con el slider Tamaño.
// Cuando se conecten los escaneos reales, este componente se sustituye por
// <img src={pedido.scanUrl} />.

const ACCENT_COLOR: Record<Pedido["accent"], string | null> = {
  verde: "#39a845",
  rojo: "#d23b3b",
  azul: "#2f5fd0",
  ninguno: null,
};

// pseudo-aleatorio estable a partir del id (para variar el manuscrito)
function seeded(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function OtPaper({ pedido }: { pedido: Pedido }) {
  const rnd = seeded(pedido.id);
  const accent = ACCENT_COLOR[pedido.accent];

  // renglones manuscritos (línea ondulada del ancho deseado, sin deformar)
  function wavy(x0: number, y: number, w: number) {
    const seg = Math.max(2, Math.round(w / 8));
    let d = `M${x0} ${y}`;
    for (let i = 0; i < seg; i++) {
      const cx = x0 + (i + 0.5) * (w / seg);
      const ex = x0 + (i + 1) * (w / seg);
      d += ` Q ${cx.toFixed(1)} ${(y + (i % 2 ? 1.6 : -1.6)).toFixed(1)} ${ex.toFixed(1)} ${y}`;
    }
    return d;
  }
  const lines = Array.from({ length: pedido.lineas }, (_, i) => ({
    y: 56 + i * 9,
    w: 20 + rnd() * 64,
  }));

  // garabato de firma
  const sigY = 132;

  return (
    <svg
      viewBox="0 0 100 141"
      className="block h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {/* hoja */}
      <rect
        x="0.5"
        y="0.5"
        width="99"
        height="140"
        rx="2"
        fill="var(--paper)"
        stroke="var(--paper-line)"
      />
      {/* cabecera impresa */}
      <rect x="7" y="7" width="14" height="10" rx="1" fill="var(--paper-line)" />
      <rect x="25" y="8" width="40" height="3" rx="1.5" fill="var(--paper-line)" />
      <rect x="25" y="13" width="28" height="2" rx="1" fill="var(--paper-line)" />
      <rect x="73" y="8" width="20" height="9" rx="1" fill="none" stroke="var(--paper-line)" />

      {/* línea separadora */}
      <line x1="7" y1="24" x2="93" y2="24" stroke="var(--paper-line)" strokeWidth="0.8" />

      {/* casillas del formulario */}
      <rect x="7" y="28" width="40" height="9" rx="1" fill="none" stroke="var(--paper-line)" strokeWidth="0.7" />
      <rect x="53" y="28" width="40" height="9" rx="1" fill="none" stroke="var(--paper-line)" strokeWidth="0.7" />
      <line x1="7" y1="44" x2="93" y2="44" stroke="var(--paper-line)" strokeWidth="0.6" />

      {/* renglones manuscritos */}
      <g stroke="#33518c" strokeWidth="0.9" strokeLinecap="round" opacity="0.65" fill="none">
        {lines.map((l, i) => (
          <path key={i} d={wavy(9, l.y, l.w)} />
        ))}
      </g>

      {/* croquis opcional */}
      {pedido.croquis && (
        <g stroke="#33518c" strokeWidth="0.9" fill="none" opacity="0.6">
          <rect x="60" y="92" width="30" height="24" rx="1" />
          <path d="M60 104 h30 M75 92 v24" />
          <path d="M63 113 l6 -8 4 5 5 -9 5 6" />
        </g>
      )}

      {/* firma / garabato */}
      <path
        d={`M10 ${sigY} q 5 -6 10 -1 t 9 -1 q 4 5 8 -1`}
        fill="none"
        stroke="#1f3a6e"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.7"
      />

      {/* círculo a mano (acento del scan) */}
      {accent && (
        <ellipse
          cx={30 + rnd() * 30}
          cy={66 + rnd() * 40}
          rx={16 + rnd() * 6}
          ry={9 + rnd() * 4}
          fill="none"
          stroke={accent}
          strokeWidth="1.6"
          opacity="0.85"
          transform={`rotate(${-12 + rnd() * 24} 50 80)`}
        />
      )}
    </svg>
  );
}
