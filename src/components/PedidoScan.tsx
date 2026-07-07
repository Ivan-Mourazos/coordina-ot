"use client";

import { useState } from "react";
import type { Pedido } from "@/lib/types";
import { familiaMeta } from "@/lib/familia";

/** URL de imagen del parte: si scanUrl es un PDF, la miniatura PNG servida por
 *  /api/pedidos/{codigo}.png; si ya es una imagen, tal cual. null = sin scan. */
function imagenDe(pedido: Pedido): string | null {
  if (!pedido.scanUrl) return null;
  return pedido.scanUrl.toLowerCase().endsWith(".pdf")
    ? pedido.scanUrl.replace(/\.pdf$/i, ".png")
    : pedido.scanUrl;
}

// Primera hoja del PDF del pedido, tal y como llega por RPS. Mientras no hay
// escaneo real (pedido.scanUrl) se dibuja una réplica del impreso con los
// datos reales del pedido: cabecera de Toldos Gómez, nº AR, cliente y la tabla
// de líneas (una por OF). Es SVG con viewBox A4, escala nítida con el slider
// y con el Quick Look. El papel es SIEMPRE claro, como una foto real, también
// en modo oscuro.

const ACCENT: Record<Pedido["accent"], string | null> = {
  verde: "#39a845",
  rojo: "#d23b3b",
  azul: "#2f5fd0",
  ninguno: null,
};

// pseudo-aleatorio estable por id (variar firma/marcas entre pedidos)
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

