import type { FichandoAhora, Pedido, Rol } from "@/lib/types";
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
  relojDe,
  className = "",
}: {
  vivos: readonly FichandoAhora[];
  /** Nombre corto del operario (el de pila basta en una fila). */
  nombre: (operarioId: string) => string;
  /** El reloj de la PERSONA, sumado sobre todo lo que ficha (ver
   *  `relojesPorOperario`). Sin él, cuenta solo su parte en la primera OF:
   *  revisando tres pedidos a la vez avanzaba un segundo de cada tres y
   *  parecía atascado. */
  relojDe?: (operarioId: string) => RelojPersona | undefined;
  className?: string;
}) {
  const unicos = vivos.filter((v, i) => vivos.findIndex((w) => w.operarioId === v.operarioId) === i);
  if (!unicos.length) return null;
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className}`}>
      {unicos.map((v) => {
        const r = relojDe?.(v.operarioId);
        return (
          <span
            key={v.operarioId}
            className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-bold ${ROL[v.rol].texto}`}
            title={`${nombre(v.operarioId)} ${v.rol === "revisar" ? "revisando" : "planteando"} ahora${
              r && r.pedidos > 1 ? ` (${r.pedidos} pedidos a la vez; el reloj es el de todos)` : ""
            }`}
          >
            <LiveDot rol={v.rol} className="size-1.5" />
            {nombre(v.operarioId)}
            <RelojVivo
              desde={v.desde}
              previoSeg={r?.previoSeg ?? v.previoSeg}
              parte={r?.parte ?? v.parte}
              className="font-semibold"
            />
          </span>
        );
      })}
    </span>
  );
}

/** El reloj de una persona sobre TODO lo que tiene en marcha. */
export interface RelojPersona {
  previoSeg: number;
  parte: number;
  pedidos: number;
}

/** Suma, por persona, lo de todas las OF de su reloj: lo que llevaba y la
 *  parte del tramo de cada una (juntas hacen el tramo entero). */
export function relojesPorOperario(pedidos: readonly Pedido[]): Map<string, RelojPersona> {
  const m = new Map<string, RelojPersona & { vistos: Set<string> }>();
  for (const p of pedidos)
    for (const of of p.ofs)
      for (const v of of.fichandoAhora ?? []) {
        const r = m.get(v.operarioId) ?? { previoSeg: 0, parte: 0, pedidos: 0, vistos: new Set<string>() };
        r.previoSeg += v.previoSeg ?? 0;
        r.parte += v.parte ?? 1;
        if (!r.vistos.has(p.id)) {
          r.vistos.add(p.id);
          r.pedidos++;
        }
        m.set(v.operarioId, r);
      }
  return m;
}
