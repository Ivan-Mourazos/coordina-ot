import type { HistorialOF } from "@/lib/historial";
import type { SeccionId } from "@/lib/secciones";
import { fmtMin } from "@/lib/estado";
import { RolChip } from "./RolChip";

const CENTROS = { ot: "OT", diseno: "Diseño", taller: "Taller" } as const;

/** Una línea por OF, aunque haya trabajado más de un centro. La sección
 *  seleccionada limita el desglose personal, nunca qué OF se pueden ver. */
export function HistorialOFsCompactas({ ofs, seccion }: { ofs: HistorialOF[]; seccion: SeccionId }) {
  const porCodigo = new Map<string, HistorialOF[]>();
  for (const of of ofs) {
    const centros = porCodigo.get(of.codigo) ?? [];
    centros.push(of);
    porCodigo.set(of.codigo, centros);
  }
  if (!ofs.length) return <p className="py-1 text-xs text-text-muted">Sin OF vinculadas al pedido en RPS.</p>;
  return (
    <ul className="space-y-1.5">
      {[...porCodigo].map(([codigo, centros]) => {
        const rol = centros.find((of) => (of.centro ?? "ot") === seccion)?.rol;
        const descripcion = centros[0].descripcion;
        return (
          <li key={codigo} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-mono font-semibold text-text">{codigo}</span>
            <span className="min-w-0 flex-1 truncate text-text-muted" title={descripcion}>{descripcion}</span>
            {centros.map((of) => (
              <span key={of.centro ?? "ot"} title="Tiempo imputado en RPS en este centro" className="rounded bg-surface-2 px-1.5 py-0.5 font-semibold text-text ring-1 ring-border">
                {CENTROS[of.centro ?? "ot"]} · {fmtMin(of.tiempoImputadoMin)}
              </span>
            ))}
            {rol && (
              <span className="flex gap-1.5">
                <RolChip rol="plantear" min={rol.planteoMin} quien={rol.planteo.map((p) => p.nombre)} />
                <RolChip rol="revisar" min={rol.revisionMin} quien={rol.revision.map((p) => p.nombre)} />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
