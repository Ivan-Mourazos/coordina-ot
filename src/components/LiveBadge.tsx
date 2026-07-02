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

/** Badge "fichando ahora": dot pulsante + rol. `quien` añade las iniciales
 *  cuando el contexto no deja claro de quién es el tiempo. */
export function LiveBadge({ rol, quien }: { rol: Rol; quien?: string }) {
  const meta = ROL[rol];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.chip}`}
    >
      <LiveDot rol={rol} className="size-1.5" />
      {meta.label}
      {quien && <span className="font-extrabold">· {quien}</span>}
    </span>
  );
}
