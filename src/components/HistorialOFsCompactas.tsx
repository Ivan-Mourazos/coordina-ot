import type { ReactNode } from "react";
import type { HistorialOF } from "@/lib/historial";
import { personasConRol, personasDeOF, repartoDe } from "@/lib/historial";
import type { SeccionId } from "@/lib/secciones";
import { centrosConDesglose } from "@/lib/historial-centros";
import { fmtMin, ROL } from "@/lib/estado";

/** Una línea por OF, aunque haya trabajado más de un centro. La sección
 *  seleccionada limita el desglose personal, nunca qué OF se pueden ver.
 *
 *  Las personas van con su tiempo, de más a menos, y sin rol: igual que la
 *  fila del pedido y la ficha.
 *
 *  Con `columnas` (las de la lista) cada OF cae debajo de lo mismo en la fila
 *  del pedido: código, descripción y gente bajo «Quién». `accion` va en la
 *  última columna de la primera OF, bajo el tiempo del pedido.
 *
 *  NO lleva el tiempo por centro. Lo llevaba, y en un pedido de una sola OF
 *  —que son casi todos— repetía el total que la fila del pedido enseña justo
 *  encima. El reparto entre centros vive en «Tareas y tiempos», que además lo
 *  desglosa por tarea y por persona. */
export function HistorialOFsCompactas({ ofs, seccion, columnas, accion }: {
  ofs: HistorialOF[];
  seccion: SeccionId;
  columnas?: string;
  accion?: ReactNode;
}) {
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
      {[...porCodigo].map(([codigo, centros], i) => {
        const deDesglose = variasOF ? centros.find((of) => conDesglose.has(of.centro ?? "ot")) : undefined;
        // Con el papel de cada uno, igual que la ficha: aquí salía "Adrián 2m ·
        // Iván 2m" mientras la fila de arriba ya decía quién lo planteó.
        const reparto = deDesglose ? repartoDe([deDesglose]) : { autores: [], revisores: [], consta: false };
        const personas = deDesglose
          ? personasConRol(personasDeOF(deDesglose), reparto.autores, reparto.revisores, reparto.consta)
          : [];
        const descripcion = centros[0].descripcion;
        const gente = personas.length > 0 && (
          <span className="text-text-muted" title="Tiempo por persona en esta sección: el imputado en RPS o, si aún no hay, el fichado en CoordinaOT">
            {personas.map((p, n) => (
              <span key={p.nombre}>
                {n > 0 && " · "}
                <span className="text-text">{p.nombre}</span>
                {p.rol && (
                  <span className={ROL[p.rol].texto}> {p.rol === "plantear" ? "planteó" : "revisó"}</span>
                )}{" "}
                {fmtMin(p.min)}
              </span>
            ))}
          </span>
        );
        const accionAqui = i === 0 ? accion : null;
        if (columnas) {
          return (
            <li key={codigo} className={`${columnas} text-xs`}>
              <span aria-hidden="true" />
              <span className="font-mono font-semibold text-text">{codigo}</span>
              <span className="min-w-0 truncate text-text-muted" title={descripcion}>{descripcion}</span>
              {/* La columna de la familia va vacía en las OF: la familia es del
                  pedido, no de cada una. Se conserva para que lo de debajo siga
                  cayendo bajo su columna de la fila. */}
              <span aria-hidden="true" />
              <span className="min-w-0 leading-4">{gente}</span>
              {/* El botón, bajo el tiempo del pedido. Pegado a la descripción
                  le comía sitio al texto de la OF, que es lo que se viene a
                  leer aquí. */}
              <span className="flex justify-end">{accionAqui}</span>
            </li>
          );
        }
        return (
          <li key={codigo} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-mono font-semibold text-text">{codigo}</span>
            <span className="min-w-0 flex-1 truncate text-text-muted" title={descripcion}>{descripcion}</span>
            {gente}
            {accionAqui}
          </li>
        );
      })}
    </ul>
  );
}
