"use client";

import { useEffect, useState } from "react";
import { leerDevolucion } from "@/lib/devolucion";
import { leerCausas, type CausaDevolucion } from "@/lib/causas-cliente";

/** La nota del revisor cuando devuelve, con sus causas delante.
 *
 *  Las causas viajan como ids dentro de `observacion` (ver lib/devolucion.ts),
 *  así que hay que traducirlas a sus rótulos. Se piden CON LAS RETIRADAS: una
 *  devolución de hace meses puede apuntar a una causa que ya no se ofrece, y
 *  seguir diciendo de qué fue es justo el motivo de retirarlas en vez de
 *  borrarlas.
 *
 *  Mientras la lista no ha llegado —o si no llega— se pinta la nota sola. Es lo
 *  que importa: las causas son para contar, la nota es la que manda al autor a
 *  hacer algo, y quedarse esperando a una consulta para enseñarla sería poner
 *  el dato accesorio por delante del útil.
 *
 *  Y las devoluciones anteriores a esto no tienen causas: salen igual que
 *  siempre, con su nota y nada más. */
export function NotaDevolucion({ observacion, className }: { observacion: string; className: string }) {
  const { causas, nota } = leerDevolucion(observacion);
  const [rotulos, setRotulos] = useState<CausaDevolucion[]>([]);

  useEffect(() => {
    if (causas.length === 0) return;
    let vivo = true;
    leerCausas(true).then((cs) => vivo && setRotulos(cs));
    return () => {
      vivo = false;
    };
    // Por los ids, no por el array: `leerDevolucion` crea uno nuevo en cada
    // render y sin esto la consulta se repetiría sin parar.
  }, [causas.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const deEsta = causas
    .map((id) => rotulos.find((c) => c.id === id))
    .filter((c): c is CausaDevolucion => c !== undefined);

  return (
    <div className={className}>
      {deEsta.length > 0 && (
        <span className="mr-1.5 inline-flex flex-wrap gap-1 align-middle">
          {deEsta.map((c) => (
            <span
              key={c.id}
              className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase"
            >
              {c.etiqueta}
            </span>
          ))}
        </span>
      )}
      ⚠ {nota}
    </div>
  );
}
