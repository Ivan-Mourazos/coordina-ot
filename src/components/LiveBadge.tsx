import type { Rol } from "@/lib/types";
import { ROL } from "@/lib/estado";

/** Punto pulsante con el color del rol (esmeralda = planteando,
 *  violeta = revisando). Pieza mínima reutilizada por chips y tarjetas. */
export function LiveDot({ rol, className = "size-2" }: { rol: Rol; className?: string }) {
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} aria-hidden>
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:animate-none"
        style={{ background: ROL[rol].color }}
      />
      <span
        className="relative inline-flex h-full w-full rounded-full"
        style={{ background: ROL[rol].color }}
      />
    </span>
  );
}
