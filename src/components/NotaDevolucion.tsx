"use client";

import { useEffect, useState } from "react";
import { leerDevolucion, partirNota } from "@/lib/devolucion";
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
  // LO QUE HAY QUE CORREGIR, COMO LISTA (16/10/2026). Las líneas «✗ …» salen de
  // la guía, una por paso que falló: se leen y se van tachando de cabeza. Lo
  // que el revisor añadió a mano, debajo. Una nota de antes sale como siempre.
  const { fallos, texto } = partirNota(nota);

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
      {fallos.length > 0 ? (
        <>
          <span className="font-semibold">⚠ Qué corregir:</span>
          <ul className="mt-1 space-y-0.5">
            {fallos.map((f, i) => (
              <li key={i} className="flex gap-1.5">
                <span aria-hidden="true" className="font-bold">✗</span>
                <span className="min-w-0">{f}</span>
              </li>
            ))}
          </ul>
          {texto && <p className="mt-1 whitespace-pre-line">{texto}</p>}
        </>
      ) : (
        <span className="whitespace-pre-line">⚠ {nota}</span>
      )}
    </div>
  );
}
