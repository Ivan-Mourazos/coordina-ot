"use client";

import { useEffect, useState } from "react";
import { leerDevolucion, lineasDe, partirNota } from "@/lib/devolucion";
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
export function NotaDevolucion({
  observacion,
  className,
  marcarComo,
}: {
  observacion: string;
  className: string;
  /** Con esto, cada cosa a corregir lleva una casilla para ir marcando lo
   *  hecho. Lo pidió un técnico (22/10/2026): con varias correcciones, se
   *  tachaban de cabeza. Es SOLO VISUAL y de quien la marca: va en su
   *  navegador, no en la base, y no cambia el estado de nada. Va el id de la
   *  OF; la clave lleva además la nota, así que una devolución nueva empieza
   *  limpia. */
  marcarComo?: string;
}) {
  const { causas, nota } = leerDevolucion(observacion);
  const [rotulos, setRotulos] = useState<CausaDevolucion[]>([]);
  const clave = marcarComo ? `coordina:corregido:${marcarComo}:${huella(observacion)}` : null;
  // Con su clave al lado: si llega otra devolución con el componente montado,
  // las marcas de la vieja no se le pasan a la nueva.
  const [marcas, setMarcas] = useState(() => ({ clave, hechas: leerHechas(clave) }));
  const hechas = marcas.clave === clave ? marcas.hechas : leerHechas(clave);
  const alternar = (i: number) => {
    const nuevas = new Set(hechas);
    if (!nuevas.delete(i)) nuevas.add(i);
    setMarcas({ clave, hechas: nuevas });
    try {
      if (nuevas.size) localStorage.setItem(clave!, JSON.stringify([...nuevas]));
      else localStorage.removeItem(clave!);
    } catch {
      // Sin almacenamiento (navegación privada): las marcas duran hasta cerrar.
    }
  };

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
  // Para marcar, también lo escrito a mano: una casilla por línea. Es como se
  // escriben las listas a mano («- cotas», «- tornillería»), y una nota de un
  // solo párrafo queda en una sola casilla, que también sirve.
  const tareas = clave ? [...fallos, ...lineasDe(fallos.length ? texto : nota)] : [];

  if (tareas.length > 0) {
    const hechasN = tareas.filter((_, i) => hechas.has(i)).length;
    return (
      <div className={className}>
        {deEsta.length > 0 && <Causas causas={deEsta} />}
        <span className="font-semibold">⚠ Qué corregir</span>
        {tareas.length > 1 && (
          <span className="ml-1.5 tabular-nums opacity-80">
            · {hechasN} de {tareas.length} hechas
          </span>
        )}
        <ul className="mt-1 space-y-0.5">
          {tareas.map((t, i) => (
            <li key={i}>
              <label className="flex cursor-pointer items-start gap-1.5">
                <input
                  type="checkbox"
                  checked={hechas.has(i)}
                  onChange={() => alternar(i)}
                  className="mt-0.5 size-3 shrink-0 cursor-pointer accent-emerald-600"
                />
                <span className={`min-w-0 ${hechas.has(i) ? "line-through opacity-60" : ""}`}>{t}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className={className}>
      {deEsta.length > 0 && <Causas causas={deEsta} />}
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

function Causas({ causas }: { causas: CausaDevolucion[] }) {
  return (
    <span className="mr-1.5 inline-flex flex-wrap gap-1 align-middle">
      {causas.map((c) => (
        <span key={c.id} className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase">
          {c.etiqueta}
        </span>
      ))}
    </span>
  );
}

/** Un resumen corto de la nota para la clave: otra nota, otra lista. */
function huella(texto: string): string {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function leerHechas(clave: string | null): ReadonlySet<number> {
  if (!clave || typeof window === "undefined") return new Set();
  try {
    const v: unknown = JSON.parse(localStorage.getItem(clave) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n)) : []);
  } catch {
    return new Set();
  }
}
