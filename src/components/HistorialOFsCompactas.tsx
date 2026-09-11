import type { HistorialOF } from "@/lib/historial";
import { personasDeOF } from "@/lib/historial";
import type { SeccionId } from "@/lib/secciones";
import { centrosConDesglose } from "@/lib/historial-centros";
import { fmtMin } from "@/lib/estado";

const CENTROS = { ot: "OT", diseno: "Diseño", taller: "Taller" } as const;

/** Una línea por OF, aunque haya trabajado más de un centro. La sección
 *  seleccionada limita el desglose personal, nunca qué OF se pueden ver.
 *
 *  Las personas van con su tiempo, de más a menos, y sin rol: igual que la
 *  fila del pedido y la ficha. */
export function HistorialOFsCompactas({ ofs, seccion }: { ofs: HistorialOF[]; seccion: SeccionId }) {
  const porCodigo = new Map<string, HistorialOF[]>();
  for (const of of ofs) {
    const centros = porCodigo.get(of.codigo) ?? [];
    centros.push(of);
    porCodigo.set(of.codigo, centros);
  }
  if (!ofs.length) return <p className="py-1 text-xs text-text-muted">Sin OF vinculadas al pedido en RPS.</p>;
  // Las personas por OF solo con varias OF: con una, ya están en la fila del
  // pedido, justo encima. Del centro que cuenta (ver `centrosConDesglose`).
  const conDesglose = centrosConDesglose(ofs, seccion);
  const variasOF = porCodigo.size > 1;
  return (
    <ul className="space-y-1.5">
      {[...porCodigo].map(([codigo, centros]) => {
        const deDesglose = variasOF ? centros.find((of) => conDesglose.has(of.centro ?? "ot")) : undefined;
        const personas = deDesglose ? personasDeOF(deDesglose) : [];
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
            {personas.length > 0 && (
              <span className="text-text-muted" title="Tiempo por persona en esta sección: el imputado en RPS o, si aún no hay, el fichado en CoordinaOT">
                {personas.map((p, i) => (
                  <span key={p.nombre}>
                    {i > 0 && " · "}
                    <span className="text-text">{p.nombre}</span> {fmtMin(p.min)}
                  </span>
                ))}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
