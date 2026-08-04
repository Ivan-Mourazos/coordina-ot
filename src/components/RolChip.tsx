import type { Rol } from "@/lib/types";
import { ROL, fmtMin } from "@/lib/estado";

/** Chip de tiempo por rol. Mismo código de color que en todo el tablero
 *  (plantear = esmeralda, revisar = violeta), tomado de ROL. */
export function RolChip({ rol, min, quien }: { rol: Rol; min: number; quien: string[] }) {
  const meta = ROL[rol];
  const etiqueta = rol === "plantear" ? "Planteo" : "Revisión";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${meta.chip}`}
      title={
        quien.length > 0
          ? `${etiqueta}: ${quien.join(", ")}`
          : `Sin ${etiqueta.toLowerCase()} fichado`
      }
    >
      {etiqueta} {fmtMin(min)}
      {quien.length > 0 && <span className="font-normal opacity-80">· {quien.join(", ")}</span>}
    </span>
  );
}