function fmt(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y.slice(2)}`;
}

const INK = "#3b3a36"; // tinta impresa
const INK_SOFT = "#8a877f";
const LINE = "#d8d4ca";

export function PedidoScan({ pedido }: { pedido: Pedido }) {
  // Imagen real del parte (miniatura del PDF o foto de RPS). Si carga bien se
  // muestra; si el endpoint da 404 (no hay PDF), se cae a la réplica dibujada.
  const imagen = imagenDe(pedido);
  const [falloImagen, setFalloImagen] = useState(false);
  if (imagen && !falloImagen) {
    return (
      // Escaneo servido por RPS en red local: sin optimizador de Next.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imagen}
        alt={`Pedido ${pedido.codigo}`}
        className="block h-full w-full rounded-[3px] object-cover object-top"
        draggable={false}
        onError={() => setFalloImagen(true)}
      />
    );
  }

  const rnd = seeded(pedido.id);
  const accent = ACCENT[pedido.accent];
  const rows = pedido.ofs.slice(0, 6);
  const tableY = 96;
  const rowH = 17;

  return (
    <svg
      viewBox="0 0 210 297"
      className="block h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {/* hoja (blanca siempre: es una foto del papel) */}
      <rect x="0.5" y="0.5" width="209" height="296" rx="2.5" fill="#fdfcf9" stroke={LINE} />

      {/* ── cabecera del impreso ── */}
      <g transform={`rotate(${(rnd() - 0.5) * 0.8} 105 40)`}>
        {/* marca */}
        <rect x="14" y="14" width="15" height="15" rx="2" fill="#d39a1c" />
        <path
          d="M17 25c1.5-4 3.5-6 6-7 2 0 3.5 1.5 3.5 3.5-2.5 0.5-4.5 2-6 4.5z"
          fill="#fff"
        />
        <text x="33" y="21.5" fontSize="8.4" fontWeight="700" fill={INK} fontFamily="inherit" letterSpacing="0.4">
          TOLDOS GÓMEZ
        </text>
        <text x="33" y="27.5" fontSize="4" fill={INK_SOFT} fontFamily="inherit">
          Polígono de Arzúa · A Coruña · Tel. 981 500 000
        </text>

        {/* nº de pedido */}
        <rect x="138" y="12" width="58" height="19" rx="1.5" fill="none" stroke={INK} strokeWidth="0.7" />
        <text x="142" y="18.5" fontSize="3.8" fill={INK_SOFT} fontFamily="inherit" letterSpacing="0.6">
          PEDIDO DE VENTA
        </text>
        <text x="142" y="27" fontSize="8.2" fontWeight="700" fill={INK} fontFamily="var(--font-geist-mono), monospace">
          {pedido.codigo}
        </text>

        <line x1="14" y1="37" x2="196" y2="37" stroke={INK} strokeWidth="0.9" />

        {/* cliente + fechas */}
        <text x="14" y="45" fontSize="3.8" fill={INK_SOFT} letterSpacing="0.6" fontFamily="inherit">
          CLIENTE
        </text>
        <text x="14" y="54" fontSize="7.6" fontWeight="650" fill={INK} fontFamily="inherit">
          {pedido.cliente}
        </text>
        {pedido.negocio && (
          <text x="14" y="60.5" fontSize="5.4" fontWeight="600" fill={INK_SOFT} fontFamily="inherit">
            {pedido.negocio}
          </text>
        )}

        <text x="134" y="45" fontSize="3.8" fill={INK_SOFT} letterSpacing="0.6" fontFamily="inherit">
          SOLICITUD
        </text>
        <text x="134" y="51.5" fontSize="5" fill={INK} fontFamily="inherit">
          {fmt(pedido.fechaSolicitud)}
        </text>
        <text x="170" y="45" fontSize="3.8" fill={INK_SOFT} letterSpacing="0.6" fontFamily="inherit">
          ENTREGA
        </text>
        <text x="170" y="51.5" fontSize="5" fontWeight="650" fill={INK} fontFamily="inherit">
          {fmt(pedido.fechaEntrega)}
        </text>

        {/* condiciones (letra pequeña de relleno) */}
        <rect x="14" y="60" width="88" height="7" rx="1" fill="none" stroke={LINE} strokeWidth="0.6" />
        <text x="16.5" y="64.8" fontSize="3.6" fill={INK_SOFT} fontFamily="inherit">
          Forma de envío: reparto propio
        </text>
        <rect x="106" y="60" width="90" height="7" rx="1" fill="none" stroke={LINE} strokeWidth="0.6" />
        <text x="108.5" y="64.8" fontSize="3.6" fill={INK_SOFT} fontFamily="inherit">
          Prioridad comercial: P{pedido.prioridad}
        </text>

        {/* ── tabla de líneas ── */}
        <text x="14" y={tableY - 5} fontSize="4.2" fill={INK_SOFT} letterSpacing="0.8" fontFamily="inherit">
          LÍNEAS DEL PEDIDO
        </text>
        <rect x="14" y={tableY} width="182" height="8.5" fill="#f0ede5" />
        <text x="17" y={tableY + 5.8} fontSize="4" fontWeight="700" fill={INK} fontFamily="inherit">Nº</text>
        <text x="28" y={tableY + 5.8} fontSize="4" fontWeight="700" fill={INK} fontFamily="inherit">FAMILIA</text>
        <text x="62" y={tableY + 5.8} fontSize="4" fontWeight="700" fill={INK} fontFamily="inherit">DESCRIPCIÓN</text>
        <text x="184" y={tableY + 5.8} fontSize="4" fontWeight="700" fill={INK} fontFamily="inherit">UDS</text>
        {rows.map((of, i) => {
          const y = tableY + 8.5 + i * rowH;
          const fam = familiaMeta(of.familia);
          return (
            <g key={of.id}>
              <line x1="14" y1={y + rowH} x2="196" y2={y + rowH} stroke={LINE} strokeWidth="0.55" />
              <text x="17" y={y + 10.5} fontSize="4.6" fill={INK_SOFT} fontFamily="var(--font-geist-mono), monospace">
                {String(i + 1).padStart(2, "0")}
              </text>
              <circle cx="30.5" cy={y + 9} r="1.6" fill={fam.color} />
              <text x="34.5" y={y + 10.5} fontSize="4" fill={INK} fontFamily="inherit" letterSpacing="0.2">
                {fam.label.toUpperCase()}
              </text>
              <text x="64" y={y + 10.5} fontSize="5.2" fontWeight="550" fill={INK} fontFamily="inherit">
                {of.descripcion.length > 38 ? of.descripcion.slice(0, 37) + "…" : of.descripcion}
              </text>
              <text x="186" y={y + 10.5} fontSize="5" fill={INK} fontFamily="inherit" textAnchor="middle">
                {of.piezas}
              </text>
            </g>
          );
        })}
        {pedido.ofs.length > 6 && (
          <text x="14" y={tableY + 8.5 + 6 * rowH + 6} fontSize="4.2" fill={INK_SOFT} fontFamily="inherit">
            (+{pedido.ofs.length - 6} líneas más…)
          </text>
        )}

        {/* croquis adjunto */}
        {pedido.croquis && (
          <g stroke="#4a5b83" strokeWidth="0.8" fill="none" opacity="0.75">
            <rect x="132" y="216" width="64" height="44" rx="1.5" strokeDasharray="2.5 2" />
            <path d="M138 250 l12 -17 8 9 10 -14 9 11" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M138 226 h20 M138 230 h13" strokeWidth="0.6" />
            <text x="134" y="221.5" fontSize="3.4" fill="#4a5b83" stroke="none" fontFamily="inherit">
              CROQUIS
            </text>
          </g>
        )}

        {/* firma comercial */}
        <path
          d={`M22 ${272 + rnd() * 4} q 8 -9 15 -2 t 13 -2 q 6 7 12 -2`}
          fill="none"
          stroke="#33518c"
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity="0.75"
        />
        <text x="22" y="281" fontSize="3.4" fill={INK_SOFT} fontFamily="inherit">
          Dpto. comercial
        </text>
      </g>

      {/* círculo a mano de Producción (marca del scan) */}
      {accent && (
        <ellipse
          cx={60 + rnd() * 80}
          cy={110 + rnd() * 50}
          rx={26 + rnd() * 10}
          ry={11 + rnd() * 5}
          fill="none"
          stroke={accent}
          strokeWidth="1.8"
          opacity="0.8"
          transform={`rotate(${-10 + rnd() * 20} 105 148)`}
        />
      )}

      {/* sombra de escaneo en el borde */}
      <rect x="0.5" y="0.5" width="209" height="296" rx="2.5" fill="url(#scanShade)" pointerEvents="none" />
      <defs>
        <linearGradient id="scanShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.05" />
          <stop offset="0.08" stopColor="#000" stopOpacity="0" />
          <stop offset="0.94" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.07" />
        </linearGradient>
      </defs>
    </svg>
  );
}
