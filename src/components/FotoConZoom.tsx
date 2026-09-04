"use client";

import { useRef, useState } from "react";

// ─── Una foto que se puede mirar de cerca ────────────────────────────────────
// Las fotos de obra son de móvil: en ellas está el número de serie del motor, la
// referencia de una guía o la cota escrita a mano en un papel apoyado en la
// pared. A tamaño de pantalla eso no se lee, y hasta ahora la única salida era
// bajar el fichero y abrirlo con el visor de Windows.
//
// La rueda acerca donde está el puntero, no en el centro: es lo que hace que
// puedas ir a una esquina sin perderla de vista a medio camino. Con la foto
// ampliada se arrastra para moverla, y el doble clic alterna entre el tamaño
// completo y el detalle, que es el gesto que ya hace todo el mundo sin pensar.
//
// NO hay librería: son treinta líneas de aritmética y una transform. Traer un
// paquete de zoom para esto costaría más de mantener que esto mismo.

const MAX = 8;

export function FotoConZoom({ src, alt }: { src: string; alt: string }) {
  const [escala, setEscala] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  // El origen del arrastre va en un ref (cambia en cada movimiento del ratón y
  // no debe repintar), pero SI se está arrastrando es estado: de ello dependen
  // el cursor y la transición, que sí se pintan.
  const arrastre = useRef<{ x: number; y: number } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  // Al cambiar de foto se vuelve al tamaño completo: heredar el zoom de la
  // anterior deja la siguiente en un trozo cualquiera, sin saber de dónde.
  //
  // Durante el RENDER y no en un efecto: React descarta este render y repite
  // con el valor bueno, así que la foto nueva nunca llega a pintarse con el
  // zoom de la anterior. Mismo patrón que `Desplegable` y el reset de pedido
  // del drawer del Historial (y el lint no admite setState dentro de un
  // efecto).
  const [srcPrevio, setSrcPrevio] = useState(src);
  if (src !== srcPrevio) {
    setSrcPrevio(src);
    setEscala(1);
    setPos({ x: 0, y: 0 });
  }

  /** Acerca o aleja MANTENIENDO bajo el puntero el punto que estaba ahí. Sin
   *  esto, ampliar sobre una esquina la manda fuera de la pantalla. */
  function zoomEn(clientX: number, clientY: number, factor: number) {
    const marco = caja.current?.getBoundingClientRect();
    if (!marco) return;
    setEscala((previa) => {
      const nueva = Math.min(MAX, Math.max(1, previa * factor));
      if (nueva === previa) return previa;
      // Distancia del puntero al centro del marco, que es el origen del scale.
      const dx = clientX - (marco.left + marco.width / 2);
      const dy = clientY - (marco.top + marco.height / 2);
      const razon = nueva / previa;
      setPos((p) =>
        nueva === 1
          ? { x: 0, y: 0 } // de vuelta al tamaño completo, centrada
          : { x: dx - (dx - p.x) * razon, y: dy - (dy - p.y) * razon },
      );
      return nueva;
    });
  }

  return (
    <div
      ref={caja}
      className="relative h-full w-full overflow-hidden"
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => {
        // No se hace preventDefault: el visor ya bloquea el scroll de la página
        // y llamarlo aquí obligaría a un listener no pasivo.
        zoomEn(e.clientX, e.clientY, e.deltaY < 0 ? 1.25 : 1 / 1.25);
      }}
      onDoubleClick={(e) => zoomEn(e.clientX, e.clientY, escala > 1 ? 1 / escala : 3)}
      onPointerDown={(e) => {
        if (escala === 1) return;
        arrastre.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
        setArrastrando(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!arrastre.current) return;
        setPos({ x: e.clientX - arrastre.current.x, y: e.clientY - arrastre.current.y });
      }}
      onPointerUp={() => {
        arrastre.current = null;
        setArrastrando(false);
      }}
      style={{ cursor: escala > 1 ? (arrastrando ? "grabbing" : "grab") : "zoom-in" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="mx-auto h-full w-auto max-w-full select-none rounded-xl object-contain"
        style={{
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${escala})`,
          // Sin transición mientras se arrastra: la foto iría por detrás del
          // dedo. Al hacer zoom sí, que es un salto y se agradece verlo.
          transition: arrastrando ? "none" : "transform 120ms ease-out",
        }}
      />

      {/* Los mandos, para quien no use rueda. Salen siempre: escondidos hasta
          pasar el ratón por encima, no se encuentran. */}
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg bg-black/60 px-1.5 py-1 text-white ring-1 ring-white/20">
        <BotonZoom
          etiqueta="Alejar"
          onClick={() => {
            const m = caja.current?.getBoundingClientRect();
            if (m) zoomEn(m.left + m.width / 2, m.top + m.height / 2, 1 / 1.5);
          }}
        >
          −
        </BotonZoom>
        <span className="w-10 text-center text-[11px] tabular-nums text-white/70">
          {Math.round(escala * 100)}%
        </span>
        <BotonZoom
          etiqueta="Acercar"
          onClick={() => {
            const m = caja.current?.getBoundingClientRect();
            if (m) zoomEn(m.left + m.width / 2, m.top + m.height / 2, 1.5);
          }}
        >
          +
        </BotonZoom>
        {escala > 1 && (
          <button
            onClick={() => {
              setEscala(1);
              setPos({ x: 0, y: 0 });
            }}
            className="ml-1 rounded px-1.5 py-0.5 text-[11px] font-semibold hover:bg-white/20"
          >
            Ajustar
          </button>
        )}
      </div>
    </div>
  );
}

function BotonZoom({
  children,
  etiqueta,
  onClick,
}: {
  children: React.ReactNode;
  etiqueta: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={etiqueta}
      title={etiqueta}
      className="grid size-6 place-items-center rounded text-base font-bold hover:bg-white/20"
    >
      {children}
    </button>
  );
}
