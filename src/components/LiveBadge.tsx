import type { FichandoAhora, Rol } from "@/lib/types";
import { RelojVivo } from "./RelojVivo";
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

/** Quién está fichando, en qué papel y cuánto lleva, con el reloj corriendo:
 *  "● Jaime · 0:12:30". Una entrada por persona; casi siempre es una.
 *
 *  Es lo que hace que el fichaje de un compañero se vea de verdad, y no solo
 *  un punto que no dice de quién es ni desde cuándo (Iván, 16/10/2026). */
export function QuienFicha({
  vivos,
  nombre,
  className = "",
}: {
  vivos: readonly FichandoAhora[];
  /** Nombre corto del operario (el de pila basta en una fila). */
  nombre: (operarioId: string) => string;
  className?: string;
}) {
  const unicos = vivos.filter((v, i) => vivos.findIndex((w) => w.operarioId === v.operarioId) === i);
  if (!unicos.length) return null;
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className}`}>
      {unicos.map((v) => (
        <span
          key={v.operarioId}
          className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-bold ${ROL[v.rol].texto}`}
          title={`${nombre(v.operarioId)} ${v.rol === "revisar" ? "revisando" : "planteando"} ahora`}
        >
          <LiveDot rol={v.rol} className="size-1.5" />
          {nombre(v.operarioId)}
          <RelojVivo desde={v.desde} className="font-semibold" />
        </span>
      ))}
    </span>
  );
}
